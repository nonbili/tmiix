package main

import (
	_ "embed"
	"errors"
	"log"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/BurntSushi/toml"
)

//go:embed settings.toml
var defaultSettingsTOML []byte

// Settings is the shape persisted at ~/.config/tmiix/settings.toml.
// Only fields users set are written back; unset keys fall back to defaults
// embedded in the binary.
type Settings struct {
	Theme       string            `toml:"theme" json:"theme"`
	UITheme     string            `toml:"ui_theme" json:"uiTheme"`
	Font        FontSettings      `toml:"font" json:"font"`
	Keybindings map[string]string `toml:"keybindings" json:"keybindings"`
}

type FontSettings struct {
	Family        string  `toml:"family" json:"family"`
	Size          float64 `toml:"size" json:"size"`
	LineHeight    float64 `toml:"line_height" json:"lineHeight"`
	LetterSpacing float64 `toml:"letter_spacing" json:"letterSpacing"`
}

func settingsConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmiix", "settings.toml"), nil
}

func defaultSettings() Settings {
	var s Settings
	if err := toml.Unmarshal(defaultSettingsTOML, &s); err != nil {
		// The embedded file is part of the build; a parse failure means the
		// repo is broken, so surfacing empty settings here is safe; the tree
		// would fail to build before reaching this path in practice.
		return Settings{Keybindings: map[string]string{}}
	}
	if s.Keybindings == nil {
		s.Keybindings = map[string]string{}
	}
	return s
}

func loadUserSettings() (Settings, *toml.MetaData, error) {
	path, err := settingsConfigPath()
	if err != nil {
		return Settings{}, nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Settings{}, nil, nil
		}
		return Settings{}, nil, err
	}
	var s Settings
	meta, err := toml.Decode(string(data), &s)
	if err != nil {
		return Settings{}, nil, err
	}
	return s, &meta, nil
}

func effectiveSettings() (Settings, error) {
	merged := defaultSettings()
	user, meta, err := loadUserSettings()
	if err != nil {
		// A malformed user settings file shouldn't take down the whole
		// frontend (e.g. wiping out keybindings). Log and fall back to
		// defaults so the app stays usable.
		log.Printf("settings: ignoring user settings file: %v", err)
		return merged, nil
	}
	if user.Theme != "" {
		merged.Theme = user.Theme
	}
	if user.UITheme != "" {
		merged.UITheme = user.UITheme
	}
	if user.Font.Family != "" {
		merged.Font.Family = user.Font.Family
	}
	if user.Font.Size > 0 {
		merged.Font.Size = user.Font.Size
	}
	if user.Font.LineHeight > 0 {
		merged.Font.LineHeight = user.Font.LineHeight
	}
	if meta != nil && meta.IsDefined("font", "letter_spacing") {
		merged.Font.LetterSpacing = user.Font.LetterSpacing
	}
	maps.Copy(merged.Keybindings, user.Keybindings)
	return merged, nil
}

// GetSettings returns the effective settings: embedded defaults overridden by
// any entries the user has set in settings.toml.
func (a *App) GetSettings() (Settings, error) {
	return effectiveSettings()
}

// GetKeybindings returns the effective keybinding map.
func (a *App) GetKeybindings() (map[string]string, error) {
	settings, err := effectiveSettings()
	return settings.Keybindings, err
}

const userSettingsStub = `# tmiix user settings
#
# Any keys you set here override the bundled defaults; unset keys fall back.
# For the full list of supported keys, see the reference settings.toml in the
# project repository: https://github.com/nonbili/tmiix/blob/main/settings.toml
`

// OpenSettingsFile reveals ~/.config/tmiix/settings.toml in the OS default
// editor, creating the file (with a stub pointing at the reference) if it
// doesn't yet exist.
func (a *App) OpenSettingsFile() error {
	path, err := settingsConfigPath()
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(userSettingsStub), 0o644); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return openWithDefaultApp(path)
}

func openWithDefaultApp(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}
