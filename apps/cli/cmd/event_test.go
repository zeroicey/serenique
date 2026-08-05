package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
)

// =============================================================================
// event create
// =============================================================================

func TestEventCreateSendsTitleAndTimes(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"2026-08-05T01:00:00.000Z","endAt":"2026-08-05T02:00:00.000Z","isAllDay":false,"location":"会议室","note":null,"createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		eventCreateTitle = "评审"
		eventCreateStartAt = "2026-08-05T09:00:00+08:00"
		eventCreateEndAt = "2026-08-05T10:00:00+08:00"
		eventCreateLocation = "会议室"
		eventCreateNote = ""
		t.Cleanup(func() {
			eventCreateTitle, eventCreateStartAt, eventCreateEndAt, eventCreateLocation, eventCreateNote = "", "", "", "", ""
			eventCreateAllDay = false
		})
		if err := eventCreateCmd.RunE(eventCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/events" {
		t.Fatalf("path = %q, want /api/events", gotPath)
	}
	if gotBody["title"] != "评审" || gotBody["startAt"] != "2026-08-05T09:00:00+08:00" || gotBody["endAt"] != "2026-08-05T10:00:00+08:00" {
		t.Fatalf("body = %v", gotBody)
	}
	if gotBody["location"] != "会议室" {
		t.Fatalf("location = %v, want 会议室", gotBody["location"])
	}
	if gotBody["isAllDay"] != false {
		t.Fatalf("isAllDay = %v, want false", gotBody["isAllDay"])
	}
}

func TestEventCreateRejectsInvalidDatetime(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an invalid datetime")
	}, true, func(srv *httptest.Server) {
		eventCreateTitle = "评审"
		eventCreateStartAt = "2026-08-05"
		eventCreateEndAt = "2026-08-05T10:00:00+08:00"
		t.Cleanup(func() {
			eventCreateTitle, eventCreateStartAt, eventCreateEndAt = "", "", ""
		})
		if err := eventCreateCmd.RunE(eventCreateCmd, nil); err == nil {
			t.Fatal("expected error for invalid start-at")
		}
	})
}

// =============================================================================
// event list
// =============================================================================

