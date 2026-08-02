package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log"
	"os"
	"os/exec"
	goruntime "runtime"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ptySession struct {
	ptmx            *os.File
	ttyName         string // slave pty path (e.g. /dev/pts/4); see DetectTabSession.
	cmd             *exec.Cmd
	gen             uint64
	watchPassphrase bool
	serverName      string
	lineBuf         []byte
	// remoteTTY is the tty the remote login shell runs on, reported by the
	// marker in remoteShellScript. Guarded by App.mu; see DetectTabSession.
	remoteTTY string
	// Scan state for that marker; touched only by readTab.
	ttyBuf     []byte
	ttyScanned int
	ttyDone    bool
}

type App struct {
	ctx         context.Context
	mu          sync.Mutex
	tabs        map[string]*ptySession
	gen         uint64
	passphrases *passphraseRegistry
	// lastUploadDir is where the upload file picker last selected from, so
	// repeated uploads reopen in the same place. In-memory only.
	lastUploadDir string
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
	ensureSSHAgent()
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
	return removeEnv(env, "TMUX", "TMUX_PANE")
}

func removeEnv(env []string, names ...string) []string {
	if len(names) == 0 {
		return env
	}
	blocked := map[string]bool{}
	for _, name := range names {
		blocked[name] = true
	}
	out := env[:0]
	for _, kv := range env {
		name, _, ok := strings.Cut(kv, "=")
		if ok && blocked[name] {
			continue
		}
		out = append(out, kv)
	}
	return out
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
	shutdownSSHAgent()
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
	return a.startTab(tabId, cmd, false, "", false)
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
	return a.startTab(tabId, cmd, false, "", false)
}

// DetectTabSession reports the tmux session name attached inside the given
// tab's pty, if any. A tab starts as a plain shell with no known session, but
// the user (or a script) may run `tmux new-session`/`tmux attach` directly in
// that shell rather than through tmiix's own attach flow, leaving the app
// unaware a session is now live there. We match the tab's slave tty path
// against `tmux list-clients`, which reports the tty each attached client is
// running on — the same tty as the tab's slave, since the tmux client is
// just another process in that shell.
// For an ssh-backed tab the local pty belongs to the ssh client, not to the
// shell that ran tmux, so we match against the tty the remote shell reported
// on connect (see remoteShellScript) and query the remote tmux server instead.
func (a *App) DetectTabSession(tabId string) (string, error) {
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	var tty, serverName, remoteTTY string
	if ok {
		tty, serverName, remoteTTY = s.ttyName, s.serverName, s.remoteTTY
	}
	a.mu.Unlock()
	if !ok {
		return "", nil
	}
	if serverName != "" {
		return a.detectRemoteTabSession(serverName, remoteTTY)
	}
	if tty == "" {
		return "", nil
	}

	out, err := exec.Command("tmux", "list-clients", "-F", clientTTYFormat).Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return "", nil
		}
		return "", err
	}

	return sessionForClientTTY(string(out), tty), nil
}

// clientTTYFormat pairs each attached client's tty with its session. The
// separator is a space rather than a tab because some tmux builds sanitize
// control characters out of `list-clients` output (turning a tab into "_"),
// and a tty path never contains a space.
const clientTTYFormat = "#{client_tty} #{session_name}"

func sessionForClientTTY(listClientsOutput, tty string) string {
	trimmed := strings.TrimSpace(listClientsOutput)
	if trimmed == "" || tty == "" {
		return ""
	}
	for _, line := range strings.Split(trimmed, "\n") {
		clientTty, sessionName, found := strings.Cut(strings.TrimSpace(line), " ")
		if found && clientTty == tty {
			return sessionName
		}
	}
	return ""
}

func (a *App) KillSession(sessionName string) error {
	sessionName = strings.TrimSpace(sessionName)
	if sessionName == "" {
		return errors.New("session name is required")
	}
	cmd := exec.Command("tmux", "kill-session", "-t", sessionName)
	cmd.Env = termEnv()
	return cmd.Run()
}

