package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsLocalPassphrasePrompt(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "id_ed25519")
	if err := os.WriteFile(keyPath, []byte("key"), 0o600); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name   string
		prompt string
		want   bool
	}{
		{"local key", "Enter passphrase for key '" + keyPath + "'", true},
		{"missing path", "Enter passphrase for key '/Users/rnons/.ssh/id_ed25519'", false},
		{"relative path", "Enter passphrase for key 'id_ed25519'", false},
		{"not a prompt", "some other output", false},
	}
	for _, tc := range cases {
		if got := isLocalPassphrasePrompt(tc.prompt); got != tc.want {
			t.Errorf("%s: isLocalPassphrasePrompt(%q) = %v, want %v", tc.name, tc.prompt, got, tc.want)
		}
	}
}

// filterPassphrase must forward prompts for non-local keys to the terminal
// untouched (these originate from programs inside the remote session) instead of
// hijacking them into the askpass dialog.
func TestFilterPassphraseForwardsRemotePrompt(t *testing.T) {
	a := &App{passphrases: newPassphraseRegistry()}
	s := &ptySession{watchPassphrase: true}

	data := []byte("Enter passphrase for key '/Users/rnons/.ssh/id_ed25519': ")
	out := a.filterPassphrase("tab1", s, data)

	if string(out) != string(data) {
		t.Fatalf("remote prompt should pass through verbatim:\n got %q\nwant %q", out, data)
	}
	if len(s.lineBuf) != 0 {
		t.Fatalf("lineBuf should be drained, got %q", s.lineBuf)
	}
}
