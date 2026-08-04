package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
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
