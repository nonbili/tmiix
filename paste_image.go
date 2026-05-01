package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/creack/pty"
)

var allowedImageExt = map[string]string{
	"png":  "png",
	"jpg":  "jpg",
	"jpeg": "jpg",
	"gif":  "gif",
	"webp": "webp",
	"bmp":  "bmp",
}

func sanitizeImageExt(ext string) string {
	ext = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
	if normalized, ok := allowedImageExt[ext]; ok {
		return normalized
	}
	return "png"
}

func pasteImageFilename(ext string) string {
	var buf [6]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("tmiix-paste-%d-%s.%s", time.Now().Unix(), hex.EncodeToString(buf[:]), ext)
}

// readClipboardImage tries to read an image off the system clipboard. It
// returns (bytes, ext) on success, ("", "") if no image is available, or an
// error if the lookup itself failed in an unexpected way.
//
// On macOS it uses osascript; on Wayland it uses wl-paste; on X11 it falls
// back to xclip. We prefer png > jpeg > gif > webp > bmp where the platform
// surfaces multiple types.
func readClipboardImage() ([]byte, string, error) {
	log.Printf("[tmiix paste] readClipboardImage os=%s", runtime.GOOS)
	if runtime.GOOS == "darwin" {
		return readClipboardImageDarwin()
	}
	var preferred = []struct {
		mime string
		ext  string
	}{
		{"image/png", "png"},
		{"image/jpeg", "jpg"},
		{"image/jpg", "jpg"},
		{"image/gif", "gif"},
		{"image/webp", "webp"},
		{"image/bmp", "bmp"},
	}

	if _, err := exec.LookPath("wl-paste"); err == nil {
		log.Printf("[tmiix paste] using wl-paste")
		out, err := exec.Command("wl-paste", "--list-types").Output()
		if err == nil {
			types := strings.Split(strings.TrimSpace(string(out)), "\n")
			log.Printf("[tmiix paste] wl-paste types=%q", types)
			for _, p := range preferred {
				if hasType(types, p.mime) {
					data, err := exec.Command("wl-paste", "--type", p.mime).Output()
					if err != nil {
						return nil, "", fmt.Errorf("wl-paste %s: %w", p.mime, err)
					}
					if len(data) == 0 {
						continue
					}
					log.Printf("[tmiix paste] wl-paste image mime=%s bytes=%d", p.mime, len(data))
					return data, p.ext, nil
				}
			}
			log.Printf("[tmiix paste] wl-paste no supported image type")
			return nil, "", nil
		}
		log.Printf("[tmiix paste] wl-paste list-types failed: %v", err)
	}

	if _, err := exec.LookPath("xclip"); err == nil {
		log.Printf("[tmiix paste] using xclip")
		out, err := exec.Command("xclip", "-selection", "clipboard", "-t", "TARGETS", "-o").Output()
		if err == nil {
			types := strings.Split(strings.TrimSpace(string(out)), "\n")
			log.Printf("[tmiix paste] xclip targets=%q", types)
			for _, p := range preferred {
				if hasType(types, p.mime) {
					data, err := exec.Command("xclip", "-selection", "clipboard", "-t", p.mime, "-o").Output()
					if err != nil {
						return nil, "", fmt.Errorf("xclip %s: %w", p.mime, err)
					}
					if len(data) == 0 {
						continue
					}
					log.Printf("[tmiix paste] xclip image mime=%s bytes=%d", p.mime, len(data))
					return data, p.ext, nil
				}
			}
			log.Printf("[tmiix paste] xclip no supported image type")
			return nil, "", nil
		}
		log.Printf("[tmiix paste] xclip TARGETS failed: %v", err)
	}

	log.Printf("[tmiix paste] no clipboard image helper found or no image available")
	return nil, "", nil
}

// readClipboardImageDarwin extracts a PNG from NSPasteboard via osascript.
// AppleScript writes raw bytes to a temp file, which Go then reads back.
// Returns ("", "") when the clipboard does not contain an image.
func readClipboardImageDarwin() ([]byte, string, error) {
	log.Printf("[tmiix paste] darwin osascript clipboard image read")
	f, err := os.CreateTemp("", "tmiix-pbpaste-*.png")
	if err != nil {
		return nil, "", err
	}
	path := f.Name()
	_ = f.Close()
	defer os.Remove(path)

	script := `try
  set imgData to the clipboard as «class PNGf»
  set fp to open for access POSIX file "` + path + `" with write permission
  set eof fp to 0
  write imgData to fp
  close access fp
  return "ok"
on error
  return "none"
end try`

	cmd := exec.Command("osascript", "-")
	cmd.Stdin = strings.NewReader(script)
	out, err := cmd.Output()
	if err != nil {
		log.Printf("[tmiix paste] osascript failed: %v", err)
		return nil, "", nil
	}
	if strings.TrimSpace(string(out)) != "ok" {
		log.Printf("[tmiix paste] osascript found no PNG image, output=%q", strings.TrimSpace(string(out)))
		return nil, "", nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		log.Printf("[tmiix paste] osascript wrote empty image")
		return nil, "", nil
	}
	log.Printf("[tmiix paste] osascript image bytes=%d", len(data))
	return data, "png", nil
}

