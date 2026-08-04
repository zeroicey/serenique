package cmd

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
	"github.com/zeroicey/serenique-cli/internal/output"
)

// runWithServer wires the package-level apiClient/printer/useJSON state to a
// fake API and runs fn. This lets handler tests exercise the actual command
// RunE logic (request payloads, response decoding) without a live server.
func runWithServer(t *testing.T, handler http.HandlerFunc, jsonMode bool, fn func(srv *httptest.Server)) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	apiClient = client.NewClient(srv.URL, "test-token")
	printer = output.NewPrinter(jsonMode)
	useJSON = jsonMode
	fn(srv)
}

func TestMomentCreateSendsTextField(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hello","createdAt":"2026-08-04T00:00:00Z","updatedAt":"2026-08-04T00:00:00Z","attachments":[]}}`))
	}, true, func(srv *httptest.Server) {
		momentCreateText = "hello"
		if err := momentCreateCmd.RunE(momentCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	if gotBody == nil {
		t.Fatal("request body was not captured")
	}
	if _, ok := gotBody["text"]; !ok {
		t.Errorf("request body should contain a 'text' field (matches the renamed API schema), got %v", gotBody)
	}
	if _, ok := gotBody["content"]; ok {
		t.Errorf("request body should not contain the removed 'content' field, got %v", gotBody)
	}
	if gotBody["text"] != "hello" {
		t.Errorf("text = %v, want hello", gotBody["text"])
	}
}

func TestDiaryCreateSendsContentAndDate(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"d1","diaryDate":"2026-08-04","content":"hi","createdAt":"x","updatedAt":"x"}}`))
	}, false, func(srv *httptest.Server) {
		diaryCreateContent = "hi"
		diaryCreateDate = "2026-08-04"
		if err := diaryCreateCmd.RunE(diaryCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	if gotBody["content"] != "hi" {
		t.Errorf("content = %v, want hi", gotBody["content"])
	}
	if gotBody["diaryDate"] != "2026-08-04" {
		t.Errorf("diaryDate = %v, want 2026-08-04", gotBody["diaryDate"])
	}
}

func TestMomentGetDecodesAttachments(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","createdAt":"2026-08-04T00:00:00Z","updatedAt":"2026-08-04T00:00:00Z","attachments":[{"id":"a1","blobId":"b1","role":"cover","displayName":"配图","sortOrder":0,"createdAt":"x","updatedAt":"x"}]}}`))
	}, true, func(srv *httptest.Server) {
		if err := momentGetCmd.RunE(momentGetCmd, []string{"m1"}); err != nil {
			t.Fatal(err)
		}
	})

	if gotPath != "/api/moments/m1" {
		t.Fatalf("request path = %q, want /api/moments/m1", gotPath)
	}
}

