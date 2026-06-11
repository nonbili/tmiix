//go:build !linux

package main

// installNavigationGuard is only needed on Linux, where WebKitGTK's default
// action for an OS file drop is to navigate the webview to the dropped file.
func installNavigationGuard() {}