func hasType(types []string, want string) bool {
	for _, t := range types {
		if strings.EqualFold(strings.TrimSpace(t), want) {
			return true
		}
	}
	return false
}

// PasteClipboardImage checks the system clipboard for an image. If one is
// present, it stages the bytes in a temp file (locally, or on the remote host
// for SSH-attached tabs) and returns the path to paste into the terminal.
// Returns "" with no error when the clipboard does not contain an image, so
// the frontend can fall back to a normal text paste.
func (a *App) PasteClipboardImage(tabId string) (string, error) {
	log.Printf("[tmiix paste] PasteClipboardImage tab=%s", tabId)
	raw, ext, err := readClipboardImage()
	if err != nil {
		log.Printf("[tmiix paste] PasteClipboardImage read failed tab=%s err=%v", tabId, err)
		return "", err
	}
	if len(raw) == 0 {
		log.Printf("[tmiix paste] PasteClipboardImage no image tab=%s", tabId)
		return "", nil
	}
	log.Printf("[tmiix paste] PasteClipboardImage got bytes tab=%s ext=%s bytes=%d", tabId, ext, len(raw))
	return a.stagePastedImage(tabId, raw, ext)
}

// PasteImageData stages image bytes supplied by the frontend paste event and
// returns the path that should be pasted into the terminal.
func (a *App) PasteImageData(tabId, dataBase64, ext string) (string, error) {
	log.Printf("[tmiix paste] PasteImageData tab=%s ext=%s base64_chars=%d", tabId, ext, len(dataBase64))
	raw, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		log.Printf("[tmiix paste] PasteImageData decode failed tab=%s err=%v", tabId, err)
		return "", err
	}
	if len(raw) == 0 {
		log.Printf("[tmiix paste] PasteImageData empty payload tab=%s", tabId)
		return "", nil
	}
	log.Printf("[tmiix paste] PasteImageData decoded tab=%s bytes=%d", tabId, len(raw))
	return a.stagePastedImage(tabId, raw, ext)
}

func (a *App) stagePastedImage(tabId string, raw []byte, ext string) (string, error) {
	log.Printf("[tmiix paste] stagePastedImage start tab=%s ext=%s bytes=%d", tabId, ext, len(raw))
	a.mu.Lock()
	s, ok := a.tabs[tabId]
	serverName := ""
	if ok {
		serverName = s.serverName
	}
	a.mu.Unlock()
	if !ok {
		log.Printf("[tmiix paste] stagePastedImage tab not open tab=%s", tabId)
		return "", fmt.Errorf("tab %q not open", tabId)
	}

	name := pasteImageFilename(sanitizeImageExt(ext))

	if serverName == "" {
		path := filepath.Join(os.TempDir(), name)
		if err := os.WriteFile(path, raw, 0o600); err != nil {
			log.Printf("[tmiix paste] local write failed tab=%s path=%s err=%v", tabId, path, err)
			return "", err
		}
		log.Printf("[tmiix paste] local image staged tab=%s path=%s bytes=%d", tabId, path, len(raw))
		return path, nil
	}

	log.Printf("[tmiix paste] remote image staging tab=%s server=%s", tabId, serverName)
	srv, err := a.findServer(serverName)
	if err != nil {
		log.Printf("[tmiix paste] remote server lookup failed tab=%s server=%s err=%v", tabId, serverName, err)
		return "", err
	}
	remotePath := "/tmp/" + name
	if err := a.writeRemotePastedImage(serverName, srv, remotePath, raw); err != nil {
		log.Printf("[tmiix paste] remote image staging failed tab=%s server=%s path=%s err=%v", tabId, serverName, remotePath, err)
		return "", err
	}
	log.Printf("[tmiix paste] remote image staged tab=%s server=%s path=%s bytes=%d", tabId, serverName, remotePath, len(raw))
	return remotePath, nil
}

func (a *App) writeRemotePastedImage(serverName string, srv *SSHServer, remotePath string, raw []byte) error {
	log.Printf("[tmiix paste] writeRemotePastedImage start server=%s path=%s bytes=%d", serverName, remotePath, len(raw))
	marker := pasteImageMarker()
	script := "umask 077; printf %s " + shellQuote(marker) + "; base64 -d > " + shellQuote(remotePath)
	args := append(srv.sshArgs(false), remoteCommand("sh", "-c", script))
	cmd := shellWrappedSSH(args)
	cmd.Env = termEnv()
	out, err := a.runSSHPtyWriteAfterMarker(cmd, serverName, []byte(marker), base64TerminalInput(raw))
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			log.Printf("[tmiix paste] writeRemotePastedImage failed without output server=%s err=%v", serverName, err)
			return err
		}
		log.Printf("[tmiix paste] writeRemotePastedImage failed server=%s output=%q err=%v", serverName, msg, err)
		return fmt.Errorf("%s", msg)
	}
	log.Printf("[tmiix paste] writeRemotePastedImage complete server=%s path=%s output_bytes=%d", serverName, remotePath, len(out))
	return nil
}