func TestEventListSendsRangeQuery(t *testing.T) {
	var gotQuery string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[{"id":"e1","title":"评审","startAt":"2026-08-05T01:00:00.000Z","endAt":"2026-08-05T02:00:00.000Z","isAllDay":false,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}]}`))
	}, true, func(srv *httptest.Server) {
		eventListFrom = "2026-08-05T00:00:00+08:00"
		eventListTo = "2026-08-06T00:00:00+08:00"
		t.Cleanup(func() { eventListFrom, eventListTo = "", "" })
		if err := eventListCmd.RunE(eventListCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotQuery == "" {
		t.Fatal("expected from/to query params, got empty")
	}
	// URL-encoded +08:00 becomes %2B08:00; verify both params present.
	if !strings.Contains(gotQuery, "from=") || !strings.Contains(gotQuery, "to=") {
		t.Fatalf("query = %q, want from= and to=", gotQuery)
	}
}

func TestEventListRejectsInvalidDatetime(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an invalid window")
	}, true, func(srv *httptest.Server) {
		eventListFrom = "bogus"
		eventListTo = "2026-08-06T00:00:00+08:00"
		t.Cleanup(func() { eventListFrom, eventListTo = "", "" })
		if err := eventListCmd.RunE(eventListCmd, nil); err == nil {
			t.Fatal("expected error for invalid from")
		}
	})
}

// =============================================================================
// event get
// =============================================================================

func TestEventGetDecodesEntry(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/events/e1" {
			t.Errorf("path = %q, want /api/events/e1", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"2026-08-05T01:00:00.000Z","endAt":"2026-08-05T02:00:00.000Z","isAllDay":false,"location":"会议室","note":null,"createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := eventGetCmd.RunE(eventGetCmd, []string{"e1"}); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(*client.EventEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.EventEntry", rec.lastSuccess.data)
		}
		if data.ID != "e1" || data.Title != "评审" || data.IsAllDay {
			t.Fatalf("entry = %+v", data)
		}
		if data.Location == nil || *data.Location != "会议室" {
			t.Fatalf("location = %v, want &会议室", data.Location)
		}
	})
}

// =============================================================================
// event update
// =============================================================================

func TestEventUpdateRequiresField(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when no update field is provided")
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(eventUpdateCmd)
		t.Cleanup(func() { resetFlagChanged(eventUpdateCmd) })
		if err := eventUpdateCmd.RunE(eventUpdateCmd, []string{"e1"}); err == nil {
			t.Fatal("expected error when no update field is provided")
		}
	})
}

func TestEventUpdateSendsOnlyChangedFields(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"新标题","startAt":"x","endAt":"y","isAllDay":false,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(eventUpdateCmd)
		if err := eventUpdateCmd.Flags().Set("title", "新标题"); err != nil {
			t.Fatal(err)
		}
		eventUpdateStartAt = ""
		eventUpdateEndAt = ""
		eventUpdateLocation = ""
		eventUpdateNote = ""
		t.Cleanup(func() {
			eventUpdateTitle, eventUpdateStartAt, eventUpdateEndAt, eventUpdateLocation, eventUpdateNote = "", "", "", "", ""
			resetFlagChanged(eventUpdateCmd)
		})
		if err := eventUpdateCmd.RunE(eventUpdateCmd, []string{"e1"}); err != nil {
			t.Fatal(err)
		}
		if gotBody["title"] != "新标题" {
			t.Fatalf("title = %v, want 新标题", gotBody["title"])
		}
		if _, ok := gotBody["startAt"]; ok {
			t.Fatalf("startAt should be omitted when unchanged, got %v", gotBody)
		}
		if _, ok := gotBody["isAllDay"]; ok {
			t.Fatalf("isAllDay should be omitted when unchanged, got %v", gotBody)
		}
	})
}

func TestEventUpdateRejectsInvalidDatetime(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an invalid datetime")
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(eventUpdateCmd)
		if err := eventUpdateCmd.Flags().Set("start-at", "bogus"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			eventUpdateStartAt = ""
			resetFlagChanged(eventUpdateCmd)
		})
		if err := eventUpdateCmd.RunE(eventUpdateCmd, []string{"e1"}); err == nil {
			t.Fatal("expected error for invalid start-at")
		}
	})
}

// =============================================================================
// event delete
// =============================================================================

func TestEventDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		eventDeleteForce = true
		t.Cleanup(func() { eventDeleteForce = false })
		if err := eventDeleteCmd.RunE(eventDeleteCmd, []string{"e1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/events/e1" {
			t.Fatalf("request = %s %s, want DELETE /api/events/e1", gotMethod, gotPath)
		}
	})
}

// =============================================================================
// Helpers
// =============================================================================

func TestEventHelpers(t *testing.T) {
	// validateISO accepts the server's ISO 8601 spellings (with offset).
	for _, ok := range []string{
		"2026-08-05T09:00:00+08:00",
		"2026-08-05T09:00:00Z",
		"2026-08-05T09:00:00.123Z",
		"2026-08-05T09:00:00.123456+08:00",
	} {
		if err := validateISO(ok, "--start-at"); err != nil {
			t.Errorf("validateISO(%q) = %v, want nil", ok, err)
		}
	}
	// ...and rejects values that are not datetimes with an offset.
	for _, bad := range []string{
		"bogus",
		"2026-08-05",
		"2026-08-05T09:00:00",
		"09:00",
	} {
		if err := validateISO(bad, "--start-at"); err == nil {
			t.Errorf("validateISO(%q) should fail", bad)
		}
	}
	if got := eventAllDayLabel(true); got != "全天" {
		t.Errorf("eventAllDayLabel(true) = %q, want 全天", got)
	}
	if got := eventAllDayLabel(false); got != "按时段" {
		t.Errorf("eventAllDayLabel(false) = %q, want 按时段", got)
	}
	if got := eventTimeLabel("2026-08-05T01:00:00.000Z"); got != "2026-08-05T01:00:00" {
		t.Errorf("eventTimeLabel = %q, want seconds-trimmed", got)
	}
}
