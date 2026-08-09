package cmd

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
)

// withTempConfigDir pins the config path to a fresh temp dir (not just a file
// path) and returns it, isolating tests from the real ~/.serenique/config.yaml.
func withTempConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	config.SetPath(filepath.Join(dir, "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })
	return dir
}

// TestAuthLoginWritesToken 验证 auth login 用候选 Token 通过 /api/auth/me
// 探测（200 = 令牌有效）后把 Token 写入配置，且探测请求携带候选 Token。
func TestAuthLoginWritesToken(t *testing.T) {
	withTempConfigDir(t)
	authLoginToken = "serenique_abcdefghijklmnopqrstuvwxyz123456"
	t.Cleanup(func() { authLoginToken = "" })

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		// Token 身份：鉴权通过但无用户信息（API 新契约）。
		if got := r.Header.Get("Authorization"); got != "Bearer serenique_abcdefghijklmnopqrstuvwxyz123456" {
			t.Fatalf("Authorization = %q, want candidate token", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":false,"user":null}}`))
	}, true, func(srv *httptest.Server) {
		if err := authLoginCmd.RunE(authLoginCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "serenique_abcdefghijklmnopqrstuvwxyz123456" {
		t.Fatalf("token = %q, want saved candidate", cfg.Token)
	}
}

// TestAuthLoginInteractiveReadsStdin 验证交互式粘贴 Token 流程（无 --token flag）。
func TestAuthLoginInteractiveReadsStdin(t *testing.T) {
	withTempConfigDir(t)
	authLoginToken = ""
	t.Cleanup(func() { authLoginToken = "" })
	withStdin(t, "serenique_interactive_token_123\n")

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":false,"user":null}}`))
	}, false, func(srv *httptest.Server) {
		if err := authLoginCmd.RunE(authLoginCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "serenique_interactive_token_123" {
		t.Fatalf("token = %q, want stdin value", cfg.Token)
	}
}

// TestAuthLoginRejectsBadToken 验证 401 时返回 error（非零退出）并给出友好提示。
func TestAuthLoginRejectsBadToken(t *testing.T) {
	withTempConfigDir(t)
	authLoginToken = "serenique_bad_token"
	t.Cleanup(func() { authLoginToken = "" })

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"success":false,"message":"未认证或登录已过期"}`))
	}, true, func(srv *httptest.Server) {
		err := authLoginCmd.RunE(authLoginCmd, nil)
		if err == nil {
			t.Fatal("expected an error for a rejected token")
		}
		if !strings.Contains(err.Error(), "令牌无效") {
			t.Fatalf("expected friendly invalid-token hint, got %v", err)
		}
	})
}

// TestAuthLogoutClearsToken 验证 logout 本地清除配置里的 Token。
func TestAuthLogoutClearsToken(t *testing.T) {
	withTempConfigDir(t)
	authLogoutRevoke = false
	t.Cleanup(func() { authLogoutRevoke = false })

	cfg := config.Default()
	cfg.Token = "serenique_some_token"
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

// TestAuthLogoutRevokeMatchesPrefix 验证 --revoke：按本地明文重算前缀匹配
// 服务端列表，确认后 DELETE 撤销，再清本地。
func TestAuthLogoutRevokeMatchesPrefix(t *testing.T) {
	withTempConfigDir(t)
	authLogoutRevoke = true
	authLogoutForce = true
	t.Cleanup(func() {
		authLogoutRevoke = false
		authLogoutForce = false
	})

	cfg := config.Default()
	cfg.Token = "serenique_abcdefghijklmnopqrstuvwxyz123456" // 随机段前 8 位 = abcdefgh
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}

	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/tokens":
			w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"tok-1","name":"macbook","prefix":"abcdefgh","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"}]}}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/api/tokens/tok-1":
			gotPath = r.URL.Path
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}, true, func(srv *httptest.Server) {
		if err := authLogoutCmd.RunE(authLogoutCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	if gotPath != "/api/tokens/tok-1" {
		t.Fatalf("revoke path = %q, want /api/tokens/tok-1", gotPath)
	}
	loaded, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token != "" {
		t.Fatalf("token = %q, want cleared after revoke", loaded.Token)
	}
}

// TestAuthLogoutRevokeNoMatchClearsLocally 验证 --revoke 但服务端无匹配时：
// 提示后仍完成本地清除（令牌在服务端已不存在/已撤销），且成功消息不谎称
// 服务端已撤销。
func TestAuthLogoutRevokeNoMatchClearsLocally(t *testing.T) {
	withTempConfigDir(t)
	authLogoutRevoke = true
	authLogoutForce = true
	t.Cleanup(func() {
		authLogoutRevoke = false
		authLogoutForce = false
	})

	cfg := config.Default()
	cfg.Token = "serenique_abcdefghijklmnopqrstuvwxyz123456"
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}

	var stderrOut, stdoutOut string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		// 服务端没有任何匹配前缀的未撤销令牌。
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"tok-9","name":"other","prefix":"zzzzzzzz","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"}]}}`))
	}, true, func(srv *httptest.Server) {
		stdoutOut = captureStdout(t, func() {
			stderrOut = captureStderr(t, func() {
				if err := authLogoutCmd.RunE(authLogoutCmd, nil); err != nil {
					t.Fatal(err)
				}
			})
		})
	})

	if !strings.Contains(stderrOut, "未找到") {
		t.Fatalf("expected no-match warning on stderr, got %q", stderrOut)
	}
	if strings.Contains(stdoutOut, "并撤销服务端令牌") {
		t.Fatalf("success message must not claim a server-side revoke: %q", stdoutOut)
	}
	loaded, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token != "" {
		t.Fatalf("token = %q, want cleared locally", loaded.Token)
	}
}