func pasteImageMarker() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return "__TMIIX_PASTE_READY_" + hex.EncodeToString(buf[:]) + "__"
}

func base64TerminalInput(raw []byte) []byte {
	encoded := base64.StdEncoding.EncodeToString(raw)
	var b strings.Builder
	for len(encoded) > 0 {
		n := 76
		if len(encoded) < n {
			n = len(encoded)
		}
		b.WriteString(encoded[:n])
		b.WriteByte('\n')
		encoded = encoded[n:]
	}
	b.WriteByte(0x04)
	return []byte(b.String())
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (a *App) runSSHPtyWriteAfterMarker(cmd *exec.Cmd, owner string, marker []byte, input []byte) ([]byte, error) {
	log.Printf("[tmiix paste] ssh pty transfer start owner=%s input_bytes=%d", owner, len(input))
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("[tmiix paste] ssh pty start failed owner=%s err=%v", owner, err)
		return nil, err
	}
	defer func() {
		_ = ptmx.Close()
		a.passphrases.cancelFor(owner)
	}()

	var (
		collected bytes.Buffer
		lineBuf   []byte
		sentInput bool
	)
	buf := make([]byte, 4096)
	keepTail := maxInt(len(marker), len(passphraseTrigger)) - 1
	for {
		_ = ptmx.SetReadDeadline(time.Now().Add(2 * time.Minute))
		n, rerr := ptmx.Read(buf)
		if n > 0 {
			lineBuf = append(lineBuf, buf[:n]...)
			for {
				if !sentInput {
					if idx := bytes.Index(lineBuf, marker); idx >= 0 {
						log.Printf("[tmiix paste] ssh pty marker seen owner=%s", owner)
						collected.Write(lineBuf[:idx])
						lineBuf = append(lineBuf[:0], lineBuf[idx+len(marker):]...)
						if _, werr := ptmx.Write(input); werr != nil {
							log.Printf("[tmiix paste] ssh pty input write failed owner=%s err=%v", owner, werr)
							return collected.Bytes(), werr
						}
						log.Printf("[tmiix paste] ssh pty input written owner=%s bytes=%d", owner, len(input))
						sentInput = true
						continue
					}
				}

				if idx := bytes.Index(lineBuf, passphraseTrigger); idx >= 0 {
					tail := lineBuf[idx+len(passphraseTrigger):]
					endRel := bytes.Index(tail, []byte("': "))
					if endRel < 0 {
						collected.Write(lineBuf[:idx])
						lineBuf = append(lineBuf[:0], lineBuf[idx:]...)
						break
					}
					promptEnd := idx + len(passphraseTrigger) + endRel + len("': ")
					prompt := string(lineBuf[idx : promptEnd-1])
					collected.Write(lineBuf[:idx])
					lineBuf = append(lineBuf[:0], lineBuf[promptEnd:]...)

					reply := a.passphrases.request(a.ctx, owner, prompt)
					val, ok := <-reply
					if !ok {
						log.Printf("[tmiix paste] ssh pty passphrase cancelled owner=%s", owner)
						_ = cmd.Process.Kill()
						return collected.Bytes(), errors.New("cancelled")
					}
					if _, werr := ptmx.Write([]byte(val + "\n")); werr != nil {
						log.Printf("[tmiix paste] ssh pty passphrase write failed owner=%s err=%v", owner, werr)
						return collected.Bytes(), werr
					}
					log.Printf("[tmiix paste] ssh pty passphrase submitted owner=%s", owner)
					continue
				}

				if sentInput {
					collected.Write(lineBuf)
					lineBuf = lineBuf[:0]
					break
				}
				if len(lineBuf) > keepTail {
					flushLen := len(lineBuf) - keepTail
					collected.Write(lineBuf[:flushLen])
					lineBuf = append(lineBuf[:0], lineBuf[flushLen:]...)
				}
				break
			}
		}
		if rerr != nil {
			if rerr == io.EOF || errors.Is(rerr, os.ErrClosed) {
				break
			}
			if strings.Contains(rerr.Error(), "input/output error") {
				break
			}
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			log.Printf("[tmiix paste] ssh pty read failed owner=%s err=%v", owner, rerr)
			return collected.Bytes(), rerr
		}
	}
	if len(lineBuf) > 0 {
		collected.Write(lineBuf)
	}
	if werr := cmd.Wait(); werr != nil {
		log.Printf("[tmiix paste] ssh pty command failed owner=%s sent_input=%t err=%v output=%q", owner, sentInput, werr, strings.TrimSpace(collected.String()))
		return collected.Bytes(), werr
	}
	log.Printf("[tmiix paste] ssh pty transfer complete owner=%s sent_input=%t output_bytes=%d", owner, sentInput, collected.Len())
	return collected.Bytes(), nil
}
