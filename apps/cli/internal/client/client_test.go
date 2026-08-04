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
	c, err := NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	return srv, c
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

// =============================================================================
// Base URL validation
// =============================================================================

func TestValidateBaseURLAcceptsValidURLs(t *testing.T) {
	for _, u := range []string{
		"http://localhost:3000",
		"http://localhost:3000/",
		"https://example.com",
		"http://127.0.0.1:8080/base",
	} {
		if err := ValidateBaseURL(u); err != nil {
			t.Errorf("ValidateBaseURL(%q) = %v, want nil", u, err)
		}
	}
}

func TestValidateBaseURLRejectsMalformed(t *testing.T) {
	for _, u := range []string{
		"",                    // empty
		"http://",             // scheme but no host
		"localhost:3000",      // host but no scheme
		"ftp://example.com/x", // unsupported scheme
		"://host",             // unparseable
	} {
		if err := ValidateBaseURL(u); err == nil {
			t.Errorf("ValidateBaseURL(%q) = nil, want error", u)
		}
	}
}

func TestNewClientRejectsInvalidBaseURL(t *testing.T) {
	for _, u := range []string{"", "http://", "localhost:3000"} {
		if _, err := NewClient(u, "t"); err == nil {
			t.Errorf("NewClient(%q) = nil error, want validation failure", u)
		}
	}
	c, err := NewClient("http://localhost:3000/", "t")
	if err != nil {
		t.Fatalf("valid URL rejected: %v", err)
	}
	if c.BaseURL != "http://localhost:3000" {
		t.Fatalf("BaseURL = %q, want trailing slash stripped", c.BaseURL)
	}
}

// =============================================================================
// Download integrity
// =============================================================================

func TestVerifyDownloadCount(t *testing.T) {
	cases := []struct {
		received, declared int64
		wantErr            bool
	}{
		{5, 5, false},          // exact match
		{0, 0, false},          // empty file, declared 0
		{5, 100, true},         // truncated
		{100, 5, true},         // over-received (mismatch)
		{5, -1, false},         // chunked/unknown length: no check
		{0, -1, false},         // unknown length, empty
	}
	for _, tc := range cases {
		err := verifyDownloadCount(tc.received, tc.declared)
		if (err != nil) != tc.wantErr {
			t.Errorf("verifyDownloadCount(%d, %d) err = %v, wantErr %v", tc.received, tc.declared, err, tc.wantErr)
		}
	}
}

// TestDownloadFileChunkedTruncation drives a raw HTTP/1.1 connection that sends
// one chunked body then closes without the terminating chunk. The Go client
// surfaces this as io.ErrUnexpectedEOF; DownloadFile must treat it as a failure,
// clean up its temp file, and never leave a partial file at the target path.
func TestDownloadFileChunkedTruncation(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out.bin")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("response writer does not support hijacking")
		}
		conn, buf, err := hj.Hijack()
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		buf.WriteString("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n")
		buf.WriteString("5\r\nhello\r\n") // one chunk, then close — no terminator
		buf.Flush()
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	err = c.DownloadFile(context.Background(), "b1", out, false, false)
	if err == nil {
		t.Fatal("expected error for truncated chunked download")
	}
	if !strings.Contains(err.Error(), "下载中断") && !strings.Contains(err.Error(), "写入文件失败") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(out); !os.IsNotExist(statErr) {
		t.Fatalf("partial file must not exist at the target path, stat err = %v", statErr)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no leftover files in dir, got %v", entries)
	}
}
