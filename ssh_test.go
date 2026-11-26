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

func TestRemoteAttachCommandReportsTTYOnlyForAnExistingSession(t *testing.T) {
	dir := t.TempDir()
	script := `#!/bin/sh
[ "$1" != "-u" ] || shift 3
[ "$2" = "-t" ] && [ "$3" = "project's work" ] || exit 2
case "$1" in
  has-session) exit "$TMUX_HAS_SESSION_STATUS" ;;
  attach-session) printf 'attached\n' ;;
  *) exit 2 ;;
esac
`
	if err := os.WriteFile(dir+"/tmux", []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	command := remoteAttachCommand("project's work")

	t.Setenv("TMUX_HAS_SESSION_STATUS", "0")
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer ptmx.Close()
	defer tty.Close()
	cmd := exec.Command("/bin/sh", "-c", command)
	cmd.Stdin = tty
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("attach failed: %v, output %q", err, output)
	}
	if !strings.Contains(string(output), "\033]1337;tmiix-tty=/dev/") ||
		!strings.HasSuffix(string(output), "\007attached\n") {
		t.Fatalf("expected tty marker followed by attach output, got %q", output)
	}

	t.Setenv("TMUX_HAS_SESSION_STATUS", "1")
	out, err := exec.Command("/bin/sh", "-c", command).CombinedOutput()
	if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 1 || len(out) != 0 {
		t.Fatalf("expected failure without a tty marker, got %v and output %q", err, out)
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
