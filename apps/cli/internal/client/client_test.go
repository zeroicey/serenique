package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *Client) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv, NewClient(srv.URL, "test-token")
}

func TestGetUnmarshalsData(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing/mismatched Authorization header")
		}
		if r.Header.Get("Accept") != "application/json" {
			t.Error("missing Accept header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"abc","content":"hello"}}`))
	})

	var out struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	}
	if err := c.Get(context.Background(), "/api/diaries/x", nil, &out); err != nil {
		t.Fatal(err)
	}
	if out.ID != "abc" || out.Content != "hello" {
		t.Fatalf("unexpected decode: %+v", out)
	}
}

func TestGetMapsAPIError(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"日记不存在","error":{"code":"NOT_FOUND"}}`))
	})

	err := c.Get(context.Background(), "/api/diaries/nope", nil, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != 404 {
		t.Fatalf("HTTPStatus = %d, want 404", apiErr.HTTPStatus)
	}
	if apiErr.Message != "日记不存在" {
		t.Fatalf("Message = %q, want %q", apiErr.Message, "日记不存在")
	}
}

func TestDeleteNoContent(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	if err := c.Delete(context.Background(), "/api/diaries/x"); err != nil {
		t.Fatal(err)
	}
}

func TestListUnpacksEnvelope(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if q := r.URL.Query().Get("page"); q != "1" {
			t.Errorf("page = %q, want 1", q)
		}
		if q := r.URL.Query().Get("pageSize"); q != "10" {
			t.Errorf("pageSize = %q, want 10", q)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"1"},{"id":"2"}],"total":2}}`))
	})

	type item struct {
		ID string `json:"id"`
	}
	query := url.Values{}
	query.Set("page", "1")
	query.Set("pageSize", "10")

	items, total, err := List[item](c, context.Background(), "/api/x", query)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	if len(items) != 2 || items[0].ID != "1" || items[1].ID != "2" {
		t.Fatalf("items = %+v", items)
	}
}

func TestDownloadFileWritesBody(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("download") != "1" {
			t.Error("missing download=1 query param")
		}
		w.Write([]byte("file-content"))
	})

	out := filepath.Join(dir, "out.bin")
	if err := c.DownloadFile(context.Background(), "b1", out, true); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "file-content" {
		t.Fatalf("content = %q, want %q", data, "file-content")
	}
}

func TestDownloadFileRemovesPartialOnError(t *testing.T) {
	dir := t.TempDir()
	// Declare a larger Content-Length than is actually written so the client
	// hits an unexpected EOF mid-copy.
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100")
		w.Write([]byte("short"))
	})

	out := filepath.Join(dir, "partial.bin")
	err := c.DownloadFile(context.Background(), "b1", out, false)
	if err == nil {
		t.Fatal("expected error for truncated body")
	}
	if !strings.Contains(err.Error(), "写入文件失败") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(out); !os.IsNotExist(statErr) {
		t.Fatalf("partial file should have been removed, stat err = %v", statErr)
	}
}

func TestDownloadFileMapsAPIError(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"文件不存在"}`))
	})

	out := filepath.Join(dir, "nope.bin")
	err := c.DownloadFile(context.Background(), "missing", out, false)
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.Message != "文件不存在" {
		t.Fatalf("Message = %q, want %q", apiErr.Message, "文件不存在")
	}
}
