package client

import (
	"context"
	"net/http"
	"testing"
)

// TestMeDecodesUserProfile: 会话身份下 /api/auth/me 返回 authenticated:true +
// 完整用户对象（含可空字段）。
func TestMeDecodesUserProfile(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" {
			t.Fatalf("path = %q, want /api/auth/me", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":true,"user":{"id":"u1","name":"zeroicey","email":null,"birthday":"1990-01-01","createdAt":"2026-08-01T00:00:00Z","updatedAt":"2026-08-01T00:00:00Z"}}}`))
	})

	me, err := c.Me(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !me.Authenticated || me.User == nil {
		t.Fatalf("expected authenticated user, got %+v", me)
	}
	if me.User.ID != "u1" || me.User.Name == nil || *me.User.Name != "zeroicey" {
		t.Fatalf("user = %+v", me.User)
	}
	if me.User.Email != nil {
		t.Fatalf("email should be nil (null), got %+v", me.User.Email)
	}
	if me.User.Birthday == nil || *me.User.Birthday != "1990-01-01" {
		t.Fatalf("birthday = %+v", me.User.Birthday)
	}
}

// TestMeDecodesTokenIdentity: Bearer 令牌身份鉴权通过但无 userId，API 返回
// authenticated:false + user:null —— 这是 CLI 的常态（auth login 探测即依赖
// 这一点：200 = 令牌有效，401 = 无效）。
func TestMeDecodesTokenIdentity(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"authenticated":false,"user":null}}`))
	})

	me, err := c.Me(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if me.Authenticated {
		t.Fatal("authenticated should be false for token identity")
	}
	if me.User != nil {
		t.Fatalf("user should be nil, got %+v", me.User)
	}
}

func TestMeMaps401(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"success":false,"message":"未认证或登录已过期","error":{"code":"UNAUTHORIZED"}}`))
	})

	_, err := c.Me(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != http.StatusUnauthorized {
		t.Fatalf("HTTPStatus = %d, want 401", apiErr.HTTPStatus)
	}
}
