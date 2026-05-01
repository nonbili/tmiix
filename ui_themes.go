package main

import (
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
)

//go:embed ui_themes/*.toml
var defaultUIThemesFS embed.FS

// UITheme is the wire shape consumed by the frontend. Colors is a flat map
// from CSS-variable suffix (e.g. "bg-0") to color string; the frontend writes
// each entry as --color-<key> on the document root.
type UITheme struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	ColorScheme string            `json:"colorScheme"`
	Colors      map[string]string `json:"colors"`
}

type uiThemeFile struct {
	ColorScheme string            `toml:"color_scheme"`
	Colors      map[string]string `toml:"colors"`
}

func userUIThemesDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmiix", "ui_themes"), nil
}

// loadUIThemes returns embedded defaults overlaid by ~/.config/tmiix/ui_themes.
// Files in the user directory override embedded entries with the same id
// (filename minus extension).
func loadUIThemes() []UITheme {
	byID := map[string]UITheme{}

	entries, err := fs.ReadDir(defaultUIThemesFS, "ui_themes")
	if err == nil {
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".toml") {
				continue
			}
			data, err := fs.ReadFile(defaultUIThemesFS, filepath.ToSlash(filepath.Join("ui_themes", e.Name())))
			if err != nil {
				log.Printf("ui_themes: read embedded %s: %v", e.Name(), err)
				continue
			}
			theme, err := parseUITheme(e.Name(), data)
			if err != nil {
				log.Printf("ui_themes: parse embedded %s: %v", e.Name(), err)
				continue
			}
			byID[theme.ID] = theme
		}
	}

	if dir, err := userUIThemesDir(); err == nil {
		entries, err := os.ReadDir(dir)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() || !strings.HasSuffix(e.Name(), ".toml") {
					continue
				}
				path := filepath.Join(dir, e.Name())
				data, err := os.ReadFile(path)
				if err != nil {
					log.Printf("ui_themes: read %s: %v", path, err)
					continue
				}
				theme, err := parseUITheme(e.Name(), data)
				if err != nil {
					log.Printf("ui_themes: parse %s: %v", path, err)
					continue
				}
				byID[theme.ID] = theme
			}
		}
	}

	out := make([]UITheme, 0, len(byID))
	for _, t := range byID {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func parseUITheme(filename string, data []byte) (UITheme, error) {
	var raw uiThemeFile
	if err := toml.Unmarshal(data, &raw); err != nil {
		return UITheme{}, err
	}
	id := strings.TrimSuffix(filename, filepath.Ext(filename))
	scheme := raw.ColorScheme
	if scheme != "light" && scheme != "dark" {
		scheme = "dark"
	}
	colors := raw.Colors
	if colors == nil {
		colors = map[string]string{}
	}
	return UITheme{
		ID:          id,
		Name:        displayNameFromID(id),
		ColorScheme: scheme,
		Colors:      colors,
	}, nil
}

// ListUIThemes returns the merged set of embedded and user UI themes, sorted
// by display name.
func (a *App) ListUIThemes() []UITheme {
	return loadUIThemes()
}
