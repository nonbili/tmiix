package main

import (
	"os/exec"
	"strings"
	"testing"
)

func TestBuildSnippetContentTrimsTrailingWhitespace(t *testing.T) {
	body := "  printf '<%s>\\n' \\ \t\r\n    hello\t \r\n\r\n \t"
	got := buildSnippetContent(body, tabNew, "box")
	want := "#!/bin/sh\n# tab: new-tab\n# target: box\n  printf '<%s>\\n' \\\n    hello\n"
	if got != want {
		t.Fatalf("content = %q, want %q", got, want)
	}

	// Verify the saved continuation still produces a single command.
	cmd := exec.Command("sh")
	cmd.Stdin = strings.NewReader(got)
	output, err := cmd.CombinedOutput()
	if err != nil || string(output) != "<hello>\n" {
		t.Fatalf("script output = %q, err = %v", output, err)
	}
}
