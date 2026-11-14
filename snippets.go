package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
)

const runbookMetaFile = ".tmiix.toml"

const (
	tabCurrent = "current-tab"
	tabNew     = "new-tab"
)

// Snippet is a single runnable file inside a runbook folder.
type Snippet struct {
	Runbook string `json:"runbook"`
	Name    string `json:"name"`
	Body    string `json:"body"`
	Tab     string `json:"tab"` // resolved tab, after inheriting the runbook's default
	Target  string `json:"target,omitempty"`
	// OwnTab/OwnTarget are the explicit values from the snippet's own
	// header (empty when it inherits from the runbook) — used to edit a
	// snippet without losing whether it was inheriting.
	OwnTab    string `json:"ownTab,omitempty"`
	OwnTarget string `json:"ownTarget,omitempty"`
}

// Runbook is a one-level folder of snippets under the snippets root.
type Runbook struct {
	Name     string    `json:"name"`
	Tab      string    `json:"tab"`
	Target   string    `json:"target,omitempty"`
	Snippets []Snippet `json:"snippets"`
}

// runbookMeta is the on-disk shape of a runbook's .tmiix.toml.
type runbookMeta struct {
	Tab    string `toml:"tab"`
	Target string `toml:"target"`
}

// snippetsRootDir resolves the configured snippets directory, falling back to
// ~/.config/tmiix/snippets when unset.
func snippetsRootDir() (string, error) {
	settings, err := effectiveSettings()
	if err != nil {
		return "", err
	}
	if settings.SnippetsPath != "" {
		return settings.SnippetsPath, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmiix", "snippets"), nil
}

// ListRunbooks reads the snippets root directory and returns one Runbook per
// immediate subfolder, each populated with the snippet files inside it.
func (a *App) ListRunbooks() ([]Runbook, error) {
	root, err := snippetsRootDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Runbook{}, nil
		}
		return nil, err
	}

	runbooks := make([]Runbook, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		runbook, err := loadRunbook(root, entry.Name())
		if err != nil {
			continue
		}
		runbooks = append(runbooks, runbook)
	}
	sort.Slice(runbooks, func(i, j int) bool { return runbooks[i].Name < runbooks[j].Name })
	return runbooks, nil
}

func loadRunbook(root, name string) (Runbook, error) {
	dir := filepath.Join(root, name)
	meta := runbookMeta{Tab: tabCurrent}
	if data, err := os.ReadFile(filepath.Join(dir, runbookMetaFile)); err == nil {
		_ = toml.Unmarshal(data, &meta)
	}
	if meta.Tab != tabCurrent && meta.Tab != tabNew {
		meta.Tab = tabCurrent
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return Runbook{}, err
	}

	runbook := Runbook{Name: name, Tab: meta.Tab, Target: meta.Target, Snippets: []Snippet{}}
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		snippet := parseSnippet(name, entry.Name(), string(data), meta)
		runbook.Snippets = append(runbook.Snippets, snippet)
	}
	sort.Slice(runbook.Snippets, func(i, j int) bool { return runbook.Snippets[i].Name < runbook.Snippets[j].Name })
	return runbook, nil
}

// parseSnippet extracts an optional "# tab:"/"# target:" header from the
// leading comment block of a snippet file, falling back to the runbook's
// default tab/target when the header is absent.
func parseSnippet(runbookName, filename, body string, defaults runbookMeta) Snippet {
	tab := defaults.Tab
	target := defaults.Target
	ownTab := ""
	ownTarget := ""

	lines := strings.Split(body, "\n")
	bodyStart := 0
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#!") {
			bodyStart = i + 1
			continue
		}
		if !strings.HasPrefix(trimmed, "#") {
			break
		}
		comment := strings.TrimSpace(strings.TrimPrefix(trimmed, "#"))
		if value, ok := strings.CutPrefix(comment, "tab:"); ok {
			value = strings.TrimSpace(value)
			if value == tabCurrent || value == tabNew {
				tab = value
				ownTab = value
			}
			bodyStart = i + 1
			continue
		}
		if value, ok := strings.CutPrefix(comment, "target:"); ok {
			target = strings.TrimSpace(value)
			ownTarget = target
			bodyStart = i + 1
			continue
		}
		break
	}

	name := strings.TrimSuffix(filename, filepath.Ext(filename))
	return Snippet{
		Runbook:   runbookName,
		Name:      name,
		Body:      strings.TrimLeft(strings.Join(lines[bodyStart:], "\n"), "\n"),
		Tab:       tab,
		Target:    target,
		OwnTab:    ownTab,
		OwnTarget: ownTarget,
	}
}

// sanitizeName validates a runbook or snippet name used as a path segment.
func sanitizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("name is required")
	}
	if name == "." || name == ".." || strings.ContainsAny(name, "/\\") {
		return "", errors.New("invalid name")
	}
	return name, nil
}

