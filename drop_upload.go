package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

// maxRemoteDropBytes caps drag-and-drop uploads to remote servers. The
// transfer streams base64 over the ssh pty (which also echoes the input), so
// large files would tie the pipe up for minutes; point users at scp instead.
const maxRemoteDropBytes = 32 << 20

type DropSkipped struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

type DropUploadResult struct {
	Dir     string        `json:"dir"`
	Copied  []string      `json:"copied"`
	Skipped []DropSkipped `json:"skipped"`
}

// UploadDroppedFiles copies OS-dropped files into the working directory of
// the tab's pane: locally for plain shells and tmux sessions, or onto the
// remote host for SSH-attached tabs. Per-file failures are reported in
// Skipped; an error is returned only when the whole operation cannot proceed.
func (a *App) UploadDroppedFiles(tabId, kind, sessionName string, paths []string) (*DropUploadResult, error) {
	log.Printf("[tmiix drop] UploadDroppedFiles tab=%s kind=%s session=%q files=%d", tabId, kind, sessionName, len(paths))
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	serverName := ""
	pid := 0
	if ok {
		serverName = s.serverName
		if s.cmd != nil && s.cmd.Process != nil {
			pid = s.cmd.Process.Pid
		}
	}
	a.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("tab %q not open", tabId)
	}

	var srv *SSHServer
	if serverName != "" {
		var err error
		srv, err = a.findServer(serverName)
		if err != nil {
			return nil, err
		}
	}

	dir, err := a.resolveDropCwd(sessionName, serverName, srv, pid)
	if err != nil {
		return nil, err
	}
	log.Printf("[tmiix drop] destination tab=%s server=%q dir=%s", tabId, serverName, dir)

	result := &DropUploadResult{Dir: dir, Copied: []string{}, Skipped: []DropSkipped{}}
	for _, src := range paths {
		name := filepath.Base(src)
		info, err := os.Stat(src)
		if err != nil {
			result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: "cannot read file"})
			continue
		}
		if info.IsDir() {
			result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: "is a directory"})
			continue
		}

		if serverName == "" {
			if err := copyLocalFile(src, dir); err != nil {
				result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: err.Error()})
				continue
			}
		} else {
			if info.Size() > maxRemoteDropBytes {
				result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: "too large for drag-and-drop upload (use scp)"})
				continue
			}
			raw, err := os.ReadFile(src)
			if err != nil {
				result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: "cannot read file"})
				continue
			}
			remotePath := strings.TrimSuffix(dir, "/") + "/" + name
			if err := a.writeRemoteFile(serverName, srv, remotePath, raw, true); err != nil {
				reason := err.Error()
				if strings.Contains(reason, "cannot overwrite") || strings.Contains(reason, "File exists") || strings.Contains(reason, "cannot create") {
					reason = "already exists on " + serverName
				}
				result.Skipped = append(result.Skipped, DropSkipped{Name: name, Reason: reason})
				continue
			}
		}
		result.Copied = append(result.Copied, name)
	}
	log.Printf("[tmiix drop] done tab=%s copied=%d skipped=%d", tabId, len(result.Copied), len(result.Skipped))
	return result, nil
}

// resolveDropCwd picks the destination directory for a drop. Tabs attached to
// a tmux session (kind "session" locally, "remote" over ssh) report the active
// pane's cwd via tmux; plain local shells via /proc; plain remote shells have
// no observable cwd, so fall back to the remote home directory.
func (a *App) resolveDropCwd(sessionName, serverName string, srv *SSHServer, pid int) (string, error) {
	if serverName == "" {
		if sessionName != "" {
			// The "=" prefix forces an exact session-name match; the trailing
			// ":" makes the target parse as a session (resolving to its active
			// pane) — without it, tmux 3.6a expands all format variables to
			// empty for "="-prefixed targets.
			cmd := exec.Command("tmux", "display-message", "-p", "-t", "="+sessionName+":", "#{pane_current_path}")
			cmd.Env = termEnv()
			out, err := cmd.Output()
			if err != nil {
				return "", fmt.Errorf("tmux pane cwd lookup failed: %w", err)
			}
			dir := strings.TrimSpace(string(out))
			if dir == "" {
				return "", fmt.Errorf("tmux reported no cwd for session %q", sessionName)
			}
			return dir, nil
		}
		if dir := localShellCwd(pid); dir != "" {
			return dir, nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return home, nil
	}

	if sessionName != "" {
		args := append(srv.sshArgs(false), remoteCommand("tmux", "display-message", "-p", "-t", "="+sessionName+":", "#{pane_current_path}"))
		cmd := shellWrappedSSH(args)
		cmd.Env = termEnv()
		out, err := a.runSSHPty(cmd, serverName)
		if err != nil {
			return "", fmt.Errorf("remote tmux pane cwd lookup failed: %w", err)
		}
		dir := strings.TrimSpace(string(out))
		if dir == "" {
			return "", fmt.Errorf("tmux reported no cwd for session %q on %s", sessionName, serverName)
		}
		return dir, nil
	}
	// Plain remote shell: the shell runs on the server, so its cwd is not
	// observable from here. Fall back to the remote home directory.
	return "~", nil
}

// localShellCwd returns the current working directory of the local shell
// process, or "" when it cannot be determined.
func localShellCwd(pid int) string {
	if pid <= 0 {
		return ""
	}
	if goruntime.GOOS == "linux" {
		dir, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", pid))
		if err != nil {
			return ""
		}
		return dir
	}
	if goruntime.GOOS == "darwin" {
		out, err := exec.Command("lsof", "-a", "-p", fmt.Sprintf("%d", pid), "-d", "cwd", "-Fn").Output()
		if err != nil {
			return ""
		}
		for _, line := range strings.Split(string(out), "\n") {
			if rest, ok := strings.CutPrefix(line, "n"); ok {
				return strings.TrimSpace(rest)
			}
		}
	}
	return ""
}

func copyLocalFile(src, destDir string) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("cannot read file")
	}
	defer in.Close()

	dest := filepath.Join(destDir, filepath.Base(src))
	out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("already exists")
		}
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(dest)
		return err
	}
	return out.Close()
}
