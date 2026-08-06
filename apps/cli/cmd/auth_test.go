package cmd

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/config"
)

// TestAuthLoginWritesToken 验证 auth login 用候选密钥通过 /api/auth/me 后把密钥写入配置。
func TestAuthLoginWritesToken(t *testing.T) {
	// 隔离配置目录，避免污染真实 ~/.serenique/config.yaml
	dir := t.TempDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	config.SetPath(filepath.Join(dir, "config.yaml"))

	authLoginToken = "secret-token"
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":true}}`))
	}, true, func(srv *httptest.Server) {
		if err := authLoginCmd.RunE(authLoginCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "secret-token" {
		t.Fatalf("token = %q, want %q", cfg.Token, "secret-token")
	}
}

// TestAuthLogoutClearsToken 验证 logout 清空配置里的密钥。
func TestAuthLogoutClearsToken(t *testing.T) {
	dir := t.TempDir()
	config.SetPath(filepath.Join(dir, "config.yaml"))

	cfg := config.Default()
	cfg.Token = "secret-token"
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}

	if err := authLogoutCmd.RunE(authLogoutCmd, nil); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token != "" {
		t.Fatalf("token = %q, want empty", loaded.Token)
	}
}

// TestAuthLoginRejectsBadToken 验证密钥错误时返回 error（非零退出）。
func TestAuthLoginRejectsBadToken(t *testing.T) {
	dir := t.TempDir()
	config.SetPath(filepath.Join(dir, "config.yaml"))

	authLoginToken = "bad-token"
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"success":false,"message":"未认证或登录已过期"}`))
	}, true, func(srv *httptest.Server) {
		if err := authLoginCmd.RunE(authLoginCmd, nil); err == nil {
			t.Fatal("expected an error for a rejected token")
		}
	})
}
