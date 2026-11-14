package main

import (
	"testing"

	"go.yaml.in/yaml/v3"
)

func TestVersionFromWailsManifest(t *testing.T) {
	var config struct {
		Project struct {
			Version string `yaml:"version"`
		} `yaml:"project"`
	}
	if err := yaml.Unmarshal(wailsConfigBytes, &config); err != nil {
		t.Fatal(err)
	}
	if config.Project.Version == "" {
		t.Fatal("project.version is missing from wails.yaml")
	}
	if want := "v" + config.Project.Version; appVersion != want {
		t.Fatalf("appVersion = %q, want %q", appVersion, want)
	}
}
