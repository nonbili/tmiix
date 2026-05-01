package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/creack/pty"
)

type SSHServer struct {
	Name         string `json:"name"`
	Host         string `json:"host"`
	User         string `json:"user,omitempty"`
	Port         int    `json:"port,omitempty"`
	IdentityFile string `json:"identityFile,omitempty"`
	Color        string `json:"color,omitempty"`
	// FromConfig marks entries parsed from ~/.ssh/config. For these we pass
	// only the Host alias to ssh so that all ssh_config directives apply.
	FromConfig bool `json:"fromConfig,omitempty"`
}

func serversConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmiix", "servers.json"), nil
}

func loadServers() ([]SSHServer, error) {
	path, err := serversConfigPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []SSHServer{}, nil
		}
		return nil, err
	}
	var servers []SSHServer
	if err := json.Unmarshal(data, &servers); err != nil {
		return nil, err
	}
	if servers == nil {
		servers = []SSHServer{}
	}
	return servers, nil
}

func saveServers(servers []SSHServer) error {
	path, err := serversConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(servers, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func (a *App) ListSSHServers() ([]SSHServer, error) {
	servers, err := loadServers()
	if err != nil {
		return nil, err
	}
	sort.Slice(servers, func(i, j int) bool { return servers[i].Name < servers[j].Name })
	return servers, nil
}

func (a *App) AddSSHServer(s SSHServer) error {
	s.Name = strings.TrimSpace(s.Name)
	s.Host = strings.TrimSpace(s.Host)
	s.User = strings.TrimSpace(s.User)
	s.IdentityFile = strings.TrimSpace(s.IdentityFile)
	if s.Name == "" {
		return errors.New("name is required")
	}
	if s.Host == "" {
		return errors.New("host is required")
	}
	if s.Port < 0 || s.Port > 65535 {
		return errors.New("invalid port")
	}
	servers, err := loadServers()
	if err != nil {
		return err
	}
	for i, existing := range servers {
		if existing.Name == s.Name {
			servers[i] = s
			return saveServers(servers)
		}
	}
	servers = append(servers, s)
	return saveServers(servers)
}

func (a *App) RemoveSSHServer(name string) error {
	servers, err := loadServers()
	if err != nil {
		return err
	}
	filtered := servers[:0]
	for _, s := range servers {
		if s.Name != name {
			filtered = append(filtered, s)
		}
	}
	return saveServers(filtered)
}

func (a *App) findServer(name string) (*SSHServer, error) {
	servers, err := loadServers()
	if err != nil {
		return nil, err
	}
	for _, s := range servers {
		if s.Name == name {
			sc := s
			return &sc, nil
		}
	}
	// Fall back to ~/.ssh/config entries.
	if cfgHosts, _ := a.ListSSHConfigHosts(); cfgHosts != nil {
		for _, s := range cfgHosts {
			if s.Name == name {
				sc := s
				return &sc, nil
			}
		}
	}
	return nil, fmt.Errorf("server %q not found", name)
}

// sshArgs builds the argument list for ssh, excluding the final remote command.
// If interactive is true, includes -tt to force pty allocation.
func (s *SSHServer) sshArgs(interactive bool) []string {
	args := []string{}
	if interactive {
		args = append(args, "-tt")
	} else {
		// Limit to pubkey so the only interactive prompt we might hit is a
		// passphrase for a locked key — which we intercept via the pty.
		args = append(args, "-o", "PreferredAuthentications=publickey")
	}
	args = append(args, "-o", "ServerAliveInterval=30")
	// Try to forward our program identity and color support.
	args = append(args, "-o", "SendEnv=COLORTERM TERM_PROGRAM")

	if s.FromConfig {
		// Use the Host alias so OpenSSH applies the full ssh_config block.
		args = append(args, s.Name)
		return args
	}
	if s.Port > 0 {
		args = append(args, "-p", fmt.Sprintf("%d", s.Port))
	}
	if s.IdentityFile != "" {
		args = append(args, "-i", s.IdentityFile)
	}
	target := s.Host
	if s.User != "" {
		target = s.User + "@" + s.Host
	}
	args = append(args, target)
	return args
}

func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}

func remoteCommand(args ...string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		quoted = append(quoted, shellQuote(arg))
	}
	return strings.Join(quoted, " ")
}

// shellWrappedSSH launches ssh as a forked child of /bin/sh instead of as the
// pty's direct child. This matches how an interactive shell runs ssh, which is
// the configuration ssh itself needs for controlling-terminal detection to
// succeed (and thus to prompt for key passphrases).
//
// The multi-statement script prevents /bin/sh from exec-optimizing ssh in
// place; that would make it equivalent to launching ssh directly and defeats
// the purpose of the wrapper.
func shellWrappedSSH(args []string) *exec.Cmd {
	script := "ssh \"$@\"\nexit \"$?\""
	shArgs := append([]string{"-c", script, "sh"}, args...)
	return exec.Command("/bin/sh", shArgs...)
}

