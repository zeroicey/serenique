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
	if err := c.DownloadFile(context.Background(), "b1", out, true, false); err != nil {
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

func TestDownloadFileSetsReadableMode(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("payload"))
	})

	out := filepath.Join(dir, "out.bin")
	if err := c.DownloadFile(context.Background(), "b1", out, false, false); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(out)
	if err != nil {
		t.Fatal(err)
	}
	// Downloaded media blobs are not secrets: the file must be group/other
	// readable (0644), not the 0600 os.CreateTemp default.
	if perm := info.Mode().Perm(); perm != 0o644 {
		t.Fatalf("file mode = %o, want 644", perm)
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
	err := c.DownloadFile(context.Background(), "b1", out, false, false)
	if err == nil {
		t.Fatal("expected error for truncated body")
	}
	if !strings.Contains(err.Error(), "写入文件失败") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(out); !os.IsNotExist(statErr) {
		t.Fatalf("partial file should not exist at the final path, stat err = %v", statErr)
	}
}

func TestDownloadFileMapsAPIError(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"文件不存在"}`))
	})

	out := filepath.Join(dir, "nope.bin")
	err := c.DownloadFile(context.Background(), "missing", out, false, false)
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

func TestDoTreatsNonEnvelope500AsError(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
	})

	err := c.Get(context.Background(), "/api/diaries/x", nil, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != 500 {
		t.Fatalf("HTTPStatus = %d, want 500", apiErr.HTTPStatus)
	}
	if !strings.Contains(apiErr.Message, "Internal Server Error") {
		t.Fatalf("message should surface the raw body, got %q", apiErr.Message)
	}
}

func TestDoTreats500SuccessEnvelopeAsError(t *testing.T) {
	// A hypothetical HTTP 500 envelope with success:true must still be an error;
	// the HTTP status alone decides.
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":true,"message":"boom","data":{}}`))
	})

	err := c.Get(context.Background(), "/api/x", nil, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != 500 {
		t.Fatalf("HTTPStatus = %d, want 500", apiErr.HTTPStatus)
	}
}

func TestDownloadFileRefusesExistingWithoutOverwrite(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("new-content"))
	})

	out := filepath.Join(dir, "out.bin")
	if err := os.WriteFile(out, []byte("old-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := c.DownloadFile(context.Background(), "b1", out, false, false)
	if err == nil {
		t.Fatal("expected error when target exists and overwrite is false")
	}
	if !strings.Contains(err.Error(), "目标文件已存在") {
		t.Fatalf("unexpected error: %v", err)
	}
	data, readErr := os.ReadFile(out)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if string(data) != "old-content" {
		t.Fatalf("existing file was clobbered: %q, want old-content", data)
	}
}

func TestDownloadFileOverwritesWithOverwrite(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("new-content"))
	})

	out := filepath.Join(dir, "out.bin")
	if err := os.WriteFile(out, []byte("old-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := c.DownloadFile(context.Background(), "b1", out, false, true); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "new-content" {
		t.Fatalf("content = %q, want new-content", data)
	}
}

func TestDownloadFileLeavesNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("payload"))
	})

	out := filepath.Join(dir, "out.bin")
	if err := c.DownloadFile(context.Background(), "b1", out, false, false); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "out.bin" {
		t.Fatalf("expected only out.bin in dir, got %d entries: %v", len(entries), entries)
	}
}

func TestDoTreats2xxSuccessFalseEnvelopeAsError(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":false,"message":"nope"}`))
	})

	err := c.Get(context.Background(), "/api/x", nil, nil)
	if err == nil {
		t.Fatal("expected error for success:false envelope")
	}
}
