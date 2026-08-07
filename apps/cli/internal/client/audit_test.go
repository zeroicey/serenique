package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"testing"
)

func TestListAuditLogsUnpacksEnvelope(t *testing.T) {
	var gotPath string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if q := r.URL.Query().Get("level"); q != "warn" {
			t.Errorf("level = %q, want warn", q)
		}
		if q := r.URL.Query().Get("event"); q != "auth.login" {
			t.Errorf("event = %q, want auth.login", q)
		}
		if q := r.URL.Query().Get("unreadOnly"); q != "true" {
			t.Errorf("unreadOnly = %q, want true", q)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"l1","event":"auth.login","message":"登录成功","level":"info","source":"cli","ip":"127.0.0.1","detail":{"ua":"curl"},"isRead":false,"createdAt":"2026-08-08T00:00:00.000Z"}],"total":1}}`))
	})

	query := url.Values{}
	query.Set("level", "warn")
	query.Set("event", "auth.login")
	query.Set("unreadOnly", "true")
	items, total, err := c.ListAuditLogs(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/audit/logs" {
		t.Fatalf("path = %q, want /api/audit/logs", gotPath)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("items = %+v, total = %d", items, total)
	}
	e := items[0]
	if e.ID != "l1" || e.Event != "auth.login" || e.Level != "info" || e.Message != "登录成功" {
		t.Fatalf("entry = %+v", e)
	}
	if e.Source == nil || *e.Source != "cli" {
		t.Fatalf("source = %v, want &cli", e.Source)
	}
	if e.IP == nil || *e.IP != "127.0.0.1" {
		t.Fatalf("ip = %v, want &127.0.0.1", e.IP)
	}
	if e.Detail["ua"] != "curl" {
		t.Fatalf("detail = %+v, want ua=curl", e.Detail)
	}
	if e.IsRead {
		t.Fatalf("isRead = true, want false")
	}
}

func TestListAuditLogsAcceptsNullDetail(t *testing.T) {
	// detail is a nullable jsonb; a null detail must decode to a nil map, not fail.
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"l1","event":"blob.delete","message":"删除文件","level":"warn","source":null,"ip":null,"detail":null,"isRead":true,"createdAt":"x"}],"total":1}}`))
	})
	items, total, err := c.ListAuditLogs(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("items = %+v, total = %d", items, total)
	}
	e := items[0]
	if e.Source != nil {
		t.Fatalf("source = %v, want nil", e.Source)
	}
	if e.Detail != nil {
		t.Fatalf("detail = %+v, want nil", e.Detail)
	}
	if !e.IsRead {
		t.Fatalf("isRead = false, want true")
	}
}

func TestAuditUnreadCountDecodes(t *testing.T) {
	var gotPath string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"unreadCount":3}}`))
	})
	result, err := c.AuditUnreadCount(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/audit/logs/unread-count" {
		t.Fatalf("path = %q, want /api/audit/logs/unread-count", gotPath)
	}
	if result.UnreadCount != 3 {
		t.Fatalf("unreadCount = %d, want 3", result.UnreadCount)
	}
}

func TestMarkAuditLogsReadOmitsIDsWhenEmpty(t *testing.T) {
	var gotMethod string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"updatedCount":2,"unreadCount":0}}`))
	})
	result, err := c.MarkAuditLogsRead(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != "PUT" {
		t.Fatalf("method = %s, want PUT", gotMethod)
	}
	if result.UpdatedCount != 2 || result.UnreadCount != 0 {
		t.Fatalf("result = %+v", result)
	}
	if _, ok := gotBody["ids"]; ok {
		t.Fatalf("ids should be omitted when empty (server treats it as all), got %v", gotBody)
	}
}

func TestMarkAuditLogsReadSendsIDs(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"updatedCount":2,"unreadCount":5}}`))
	})
	if _, err := c.MarkAuditLogsRead(context.Background(), []string{"l1", "l2"}); err != nil {
		t.Fatal(err)
	}
	ids, ok := gotBody["ids"].([]any)
	if !ok || len(ids) != 2 || ids[0] != "l1" || ids[1] != "l2" {
		t.Fatalf("ids = %v, want [l1 l2]", gotBody["ids"])
	}
}

func TestIsAuditLevel(t *testing.T) {
	for _, ok := range []string{"info", "warn", "error"} {
		if !IsAuditLevel(ok) {
			t.Errorf("IsAuditLevel(%q) = false, want true", ok)
		}
	}
	for _, bad := range []string{"", "fatal", "INFO", "debug"} {
		if IsAuditLevel(bad) {
			t.Errorf("IsAuditLevel(%q) = true, want false", bad)
		}
	}
}