// expectTTYMarker is set for tabs whose command reports the remote tty via
// remoteShellScript, so readTab knows to scan for (and strip) that marker.
func (a *App) startTab(tabId string, cmd *exec.Cmd, watchPassphrase bool, serverName string, expectTTYMarker bool) error {
	a.mu.Lock()
	old := a.tabs[tabId]
	if old != nil {
		delete(a.tabs, tabId)
	}
	a.mu.Unlock()
	if old != nil {
		a.passphrases.cancelFor(tabId)
		if old.ptmx != nil {
			_ = old.ptmx.Close()
		}
		if old.cmd != nil && old.cmd.Process != nil {
			_ = old.cmd.Process.Kill()
			_, _ = old.cmd.Process.Wait()
		}
	}

	a.mu.Lock()
	// pty.Start (the usual one-liner) opens the pty pair, wires the slave to
	// cmd, starts it, and then closes its own reference to the slave file —
	// discarding its path in the process. We need that path (DetectTabSession
	// matches it against tmux's #{client_tty}), so open and start it
	// ourselves instead, the same way pty.Start does internally.
	ptmx, tty, err := pty.Open()
	if err != nil {
		a.mu.Unlock()
		log.Printf("pty open failed tab=%s cmd=%s err=%v", tabId, cmd.Path, err)
		return err
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setsid = true
	cmd.SysProcAttr.Setctty = true
	cmd.Stdin, cmd.Stdout, cmd.Stderr = tty, tty, tty
	ttyName := tty.Name()
	err = cmd.Start()
	_ = tty.Close()
	if err != nil {
		_ = ptmx.Close()
		a.mu.Unlock()
		log.Printf("pty start failed tab=%s cmd=%s err=%v", tabId, cmd.Path, err)
		return err
	}
	a.gen++
	s := &ptySession{
		ptmx:            ptmx,
		ttyName:         ttyName,
		cmd:             cmd,
		gen:             a.gen,
		watchPassphrase: watchPassphrase,
		serverName:      serverName,
		ttyDone:         !expectTTYMarker,
	}
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
			if !s.ttyDone {
				data = a.filterRemoteTTYMarker(s, data)
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
	mine := ok && current.gen == s.gen
	if mine {
		delete(a.tabs, tabId)
	}
	a.mu.Unlock()
	if !mine {
		return
	}
	a.passphrases.cancelFor(tabId)

	// Distinguish a clean end (user typed `exit`, detached tmux, killed the
	// session) from a failure — most importantly an ssh connection that
	// dropped, as happens when the machine suspends/resumes. The frontend uses
	// this to decide whether to auto-reconnect remote tabs. We only reap here
	// when we still own the session; a concurrent CloseTab (a user-initiated
	// close) reaps it itself and is always treated as clean.
	clean := true
	if mine {
		if werr := s.cmd.Wait(); werr != nil {
			clean = false
		}
	}
	runtime.EventsEmit(a.ctx, "terminal:closed:"+tabId, clean)
}

// filterPassphrase scans pty output for ssh passphrase prompts. When it finds
// one, it routes the prompt to the UI via the passphrase registry, blocks for
// the reply, writes it back into the pty, and returns bytes to forward to the
// terminal view with the prompt suppressed.
var passphraseTrigger = []byte("Enter passphrase for key '")

func passphraseTriggerTailLen(data []byte) int {
	return triggerTailLen(data, passphraseTrigger)
}

// triggerTailLen returns the length of the suffix of data that is a prefix of
// trigger, i.e. how many trailing bytes must be held back because they could
// still turn into a full trigger once more output arrives.
func triggerTailLen(data, trigger []byte) int {
	limit := len(trigger) - 1
	if len(data) < limit {
		limit = len(data)
	}
	for n := limit; n > 0; n-- {
		if bytes.Equal(data[len(data)-n:], trigger[:n]) {
			return n
		}
	}
	return 0
}

// remoteTTYMarker is the OSC sequence remoteShellScript prints on connect to
// report the tty of the remote login shell. filterRemoteTTYMarker records the
// path and strips the sequence so it never reaches the terminal view.
var remoteTTYMarkerStart = []byte("\033]1337;tmiix-tty=")

const remoteTTYMarkerEnd = 0x07 // BEL

// remoteTTYScanLimit bounds how much output we buffer looking for the marker.
// It is printed before the login shell execs, so it always lands in the first
// bytes; the limit just stops us scanning forever on an older/custom setup
// that never emits it.
const remoteTTYScanLimit = 8192

func (a *App) filterRemoteTTYMarker(s *ptySession, data []byte) []byte {
	s.ttyBuf = append(s.ttyBuf, data...)
	s.ttyScanned += len(data)

	flush := func(keep int) []byte {
		out := append([]byte(nil), s.ttyBuf[:len(s.ttyBuf)-keep]...)
		s.ttyBuf = append(s.ttyBuf[:0], s.ttyBuf[len(s.ttyBuf)-keep:]...)
		return out
	}

	idx := bytes.Index(s.ttyBuf, remoteTTYMarkerStart)
	if idx < 0 {
		keep := triggerTailLen(s.ttyBuf, remoteTTYMarkerStart)
		if s.ttyScanned > remoteTTYScanLimit {
			s.ttyDone = true
			keep = 0
		}
		return flush(keep)
	}

	tail := s.ttyBuf[idx+len(remoteTTYMarkerStart):]
	endRel := bytes.IndexByte(tail, remoteTTYMarkerEnd)
	if endRel < 0 {
		// Marker started but is not complete yet — forward what precedes it.
		return flush(len(s.ttyBuf) - idx)
	}

	ttyPath := strings.TrimSpace(string(tail[:endRel]))
	markerEnd := idx + len(remoteTTYMarkerStart) + endRel + 1
	out := append([]byte(nil), s.ttyBuf[:idx]...)
	out = append(out, s.ttyBuf[markerEnd:]...)
	s.ttyBuf = nil
	s.ttyDone = true

	a.mu.Lock()
	if strings.HasPrefix(ttyPath, "/dev/") {
		s.remoteTTY = ttyPath
	}
	a.mu.Unlock()
	return out
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

		if !isLocalPassphrasePrompt(prompt) {
			// Prompt for a key that doesn't exist locally — it came from a
			// program inside the remote session. Forward it untouched so it
			// renders in the terminal where the user can answer it.
			out = append(out, s.lineBuf[:promptEnd]...)
			s.lineBuf = append(s.lineBuf[:0], s.lineBuf[promptEnd:]...)
			continue
		}

		out = append(out, s.lineBuf[:idx]...) // pre-prompt output (usually empty)
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
