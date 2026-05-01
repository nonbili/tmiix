//go:build linux

package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed build/linux/appicon.png
var linuxAppIconPNG []byte

func platformLinuxOptions() *linux.Options {
	return &linux.Options{
		Icon: linuxAppIconPNG,
	}
}
