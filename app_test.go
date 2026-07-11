package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestExtendPathAppendsMissingDirsOnly(t *testing.T) {
	sep := string(os.PathListSeparator)
	t.Setenv("PATH", "/usr/bin"+sep+"/opt/homebrew/bin")

	extendPath([]string{"/opt/homebrew/bin", "/usr/local/bin"})

	want := "/usr/bin" + sep + "/opt/homebrew/bin" + sep + "/usr/local/bin"
	if got := os.Getenv("PATH"); got != want {
		t.Fatalf("PATH = %q, want %q", got, want)
	}
}

func TestStartTabReplacesExistingSessionForSameTabID(t *testing.T) {
	app := NewApp()
	cmd1 := longRunningShell()
	if err := app.startTab("tab-1", cmd1, false, ""); err != nil {
		t.Fatal(err)
	}

	app.mu.Lock()
	first := app.tabs["tab-1"]
	firstGen := first.gen
	app.mu.Unlock()

	cmd2 := longRunningShell()
	if err := app.startTab("tab-1", cmd2, false, ""); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		app.CloseTab("tab-1")
	})

	if !waitForProcessExit(cmd1, time.Second) {
		t.Fatal("expected replaced tab process to exit")
	}

	app.mu.Lock()
	current := app.tabs["tab-1"]
	app.mu.Unlock()
	if current == nil {
		t.Fatal("expected replacement session to remain registered")
	}
	if current.gen == firstGen {
		t.Fatalf("expected replacement generation to change, got %d", current.gen)
	}
	if current.cmd != cmd2 {
		t.Fatal("expected registered session to be the replacement command")
	}
}

func TestDetectTabSessionUnknownTab(t *testing.T) {
	app := NewApp()

	name, err := app.DetectTabSession("does-not-exist")
	if err != nil {
		t.Fatal(err)
	}
	if name != "" {
		t.Fatalf("DetectTabSession = %q, want empty", name)
	}
}

func TestDetectTabSessionPlainShellReturnsEmpty(t *testing.T) {
	app := NewApp()
	if err := app.startTab("tab-shell", longRunningShell(), false, ""); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.CloseTab("tab-shell") })

	name, err := app.DetectTabSession("tab-shell")
	if err != nil {
		t.Fatal(err)
	}
	if name != "" {
		t.Fatalf("DetectTabSession = %q, want empty for a tab with no tmux client", name)
	}
}

// TestDetectTabSessionMatchesAttachedClient covers the bug this method fixes:
// a shell tab where the user (or an external script) ran `tmux new-session`
// directly, rather than through tmiix's own attach flow, must still be
// recognized as carrying that session so actions like "kill session" work.
//
// This registers the ptySession directly (skipping startTab's `go
// a.readTab(...)`) because that reader goroutine calls into the Wails
// runtime's EventsEmit on process exit, which calls log.Fatal (aborting the
// whole test binary) when App.ctx hasn't been wired up by a real Wails
// lifecycle — as it isn't in these unit tests. DetectTabSession itself only
// reads from a.tabs, so it doesn't need the reader goroutine running.
func TestDetectTabSessionMatchesAttachedClient(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not available")
	}

	app := NewApp()
	sessionName := fmt.Sprintf("tmiix-test-%d", time.Now().UnixNano())
	cmd := exec.Command("tmux", "new-session", "-s", sessionName)

	// Mirrors startTab's manual pty.Open+Setctty dance (see app.go) rather
	// than pty.Start, which never exposes the slave tty path this test needs.
	ptmx, tty, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = tty, tty, tty
	ttyName := tty.Name()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	_ = tty.Close()

	app.mu.Lock()
	app.tabs["tab-tmux"] = &ptySession{ptmx: ptmx, ttyName: ttyName, cmd: cmd}
	app.mu.Unlock()
	t.Cleanup(func() {
		_ = exec.Command("tmux", "kill-session", "-t", sessionName).Run()
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	})

	deadline := time.Now().Add(2 * time.Second)
	var got string
	for time.Now().Before(deadline) {
		name, err := app.DetectTabSession("tab-tmux")
		if err != nil {
			t.Fatal(err)
		}
		if name == sessionName {
			got = name
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got != sessionName {
		t.Fatalf("DetectTabSession = %q, want %q", got, sessionName)
	}
}

func longRunningShell() *exec.Cmd {
	return exec.Command("sh", "-c", "trap 'exit 0' TERM; while :; do sleep 1; done")
}

// waitForProcessExit polls for the process's death via a signal-0 liveness
// check rather than cmd.ProcessState: startTab reaps the old process with
// cmd.Process.Wait() (the os.Process method), which never populates
// cmd.ProcessState — only exec.Cmd's own Wait() does that.
func waitForProcessExit(cmd *exec.Cmd, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cmd.Process.Signal(syscall.Signal(0)) != nil {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cmd.Process.Signal(syscall.Signal(0)) != nil
}
