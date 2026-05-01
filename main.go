package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
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

	startState := options.Maximised
	if *fullscreen {
		startState = options.Fullscreen
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "tmiix",
		Width:            1280,
		Height:           820,
		MinWidth:         960,
		MinHeight:        640,
		StartHidden:      true,
		WindowStartState: startState,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0x0d, G: 0x11, B: 0x17, A: 1},
		Linux:            platformLinuxOptions(),
		OnStartup:        app.startup,
		OnDomReady:       runtime.WindowShow,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Printf("wails run failed: %v", err)
		fmt.Fprintln(os.Stderr, "Error:", err.Error())
	}
}
