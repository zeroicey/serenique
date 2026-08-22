package client

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// testBlobEntry mirrors a minimal API blob entry for decode assertions.
type testBlobEntry struct {
	ID           string `json:"id"`
	OriginalName string `json:"originalName"`
	MimeType     string `json:"mimeType"`
	Size         int64  `json:"size"`
	Checksum     string `json:"checksum"`
}

func TestUploadFileSmartDirectFlow(t *testing.T) {
	content := []byte("hello direct upload 直传")
	checksum := sha256.Sum256(content)
	sum := hex.EncodeToString(checksum[:])

	dir := t.TempDir()
	f := filepath.Join(dir, "photo.jpg")
	if err := os.WriteFile(f, content, 0o644); err != nil {
		t.Fatal(err)
	}

	// Gateway: signed-PUT target. Verifies Content-Length is sent explicitly
	// (the gateway rejects chunked requests) and captures the body.
	var gotBody []byte
	var gotContentLength int64
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("gateway method = %s, want PUT", r.Method)
		}
		gotContentLength = r.ContentLength
		if r.ContentLength != int64(len(content)) {
			t.Errorf("gateway Content-Length = %d, want %d", r.ContentLength, len(content))
		}
		body := make([]byte, r.ContentLength)
		if _, err := io.ReadFull(r.Body, body); err != nil {
			t.Errorf("read gateway body: %v", err)
		}
		gotBody = body
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer gateway.Close()

	// API: issues the credential then finalizes the upload.
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case uploadURLPath:
			if r.Method != http.MethodPost {
				t.Errorf("upload-url method = %s, want POST", r.Method)
			}
			w.Write([]byte(`{"success":true,"message":"ok","data":{` +
				`"blobId":"11111111-2222-4333-8444-555555555555",` +
				`"storagePath":"image/2026/08/x.jpg",` +
				`"method":"PUT",` +
				`"url":"` + gateway.URL + `/image/2026/08/x.jpg?e=1755667200&s=abc",` +
				`"expires":1755667200,` +
				`"expiresAt":"2025-08-20T00:00:00.000Z",` +
				`"mode":"direct-r2"}}`))
		case "/api/blobs/confirm":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode confirm body: %v", err)
			}
			if body["blobId"] != "11111111-2222-4333-8444-555555555555" {
				t.Errorf("confirm blobId = %v", body["blobId"])
			}
			if body["storagePath"] != "image/2026/08/x.jpg" {
				t.Errorf("confirm storagePath = %v", body["storagePath"])
			}
			if body["originalName"] != "photo.jpg" {
				t.Errorf("confirm originalName = %v", body["originalName"])
			}
			if body["mimeType"] != "image/jpeg" {
				t.Errorf("confirm mimeType = %v", body["mimeType"])
			}
			if body["size"] != float64(len(content)) {
				t.Errorf("confirm size = %v", body["size"])
			}
			if body["checksum"] != sum {
				t.Errorf("confirm checksum = %v, want %s", body["checksum"], sum)
			}
			w.Write([]byte(`{"success":true,"message":"ok","data":{` +
				`"id":"11111111-2222-4333-8444-555555555555",` +
				`"originalName":"photo.jpg","mimeType":"image/jpeg",` +
				`"size":` + strconv.FormatInt(int64(len(content)), 10) + `,"checksum":"` + sum + `"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	var out testBlobEntry
	if err := c.UploadFileSmart(context.Background(), f, &out); err != nil {
		t.Fatal(err)
	}
	if out.ID != "11111111-2222-4333-8444-555555555555" {
		t.Fatalf("result ID = %q", out.ID)
	}
	if string(gotBody) != string(content) {
		t.Fatalf("gateway body mismatch:\n got %q\nwant %q", gotBody, content)
	}
	if gotContentLength != int64(len(content)) {
		t.Fatalf("gateway Content-Length = %d, want %d", gotContentLength, len(content))
	}
}

func TestUploadFileSmartFallsBackToMultipart(t *testing.T) {
	content := []byte("local backend file")

	dir := t.TempDir()
	f := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(f, content, 0o644); err != nil {
		t.Fatal(err)
	}

	multipartHit := false
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case uploadURLPath:
			// Local backend: the API rejects the direct path with 400.
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"success":false,"message":"直传上传仅在 r2 存储后端可用","error":{"code":"VALIDATION"}}`))
		case "/api/blobs/upload":
			multipartHit = true
			if r.Method != http.MethodPost {
				t.Errorf("multipart method = %s, want POST", r.Method)
			}
			// Read the multipart body so the pipe-backed request completes.
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Errorf("parse multipart: %v", err)
			}
			file, _, err := r.FormFile("file")
			if err != nil {
				t.Errorf("form file: %v", err)
				return
			}
			got := make([]byte, len(content))
			if _, err := io.ReadFull(file, got); err != nil {
				t.Errorf("read form file: %v", err)
			}
			if string(got) != string(content) {
				t.Errorf("multipart body = %q, want %q", got, content)
			}
			w.Write([]byte(`{"success":true,"message":"ok","data":{` +
				`"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",` +
				`"originalName":"notes.txt","mimeType":"text/plain",` +
				`"size":` + strconv.FormatInt(int64(len(content)), 10) + `,"checksum":"00"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	var out testBlobEntry
	if err := c.UploadFileSmart(context.Background(), f, &out); err != nil {
		t.Fatal(err)
	}
	if !multipartHit {
		t.Fatal("expected the legacy multipart endpoint to be used on local backend")
	}
	if out.OriginalName != "notes.txt" {
		t.Fatalf("result OriginalName = %q", out.OriginalName)
	}
}

func TestUploadFileSmartPropagatesGatewayError(t *testing.T) {
	content := []byte("will fail at the gateway")

	dir := t.TempDir()
	f := filepath.Join(dir, "fail.bin")
	if err := os.WriteFile(f, content, 0o644); err != nil {
		t.Fatal(err)
	}

	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte("Forbidden"))
	}))
	defer gateway.Close()

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == uploadURLPath {
			w.Write([]byte(`{"success":true,"message":"ok","data":{` +
				`"blobId":"11111111-2222-4333-8444-555555555555",` +
				`"storagePath":"bin/2026/08/x.bin",` +
				`"method":"PUT",` +
				`"url":"` + gateway.URL + `/bin/2026/08/x.bin?e=1&s=x",` +
				`"expires":1755667200,"expiresAt":"2025-08-20T00:00:00.000Z",` +
				`"mode":"direct-r2"}}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	var out testBlobEntry
	err = c.UploadFileSmart(context.Background(), f, &out)
	if err == nil {
		t.Fatal("expected gateway 403 to surface as an error")
	}
	if !strings.Contains(err.Error(), "网关直传失败 (HTTP 403)") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDeleteBlobFiresGatewayDeletes(t *testing.T) {
	// Gateway: DELETE endpoint counting calls + capturing target paths.
	var gotPaths []string
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("gateway method = %s, want DELETE", r.Method)
		}
		gotPaths = append(gotPaths, r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer gateway.Close()

	// 测试注入：白名单 origin 覆盖为测试网关（生产值 r2GatewayOrigin 为官方域名）。
	oldOrigin := r2GatewayOrigin
	r2GatewayOrigin = gateway.URL
	defer func() { r2GatewayOrigin = oldOrigin }()

	// API: r2 backend returns signed delete URLs for original + thumbnail,
	// plus one malicious non-gateway URL that must be filtered out.
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"deleted":true,"deleteUrls":[` +
			`"` + gateway.URL + `/image/2026/08/x.jpg?e=1&s=abc",` +
			`"` + gateway.URL + `/image/2026/08/x.jpg.thumb.webp?e=1&s=def",` +
			`"https://evil.example/path?e=1&s=hack"` + `]}}`))
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}

	if err := c.DeleteBlob(context.Background(), "blob-1"); err != nil {
		t.Fatalf("DeleteBlob: %v", err)
	}
	if len(gotPaths) != 2 {
		t.Fatalf("gateway DELETE calls = %d, want 2 (evil origin filtered)", len(gotPaths))
	}
}

func TestDeleteBlobLocalNoop(t *testing.T) {
	// local backend: 204 no body — no gateway calls, no error.
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteBlob(context.Background(), "blob-1"); err != nil {
		t.Fatalf("DeleteBlob (local): %v", err)
	}
}

func TestDeleteBlobGatewayFailureWarnsOnly(t *testing.T) {
	// Gateway returns 500: DeleteBlob must not fail (DB row already removed,
	// object deletion is best-effort — orphan cleanup catches it later).
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer gateway.Close()

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"deleted":true,"deleteUrls":[` +
			`"` + gateway.URL + `/image/2026/08/x.jpg?e=1&s=abc"` + `]}}`))
	}))
	defer api.Close()

	c, err := NewClient(api.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteBlob(context.Background(), "blob-1"); err != nil {
		t.Fatalf("DeleteBlob should not fail on gateway error, got: %v", err)
	}
}
