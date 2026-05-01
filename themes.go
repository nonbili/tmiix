package main

import (
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"

	"github.com/BurntSushi/toml"
)

//go:embed themes/*.toml
var defaultThemesFS embed.FS

// TerminalTheme is the wire shape consumed by the frontend. Field tags use
// json: keys to mirror xterm.js's ITheme members so the frontend can drop the
// payload straight into Terminal options.
type TerminalTheme struct {
	ID    string             `json:"id"`
	Name  string             `json:"name"`
	Theme TerminalThemeColor `json:"theme"`
}

type TerminalThemeColor struct {
	Background          string `json:"background,omitempty"`
	Foreground          string `json:"foreground,omitempty"`
	Cursor              string `json:"cursor,omitempty"`
	CursorAccent        string `json:"cursorAccent,omitempty"`
	SelectionBackground string `json:"selectionBackground,omitempty"`
	Black               string `json:"black,omitempty"`
	Red                 string `json:"red,omitempty"`
	Green               string `json:"green,omitempty"`
	Yellow              string `json:"yellow,omitempty"`
	Blue                string `json:"blue,omitempty"`
	Magenta             string `json:"magenta,omitempty"`
	Cyan                string `json:"cyan,omitempty"`
	White               string `json:"white,omitempty"`
	BrightBlack         string `json:"brightBlack,omitempty"`
	BrightRed           string `json:"brightRed,omitempty"`
	BrightGreen         string `json:"brightGreen,omitempty"`
	BrightYellow        string `json:"brightYellow,omitempty"`
	BrightBlue          string `json:"brightBlue,omitempty"`
	BrightMagenta       string `json:"brightMagenta,omitempty"`
	BrightCyan          string `json:"brightCyan,omitempty"`
	BrightWhite         string `json:"brightWhite,omitempty"`
}

// alacrittyTheme is the on-disk shape. It mirrors the alacritty colors schema
// so community theme files load unmodified; the display name is derived from
// the filename.
type alacrittyTheme struct {
	Colors struct {
		Primary struct {
			Background string `toml:"background"`
			Foreground string `toml:"foreground"`
		} `toml:"primary"`
		Cursor struct {
			Cursor string `toml:"cursor"`
			Text   string `toml:"text"`
		} `toml:"cursor"`
		Selection struct {
			Background string `toml:"background"`
		} `toml:"selection"`
		Normal alacrittyAnsi `toml:"normal"`
		Bright alacrittyAnsi `toml:"bright"`
	} `toml:"colors"`
}

type alacrittyAnsi struct {
	Black   string `toml:"black"`
	Red     string `toml:"red"`
	Green   string `toml:"green"`
	Yellow  string `toml:"yellow"`
	Blue    string `toml:"blue"`
	Magenta string `toml:"magenta"`
	Cyan    string `toml:"cyan"`
	White   string `toml:"white"`
}

func userThemesDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmiix", "themes"), nil
}

// loadThemes returns embedded defaults overlaid by ~/.config/tmiix/themes.
// Files in the user directory override embedded entries with the same id
// (filename minus extension).
func loadThemes() []TerminalTheme {
	byID := map[string]TerminalTheme{}

	entries, err := fs.ReadDir(defaultThemesFS, "themes")
	if err == nil {
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".toml") {
				continue
			}
			data, err := fs.ReadFile(defaultThemesFS, filepath.ToSlash(filepath.Join("themes", e.Name())))
			if err != nil {
				log.Printf("themes: read embedded %s: %v", e.Name(), err)
				continue
			}
			theme, err := parseTheme(e.Name(), data)
			if err != nil {
				log.Printf("themes: parse embedded %s: %v", e.Name(), err)
				continue
			}
			byID[theme.ID] = theme
		}
	}

	if dir, err := userThemesDir(); err == nil {
		entries, err := os.ReadDir(dir)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() || !strings.HasSuffix(e.Name(), ".toml") {
					continue
				}
				path := filepath.Join(dir, e.Name())
				data, err := os.ReadFile(path)
				if err != nil {
					log.Printf("themes: read %s: %v", path, err)
					continue
				}
				theme, err := parseTheme(e.Name(), data)
				if err != nil {
					log.Printf("themes: parse %s: %v", path, err)
					continue
				}
				byID[theme.ID] = theme
			}
		}
	}

	out := make([]TerminalTheme, 0, len(byID))
	for _, t := range byID {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func parseTheme(filename string, data []byte) (TerminalTheme, error) {
	var raw alacrittyTheme
	if err := toml.Unmarshal(data, &raw); err != nil {
		return TerminalTheme{}, err
	}
	id := strings.TrimSuffix(filename, filepath.Ext(filename))
	t := TerminalTheme{
		ID:   id,
		Name: displayNameFromID(id),
		Theme: TerminalThemeColor{
			Background:          raw.Colors.Primary.Background,
			Foreground:          raw.Colors.Primary.Foreground,
			Cursor:              raw.Colors.Cursor.Cursor,
			CursorAccent:        raw.Colors.Cursor.Text,
			SelectionBackground: raw.Colors.Selection.Background,
			Black:               raw.Colors.Normal.Black,
			Red:                 raw.Colors.Normal.Red,
			Green:               raw.Colors.Normal.Green,
			Yellow:              raw.Colors.Normal.Yellow,
			Blue:                raw.Colors.Normal.Blue,
			Magenta:             raw.Colors.Normal.Magenta,
			Cyan:                raw.Colors.Normal.Cyan,
			White:               raw.Colors.Normal.White,
			BrightBlack:         raw.Colors.Bright.Black,
			BrightRed:           raw.Colors.Bright.Red,
			BrightGreen:         raw.Colors.Bright.Green,
			BrightYellow:        raw.Colors.Bright.Yellow,
			BrightBlue:          raw.Colors.Bright.Blue,
			BrightMagenta:       raw.Colors.Bright.Magenta,
			BrightCyan:          raw.Colors.Bright.Cyan,
			BrightWhite:         raw.Colors.Bright.White,
		},
	}
	return t, nil
}

// displayNameFromID turns "tokyo-night" or "tokyo_night" into "Tokyo Night".
func displayNameFromID(id string) string {
	parts := strings.FieldsFunc(id, func(r rune) bool {
		return r == '-' || r == '_' || r == ' '
	})
	for i, p := range parts {
		if p == "" {
			continue
		}
		runes := []rune(p)
		runes[0] = unicode.ToUpper(runes[0])
		parts[i] = string(runes)
	}
	return strings.Join(parts, " ")
}

// ListThemes returns the merged set of embedded and user themes, sorted by
// display name.
func (a *App) ListThemes() []TerminalTheme {
	return loadThemes()
}
