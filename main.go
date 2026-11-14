package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	fullscreen := flag.Bool("fullscreen", false, "start the window in fullscreen mode")
	showVersion := flag.Bool("version", false, "print version and exit")
	showVersionShort := flag.Bool("v", false, "print version and exit")
	flag.Parse()

	if *showVersion || *showVersionShort {
		fmt.Println(appVersion)
		return
	}

	if _, err := initAppLogger(); err != nil {
		fmt.Fprintf(os.Stderr, "tmiix: log setup failed: %v\n", err)
	}

	startState := application.WindowStateMaximised
	if *fullscreen {
		startState = application.WindowStateFullscreen
	}

	app := NewApp()

	desktop := application.New(application.Options{
		Name:        "tmiix",
		Description: "The missing tmux GUI",
		Icon:        platformAppIcon(),
		Services:    []application.Service{application.NewService(app)},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
		OnShutdown:  func() { app.shutdown(app.ctx) },
	})
	app.startup(context.Background())
	window := desktop.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "tmiix",
		Width:            1280,
		Height:           820,
		MinWidth:         960,
		MinHeight:        640,
		Hidden:           true,
		StartState:       startState,
		BackgroundColour: application.NewRGB(0x0d, 0x11, 0x17),
		EnableFileDrop:   true,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHidden,
		},
	})
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(_ *application.WindowEvent) {
		installNavigationGuard()
		window.Show()
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		desktop.Event.Emit("files:dropped", event.Context().DroppedFiles())
	})
	err := desktop.Run()
	if err != nil {
		log.Printf("wails run failed: %v", err)
		fmt.Fprintln(os.Stderr, "Error:", err.Error())
	}
}
