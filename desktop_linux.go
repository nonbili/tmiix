//go:build linux

package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
)

// installDesktopEntry writes a .desktop file and icon into the user's
// XDG data dir so GNOME/KDE/etc. show the app's logo in the dock and
// switcher. Safe to call on every startup: it only rewrites files when
// their content has changed.
func installDesktopEntry() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return
	}

	dataHome := os.Getenv("XDG_DATA_HOME")
	if dataHome == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return
		}
		dataHome = filepath.Join(home, ".local", "share")
	}

	iconPath := filepath.Join(dataHome, "icons", "tmiix.png")
	desktopPath := filepath.Join(dataHome, "applications", "tmiix.desktop")

	writeIfChanged(iconPath, linuxAppIconPNG)

	desktop := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=tmiix
Comment=Terminal multiplexer UI
Exec=%s
Icon=tmiix
Terminal=false
Categories=Utility;TerminalEmulator;
StartupWMClass=tmiix
`, exe)
	writeIfChanged(desktopPath, []byte(desktop))
}

func writeIfChanged(path string, data []byte) {
	if existing, err := os.ReadFile(path); err == nil {
		if sha256.Sum256(existing) == sha256.Sum256(data) {
			return
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(path, data, 0o644)
}
