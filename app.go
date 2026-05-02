package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	goruntime "runtime"
	"strings"
	"sync"

	"github.com/creack/pty"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ptySession struct {
	ptmx            *os.File
	cmd             *exec.Cmd
	gen             uint64
	watchPassphrase bool
	serverName      string
	lineBuf         []byte
}

type App struct {
	ctx         context.Context
	mu          sync.Mutex
	tabs        map[string]*ptySession
	gen         uint64
	passphrases *passphraseRegistry
}

func NewApp() *App {
	return &App{
		tabs:        map[string]*ptySession{},
		passphrases: newPassphraseRegistry(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	loadLoginShellPath()
	installDesktopEntry()
}

// IsTmuxAvailable reports whether `tmux` is on PATH. Used by the frontend to
// surface a one-time toast when missing — tmiix still works as a plain
// terminal without tmux, so we don't block startup.
func (a *App) IsTmuxAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// termEnv returns a copy of the current environment with TERM forced to a
// value the embedded xterm.js frontend understands. When launched from a GUI,
// TERM is typically unset, which breaks tmux ("terminal does not support
// clear") and other curses programs.
func termEnv() []string {
	env := os.Environ()
	const want = "xterm-256color"
	found := false
	for i, kv := range env {
		if strings.HasPrefix(kv, "TERM=") {
			env[i] = "TERM=" + want
			found = true
			break
		}
	}
	if !found {
		env = append(env, "TERM="+want)
	}

	// Advertise truecolor support and program identity for modern terminal apps.
	env = append(env, "COLORTERM=truecolor")
	env = append(env, "TERM_PROGRAM=tmiix")
	return env
}

// loadLoginShellPath ensures PATH includes common macOS tool locations.
// When launched from a GUI (not a terminal), the process inherits a minimal
// PATH that typically excludes /usr/local/bin and /opt/homebrew/bin, so tools
// like tmux cannot be found.
func loadLoginShellPath() {
	extendPath(commonToolDirs())
}

func commonToolDirs() []string {
	if goruntime.GOOS != "darwin" {
		return nil
	}
	return []string{
		"/opt/homebrew/bin",
		"/usr/local/bin",
	}
}

func extendPath(dirs []string) {
	if len(dirs) == 0 {
		return
	}
	path := os.Getenv("PATH")
	seen := map[string]bool{}
	for _, dir := range strings.Split(path, string(os.PathListSeparator)) {
		seen[dir] = true
	}
	for _, dir := range dirs {
		if dir == "" || seen[dir] {
			continue
		}
		if path == "" {
			path = dir
		} else {
			path += string(os.PathListSeparator) + dir
		}
		seen[dir] = true
	}
	_ = os.Setenv("PATH", path)
}

func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	ids := make([]string, 0, len(a.tabs))
	for id := range a.tabs {
		ids = append(ids, id)
	}
	a.mu.Unlock()
	for _, id := range ids {
		a.CloseTab(id)
	}
}

func (a *App) ListSessions() ([]string, error) {
	out, err := exec.Command("tmux", "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return []string{}, nil
		}
		return nil, err
	}

	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return []string{}, nil
	}

	return strings.Split(trimmed, "\n"), nil
}

func (a *App) OpenShell(tabId string) error {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	cmd := exec.Command(shell, "-l")
	cmd.Env = termEnv()
	return a.startTab(tabId, cmd, false, "")
}

// tmuxClientFeatures is passed via `tmux -T` on attach so tmux advertises
// terminal capabilities to inside-tmux programs regardless of what the
// attach client's env happens to carry. xterm.js in tmiix supports all of
// these, and forcing them prevents apps like Claude Code from falling back
// to ASCII/16-color rendering when re-attaching with a minimal env.
const tmuxClientFeatures = "256,RGB,clipboard,ccolour,cstyle,extkeys,focus,mouse,overline,strikethrough,sync,title,usstyle"

func (a *App) AttachSession(tabId, sessionName string) error {
	cmd := exec.Command("tmux", "-u", "-T", tmuxClientFeatures, "attach-session", "-t", sessionName)
	cmd.Env = termEnv()
	return a.startTab(tabId, cmd, false, "")
}

func (a *App) startTab(tabId string, cmd *exec.Cmd, watchPassphrase bool, serverName string) error {
	a.mu.Lock()
	if _, ok := a.tabs[tabId]; ok {
		a.mu.Unlock()
		return fmt.Errorf("tab %q already open", tabId)
	}
	ptmx, err := pty.Start(cmd)
	if err != nil {
		a.mu.Unlock()
		log.Printf("pty start failed tab=%s cmd=%s err=%v", tabId, cmd.Path, err)
		return err
	}
	a.gen++
	s := &ptySession{ptmx: ptmx, cmd: cmd, gen: a.gen, watchPassphrase: watchPassphrase, serverName: serverName}
	a.tabs[tabId] = s
	a.mu.Unlock()

	go a.readTab(tabId, s)
	return nil
}

