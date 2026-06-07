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
