//go:build !linux

package main

func platformAppIcon() []byte {
	return nil
}