func snippetFileName(name string) string {
	return name + ".sh"
}

// writeRunbookMeta writes a runbook's .tmiix.toml default tab/target.
func writeRunbookMeta(dir string, meta runbookMeta) error {
	f, err := os.Create(filepath.Join(dir, runbookMetaFile))
	if err != nil {
		return err
	}
	defer f.Close()
	return toml.NewEncoder(f).Encode(meta)
}

// buildSnippetContent renders a snippet file's contents: a shebang, an
// optional "# tab:"/"# target:" header (omitted when tab is empty,
// meaning "inherit from the runbook"), then the body.
func buildSnippetContent(body, tab, target string) string {
	var b strings.Builder
	b.WriteString("#!/bin/sh\n")
	if tab != "" {
		b.WriteString("# tab: " + tab + "\n")
		if target != "" {
			b.WriteString("# target: " + target + "\n")
		}
	}
	lines := strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t\r")
	}
	b.WriteString(strings.TrimRight(strings.Join(lines, "\n"), "\n"))
	b.WriteString("\n")
	return b.String()
}

// SaveRunbook creates a runbook (oldName == "") or renames/updates an
// existing one's default tab/target (oldName == its current name).
func (a *App) SaveRunbook(oldName, name, tab, target string) error {
	name, err := sanitizeName(name)
	if err != nil {
		return err
	}
	if tab != tabCurrent && tab != tabNew {
		tab = tabCurrent
	}
	target = strings.TrimSpace(target)

	root, err := snippetsRootDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(root, name)

	if oldName != "" {
		oldName, err = sanitizeName(oldName)
		if err != nil {
			return err
		}
		if oldName != name {
			if _, err := os.Stat(dir); err == nil {
				return fmt.Errorf("runbook %q already exists", name)
			}
			if err := os.Rename(filepath.Join(root, oldName), dir); err != nil {
				return err
			}
		}
	} else {
		if _, err := os.Stat(dir); err == nil {
			return fmt.Errorf("runbook %q already exists", name)
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	return writeRunbookMeta(dir, runbookMeta{Tab: tab, Target: target})
}

// DeleteRunbook removes a runbook folder and everything inside it.
func (a *App) DeleteRunbook(name string) error {
	name, err := sanitizeName(name)
	if err != nil {
		return err
	}
	root, err := snippetsRootDir()
	if err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(root, name))
}

// SaveSnippet creates a snippet (oldName == "") or renames/updates an
// existing one within runbook. An empty tab means "inherit from the
// runbook" (no header is written).
func (a *App) SaveSnippet(runbook, oldName, name, body, tab, target string) error {
	runbook, err := sanitizeName(runbook)
	if err != nil {
		return err
	}
	name, err = sanitizeName(name)
	if err != nil {
		return err
	}
	if tab != "" && tab != tabCurrent && tab != tabNew {
		return errors.New("invalid tab")
	}
	target = strings.TrimSpace(target)

	root, err := snippetsRootDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(root, runbook)
	if _, err := os.Stat(dir); err != nil {
		return fmt.Errorf("runbook %q not found", runbook)
	}

	newPath := filepath.Join(dir, snippetFileName(name))
	if oldName != "" {
		oldName, err = sanitizeName(oldName)
		if err != nil {
			return err
		}
		if oldName != name {
			oldPath := filepath.Join(dir, snippetFileName(oldName))
			if err := os.Remove(oldPath); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
	}

	content := buildSnippetContent(body, tab, target)
	return os.WriteFile(newPath, []byte(content), 0o644)
}

// DeleteSnippet removes a single snippet file from a runbook.
func (a *App) DeleteSnippet(runbook, name string) error {
	runbook, err := sanitizeName(runbook)
	if err != nil {
		return err
	}
	name, err = sanitizeName(name)
	if err != nil {
		return err
	}
	root, err := snippetsRootDir()
	if err != nil {
		return err
	}
	return os.Remove(filepath.Join(root, runbook, snippetFileName(name)))
}

// OpenSnippetsDir reveals the snippets root directory in the OS file manager,
// creating it (with an example runbook) if it doesn't exist yet.
func (a *App) OpenSnippetsDir() error {
	root, err := snippetsRootDir()
	if err != nil {
		return err
	}
	if _, err := os.Stat(root); errors.Is(err, os.ErrNotExist) {
		exampleDir := filepath.Join(root, "example")
		if err := os.MkdirAll(exampleDir, 0o755); err != nil {
			return err
		}
		meta := "tab = \"current-tab\"\n"
		if err := os.WriteFile(filepath.Join(exampleDir, runbookMetaFile), []byte(meta), 0o644); err != nil {
			return err
		}
		snippet := "#!/bin/sh\n# tab: current-tab\necho hello from tmiix\n"
		if err := os.WriteFile(filepath.Join(exampleDir, "hello.sh"), []byte(snippet), 0o644); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return openWithDefaultApp(root)
}
