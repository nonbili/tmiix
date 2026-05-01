package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func findServer(servers []SSHServer, name string) *SSHServer {
	for i := range servers {
		if servers[i].Name == name {
			return &servers[i]
		}
	}
	return nil
}

func TestParseSSHConfigBasic(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config")
	writeFile(t, cfg, `
# global comment
Host alpha
    HostName alpha.example.com
    User alice
    Port 2222
    IdentityFile ~/.ssh/id_alpha

Host beta
    HostName=beta.example.com
    User="bob"
`)
	servers, err := parseSSHConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %d (%v)", len(servers), servers)
	}
	a := findServer(servers, "alpha")
	if a == nil {
		t.Fatal("alpha missing")
	}
	if a.Host != "alpha.example.com" || a.User != "alice" || a.Port != 2222 {
		t.Fatalf("alpha mis-parsed: %+v", a)
	}
	if !a.FromConfig {
		t.Fatal("expected FromConfig=true")
	}
	if home, _ := os.UserHomeDir(); home != "" {
		want := filepath.Join(home, ".ssh", "id_alpha")
		if a.IdentityFile != want {
			t.Fatalf("identity not expanded: got %q want %q", a.IdentityFile, want)
		}
	}
	b := findServer(servers, "beta")
	if b == nil {
		t.Fatal("beta missing")
	}
	if b.Host != "beta.example.com" || b.User != "bob" {
		t.Fatalf("beta mis-parsed (key=value / quotes): %+v", b)
	}
}

func TestParseSSHConfigSkipsWildcardsAndMatch(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config")
	writeFile(t, cfg, `
Host *
    User defaultuser

Host *.internal prod-?
    Port 2200

Match host something
    User shouldnotappear

Host real
    HostName real.example.com
`)
	servers, err := parseSSHConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 || servers[0].Name != "real" {
		t.Fatalf("expected only 'real', got %+v", servers)
	}
	if servers[0].Host != "real.example.com" {
		t.Fatalf("wrong host: %+v", servers[0])
	}
}

func TestParseSSHConfigMultipleAliasesPicksFirstConcrete(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config")
	writeFile(t, cfg, `
Host *.wild concrete other
    HostName picked.example.com
`)
	servers, err := parseSSHConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 || servers[0].Name != "concrete" {
		t.Fatalf("expected first concrete alias 'concrete', got %+v", servers)
	}
}

func TestParseSSHConfigMatchDoesNotLeakIntoNextHost(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config")
	writeFile(t, cfg, `
Host before
    HostName before.example.com
    User u1

Match host whatever
    User leaked

Host after
    HostName after.example.com
`)
	servers, err := parseSSHConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %+v", servers)
	}
	if a := findServer(servers, "after"); a == nil || a.User != "" {
		t.Fatalf("after should have no user (Match block must not leak): %+v", a)
	}
}

func TestParseSSHConfigInclude(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	sshDir := filepath.Join(dir, ".ssh")
	main := filepath.Join(sshDir, "config")
	writeFile(t, main, `
Include extra/*.conf

Host top
    HostName top.example.com
`)
	writeFile(t, filepath.Join(sshDir, "extra", "a.conf"), `
Host inc-a
    HostName a.example.com
`)
	writeFile(t, filepath.Join(sshDir, "extra", "b.conf"), `
Host inc-b
    HostName b.example.com
`)

	servers, err := parseSSHConfig(main, nil)
	if err != nil {
		t.Fatal(err)
	}
	if findServer(servers, "top") == nil ||
		findServer(servers, "inc-a") == nil ||
		findServer(servers, "inc-b") == nil {
		t.Fatalf("missing entries from include: %+v", servers)
	}
}

func TestParseSSHConfigIncludeCycleTerminates(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	sshDir := filepath.Join(dir, ".ssh")
	a := filepath.Join(sshDir, "config")
	b := filepath.Join(sshDir, "other")
	writeFile(t, a, `
Include other
Host ha
    HostName ha.example.com
`)
	writeFile(t, b, `
Include config
Host hb
    HostName hb.example.com
`)
	servers, err := parseSSHConfig(a, nil)
	if err != nil {
		t.Fatal(err)
	}
	if findServer(servers, "ha") == nil || findServer(servers, "hb") == nil {
		t.Fatalf("expected ha and hb, got %+v", servers)
	}
}

func TestParseSSHConfigMissingFile(t *testing.T) {
	servers, err := parseSSHConfig(filepath.Join(t.TempDir(), "does-not-exist"), nil)
	if err != nil {
		t.Fatalf("missing file should not error, got %v", err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected no servers, got %+v", servers)
	}
}

func TestParseSSHConfigInvalidPortIgnored(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config")
	writeFile(t, cfg, `
Host h
    HostName h.example.com
    Port not-a-number
`)
	servers, err := parseSSHConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 || servers[0].Port != 0 {
		t.Fatalf("expected port 0 for invalid value, got %+v", servers)
	}
}

func TestSplitConfigLine(t *testing.T) {
	cases := []struct {
		in       string
		key, val string
	}{
		{"HostName foo.example.com", "HostName", "foo.example.com"},
		{"HostName=foo.example.com", "HostName", "foo.example.com"},
		{"HostName  =   foo.example.com", "HostName", "foo.example.com"},
		{`User "alice"`, "User", "alice"},
		{"Port\t2222", "Port", "2222"},
		{"BareKey", "BareKey", ""},
	}
	for _, c := range cases {
		k, v := splitConfigLine(c.in)
		if k != c.key || v != c.val {
			t.Errorf("splitConfigLine(%q) = (%q,%q), want (%q,%q)", c.in, k, v, c.key, c.val)
		}
	}
}

func TestFirstConcreteHost(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"alpha", "alpha"},
		{"*.example.com alpha", "alpha"},
		{"*.example.com !bad alpha beta", "alpha"},
		{"*", ""},
		{`"quoted" other`, "quoted"},
		{"", ""},
	}
	for _, c := range cases {
		got := firstConcreteHost(c.in)
		if got != c.want {
			t.Errorf("firstConcreteHost(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
