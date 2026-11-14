package main

import (
	_ "embed"
	"go.yaml.in/yaml/v3"
)

//go:embed wails.yaml
var wailsConfigBytes []byte

var (
	appVersion  = "v0.1.0"
	buildCommit = ""
	buildDate   = ""
)

func init() {
	var cfg struct {
		Project struct {
			Version string `yaml:"version"`
		} `yaml:"project"`
	}
	if err := yaml.Unmarshal(wailsConfigBytes, &cfg); err == nil && cfg.Project.Version != "" {
		appVersion = "v" + cfg.Project.Version
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
