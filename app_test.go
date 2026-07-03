package main

import (
	"os"
	"os/exec"
	"testing"
	"time"
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

func longRunningShell() *exec.Cmd {
	return exec.Command("sh", "-c", "trap 'exit 0' TERM; while :; do sleep 1; done")
}

func waitForProcessExit(cmd *exec.Cmd, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cmd.ProcessState != nil && cmd.ProcessState.Exited()
}