func (a *App) WriteTab(tabId, data string) error {
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	a.mu.Unlock()
	if !ok {
		return nil
	}
	_, err := s.ptmx.Write([]byte(data))
	if err != nil {
		log.Printf("terminal write failed tab=%s err=%v", tabId, err)
	}
	return err
}

func (a *App) ResizeTab(tabId string, cols, rows uint16) error {
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	a.mu.Unlock()
	if !ok {
		return nil
	}
	if err := pty.Setsize(s.ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		log.Printf("terminal resize failed tab=%s cols=%d rows=%d err=%v", tabId, cols, rows, err)
		return err
	}
	return nil
}

func (a *App) CloseTab(tabId string) {
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	if ok {
		delete(a.tabs, tabId)
	}
	a.mu.Unlock()
	if !ok {
		return
	}
	a.passphrases.cancelFor(tabId)
	if s.ptmx != nil {
		_ = s.ptmx.Close()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_, _ = s.cmd.Process.Wait()
	}
}

func (a *App) readTab(tabId string, s *ptySession) {
	buf := make([]byte, 4096)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			data := buf[:n]
			if s.watchPassphrase {
				data = a.filterPassphrase(tabId, s, data)
			}
			if len(data) > 0 {
				runtime.EventsEmit(a.ctx, "terminal:data:"+tabId, base64.StdEncoding.EncodeToString(data))
			}
		}
		if err != nil {
			if err != io.EOF {
				log.Printf("terminal read failed tab=%s err=%v", tabId, err)
			}
			break
		}
	}

	a.mu.Lock()
	current, ok := a.tabs[tabId]
	if ok && current.gen == s.gen {
		delete(a.tabs, tabId)
	}
	a.mu.Unlock()
	a.passphrases.cancelFor(tabId)
	runtime.EventsEmit(a.ctx, "terminal:closed:"+tabId)
}

// filterPassphrase scans pty output for ssh passphrase prompts. When it finds
// one, it routes the prompt to the UI via the passphrase registry, blocks for
// the reply, writes it back into the pty, and returns bytes to forward to the
// terminal view with the prompt suppressed.
var passphraseTrigger = []byte("Enter passphrase for key '")

func passphraseTriggerTailLen(data []byte) int {
	limit := len(passphraseTrigger) - 1
	if len(data) < limit {
		limit = len(data)
	}
	for n := limit; n > 0; n-- {
		if bytes.Equal(data[len(data)-n:], passphraseTrigger[:n]) {
			return n
		}
	}
	return 0
}

func (a *App) filterPassphrase(tabId string, s *ptySession, data []byte) []byte {
	s.lineBuf = append(s.lineBuf, data...)
	var out []byte
	for {
		idx := bytes.Index(s.lineBuf, passphraseTrigger)
		if idx < 0 {
			// Only retain the suffix that could still become the start of a
			// future prompt. Holding a fixed-length tail delays normal echoed
			// terminal input until enough bytes accumulate.
			keep := passphraseTriggerTailLen(s.lineBuf)
			flush := len(s.lineBuf) - keep
			if flush > 0 {
				out = append(out, s.lineBuf[:flush]...)
				s.lineBuf = append(s.lineBuf[:0], s.lineBuf[flush:]...)
			}
			return out
		}
		// Need the closing "': " to have the full prompt.
		tail := s.lineBuf[idx+len(passphraseTrigger):]
		endRel := bytes.Index(tail, []byte("': "))
		if endRel < 0 {
			// Incomplete prompt — forward bytes before the trigger, wait for more.
			out = append(out, s.lineBuf[:idx]...)
			s.lineBuf = append(s.lineBuf[:0], s.lineBuf[idx:]...)
			return out
		}
		promptEnd := idx + len(passphraseTrigger) + endRel + len("': ")
		prompt := string(s.lineBuf[idx : promptEnd-1]) // drop trailing space
		out = append(out, s.lineBuf[:idx]...)          // pre-prompt output (usually empty)
		s.lineBuf = append(s.lineBuf[:0], s.lineBuf[promptEnd:]...)

		reply := a.passphrases.request(a.ctx, tabId, prompt)
		val, ok := <-reply
		if !ok {
			// cancelled
			return out
		}
		_, _ = s.ptmx.Write([]byte(val + "\n"))
	}
}
