package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
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
	c, err := client.NewClient(srv.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	apiClient = c
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

// TestConfigSetUnknownKeyErrorHasNoNewline guards the error message shape: the
// unknown-key error must not embed a newline (which would render as a stray
// blank line under the "✗ 错误:" prefix and leak verbatim into the JSON error
// object).
func TestConfigSetUnknownKeyErrorHasNoNewline(t *testing.T) {
	withTempConfig(t)
	err := configSetCmd.RunE(configSetCmd, []string{"bogus", "x"})
	if err == nil {
		t.Fatal("expected error for unknown config key")
	}
	if !strings.Contains(err.Error(), "未知的配置项: bogus") {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(err.Error(), "\n") {
		t.Fatalf("error must not embed a newline: %q", err.Error())
	}
}

func TestConfigSetBaseURLRejectsMalformed(t *testing.T) {
	withTempConfig(t)
	for _, bad := range []string{"http://", "localhost:3000", "ftp://x", ""} {
		err := configSetCmd.RunE(configSetCmd, []string{"baseurl", bad})
		if err == nil {
			t.Errorf("config set baseurl %q = nil error, want validation failure", bad)
		}
	}
	if err := configSetCmd.RunE(configSetCmd, []string{"baseurl", "http://example.test"}); err != nil {
		t.Fatalf("valid baseurl rejected: %v", err)
	}
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

// =============================================================================
// Blob upload batch behavior
// =============================================================================

func TestBlobUploadPartialFailureJSONMarksSuccessFalse(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "a.jpg")
	if err := os.WriteFile(f, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"message":"服务器错误","error":{"code":"INTERNAL"}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		err := blobUploadCmd.RunE(blobUploadCmd, []string{f})
		if err == nil {
			t.Fatal("expected error for failed upload")
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		// A consumer parsing stdout alone must be able to tell the batch failed.
		if data["success"] != false {
			t.Fatalf("success = %v, want false", data["success"])
		}
		if data["failed"] != 1 {
			t.Fatalf("failed = %v, want 1", data["failed"])
		}
	})
}

func TestBlobUploadAllSuccessJSONMarksSuccessTrue(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "a.jpg")
	if err := os.WriteFile(f, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"b1","originalName":"a.jpg","mimeType":"image/jpeg","size":4,"checksum":"x","metadata":{},"width":null,"height":null,"duration":null,"createdAt":"2026-08-04T00:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := blobUploadCmd.RunE(blobUploadCmd, []string{f}); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		if data["success"] != true {
			t.Fatalf("success = %v, want true", data["success"])
		}
		if data["succeeded"] != 1 {
			t.Fatalf("succeeded = %v, want 1", data["succeeded"])
		}
	})
}

