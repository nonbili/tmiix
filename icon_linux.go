//go:build linux

package main

import (
	_ "embed"
)

//go:embed build/linux/appicon.png
var linuxAppIconPNG []byte

func platformAppIcon() []byte {
	return linuxAppIconPNG
}
