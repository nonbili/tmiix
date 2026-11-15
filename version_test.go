package main

import (
	"testing"

	"go.yaml.in/yaml/v3"
)

func TestVersionFromWailsManifest(t *testing.T) {
	var config struct {
		Info struct {
			Version string `yaml:"version"`
		} `yaml:"info"`
	}
	if err := yaml.Unmarshal(wailsConfigBytes, &config); err != nil {
		t.Fatal(err)
	}
	if config.Info.Version == "" {
		t.Fatal("info.version is missing from build/config.yml")
	}
	if want := "v" + config.Info.Version; appVersion != want {
		t.Fatalf("appVersion = %q, want %q", appVersion, want)
	}
}