func TestBlobUploadPartialFailureTableReturnsRenderedError(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "a.jpg")
	if err := os.WriteFile(f, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"message":"服务器错误","error":{"code":"INTERNAL"}}`))
	}, false, func(srv *httptest.Server) {
		// Table mode prints per-file failures inline; the returned error must be
		// a *renderedError so Execute() does not re-render the same message.
		err := blobUploadCmd.RunE(blobUploadCmd, []string{f})
		var rendered *renderedError
		if !errors.As(err, &rendered) {
			t.Fatalf("expected *renderedError for table-mode batch failure, got %T: %v", err, err)
		}
	})
}

// =============================================================================
// Error rendering
// =============================================================================

func TestRenderExecutionErrorSuppressesRenderedError(t *testing.T) {
	printer = nil
	out := captureStderr(t, func() {
		renderExecutionError(&renderedError{message: "已内联输出"}, false)
	})
	if out != "" {
		t.Fatalf("rendered error should not be printed again, got %q", out)
	}
}

func TestRenderExecutionErrorPlainTextFallback(t *testing.T) {
	printer = nil
	out := captureStderr(t, func() {
		renderExecutionError(errors.New("boom"), false)
	})
	if !strings.Contains(out, "✗ 错误: boom") {
		t.Fatalf("expected plain-text error on stderr, got %q", out)
	}
}

func TestRenderExecutionErrorJSONFallback(t *testing.T) {
	printer = nil
	out := captureStderr(t, func() {
		renderExecutionError(errors.New("boom"), true)
	})
	if !strings.Contains(out, `"error": "boom"`) {
		t.Fatalf("expected JSON error object on stderr, got %q", out)
	}
}

// =============================================================================
// --json pre-scan
// =============================================================================

func TestFlagJSONRequestedFrom(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{"bare long", []string{"diary", "get", "--json"}, true},
		{"bare short", []string{"diary", "get", "-j"}, true},
		{"long equals true", []string{"diary", "get", "--json=true"}, true},
		{"short equals true", []string{"diary", "get", "-j=true"}, true},
		{"long numeric true", []string{"--json=1"}, true},
		{"long equals false", []string{"diary", "get", "--json=false"}, false},
		{"short equals false", []string{"diary", "get", "-j=false"}, false},
		{"long numeric false", []string{"--json=0"}, false},
		{"no flag", []string{"diary", "list"}, false},
		{"unrelated flags", []string{"--baseurl", "http://x", "list"}, false},
		// Value-taking flags must consume the next argument so a literal "--json"
		// or "-j" used as content is not misdetected as a flag (pflag semantics
		// confirmed: `-m --json` sets m="--json").
		{"json consumed as short value", []string{"diary", "create", "-m", "--json"}, false},
		{"json consumed as long value", []string{"diary", "create", "--content", "--json"}, false},
		{"json consumed as short flag value", []string{"diary", "create", "-m", "-j"}, false},
		{"json embedded in value", []string{"diary", "create", "-mj"}, false},
		// Combined boolean shorthands must be recognized (-fj = force+json).
		{"combined shorthand", []string{"blob", "delete", "-fj"}, true},
		{"combined shorthand reversed", []string{"blob", "delete", "-jf"}, true},
		// "--" terminates flag parsing; everything after is positional.
		{"json after terminator", []string{"diary", "create", "--", "--json"}, false},
		// "-m -- --json": "--" is consumed as m's value, so --json is a real flag.
		{"json after value-taken terminator", []string{"diary", "create", "-m", "--", "--json"}, true},
		{"short flag with attached value", []string{"blob", "download", "-j=true"}, true},
		{"short flag attached false", []string{"blob", "download", "-j=false"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := flagJSONRequestedFrom(tc.args); got != tc.want {
				t.Errorf("flagJSONRequestedFrom(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}

// =============================================================================
// Blob attachments — free-form ownerId must never panic the render
// =============================================================================

func TestBlobAttachmentsShortOwnerIDDoesNotPanic(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// ownerId is a free-form business id (min 1 char per the API schema) and
		// may be far shorter than the 8 chars a UUID truncation would assume.
		w.Write([]byte(`{"success":true,"message":"ok","data":[{"id":"11111111-1111-1111-1111-111111111111","blobId":"22222222-2222-2222-2222-222222222222","ownerType":"diary","ownerId":"ab","role":"attachment","displayName":null,"sortOrder":0,"metadata":{},"createdAt":"2026-08-04T00:00:00Z","updatedAt":"2026-08-04T00:00:00Z"}]}`))
	}, false, func(srv *httptest.Server) {
		if err := blobAttachmentsCmd.RunE(blobAttachmentsCmd, []string{"22222222-2222-2222-2222-222222222222"}); err != nil {
			t.Fatalf("command failed: %v", err)
		}
	})
}

// =============================================================================
// Shared command factories
// =============================================================================

// TestListFactoryEmptyPageMessage verifies the UX fix for a page past the end:
// table mode prints an explicit "本页无数据，共 N 条记录" instead of an empty
// "(无数据)" table followed by the total footer. This also exercises the
// output package's lazy stream resolution, since the factory writes through the
// real TablePrinter to the (swapped) os.Stdout.
func TestListFactoryEmptyPageMessage(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if q := r.URL.Query().Get("pageSize"); q != "10" {
			t.Errorf("pageSize = %q, want 10", q)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[],"total":42}}`))
	}, false, func(srv *httptest.Server) {
		page, size := 1, 10
		lc := paginatedListCommand[DiaryEntry](listSpec[DiaryEntry]{
			use:        "list",
			short:      "列出日记",
			long:       "long",
			path:       "/api/diaries",
			emptyMsg:   "暂无日记记录",
			headers:    []string{"ID", "日期"},
			defaultSize: 10,
			row:        func(d DiaryEntry) map[string]string { return map[string]string{} },
		}, &page, &size)
		out := captureStdout(t, func() {
			if err := lc.RunE(lc, nil); err != nil {
				t.Fatal(err)
			}
		})
		if !strings.Contains(out, "本页无数据，共 42 条记录") {
			t.Fatalf("expected empty-page message, got %q", out)
		}
		if strings.Contains(out, "(无数据)") {
			t.Fatalf("should not print the empty-table placeholder, got %q", out)
		}
	})
}

func TestDeleteCommandFactoryIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		force := true
		dc := deleteCommand("delete <id>", "x", "long", "日记", false,
			func(id string) string { return "/api/diaries/" + id }, &force)
		if err := dc.RunE(dc, []string{"d1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/diaries/d1" {
			t.Fatalf("request = %s %s, want DELETE /api/diaries/d1", gotMethod, gotPath)
		}
		if rec.lastSuccess.message != "日记已删除" {
			t.Fatalf("message = %q, want 日记已删除", rec.lastSuccess.message)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok || data["id"] != "d1" {
			t.Fatalf("data = %+v, want id d1", rec.lastSuccess.data)
		}
	})
}

// TestCommandContextFallsBackToBackground covers commands invoked without
// ExecuteContext (RunE called directly in tests), where cobra leaves the
// context nil: the helper must not panic and must return a usable context.
func TestCommandContextFallsBackToBackground(t *testing.T) {
	cmd := &cobra.Command{Use: "test"}
	if ctx := commandContext(cmd); ctx == nil {
		t.Fatal("commandContext returned nil")
	}
	cmd.SetContext(context.Background())
	if ctx := commandContext(cmd); ctx == nil {
		t.Fatal("commandContext returned nil for set context")
	}
}

// =============================================================================
// Moment attachment metadata round-trip
// =============================================================================

func TestMomentGetKeepsAttachmentMetadata(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","createdAt":"x","updatedAt":"x","attachments":[{"id":"a1","blobId":"b1","role":"cover","sortOrder":0,"metadata":{"tag":"cover-photo"},"createdAt":"x","updatedAt":"x"}]}}`))
	}, true, func(srv *httptest.Server) {
		var result MomentEntry
		if err := apiClient.Get(context.Background(), "/api/moments/m1", nil, &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Attachments) != 1 {
			t.Fatalf("attachments = %d, want 1", len(result.Attachments))
		}
		a := result.Attachments[0]
		if a.Metadata == nil {
			t.Fatal("attachment metadata was dropped during decode")
		}
		if a.Metadata["tag"] != "cover-photo" {
			t.Fatalf("metadata = %+v, want tag=cover-photo", a.Metadata)
		}
	})
}
