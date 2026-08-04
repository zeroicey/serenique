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
// Uses SERENIQUE_CONFIG_DIR env var if set, otherwise ~/.serenique/config.yaml.
func Path() (string, error) {
	if dir := os.Getenv("SERENIQUE_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "config.yaml"), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("无法获取用户家目录: %w", err)
	}
	return filepath.Join(home, ".serenique", "config.yaml"), nil
}

// ConfigDir returns the directory containing the config file.
func ConfigDir() (string, error) {
	configPath, err := Path()
	if err != nil {
		return "", err
	}
	return filepath.Dir(configPath), nil
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

	return cfg, nil
}

// Save writes the config to disk. Creates the parent directory if needed.
func Save(cfg *Config) error {
	configPath, err := Path()
	if err != nil {
		return err
	}

	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建配置目录失败 (%s): %w", dir, err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0o600); err != nil {
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
