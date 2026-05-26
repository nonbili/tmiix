package main

import (
	"bytes"
	"errors"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

// sshAgent tracks an ssh-agent process spawned by tmiix when the host session
// did not already provide one. When set, agentPID is killed on shutdown.
type sshAgent struct {
	mu          sync.Mutex
	agentPID    int
	loadedKeys  map[string]bool // keyPath -> already pushed to agent
	warnedNoAgent bool
}

var agentState = &sshAgent{loadedKeys: map[string]bool{}}

// ensureSSHAgent makes sure SSH_AUTH_SOCK is set in tmiix's environment. If
// none is present (common when launched from a desktop entry on systems
// without gnome-keyring), it spawns a private agent. Children inherit the env
// via termEnv().
func ensureSSHAgent() {
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if _, err := os.Stat(sock); err == nil {
			return
		}
	}
	if _, err := exec.LookPath("ssh-agent"); err != nil {
		log.Printf("ssh-agent not found on PATH; passphrase caching disabled")
		return
	}
	out, err := exec.Command("ssh-agent", "-s").Output()
	if err != nil {
		log.Printf("ssh-agent spawn failed: %v", err)
		return
	}
	sock, pid := parseAgentOutput(string(out))
	if sock == "" {
		log.Printf("ssh-agent: could not parse output: %q", string(out))
		return
	}
	_ = os.Setenv("SSH_AUTH_SOCK", sock)
	agentState.mu.Lock()
	agentState.agentPID = pid
	agentState.mu.Unlock()
	log.Printf("ssh-agent started pid=%d sock=%s", pid, sock)
}

// shutdownSSHAgent kills any agent we spawned.
func shutdownSSHAgent() {
	agentState.mu.Lock()
	pid := agentState.agentPID
	agentState.agentPID = 0
	agentState.mu.Unlock()
	if pid <= 0 {
		return
	}
	if proc, err := os.FindProcess(pid); err == nil {
		_ = proc.Kill()
	}
}

// parseAgentOutput parses lines like:
//   SSH_AUTH_SOCK=/tmp/ssh-XXX/agent.123; export SSH_AUTH_SOCK;
//   SSH_AGENT_PID=4567; export SSH_AGENT_PID;
func parseAgentOutput(s string) (sock string, pid int) {
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		eq := strings.IndexByte(line, '=')
		if eq < 0 {
			continue
		}
		key := line[:eq]
		val := line[eq+1:]
		if semi := strings.IndexByte(val, ';'); semi >= 0 {
			val = val[:semi]
		}
		switch key {
		case "SSH_AUTH_SOCK":
			sock = val
		case "SSH_AGENT_PID":
			var n int
			for _, c := range val {
				if c < '0' || c > '9' {
					break
				}
				n = n*10 + int(c-'0')
			}
			pid = n
		}
	}
	return
}

// parsePassphraseKeyPath extracts /path from "Enter passphrase for key '/path'".
func parsePassphraseKeyPath(prompt string) string {
	const pfx = "Enter passphrase for key '"
	i := strings.Index(prompt, pfx)
	if i < 0 {
		return ""
	}
	rest := prompt[i+len(pfx):]
	j := strings.LastIndex(rest, "'")
	if j < 0 {
		return ""
	}
	return rest[:j]
}

// isLocalPassphrasePrompt reports whether a captured passphrase prompt concerns
// a key file that exists on the machine running tmiix. We only intercept prompts
// for local keys: those are the ones our local ssh client raises while
// connecting (and the only ones addKeyToAgent can cache via local ssh-add). A
// prompt naming a path that does not exist locally — e.g. a "/Users/..." path
// seen on a Linux host — was produced by a program running inside the remote
// session and must be left in the terminal for the user to answer there.
func isLocalPassphrasePrompt(prompt string) bool {
	keyPath := parsePassphraseKeyPath(prompt)
	if keyPath == "" {
		return false
	}
	if strings.HasPrefix(keyPath, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			keyPath = filepath.Join(home, keyPath[2:])
		}
	}
	if !filepath.IsAbs(keyPath) {
		return false
	}
	_, err := os.Stat(keyPath)
	return err == nil
}

// addKeyToAgent runs `ssh-add <keyPath>` under a pty and feeds it the
// passphrase, so subsequent ssh invocations are answered by the agent and the
// user is not prompted again. No-op if SSH_AUTH_SOCK is missing or ssh-add is
// not available.
func (a *App) addKeyToAgent(keyPath, passphrase string) {
	if keyPath == "" || passphrase == "" {
		return
	}

	agentState.mu.Lock()
	if agentState.loadedKeys[keyPath] {
		agentState.mu.Unlock()
		return
	}
	agentState.mu.Unlock()

	if os.Getenv("SSH_AUTH_SOCK") == "" {
		agentState.mu.Lock()
		warned := agentState.warnedNoAgent
		agentState.warnedNoAgent = true
		agentState.mu.Unlock()
		if !warned {
			log.Printf("ssh-agent: SSH_AUTH_SOCK not set; cannot cache passphrase")
		}
		return
	}
	if _, err := exec.LookPath("ssh-add"); err != nil {
		return
	}

	cmd := exec.Command("ssh-add", keyPath)
	cmd.Env = termEnv()
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("ssh-add pty start failed key=%s err=%v", keyPath, err)
		return
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		var acc []byte
		buf := make([]byte, 1024)
		written := false
		deadline := time.Now().Add(5 * time.Second)
		for {
			_ = ptmx.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
			n, rerr := ptmx.Read(buf)
			if n > 0 {
				acc = append(acc, buf[:n]...)
				if !written && bytes.Contains(acc, []byte(": ")) {
					if _, werr := ptmx.Write([]byte(passphrase + "\n")); werr != nil {
						return
					}
					written = true
					acc = acc[:0]
				}
			}
			if rerr != nil {
				if rerr == io.EOF || errors.Is(rerr, os.ErrClosed) ||
					strings.Contains(rerr.Error(), "input/output error") {
					return
				}
				if os.IsTimeout(rerr) {
					if time.Now().After(deadline) {
						return
					}
					continue
				}
				return
			}
		}
	}()

	waitErr := cmd.Wait()
	_ = ptmx.Close()
	<-done
	if waitErr != nil {
		log.Printf("ssh-add failed key=%s err=%v", keyPath, waitErr)
		return
	}

	agentState.mu.Lock()
	agentState.loadedKeys[keyPath] = true
	agentState.mu.Unlock()
	log.Printf("ssh-add: cached key %s in agent", keyPath)
}
