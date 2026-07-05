package main

import (
	_ "embed"
	"encoding/json"
)

//go:embed wails.json
var wailsConfigBytes []byte

var (
	appVersion  = "v0.1.0"
	buildCommit = ""
	buildDate   = ""
)

func init() {
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(wailsConfigBytes, &cfg); err == nil && cfg.Info.ProductVersion != "" {
		appVersion = "v" + cfg.Info.ProductVersion
	}
}

type AppInfo struct {
	Version string `json:"version"`
	Commit  string `json:"commit,omitempty"`
	Date    string `json:"date,omitempty"`
	LogPath string `json:"logPath,omitempty"`
}

func (a *App) GetAppInfo() AppInfo {
	return AppInfo{
		Version: appVersion,
		Commit:  buildCommit,
		Date:    buildDate,
		LogPath: appLogPath,
	}
}
