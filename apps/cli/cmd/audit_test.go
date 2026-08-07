package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/zeroicey/serenique-cli/internal/client"
)

// =============================================================================
// logs list
// =============================================================================

func TestLogsListSendsFilterQuery(t *testing.T) {
	var gotQuery url.Values
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"l1","event":"auth.login","message":"登录成功","level":"info","source":"cli","ip":"127.0.0.1","detail":null,"isRead":false,"createdAt":"2026-08-08T00:00:00.000Z"}],"total":1}}`))
	}, true, func(srv *httptest.Server) {
		auditListLevel = "warn"
		auditListEvent = "auth.login"
		auditListUnreadOnly = true
		auditListPage = 1
		auditListPageSize = 50
		auditListAll = false
		t.Cleanup(func() {
			auditListLevel = ""
			auditListEvent = ""
			auditListUnreadOnly = false
			auditListPage = 1
			auditListPageSize = 50
			auditListAll = false
		})
		if err := auditListCmd.RunE(auditListCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotQuery.Get("level") != "warn" {
		t.Fatalf("level = %q, want warn", gotQuery.Get("level"))
	}
	if gotQuery.Get("event") != "auth.login" {
		t.Fatalf("event = %q, want auth.login", gotQuery.Get("event"))
	}
	if gotQuery.Get("unreadOnly") != "true" {
		t.Fatalf("unreadOnly = %q, want true", gotQuery.Get("unreadOnly"))
	}
	if gotQuery.Get("page") != "1" || gotQuery.Get("pageSize") != "50" {
		t.Fatalf("page/pageSize = %q/%q, want 1/50", gotQuery.Get("page"), gotQuery.Get("pageSize"))
	}
}

func TestLogsListJSONEmitsItemsEnvelope(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"l1","event":"auth.login","message":"登录成功","level":"info","source":null,"ip":null,"detail":null,"isRead":false,"createdAt":"x"}],"total":1}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		auditListPage = 1
		auditListPageSize = 10
		auditListAll = false
		t.Cleanup(func() {
			auditListPage = 1
			auditListPageSize = 50
			auditListAll = false
		})
		if err := auditListCmd.RunE(auditListCmd, nil); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		items, _ := data["items"].([]client.AuditLogEntry)
		if len(items) != 1 || items[0].ID != "l1" || items[0].Event != "auth.login" {
			t.Fatalf("items = %+v, want one auth.login entry", items)
		}
		if data["total"] != 1 {
			t.Fatalf("total = %v, want 1", data["total"])
		}
	})
}

func TestLogsListPreRunRejectsInvalidLevel(t *testing.T) {
	auditListLevel = "bogus"
	t.Cleanup(func() { auditListLevel = "" })
	if err := auditListCmd.PreRunE(auditListCmd, nil); err == nil {
		t.Fatal("expected error for invalid level filter")
	}
}

func TestLogsListPreRunAcceptsValidLevel(t *testing.T) {
	auditListLevel = "warn"
	t.Cleanup(func() { auditListLevel = "" })
	if err := auditListCmd.PreRunE(auditListCmd, nil); err != nil {
		t.Fatalf("valid level rejected: %v", err)
	}
}

// =============================================================================
// logs unread
// =============================================================================

func TestLogsUnreadJSONEmitsCount(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"unreadCount":7}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := auditUnreadCmd.RunE(auditUnreadCmd, nil); err != nil {
			t.Fatal(err)
		}
		if gotPath != "/api/audit/logs/unread-count" {
			t.Fatalf("path = %q, want /api/audit/logs/unread-count", gotPath)
		}
		data, ok := rec.lastSuccess.data.(*client.AuditUnreadCount)
		if !ok {
			t.Fatalf("data is %T, want *client.AuditUnreadCount", rec.lastSuccess.data)
		}
		if data.UnreadCount != 7 {
			t.Fatalf("unreadCount = %d, want 7", data.UnreadCount)
		}
	})
}

// =============================================================================
// logs read
// =============================================================================

func TestLogsReadMarksAllReadByDefault(t *testing.T) {
	var gotMethod string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"updatedCount":5,"unreadCount":0}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		auditReadIDs = ""
		t.Cleanup(func() { auditReadIDs = "" })
		if err := auditReadCmd.RunE(auditReadCmd, nil); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "PUT" {
			t.Fatalf("method = %s, want PUT", gotMethod)
		}
		if _, ok := gotBody["ids"]; ok {
			t.Fatalf("ids should be omitted when no --ids flag, got %v", gotBody)
		}
		data, ok := rec.lastSuccess.data.(*client.AuditMarkReadResult)
		if !ok {
			t.Fatalf("data is %T, want *client.AuditMarkReadResult", rec.lastSuccess.data)
		}
		if data.UpdatedCount != 5 || data.UnreadCount != 0 {
			t.Fatalf("result = %+v", data)
		}
	})
}

func TestLogsReadWithIDsTrimsWhitespace(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"updatedCount":2,"unreadCount":4}}`))
	}, true, func(srv *httptest.Server) {
		auditReadIDs = " l1 , l2 , "
		t.Cleanup(func() { auditReadIDs = "" })
		if err := auditReadCmd.RunE(auditReadCmd, nil); err != nil {
			t.Fatal(err)
		}
		ids, ok := gotBody["ids"].([]any)
		if !ok || len(ids) != 2 || ids[0] != "l1" || ids[1] != "l2" {
			t.Fatalf("ids = %v, want [l1 l2]", gotBody["ids"])
		}
	})
}

