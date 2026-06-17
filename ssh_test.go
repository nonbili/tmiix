package main

import "testing"

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
