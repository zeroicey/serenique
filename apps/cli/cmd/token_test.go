package cmd

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
)

// TestTokenCreateEmitsPlaintextOnce 验证 create 在表格模式输出完整明文
// （唯一拿到明文的机会），stderr 提示「明文仅此一次」，且请求体带 name。
func TestTokenCreateEmitsPlaintextOnce(t *testing.T) {
	const plaintext = "serenique_abcdefghijklmnopqrstuvwxyz123456"
	var gotBody string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/tokens" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"plaintext":"` + plaintext + `","item":{"id":"tok-1","name":"macbook","prefix":"abcdefgh","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"}}}`))
	}, false, func(srv *httptest.Server) {
		var out, errOut string
		func() {
			out = captureStdout(t, func() {
				errOut = captureStderr(t, func() {
					if err := tokenCreateCmd.RunE(tokenCreateCmd, []string{"macbook"}); err != nil {
						t.Fatal(err)
					}
				})
			})
		}()
		if !strings.Contains(gotBody, `"name":"macbook"`) {
			t.Fatalf("request body = %s, want name macbook", gotBody)
		}
		if !strings.Contains(out, plaintext) {
			t.Fatalf("plaintext must appear in stdout exactly once, got %q", out)
		}
		if !strings.Contains(errOut, "明文仅此一次") {
			t.Fatalf("expected one-time-warning on stderr, got %q", errOut)
		}
	})
}

// TestTokenCreateJSONEmitsPlaintext 验证 --json 模式同样输出完整明文
// （token 打码约定的唯一例外——创建响应是拿到明文的唯一机会）。
func TestTokenCreateJSONEmitsPlaintext(t *testing.T) {
	const plaintext = "serenique_xyz9876543210"
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"plaintext":"` + plaintext + `","item":{"id":"tok-1","name":"macbook","prefix":"xyz98765","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"}}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		errOut := captureStderr(t, func() {
			if err := tokenCreateCmd.RunE(tokenCreateCmd, []string{"macbook"}); err != nil {
				t.Fatal(err)
			}
		})
		result, ok := rec.lastSuccess.data.(*client.TokenCreateResult)
		if !ok {
			t.Fatalf("data is %T, want *client.TokenCreateResult", rec.lastSuccess.data)
		}
		if result.Plaintext != plaintext {
			t.Fatalf("plaintext = %q, want %q (must NOT be masked)", result.Plaintext, plaintext)
		}
		if !strings.Contains(errOut, "明文仅此一次") {
			t.Fatalf("expected one-time-warning on stderr in JSON mode, got %q", errOut)
		}
	})
}

// TestTokenListRendersTable 验证 list 表格输出（前缀/名称/时间，未使用与未撤销
// 显示 "-"，已撤销显示撤销时间）。
func TestTokenListRendersTable(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tokens" {
			t.Fatalf("path = %q, want /api/tokens", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[
			{"id":"tok-1","name":"macbook","prefix":"abcdefgh","lastUsedAt":"2026-08-09T01:00:00.000Z","revokedAt":null,"createdAt":"2026-08-08T00:00:00.000Z"},
			{"id":"tok-2","name":"server","prefix":"xyz99999","lastUsedAt":null,"revokedAt":"2026-08-07T00:00:00.000Z","createdAt":"2026-08-06T00:00:00.000Z"}
		]}}`))
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := tokenListCmd.RunE(tokenListCmd, nil); err != nil {
				t.Fatal(err)
			}
		})
		for _, want := range []string{"macbook", "server", "abcdefgh", "xyz99999", "共 2 个令牌", "2026-08-09T01:00:00"} {
			if !strings.Contains(out, want) {
				t.Fatalf("output missing %q:\n%s", want, out)
			}
		}
		// 已撤销令牌的撤销时间出现；未使用令牌的最近使用列显示 "-"。
		if !strings.Contains(out, "2026-08-07T00:00:00") {
			t.Fatalf("revoked timestamp missing:\n%s", out)
		}
	})
}

// TestTokenListEmptyMessage 验证空列表提示。
func TestTokenListEmptyMessage(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[]}}`))
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := tokenListCmd.RunE(tokenListCmd, nil); err != nil {
				t.Fatal(err)
			}
		})
		if !strings.Contains(out, "暂无 API 令牌") {
			t.Fatalf("expected empty message, got %q", out)
		}
	})
}

// TestTokenListJSONDecodesItems 验证 --json 模式输出完整条目（含可空字段解码）。
func TestTokenListJSONDecodesItems(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"tok-1","name":"macbook","prefix":"abcdefgh","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-08T00:00:00.000Z"}]}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := tokenListCmd.RunE(tokenListCmd, nil); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		items, ok := data["items"].([]client.TokenEntry)
		if !ok || len(items) != 1 {
			t.Fatalf("items = %#v", data["items"])
		}
		if items[0].ID != "tok-1" || items[0].RevokedAt != "" || items[0].LastUsedAt != "" {
			t.Fatalf("entry = %+v", items[0])
		}
	})
}

// TestTokenRevokeRequiresConfirmation 验证非交互式 EOF 视为取消：报错、不发请求。
func TestTokenRevokeRequiresConfirmation(t *testing.T) {
	withStdin(t, "") // EOF — 非交互场景
	var called bool
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		err := tokenRevokeCmd.RunE(tokenRevokeCmd, []string{"tok-1"})
		if err == nil {
			t.Fatal("expected cancel error on EOF")
		}
		if !strings.Contains(err.Error(), "已取消") {
			t.Fatalf("expected cancel message, got %v", err)
		}
		if called {
			t.Fatal("DELETE must not be issued without confirmation")
		}
	})
}

// TestTokenRevokeConfirmed 验证确认后发出 DELETE 并输出成功。
func TestTokenRevokeConfirmed(t *testing.T) {
	withStdin(t, "y\n")
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := tokenRevokeCmd.RunE(tokenRevokeCmd, []string{"tok-1"}); err != nil {
				t.Fatal(err)
			}
		})
		if gotPath != "/api/tokens/tok-1" {
			t.Fatalf("revoke path = %q, want /api/tokens/tok-1", gotPath)
		}
		if !strings.Contains(out, "令牌已撤销") {
			t.Fatalf("expected success message, got %q", out)
		}
	})
}

// TestTokenRevokeForce 验证 --force 跳过确认。
func TestTokenRevokeForce(t *testing.T) {
	tokenRevokeForce = true
	t.Cleanup(func() { tokenRevokeForce = false })
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		if err := tokenRevokeCmd.RunE(tokenRevokeCmd, []string{"tok-1"}); err != nil {
			t.Fatal(err)
		}
		if gotPath != "/api/tokens/tok-1" {
			t.Fatalf("revoke path = %q, want /api/tokens/tok-1", gotPath)
		}
	})
}