func TestMomentGetMissingIDFails(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"闪念不存在","error":{"code":"NOT_FOUND"}}`))
	}, true, func(srv *httptest.Server) {
		err := momentGetCmd.RunE(momentGetCmd, []string{"nope"})
		if err == nil {
			t.Fatal("expected error for missing moment")
		}
	})
}

// recordingPrinter implements output.Printer and captures the data passed to
// PrintSuccess so tests can assert what a command renders without depending on
// the output package's (unexported) streams.
type recordingPrinter struct {
	lastSuccess struct {
		message string
		data    any
	}
}

func (r *recordingPrinter) PrintTable(headers []string, rows []map[string]string) {}
func (r *recordingPrinter) PrintKeyValue(data map[string]string)                  {}
func (r *recordingPrinter) PrintError(message string)                             {}
func (r *recordingPrinter) PrintMessage(message string)                           {}
func (r *recordingPrinter) PrintSuccess(message string, data any) {
	r.lastSuccess.message = message
	r.lastSuccess.data = data
}

// withTempConfig pins the config path to a temp dir for the duration of the test
// and returns the path.
func withTempConfig(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	config.SetPath(path)
	t.Cleanup(func() { config.SetPath("") })
	return path
}

func TestConfigSetJSONMasksToken(t *testing.T) {
	withTempConfig(t)
	rec := &recordingPrinter{}
	printer = rec
	useJSON = true
	t.Cleanup(func() { useJSON = false })

	raw := "super-secret-token-12345"
	if err := configSetCmd.RunE(configSetCmd, []string{"token", raw}); err != nil {
		t.Fatal(err)
	}

	data, ok := rec.lastSuccess.data.(map[string]any)
	if !ok {
		t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
	}
	value, _ := data["value"].(string)
	if value == raw {
		t.Fatalf("raw token leaked into --json output: %q", value)
	}
	if strings.Contains(value, "secret") {
		t.Fatalf("masked value still reveals token material: %q", value)
	}
}

func TestConfigSetJSONEchoesNonSecretValue(t *testing.T) {
	withTempConfig(t)
	rec := &recordingPrinter{}
	printer = rec
	useJSON = true
	t.Cleanup(func() { useJSON = false })

	if err := configSetCmd.RunE(configSetCmd, []string{"baseurl", "http://example.test"}); err != nil {
		t.Fatal(err)
	}

	data, ok := rec.lastSuccess.data.(map[string]any)
	if !ok {
		t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
	}
	if data["value"] != "http://example.test" {
		t.Fatalf("baseurl value should be echoed unmodified, got %v", data["value"])
	}
}

func TestConfigJSONMasksToken(t *testing.T) {
	withTempConfig(t)
	if err := config.Save(&config.Config{BaseURL: "http://x", Token: "super-secret-token-12345"}); err != nil {
		t.Fatal(err)
	}
	rec := &recordingPrinter{}
	printer = rec
	useJSON = true
	t.Cleanup(func() { useJSON = false })

	if err := configCmd.RunE(configCmd, nil); err != nil {
		t.Fatal(err)
	}

	data, ok := rec.lastSuccess.data.(map[string]any)
	if !ok {
		t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
	}
	tok, _ := data["token"].(string)
	if tok == "super-secret-token-12345" || strings.Contains(tok, "secret") {
		t.Fatalf("raw token leaked into --json output: %q", tok)
	}
}

func TestInitJSONMasksToken(t *testing.T) {
	withTempConfig(t)
	rec := &recordingPrinter{}
	printer = rec
	useJSON = true
	flagBaseURL = "http://example.test"
	flagToken = "super-secret-token-12345"
	t.Cleanup(func() {
		useJSON = false
		flagBaseURL = ""
		flagToken = ""
	})

	if err := initCmd.RunE(initCmd, nil); err != nil {
		t.Fatal(err)
	}

	data, ok := rec.lastSuccess.data.(map[string]any)
	if !ok {
		t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
	}
	tok, _ := data["token"].(string)
	if tok == "super-secret-token-12345" || strings.Contains(tok, "secret") {
		t.Fatalf("raw token leaked into --json output: %q", tok)
	}
}

func TestInitNonInteractiveEOFWithoutFlagsFails(t *testing.T) {
	path := withTempConfig(t)
	flagBaseURL = ""
	flagToken = ""
	t.Cleanup(func() {
		flagBaseURL = ""
		flagToken = ""
	})
	withStdin(t, "") // immediate EOF — the pipe/CI/AI-agent case

	rec := &recordingPrinter{}
	printer = rec
	useJSON = false
	t.Cleanup(func() { useJSON = false })

	err := initCmd.RunE(initCmd, nil)
	if err == nil {
		t.Fatal("expected error on non-interactive EOF without --baseurl/--token")
	}
	if !strings.Contains(err.Error(), "非交互式") {
		t.Fatalf("unexpected error: %v", err)
	}
	// The config must not have been written unchanged.
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("config should not be written on non-interactive EOF, stat err = %v", statErr)
	}
}

func TestDiaryDeleteJSONEmitsIDEnvelope(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		diaryDeleteForce = true
		t.Cleanup(func() { diaryDeleteForce = false })

		if err := diaryDeleteCmd.RunE(diaryDeleteCmd, []string{"d1"}); err != nil {
			t.Fatal(err)
		}
		if rec.lastSuccess.message != "日记已删除" {
			t.Fatalf("message = %q, want 日记已删除", rec.lastSuccess.message)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		if data["id"] != "d1" {
			t.Fatalf("data = %+v, want id d1", data)
		}
	})
}

func TestMomentGetDecodesBlobSubObject(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","createdAt":"x","updatedAt":"x","attachments":[{"id":"a1","blobId":"b1","role":"cover","sortOrder":0,"createdAt":"x","updatedAt":"x","blob":{"id":"b1","originalName":"pic.jpg","mimeType":"image/jpeg","size":123,"metadata":{},"width":10,"height":10,"duration":null,"createdAt":"x","fileUrl":"/api/blobs/b1/file"}}]}}`))
	}, true, func(srv *httptest.Server) {
		// Decode into the CLI structs exactly as the command does, so the blob
		// sub-object the API returns is not dropped.
		var result MomentEntry
		if err := apiClient.Get(context.Background(), "/api/moments/m1", nil, &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Attachments) != 1 {
			t.Fatalf("attachments = %d, want 1", len(result.Attachments))
		}
		a := result.Attachments[0]
		if a.Blob == nil {
			t.Fatal("blob sub-object was dropped during decode")
		}
		if a.Blob.FileURL != "/api/blobs/b1/file" {
			t.Fatalf("fileUrl = %q, want /api/blobs/b1/file", a.Blob.FileURL)
		}
		if a.Blob.OriginalName != "pic.jpg" || a.Blob.MimeType != "image/jpeg" || a.Blob.Size != 123 {
			t.Fatalf("blob = %+v", a.Blob)
		}
	})
}

func TestValidatePageParams(t *testing.T) {
	if err := validatePageParams(1, 10); err != nil {
		t.Fatalf("valid params rejected: %v", err)
	}
	for _, tc := range []struct{ page, size int }{
		{0, 10}, {1, 0}, {1, 51},
	} {
		if err := validatePageParams(tc.page, tc.size); err == nil {
			t.Fatalf("params page=%d size=%d should be rejected", tc.page, tc.size)
		}
	}
}
