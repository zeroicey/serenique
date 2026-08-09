package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCreateTokenPostsNameAndDecodes(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/api/tokens" {
			t.Errorf("path = %q, want /api/tokens", r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"plaintext":"serenique_abc123","item":{"id":"tok-1","name":"macbook","prefix":"abc12345","lastUsedAt":null,"revokedAt":null,"createdAt":"2026-08-09T00:00:00.000Z"}}}`))
	})

	result, err := c.CreateToken(context.Background(), "macbook")
	if err != nil {
		t.Fatal(err)
	}
	if gotBody["name"] != "macbook" {
		t.Fatalf("request body = %v, want name macbook", gotBody)
	}
	if result.Plaintext != "serenique_abc123" {
		t.Fatalf("plaintext = %q", result.Plaintext)
	}
	if result.Item.ID != "tok-1" || result.Item.Prefix != "abc12345" || result.Item.Name != "macbook" {
		t.Fatalf("item = %+v", result.Item)
	}
	if result.Item.RevokedAt != "" || result.Item.LastUsedAt != "" {
		t.Fatalf("null timestamps should decode to empty strings: %+v", result.Item)
	}
}

func TestListTokensDecodesBareItems(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/tokens" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[
			{"id":"tok-1","name":"macbook","prefix":"abc12345","lastUsedAt":"2026-08-09T01:00:00.000Z","revokedAt":null,"createdAt":"2026-08-08T00:00:00.000Z"},
			{"id":"tok-2","name":"server","prefix":"xyz99999","lastUsedAt":null,"revokedAt":"2026-08-09T02:00:00.000Z","createdAt":"2026-08-07T00:00:00.000Z"}
		]}}`))
	})

	items, err := c.ListTokens(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2", len(items))
	}
	if items[0].ID != "tok-1" || items[0].Prefix != "abc12345" || items[0].LastUsedAt == "" {
		t.Fatalf("items[0] = %+v", items[0])
	}
	if items[1].RevokedAt == "" || items[1].RevokedAt[:19] != "2026-08-09T02:00:00" {
		t.Fatalf("items[1].RevokedAt = %q", items[1].RevokedAt)
	}
}

func TestRevokeTokenDeletes(t *testing.T) {
	var gotMethod, gotPath string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	})

	if err := c.RevokeToken(context.Background(), "tok-1"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/api/tokens/tok-1" {
		t.Fatalf("request = %s %s, want DELETE /api/tokens/tok-1", gotMethod, gotPath)
	}
}

func TestRevokeTokenMaps404(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"令牌不存在","error":{"code":"NOT_FOUND"}}`))
	})

	err := c.RevokeToken(context.Background(), "nope")
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != http.StatusNotFound || !strings.Contains(apiErr.Message, "令牌不存在") {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}
