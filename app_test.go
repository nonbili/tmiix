package main

import (
	"os"
	"testing"
)

func TestExtendPathAppendsMissingDirsOnly(t *testing.T) {
	sep := string(os.PathListSeparator)
	t.Setenv("PATH", "/usr/bin"+sep+"/opt/homebrew/bin")

	extendPath([]string{"/opt/homebrew/bin", "/usr/local/bin"})

	want := "/usr/bin" + sep + "/opt/homebrew/bin" + sep + "/usr/local/bin"
	if got := os.Getenv("PATH"); got != want {
		t.Fatalf("PATH = %q, want %q", got, want)
	}
}