// =============================================================================
// Helpers
// =============================================================================

func TestAuditHelpers(t *testing.T) {
	for _, ok := range []string{"info", "warn", "error"} {
		if err := validateAuditLevel(ok); err != nil {
			t.Errorf("validateAuditLevel(%q) = %v, want nil", ok, err)
		}
	}
	if err := validateAuditLevel("bogus"); err == nil {
		t.Error("validateAuditLevel(bogus) should fail")
	}
	if got := auditLevelLabel("error"); got != "错误" {
		t.Errorf("auditLevelLabel(error) = %q, want 错误", got)
	}
	if got := auditLevelLabel("warn"); got != "警告" {
		t.Errorf("auditLevelLabel(warn) = %q, want 警告", got)
	}
	if got := auditLevelLabel("info"); got != "信息" {
		t.Errorf("auditLevelLabel(info) = %q, want 信息", got)
	}
	if got := auditReadLabel(true); got != "已读" {
		t.Errorf("auditReadLabel(true) = %q, want 已读", got)
	}
	if got := auditReadLabel(false); got != "未读" {
		t.Errorf("auditReadLabel(false) = %q, want 未读", got)
	}
	// auditTimeLabel converts server UTC to local time. The expected value is
	// derived from the same conversion so the assertion is timezone-independent.
	tm, _ := time.Parse(time.RFC3339Nano, "2026-08-08T01:00:00.000Z")
	wantLocal := tm.Local().Format("2006-01-02 15:04:05")
	if got := auditTimeLabel("2026-08-08T01:00:00.000Z"); got != wantLocal {
		t.Errorf("auditTimeLabel = %q, want %q (local)", got, wantLocal)
	}
	// Unparseable timestamps fall back to a defensive prefix, never a panic.
	if got := auditTimeLabel("bogus"); got != "bogus" {
		t.Errorf("auditTimeLabel(bogus) = %q, want the raw string", got)
	}
	// The rendered label must always carry a space separator (date + time), so a
	// server UTC timestamp is never mistaken for a bare date.
	got := auditTimeLabel("2026-08-08T01:00:00.000Z")
	if !strings.Contains(got, " ") {
		t.Errorf("auditTimeLabel = %q, want a date + time (space separator)", got)
	}
}

// TestLogsCommandTreeRegistered guards the wiring: the logs parent must expose
// the three subcommands and sit under the root command.
func TestLogsCommandTreeRegistered(t *testing.T) {
	byName := map[string]bool{}
	for _, c := range auditCmd.Commands() {
		byName[c.Name()] = true
	}
	for _, want := range []string{"list", "unread", "read"} {
		if !byName[want] {
			t.Errorf("auditCmd missing subcommand %q", want)
		}
	}
	rootHasLogs := false
	for _, c := range rootCmd.Commands() {
		if c.Name() == "logs" {
			rootHasLogs = true
		}
	}
	if !rootHasLogs {
		t.Error("root command does not register logs")
	}
}
