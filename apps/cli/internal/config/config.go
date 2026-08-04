// Package config manages the Serenique CLI configuration file (~/.serenique/config.yaml).
//
// Configuration precedence (highest to lowest):
//  1. CLI flags (--baseurl, --token)
//  2. Environment variables (SERENIQUE_BASEURL, SERENIQUE_TOKEN)
//  3. Config file (~/.serenique/config.yaml)
//  4. Default values
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// overridePath, when non-empty, overrides the default config file location.
// It is set via SetPath, typically from the --config/-c flag.
var overridePath string

// SetPath sets an explicit config file path that takes precedence over the
// default (~/.serenique/config.yaml) and SERENIQUE_CONFIG_DIR. Pass an empty
// string to clear the override.
func SetPath(path string) {
	overridePath = path
}

// Config holds the CLI configuration.
type Config struct {
	// BaseURL is the API server address (without trailing slash).
	BaseURL string `yaml:"baseurl" json:"baseurl"`
	// Token is the authentication token (reserved — backend auth not implemented yet).
	Token string `yaml:"token" json:"token,omitempty"`
}

// Default returns a Config with sensible defaults.
func Default() *Config {
	return &Config{
		BaseURL: "http://localhost:3000",
		Token:   "",
	}
}

// Path returns the path to the config file.
// Precedence: explicit override (SetPath / --config) > SERENIQUE_CONFIG_DIR
// env var > ~/.serenique/config.yaml.
func Path() (string, error) {
	if overridePath != "" {
		return overridePath, nil
	}
	if dir := os.Getenv("SERENIQUE_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "config.yaml"), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("无法获取用户家目录: %w", err)
	}
	return filepath.Join(home, ".serenique", "config.yaml"), nil
}

// Load reads the config from disk. Returns the default config if the file
// does not exist.
func Load() (*Config, error) {
	configPath, err := Path()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return Default(), nil
		}
		return nil, fmt.Errorf("读取配置文件失败 (%s): %w", configPath, err)
	}

	cfg := Default()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败 (%s): %w", configPath, err)
	}

	// Tighten permissions on a pre-existing file so a stored token is never
	// left world-readable (best effort — do not fail the load on chmod errors).
	// Skip symlinks: os.Chmod would follow the link and alter the permissions of
	// an arbitrary target the user did not intend to touch.
	if fi, err := os.Lstat(configPath); err == nil && fi.Mode()&os.ModeSymlink == 0 {
		_ = os.Chmod(configPath, 0o600)
	}

	return cfg, nil
}

// Save writes the config to disk. Creates the parent directory if needed.
// The write is atomic (temp file + rename) so a crash mid-write never leaves
// a truncated config behind, and the file is always chmod'ed to 0600.
func Save(cfg *Config) error {
	configPath, err := Path()
	if err != nil {
		return err
	}

	// Write through a symlinked config to its resolved target so save and load
	// treat symlinks the same way (Load deliberately skips chmod through links).
	// Otherwise the atomic rename below would replace the symlink with a new
	// regular file, silently detaching it from its target.
	if fi, err := os.Lstat(configPath); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		if target, err := filepath.EvalSymlinks(configPath); err == nil {
			configPath = target
		}
	}

	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建配置目录失败 (%s): %w", dir, err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	tmp, err := os.CreateTemp(dir, ".config-*.tmp")
	if err != nil {
		return fmt.Errorf("创建临时配置文件失败: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("写入临时配置文件失败: %w", err)
	}
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return fmt.Errorf("设置配置文件权限失败 (%s): %w", configPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("关闭临时配置文件失败: %w", err)
	}
	if err := os.Rename(tmpName, configPath); err != nil {
		return fmt.Errorf("写入配置文件失败 (%s): %w", configPath, err)
	}

	return nil
}

// Resolve returns the effective configuration by merging flags and
// environment variables on top of the config file values.
// Override strings may be empty (meaning "not set").
func Resolve(cfg *Config, baseURLOverride, tokenOverride string) *Config {
	resolved := &Config{
		BaseURL: cfg.BaseURL,
		Token:   cfg.Token,
	}

	// Environment variables — override config file
	if v := os.Getenv("SERENIQUE_BASEURL"); v != "" {
		resolved.BaseURL = v
	}
	if v := os.Getenv("SERENIQUE_TOKEN"); v != "" {
		resolved.Token = v
	}

	// CLI flags — highest precedence
	if baseURLOverride != "" {
		resolved.BaseURL = baseURLOverride
	}
	if tokenOverride != "" {
		resolved.Token = tokenOverride
	}

	return resolved
}