// TestAuthLogoutRevokeAmbiguousFails 验证同前缀多匹配时报错且不删本地——
// 避免用户误以为服务端已撤销。
func TestAuthLogoutRevokeAmbiguousFails(t *testing.T) {
	withTempConfigDir(t)
	authLogoutRevoke = true
	authLogoutForce = true
	t.Cleanup(func() {
		authLogoutRevoke = false
		authLogoutForce = false
	})

	cfg := config.Default()
	cfg.Token = "serenique_abcdefghijklmnopqrstuvwxyz123456"
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[
			{"id":"tok-1","name":"a","prefix":"abcdefgh","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"},
			{"id":"tok-2","name":"b","prefix":"abcdefgh","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-08T00:00:00.000Z"}
		]}}`))
	}, true, func(srv *httptest.Server) {
		if err := authLogoutCmd.RunE(authLogoutCmd, nil); err == nil {
			t.Fatal("expected error for ambiguous prefix match")
		}
	})

	loaded, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token == "" {
		t.Fatal("token must NOT be cleared on ambiguous revoke")
	}
}

// TestAuthMeDisplaysUserInfo 验证 auth me 在服务端返回用户对象时展示
// id/name/email/birthday，未设置字段显示 "-"。
func TestAuthMeDisplaysUserInfo(t *testing.T) {
	withTempConfigDir(t)
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":true,"user":{"id":"u1","name":"zeroicey","email":null,"birthday":"1990-01-01","createdAt":"x","updatedAt":"x"}}}`))
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := authMeCmd.RunE(authMeCmd, nil); err != nil {
				t.Fatal(err)
			}
		})
		for _, want := range []string{"已登录", "u1", "zeroicey", "1990-01-01", "邮箱", "-"} {
			if !strings.Contains(out, want) {
				t.Fatalf("output missing %q: %s", want, out)
			}
		}
	})
}

// TestAuthMeTokenIdentity 验证 Token 身份（200 + user:null，尚未注册用户资料）
// 显示「令牌有效」，不误报未登录。
func TestAuthMeTokenIdentity(t *testing.T) {
	withTempConfigDir(t)
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":true,"user":null}}`))
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := authMeCmd.RunE(authMeCmd, nil); err != nil {
				t.Fatal(err)
			}
		})
		if !strings.Contains(out, "令牌有效") {
			t.Fatalf("expected token-valid message, got %q", out)
		}
	})
}

// TestAuthMeUnauthorizedHint 验证 401 时返回带 auth login 提示的错误。
func TestAuthMeUnauthorizedHint(t *testing.T) {
	withTempConfigDir(t)
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"success":false,"message":"未认证或登录已过期"}`))
	}, true, func(srv *httptest.Server) {
		err := authMeCmd.RunE(authMeCmd, nil)
		if err == nil {
			t.Fatal("expected error for 401")
		}
		if !strings.Contains(err.Error(), "auth login") {
			t.Fatalf("expected auth login hint, got %v", err)
		}
	})
}

// TestAuthMeJSONPassesThrough 验证 --json 模式原样透传 {authenticated, user}
// 载荷（契约保真，供 AI/脚本判断）。
func TestAuthMeJSONPassesThrough(t *testing.T) {
	withTempConfigDir(t)
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":true,"user":{"id":"u1","name":null,"email":"a@b.c","birthday":null,"createdAt":"x","updatedAt":"x"}}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := authMeCmd.RunE(authMeCmd, nil); err != nil {
			t.Fatal(err)
		}
		me, ok := rec.lastSuccess.data.(*client.AuthMeEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.AuthMeEntry", rec.lastSuccess.data)
		}
		if !me.Authenticated || me.User == nil || me.User.Email == nil || *me.User.Email != "a@b.c" {
			t.Fatalf("unexpected decode: %+v", me)
		}
	})
}

// TestTokenListPrefix 验证 tokenListPrefix 复刻 API 的 prefixOf（随机段前 8 位）。
func TestTokenListPrefix(t *testing.T) {
	cases := []struct{ in, want string }{
		{"serenique_abcdefghijklmnopqrstuvwxyz123456", "abcdefgh"},
		{"serenique_short", "short"},
		{"not_branded_token_123", "not_bran"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := tokenListPrefix(tc.in); got != tc.want {
			t.Errorf("tokenListPrefix(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