func (a *App) ListRemoteSessions(serverName string) ([]string, error) {
	s, err := a.findServer(serverName)
	if err != nil {
		return nil, err
	}
	args := append(s.sshArgs(false), remoteCommand("tmux", "list-sessions", "-F", "#{session_name}"))
	cmd := shellWrappedSSH(args)
	cmd.Env = termEnv()
	out, err := a.runSSHPty(cmd, serverName)
	if err != nil {
		// tmux exits non-zero if no sessions; treat that as empty.
		msg := err.Error()
		if strings.Contains(msg, "no server running") || strings.Contains(msg, "no sessions") {
			return []string{}, nil
		}
		return nil, err
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return []string{}, nil
	}
	return strings.Split(trimmed, "\n"), nil
}

func (a *App) AttachRemoteSession(tabId, serverName, sessionName string) error {
	s, err := a.findServer(serverName)
	if err != nil {
		return err
	}
	args := append(s.sshArgs(true), remoteCommand("tmux", "-u", "-T", tmuxClientFeatures, "attach-session", "-t", sessionName))
	cmd := shellWrappedSSH(args)
	cmd.Env = termEnv()
	return a.startTab(tabId, cmd, true /* watchPassphrase */, serverName)
}

func (a *App) OpenRemoteShell(tabId, serverName string) error {
	s, err := a.findServer(serverName)
	if err != nil {
		return err
	}
	args := s.sshArgs(true)
	cmd := shellWrappedSSH(args)
	cmd.Env = termEnv()
	return a.startTab(tabId, cmd, true /* watchPassphrase */, serverName)
}

// runSSHPty runs a non-interactive ssh command under a pty so that passphrase
// prompts can be intercepted and relayed to the UI. Returns the non-prompt
// output. owner is used as the passphrase registry owner (so pending prompts
// can be cancelled if the request is abandoned).
func (a *App) runSSHPty(cmd *exec.Cmd, owner string) ([]byte, error) {
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("ssh pty start failed owner=%s cmd=%s err=%v", owner, cmd.Path, err)
		return nil, err
	}
	defer func() {
		_ = ptmx.Close()
		a.passphrases.cancelFor(owner)
	}()

	var (
		collected bytes.Buffer
		lineBuf   []byte
	)
	buf := make([]byte, 4096)
	for {
		_ = ptmx.SetReadDeadline(time.Now().Add(2 * time.Minute))
		n, rerr := ptmx.Read(buf)
		if n > 0 {
			lineBuf = append(lineBuf, buf[:n]...)
			for {
				idx := bytes.Index(lineBuf, passphraseTrigger)
				if idx < 0 {
					collected.Write(lineBuf)
					lineBuf = lineBuf[:0]
					break
				}
				tail := lineBuf[idx+len(passphraseTrigger):]
				endRel := bytes.Index(tail, []byte("': "))
				if endRel < 0 {
					collected.Write(lineBuf[:idx])
					lineBuf = append(lineBuf[:0], lineBuf[idx:]...)
					break
				}
				promptEnd := idx + len(passphraseTrigger) + endRel + len("': ")
				prompt := string(lineBuf[idx : promptEnd-1])
				collected.Write(lineBuf[:idx])
				lineBuf = append(lineBuf[:0], lineBuf[promptEnd:]...)

				reply := a.passphrases.request(a.ctx, owner, prompt)
				val, ok := <-reply
				if !ok {
					log.Printf("ssh passphrase cancelled owner=%s", owner)
					_ = cmd.Process.Kill()
					return nil, errors.New("cancelled")
				}
				if _, werr := ptmx.Write([]byte(val + "\n")); werr != nil {
					log.Printf("ssh passphrase write failed owner=%s err=%v", owner, werr)
					return nil, werr
				}
			}
		}
		if rerr != nil {
			if rerr == io.EOF || errors.Is(rerr, os.ErrClosed) {
				break
			}
			// EIO on pty after child exits is expected on Linux.
			if strings.Contains(rerr.Error(), "input/output error") {
				break
			}
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			log.Printf("ssh pty read failed owner=%s err=%v", owner, rerr)
			return nil, rerr
		}
	}
	if werr := cmd.Wait(); werr != nil {
		out := strings.TrimSpace(collected.String())
		if out == "" {
			log.Printf("ssh command failed owner=%s err=%v", owner, werr)
			return nil, werr
		}
		log.Printf("ssh command failed owner=%s err=%v output=%q", owner, werr, out)
		return nil, fmt.Errorf("%s", out)
	}
	// ssh over pty tends to insert CR before LF — normalize.
	cleaned := bytes.ReplaceAll(collected.Bytes(), []byte("\r\n"), []byte("\n"))
	return cleaned, nil
}
