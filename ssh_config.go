package main

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// parseSSHConfig reads an OpenSSH config file and returns one SSHServer per
// concrete Host entry (wildcards and Match blocks are skipped). Include
// directives are followed with basic recursion.
func parseSSHConfig(path string, seen map[string]bool) ([]SSHServer, error) {
	if seen == nil {
		seen = map[string]bool{}
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		if seen[abs] {
			return nil, nil
		}
		seen[abs] = true
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var (
		servers []SSHServer
		current *SSHServer // nil means we're in a wildcard/Match block and should ignore settings
		inHost  bool
	)

	flush := func() {
		if current != nil && current.Name != "" && current.Host != "" {
			servers = append(servers, *current)
		}
		current = nil
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value := splitConfigLine(line)
		if key == "" {
			continue
		}
		lkey := strings.ToLower(key)

		switch lkey {
		case "host":
			flush()
			inHost = true
			name := firstConcreteHost(value)
			if name == "" {
				current = nil
				continue
			}
			current = &SSHServer{Name: name, Host: name, FromConfig: true}
		case "match":
			flush()
			inHost = false
			current = nil
		case "include":
			for _, p := range expandIncludePaths(value, path) {
				sub, err := parseSSHConfig(p, seen)
				if err == nil {
					servers = append(servers, sub...)
				}
			}
		default:
			if !inHost || current == nil {
				continue
			}
			switch lkey {
			case "hostname":
				current.Host = value
			case "user":
				current.User = value
			case "port":
				if n, err := strconv.Atoi(value); err == nil {
					current.Port = n
				}
			case "identityfile":
				if current.IdentityFile == "" {
					current.IdentityFile = expandHome(value)
				}
			}
		}
	}
	flush()
	return servers, scanner.Err()
}

func splitConfigLine(line string) (string, string) {
	// OpenSSH allows "key value", "key=value", and surrounding whitespace.
	i := strings.IndexAny(line, " \t=")
	if i < 0 {
		return line, ""
	}
	key := strings.TrimSpace(line[:i])
	value := strings.TrimSpace(strings.TrimLeft(line[i+1:], " \t="))
	value = strings.Trim(value, "\"")
	return key, value
}

// firstConcreteHost returns the first host alias from a `Host` line that is
// not a pattern (no *, ?, !) and is not empty. Multiple aliases on one line
// are space-separated; we only pick one representative.
func firstConcreteHost(value string) string {
	for _, token := range strings.Fields(value) {
		token = strings.Trim(token, "\"")
		if token == "" {
			continue
		}
		if strings.ContainsAny(token, "*?!") {
			continue
		}
		return token
	}
	return ""
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[2:])
		}
	}
	return p
}

func expandIncludePaths(value, parent string) []string {
	var out []string
	for _, tok := range strings.Fields(value) {
		tok = strings.Trim(tok, "\"")
		if tok == "" {
			continue
		}
		tok = expandHome(tok)
		if !filepath.IsAbs(tok) {
			// OpenSSH resolves relative Include paths against ~/.ssh for user configs.
			if home, err := os.UserHomeDir(); err == nil {
				tok = filepath.Join(home, ".ssh", tok)
			} else if parent != "" {
				tok = filepath.Join(filepath.Dir(parent), tok)
			}
		}
		matches, err := filepath.Glob(tok)
		if err != nil || len(matches) == 0 {
			out = append(out, tok)
			continue
		}
		out = append(out, matches...)
	}
	return out
}

// ListSSHConfigHosts returns host entries parsed from ~/.ssh/config, excluding
// anything whose Name already appears in the user-managed server list.
func (a *App) ListSSHConfigHosts() ([]SSHServer, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return []SSHServer{}, nil
	}
	entries, err := parseSSHConfig(filepath.Join(home, ".ssh", "config"), nil)
	if err != nil || len(entries) == 0 {
		return []SSHServer{}, err
	}
	managed, _ := loadServers()
	taken := map[string]bool{}
	for _, s := range managed {
		taken[s.Name] = true
	}
	seen := map[string]bool{}
	out := entries[:0]
	for _, e := range entries {
		if taken[e.Name] || seen[e.Name] {
			continue
		}
		seen[e.Name] = true
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
