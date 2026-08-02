package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestAddSSHServerPersistsAutoConnect(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configDir)
	t.Setenv("HOME", configDir)

	app := NewApp()
	if err := app.AddSSHServer(SSHServer{
		Name:        "prod",
		Host:        "prod.example.com",
		AutoConnect: true,
	}); err != nil {
		t.Fatal(err)
	}

	servers, err := app.ListSSHServers()
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if !servers[0].AutoConnect {
		t.Fatalf("expected autoConnect to persist, got %+v", servers[0])
	}
}

func TestSSHArgsQuietNonInteractiveUsesBatchMode(t *testing.T) {
	server := SSHServer{Name: "prod", Host: "prod.example.com"}

	args := server.sshArgs(false, false)
	if !hasAdjacentArgs(args, "-o", "BatchMode=yes") {
		t.Fatalf("expected quiet non-interactive ssh args to include BatchMode=yes, got %#v", args)
	}
}

func TestSSHArgsPromptingNonInteractiveDoesNotUseBatchMode(t *testing.T) {
	server := SSHServer{Name: "prod", Host: "prod.example.com"}

	args := server.sshArgs(false, true)
	if hasAdjacentArgs(args, "-o", "BatchMode=yes") {
		t.Fatalf("expected prompting non-interactive ssh args not to include BatchMode=yes, got %#v", args)
	}
}

func hasAdjacentArgs(args []string, left, right string) bool {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == left && args[i+1] == right {
			return true
		}
	}
	return false
}

// TestRemoteShellScriptReportsTTY runs remoteShellScript the way sshd does —
// as the argument of `$SHELL -c` on a tty — and checks that the tty marker
// survives that quoting and is understood by the filter that consumes it.
func TestRemoteShellScriptReportsTTY(t *testing.T) {
	for _, loginShell := range []string{"/bin/sh", "/bin/bash"} {
		if _, err := os.Stat(loginShell); err != nil {
			continue
		}
		t.Run(loginShell, func(t *testing.T) {
			cmd := exec.Command(loginShell, "-c", remoteShellScript)
			cmd.Env = append(os.Environ(), "SHELL="+loginShell)
			ptmx, err := pty.Start(cmd)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				_ = ptmx.Close()
				_ = cmd.Process.Kill()
				_, _ = cmd.Process.Wait()
			}()

			app := NewApp()
			s := &ptySession{serverName: "box"}
			buf := make([]byte, 4096)
			for s.remoteTTY == "" {
				_ = ptmx.SetReadDeadline(time.Now().Add(10 * time.Second))
				n, rerr := ptmx.Read(buf)
				if n > 0 {
					app.filterRemoteTTYMarker(s, buf[:n])
				}
				if rerr != nil {
					break
				}
			}
			if !strings.HasPrefix(s.remoteTTY, "/dev/") {
				t.Fatalf("remoteTTY = %q, want the shell's pty path", s.remoteTTY)
			}
		})
	}
}
