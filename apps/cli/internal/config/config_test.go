package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPathDefault(t *testing.T) {
	SetPath("")
	t.Setenv("SERENIQUE_CONFIG_DIR", "")
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	p, err := Path()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(home, ".serenique", "config.yaml"); p != want {
		t.Fatalf("Path() = %q, want %q", p, want)
	}
}

func TestPathEnvOverride(t *testing.T) {
	SetPath("")
	t.Setenv("SERENIQUE_CONFIG_DIR", "/tmp/sqn-test-dir")
	p, err := Path()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join("/tmp/sqn-test-dir", "config.yaml"); p != want {
		t.Fatalf("Path() = %q, want %q", p, want)
	}
}

func TestPathExplicitOverrideWins(t *testing.T) {
	t.Setenv("SERENIQUE_CONFIG_DIR", "/tmp/ignored-dir")
	SetPath("/custom/path/config.yaml")
	defer SetPath("")
	p, err := Path()
	if err != nil {
		t.Fatal(err)
	}
	if p != "/custom/path/config.yaml" {
		t.Fatalf("Path() = %q, want %q", p, "/custom/path/config.yaml")
	}
}

func TestLoadMissingReturnsDefault(t *testing.T) {
	SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	defer SetPath("")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BaseURL != "http://localhost:3000" {
		t.Fatalf("BaseURL = %q, want default", cfg.BaseURL)
	}
}

func TestLoadInvalidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte("baseurl: [unclosed"), 0o600); err != nil {
		t.Fatal(err)
	}
	SetPath(path)
	defer SetPath("")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	SetPath(path)
	defer SetPath("")

	cfg := &Config{BaseURL: "http://example.test", Token: "sekrit"}
	if err := Save(cfg); err != nil {
		t.Fatal(err)
	}

	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := fi.Mode().Perm(); perm != 0o600 {
		t.Fatalf("config file perms = %o, want 600", perm)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.BaseURL != cfg.BaseURL || loaded.Token != cfg.Token {
		t.Fatalf("round trip mismatch: got %+v, want %+v", loaded, cfg)
	}
}

func TestSaveLeavesNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	SetPath(path)
	defer SetPath("")

	if err := Save(&Config{BaseURL: "http://x", Token: "t"}); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected only config.yaml in dir, got %d entries", len(entries))
	}
}

func TestLoadTightensPermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	SetPath(path)
	defer SetPath("")

	// A pre-existing world-readable config must be tightened on load.
	if err := os.WriteFile(path, []byte("baseurl: http://x\ntoken: t\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := fi.Mode().Perm(); perm != 0o600 {
		t.Fatalf("config file perms = %o, want 600", perm)
	}
}

func TestResolvePrecedence(t *testing.T) {
	t.Setenv("SERENIQUE_BASEURL", "http://env.test")
	t.Setenv("SERENIQUE_TOKEN", "env-token")

	file := &Config{BaseURL: "http://file.test", Token: "file-token"}

	// Env should win over the file.
	r := Resolve(file, "", "")
	if r.BaseURL != "http://env.test" || r.Token != "env-token" {
		t.Fatalf("env should win over file, got %+v", r)
	}

	// Flags should win over env.
	r = Resolve(file, "http://flag.test", "flag-token")
	if r.BaseURL != "http://flag.test" || r.Token != "flag-token" {
		t.Fatalf("flag should win over env, got %+v", r)
	}

	// Source config must not be mutated.
	if file.BaseURL != "http://file.test" || file.Token != "file-token" {
		t.Fatalf("Resolve mutated its input: %+v", file)
	}
}
