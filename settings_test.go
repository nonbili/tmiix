package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEffectiveSettingsMergesUserOverrides(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configDir)

	appConfigDir := filepath.Join(configDir, "tmiix")
	if err := os.MkdirAll(appConfigDir, 0o755); err != nil {
		t.Fatal(err)
	}
	userSettings := []byte(`
[font]
size = 15

[keybindings]
"palette.switch" = "Ctrl+P"
"tab.select.9" = ""
`)
	if err := os.WriteFile(filepath.Join(appConfigDir, "settings.toml"), userSettings, 0o644); err != nil {
		t.Fatal(err)
	}

	settings, err := effectiveSettings()
	if err != nil {
		t.Fatal(err)
	}

	if settings.Font.Family == "" {
		t.Fatal("expected default font family to remain set")
	}
	if settings.Font.Size != 15 {
		t.Fatalf("expected font size override, got %v", settings.Font.Size)
	}
	if settings.Font.LineHeight != 1 {
		t.Fatalf("expected default line height, got %v", settings.Font.LineHeight)
	}
	if settings.Keybindings["palette.switch"] != "Ctrl+P" {
		t.Fatalf("expected keybinding override, got %q", settings.Keybindings["palette.switch"])
	}
	if settings.Keybindings["tab.select.9"] != "" {
		t.Fatalf("expected disabled keybinding, got %q", settings.Keybindings["tab.select.9"])
	}
}
