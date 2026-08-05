package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestCreateEventPostsBody(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"2026-08-05T01:00:00.000Z","endAt":"2026-08-05T02:00:00.000Z","isAllDay":false,"location":"会议室","note":"带设计稿","createdAt":"x","updatedAt":"x"}}`))
	})

	event, err := c.CreateEvent(context.Background(), CreateEventInput{
		Title:    "评审",
		StartAt:  "2026-08-05T09:00:00+08:00",
		EndAt:    "2026-08-05T10:00:00+08:00",
		Location: "会议室",
		Note:     "带设计稿",
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/events" {
		t.Fatalf("path = %q, want /api/events", gotPath)
	}
	if gotBody["title"] != "评审" || gotBody["startAt"] != "2026-08-05T09:00:00+08:00" || gotBody["endAt"] != "2026-08-05T10:00:00+08:00" {
		t.Fatalf("body = %v", gotBody)
	}
	if gotBody["location"] != "会议室" || gotBody["note"] != "带设计稿" {
		t.Fatalf("body = %v", gotBody)
	}
	if event.ID != "e1" || event.Location == nil || *event.Location != "会议室" {
		t.Fatalf("event = %+v", event)
	}
}

func TestCreateEventOmitsEmptyLocationNote(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"x","endAt":"y","isAllDay":true,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}}`))
	})
	if _, err := c.CreateEvent(context.Background(), CreateEventInput{
		Title:    "评审",
		StartAt:  "2026-08-05T09:00:00Z",
		EndAt:    "2026-08-05T10:00:00Z",
		IsAllDay: true,
	}); err != nil {
		t.Fatal(err)
	}
	if _, ok := gotBody["location"]; ok {
		t.Fatalf("location should be omitted when empty, got %v", gotBody)
	}
	if _, ok := gotBody["note"]; ok {
		t.Fatalf("note should be omitted when empty, got %v", gotBody)
	}
	if gotBody["isAllDay"] != true {
		t.Fatalf("isAllDay = %v, want true", gotBody["isAllDay"])
	}
}

func TestUpdateEventSendsPartialBody(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"新标题","startAt":"x","endAt":"y","isAllDay":false,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}}`))
	})
	title := "新标题"
	if _, err := c.UpdateEvent(context.Background(), "e1", UpdateEventInput{Title: &title}); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/events/e1" {
		t.Fatalf("path = %q, want /api/events/e1", gotPath)
	}
	if gotBody["title"] != "新标题" {
		t.Fatalf("title = %v, want 新标题", gotBody["title"])
	}
	if _, ok := gotBody["startAt"]; ok {
		t.Fatalf("startAt should be omitted when nil, got %v", gotBody)
	}
	if _, ok := gotBody["isAllDay"]; ok {
		t.Fatalf("isAllDay should be omitted when nil, got %v", gotBody)
	}
}

func TestUpdateEventClearsLocationWithEmptyString(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"x","endAt":"y","isAllDay":false,"location":"","note":null,"createdAt":"x","updatedAt":"x"}}`))
	})
	loc := ""
	if _, err := c.UpdateEvent(context.Background(), "e1", UpdateEventInput{Location: &loc}); err != nil {
		t.Fatal(err)
	}
	if _, ok := gotBody["location"]; !ok {
		t.Fatalf("location should be present when set to empty, got %v", gotBody)
	}
	if gotBody["location"] != "" {
		t.Fatalf("location = %v, want empty string", gotBody["location"])
	}
}

func TestListEventsSendsRangeQuery(t *testing.T) {
	var gotQuery url.Values
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/events" {
			t.Errorf("path = %q, want /api/events", r.URL.Path)
		}
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[{"id":"e1","title":"评审","startAt":"x","endAt":"y","isAllDay":false,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}]}`))
	})
	items, err := c.ListEvents(context.Background(), "2026-08-05T00:00:00+08:00", "2026-08-06T00:00:00+08:00")
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery.Get("from") != "2026-08-05T00:00:00+08:00" || gotQuery.Get("to") != "2026-08-06T00:00:00+08:00" {
		t.Fatalf("query = %v, want from/to set", gotQuery)
	}
	// The API returns a bare array; the client must decode it as such.
	if len(items) != 1 || items[0].ID != "e1" {
		t.Fatalf("items = %+v", items)
	}
}

func TestEventCRUDPaths(t *testing.T) {
	var hits []string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "DELETE" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/events/"):
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"e1","title":"评审","startAt":"x","endAt":"y","isAllDay":false,"location":null,"note":null,"createdAt":"x","updatedAt":"x"}}`))
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	})

	ctx := context.Background()
	if _, err := c.GetEvent(ctx, "e1"); err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteEvent(ctx, "e1"); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"GET /api/events/e1",
		"DELETE /api/events/e1",
	}
	if len(hits) != len(want) {
		t.Fatalf("hits = %v, want %v", hits, want)
	}
	for i, w := range want {
		if hits[i] != w {
			t.Fatalf("hit[%d] = %q, want %q (all hits: %v)", i, hits[i], w, hits)
		}
	}
}
