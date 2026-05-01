package main

var (
	appVersion  = "v0.1.0"
	buildCommit = ""
	buildDate   = ""
)

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
