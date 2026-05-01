package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type passphraseRequest struct {
	id    string
	owner string // tabId, or empty for one-shot (e.g. ListRemoteSessions)
	reply chan string
}

type passphraseRegistry struct {
	mu      sync.Mutex
	pending map[string]*passphraseRequest
}

func newPassphraseRegistry() *passphraseRegistry {
	return &passphraseRegistry{pending: map[string]*passphraseRequest{}}
}

// request emits an askpass event to the UI and returns a channel the caller
// should read from to receive the passphrase. The channel is closed (yielding
// ok=false) if the request is cancelled.
func (r *passphraseRegistry) request(ctx context.Context, owner, prompt string) <-chan string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	req := &passphraseRequest{
		id:    hex.EncodeToString(buf[:]),
		owner: owner,
		reply: make(chan string, 1),
	}
	r.mu.Lock()
	r.pending[req.id] = req
	r.mu.Unlock()
	runtime.EventsEmit(ctx, "ssh:passphrase", map[string]string{
		"id":     req.id,
		"prompt": prompt,
	})
	return req.reply
}

func (r *passphraseRegistry) resolve(id, value string) {
	r.mu.Lock()
	req, ok := r.pending[id]
	delete(r.pending, id)
	r.mu.Unlock()
	if !ok {
		return
	}
	req.reply <- value
	close(req.reply)
}

func (r *passphraseRegistry) cancel(id string) {
	r.mu.Lock()
	req, ok := r.pending[id]
	delete(r.pending, id)
	r.mu.Unlock()
	if !ok {
		return
	}
	close(req.reply)
}

// cancelFor cancels any pending prompts owned by the given id (e.g. tabId).
func (r *passphraseRegistry) cancelFor(owner string) {
	r.mu.Lock()
	ids := make([]string, 0)
	for id, req := range r.pending {
		if req.owner == owner {
			ids = append(ids, id)
		}
	}
	r.mu.Unlock()
	for _, id := range ids {
		r.cancel(id)
	}
}

// Bound methods called by the frontend modal.

func (a *App) SubmitPassphrase(id, value string) {
	a.passphrases.resolve(id, value)
}

func (a *App) CancelPassphrase(id string) {
	a.passphrases.cancel(id)
}
