package client

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	if err := c.Get(context.Background(), "/api/moments/x", nil, &out); err != nil {
		t.Fatal(err)
	}
	if out.ID != "abc" || out.Content != "hello" {
		t.Fatalf("unexpected decode: %+v", out)
	}
}

func TestGetMapsAPIError(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"闪念不存在","error":{"code":"NOT_FOUND"}}`))
	})

	err := c.Get(context.Background(), "/api/moments/nope", nil, nil)
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
	if apiErr.Message != "闪念不存在" {
		t.Fatalf("Message = %q, want %q", apiErr.Message, "闪念不存在")
	}
}

func TestDeleteNoContent(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	if err := c.Delete(context.Background(), "/api/moments/x"); err != nil {
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

// =============================================================================
// Delete against a 204-with-body server (the API's Res.noContent contract)
// =============================================================================

// writeRawNoContentWithBody emulates the API's Res.noContent behavior: HTTP 204
// with a JSON body written straight onto the wire. Go's http.Server strips a
// body written after WriteHeader(204), so a hijacked raw write is required to
// reproduce the real server's bytes — exactly the protocol violation that
// leaves unread bytes on a keep-alive connection.
func writeRawNoContentWithBody(t *testing.T, w http.ResponseWriter, body string) {
	t.Helper()
	hj, ok := w.(http.Hijacker)
	if !ok {
		t.Fatalf("response writer does not support hijacking")
	}
	conn, buf, err := hj.Hijack()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(buf, "HTTP/1.1 204 No Content\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s", len(body), body)
	buf.Flush()
}

// TestDeleteSetsConnectionClose verifies the CLI workaround for the API's
// Res.noContent-with-body 204s: the Delete request asks for Connection: close so
// the keep-alive connection (carrying the hidden, unread body bytes) is never
// reused and the stale bytes are never misread as the next response.
func TestDeleteSetsConnectionClose(t *testing.T) {
	var gotConn string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotConn = r.Header.Get("Connection")
		w.WriteHeader(http.StatusNoContent)
	})
	if err := c.Delete(context.Background(), "/api/diaries/x"); err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(gotConn, "close") {
		t.Fatalf("Connection header = %q, want close", gotConn)
	}
}

// TestDeleteNoContentWithBodyKeepsNextResponseClean runs several deletes against
// a server that (like the real API) sends 204 with a body, then a GET on the
// same client. With Connection: close the connection is discarded after each
// delete, so the subsequent GET must decode clean JSON rather than stale
// 204-body bytes off a reused connection.
func TestDeleteNoContentWithBodyKeepsNextResponseClean(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/blobs/x/file" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"b1"}}`))
			return
		}
		// DELETE endpoints: the API's Res.noContent("...") sends 204 + JSON body.
		writeRawNoContentWithBody(t, w, `{"success":true,"message":"闪念删除成功"}`)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 5; i++ {
		if err := c.Delete(context.Background(), "/api/moments/m1"); err != nil {
			t.Fatal(err)
		}
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := c.Get(context.Background(), "/api/blobs/x/file", nil, &out); err != nil {
		t.Fatal(err)
	}
	if out.ID != "b1" {
		t.Fatalf("GET after 204-with-body deletes decoded %q, want b1 (stale bytes read?)", out.ID)
	}
}

// =============================================================================
// Transfer idle timeout (a stalled peer must not hang forever)
// =============================================================================

func TestDownloadFileIdleTimeoutAborts(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out.bin")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Send headers, then stall mid-body until the client gives up. The bounded
		// wait (not a bare <-r.Context().Done()) guarantees the handler returns
		// even if the client cannot close the connection promptly, so srv.Close()
		// cannot hang.
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(500 * time.Millisecond):
		}
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	old := transferIdleTimeout
	transferIdleTimeout = 200 * time.Millisecond
	defer func() { transferIdleTimeout = old }()

	start := time.Now()
	err = c.DownloadFile(context.Background(), "b1", out, false, false)
	if err == nil {
		t.Fatal("expected idle-timeout error")
	}
	if !strings.Contains(err.Error(), "下载超时") {
		t.Fatalf("unexpected error: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("idle timeout took too long: %v", elapsed)
	}
	if _, statErr := os.Stat(out); !os.IsNotExist(statErr) {
		t.Fatalf("partial file must not exist at the target path, stat err = %v", statErr)
	}
}

func TestUploadFileIdleTimeoutAborts(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "big.bin")
	if err := os.WriteFile(f, bytes.Repeat([]byte("x"), 1<<20), 0o644); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Never read the multipart body — the client's unbuffered pipe write
		// stalls, which must abort via the idle watchdog. The bounded wait keeps
		// srv.Close() from hanging when the client cannot close the connection
		// promptly.
		select {
		case <-r.Context().Done():
		case <-time.After(500 * time.Millisecond):
		}
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	old := transferIdleTimeout
	transferIdleTimeout = 200 * time.Millisecond
	defer func() { transferIdleTimeout = old }()

	var result struct{}
	start := time.Now()
	err = c.UploadFile(context.Background(), "/api/blobs/upload", f, &result)
	if err == nil {
		t.Fatal("expected idle-timeout error")
	}
	if !strings.Contains(err.Error(), "上传超时") {
		t.Fatalf("unexpected error: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("idle timeout took too long: %v", elapsed)
	}
}

// =============================================================================
// Response body size cap
// =============================================================================

func TestDoRejectsOversizedBody(t *testing.T) {
	old := maxResponseBody
	maxResponseBody = 16
	defer func() { maxResponseBody = old }()

	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"success":true,"message":"ok","data":"` + strings.Repeat("x", 64) + `"}`))
	})
	err := c.Get(context.Background(), "/api/x", nil, nil)
	if err == nil {
		t.Fatal("expected error for oversized body")
	}
	if !strings.Contains(err.Error(), "响应体过大") {
		t.Fatalf("unexpected error: %v", err)
	}
}
