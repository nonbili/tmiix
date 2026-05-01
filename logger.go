package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

const maxLogSize = 1024 * 1024

var appLogPath string

func initAppLogger() (string, error) {
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	logDir := filepath.Join(dir, "tmiix")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(logDir, "tmiix.log")
	rotateLogFile(path)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return "", err
	}
	log.SetOutput(f)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	appLogPath = path
	log.Printf("tmiix starting version=%s commit=%s date=%s", appVersion, buildCommit, buildDate)
	return path, nil
}

func rotateLogFile(path string) {
	info, err := os.Stat(path)
	if err != nil || info.Size() <= maxLogSize {
		return
	}
	_ = os.Rename(path, fmt.Sprintf("%s.1", path))
}
