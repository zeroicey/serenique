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

const tagEntryJSON = `{"id":"t1","name":"work","momentCount":2,"createdAt":"2026-08-08T01:00:00Z","updatedAt":"2026-08-08T01:00:00Z"}`

// =============================================================================
// Tag CRUD
// =============================================================================

func TestCreateTagPostsName(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":` + tagEntryJSON + `}`))
	})

	tag, err := c.CreateTag(context.Background(), "Work")
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/tags" {
		t.Fatalf("path = %q, want /api/tags", gotPath)
	}
	if gotBody["name"] != "Work" {
		t.Fatalf("body = %v, want name=Work", gotBody)
	}
	if tag.ID != "t1" || tag.Name != "work" || tag.MomentCount != 2 {
		t.Fatalf("tag = %+v", tag)
	}
}

func TestCreateTagMapsDuplicateTo409(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"success":false,"message":"标签已存在","error":{"code":"CONFLICT"}}`))
	})

	_, err := c.CreateTag(context.Background(), "work")
	if err == nil {
		t.Fatal("expected error for duplicate tag name")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("error is %T, want *APIError", err)
	}
	if apiErr.Message != "标签已存在" || apiErr.HTTPStatus != 409 {
		t.Fatalf("apiErr = %+v", apiErr)
	}
}

func TestListTagsUnpacksEnvelope(t *testing.T) {
	var gotQuery url.Values
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Errorf("path = %q, want /api/tags", r.URL.Path)
		}
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[` + tagEntryJSON + `],"total":1}}`))
	})

	query := url.Values{}
	query.Set("page", "1")
	query.Set("pageSize", "50")
	items, total, err := c.ListTags(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery.Get("page") != "1" || gotQuery.Get("pageSize") != "50" {
		t.Fatalf("query = %v, want page=1 pageSize=50", gotQuery)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("items = %d, total = %d, want 1/1", len(items), total)
	}
	if items[0].ID != "t1" || items[0].MomentCount != 2 {
		t.Fatalf("item = %+v", items[0])
	}
}

func TestTagCRUDPaths(t *testing.T) {
	var hits []string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "DELETE" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method == "PUT" {
			b, _ := io.ReadAll(r.Body)
			var body map[string]any
			_ = json.Unmarshal(b, &body)
			if body["name"] != "新名称" {
				t.Errorf("rename body = %v, want name=新名称", body)
			}
		}
		w.Write([]byte(`{"success":true,"message":"ok","data":` + tagEntryJSON + `}`))
	})

	ctx := context.Background()
	if _, err := c.GetTag(ctx, "t1"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.RenameTag(ctx, "t1", "新名称"); err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteTag(ctx, "t1"); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"GET /api/tags/t1",
		"PUT /api/tags/t1",
		"DELETE /api/tags/t1",
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

// =============================================================================
// Tag relations (attach/detach)
// =============================================================================

func TestAttachTagPostsOwnerPair(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"r1","tagId":"t1","ownerType":"moment","ownerId":"m1","createdAt":"2026-08-08T01:00:00Z"}}`))
	})

	rel, err := c.AttachTag(context.Background(), "t1", TagOwnerTypeMoment, "m1")
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/tags/t1/attach" {
		t.Fatalf("path = %q, want /api/tags/t1/attach", gotPath)
	}
	if gotBody["ownerType"] != "moment" || gotBody["ownerId"] != "m1" {
		t.Fatalf("body = %v, want ownerType=moment ownerId=m1", gotBody)
	}
	if rel.ID != "r1" || rel.OwnerType != "moment" || rel.OwnerID != "m1" {
		t.Fatalf("relation = %+v", rel)
	}
}

func TestAttachTagMapsDuplicateTo409(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"success":false,"message":"标签已绑定","error":{"code":"CONFLICT"}}`))
	})

	_, err := c.AttachTag(context.Background(), "t1", TagOwnerTypeMoment, "m1")
	if err == nil {
		t.Fatal("expected error for duplicate bind")
	}
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.HTTPStatus != 409 {
		t.Fatalf("error = %v, want *APIError with 409", err)
	}
}

func TestDetachTagSendsDeleteWithBody(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	var contentType string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		contentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(http.StatusNoContent)
	})

	if err := c.DetachTag(context.Background(), "t1", TagOwnerTypeMoment, "m1"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != "DELETE" || gotPath != "/api/tags/t1/detach" {
		t.Fatalf("request = %s %s, want DELETE /api/tags/t1/detach", gotMethod, gotPath)
	}
	if !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", contentType)
	}
	if gotBody["ownerType"] != "moment" || gotBody["ownerId"] != "m1" {
		t.Fatalf("body = %v, want ownerType=moment ownerId=m1", gotBody)
	}
}
