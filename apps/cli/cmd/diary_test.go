package cmd

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// =============================================================================
// diary get — --date by-date path vs positional id
// =============================================================================

// TestDiaryGetByDateUsesByDatePath verifies that `diary get --date` requests the
// by-date endpoint (GET /api/diaries/by-date/:date) and decodes the entry.
func TestDiaryGetByDateUsesByDatePath(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"d1","diaryDate":"2026-08-05","content":"hi","createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		diaryGetDate = "2026-08-05"
		t.Cleanup(func() { diaryGetDate = "" })
		rec := &recordingPrinter{}
		printer = rec

		if err := diaryGetCmd.RunE(diaryGetCmd, nil); err != nil {
			t.Fatal(err)
		}
	})

	if gotPath != "/api/diaries/by-date/2026-08-05" {
		t.Fatalf("request path = %q, want /api/diaries/by-date/2026-08-05", gotPath)
	}
}

// TestDiaryGetByDateDecodesEntry asserts the by-date response is decoded into the
// same DiaryEntry the id path uses, so --json output is a single document.
func TestDiaryGetByDateDecodesEntry(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"d1","diaryDate":"2026-08-05","content":"hi","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		diaryGetDate = "2026-08-05"
		t.Cleanup(func() { diaryGetDate = "" })
		rec := &recordingPrinter{}
		printer = rec

		if err := diaryGetCmd.RunE(diaryGetCmd, nil); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(DiaryEntry)
		if !ok {
			t.Fatalf("data is %T, want DiaryEntry", rec.lastSuccess.data)
		}
		if data.ID != "d1" || data.DiaryDate != "2026-08-05" || data.Content != "hi" {
			t.Fatalf("entry = %+v", data)
		}
	})
}

// TestDiaryGetByDatePassesThrough404 verifies a missing date surfaces the server
// error (RunE returns non-nil) rather than rendering a success.
func TestDiaryGetByDatePassesThrough404(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"日记不存在","error":{"code":"NOT_FOUND"}}`))
	}, true, func(srv *httptest.Server) {
		diaryGetDate = "2026-08-05"
		t.Cleanup(func() { diaryGetDate = "" })
		if err := diaryGetCmd.RunE(diaryGetCmd, nil); err == nil {
			t.Fatal("expected error for missing diary by date")
		}
	})
}

// TestDiaryGetRequiresDateOrID guards the new validation: with neither --date nor
// a positional id, RunE must return a non-nil error (and never hit the server).
func TestDiaryGetRequiresDateOrID(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when neither --date nor id is provided")
	}, true, func(srv *httptest.Server) {
		diaryGetDate = ""
		err := diaryGetCmd.RunE(diaryGetCmd, nil)
		if err == nil {
			t.Fatal("expected error when neither --date nor id is provided")
		}
	})
}

// TestDiaryGetByIDUsesIDPath is the regression guard for the original id branch:
// without --date, `diary get <id>` must still request /api/diaries/<id>.
func TestDiaryGetByIDUsesIDPath(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"d1","diaryDate":"2026-08-04","content":"hi","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		diaryGetDate = ""
		if err := diaryGetCmd.RunE(diaryGetCmd, []string{"d1"}); err != nil {
			t.Fatal(err)
		}
	})

	if gotPath != "/api/diaries/d1" {
		t.Fatalf("request path = %q, want /api/diaries/d1", gotPath)
	}
}

// TestDiaryGetByDateTakesPrecedenceOverID pins the documented precedence: when
// --date is provided, the by-date path is used even if a positional id is also
// given (cobra.MaximumNArgs allows it).
func TestDiaryGetByDateTakesPrecedenceOverID(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"d1","diaryDate":"2026-08-05","content":"hi","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		diaryGetDate = "2026-08-05"
		t.Cleanup(func() { diaryGetDate = "" })
		if err := diaryGetCmd.RunE(diaryGetCmd, []string{"d1"}); err != nil {
			t.Fatal(err)
		}
	})

	if gotPath != "/api/diaries/by-date/2026-08-05" {
		t.Fatalf("request path = %q, want /api/diaries/by-date/2026-08-05 (--date takes precedence)", gotPath)
	}
}

// =============================================================================
// diary get — args validation (cobra.MaximumNArgs)
// =============================================================================

// TestDiaryGetArgsValidation exercises the registered command's Args validator
// through ExecuteC, which is what cobra runs before RunE in real usage: more
// than one positional id must be rejected even when --date is absent.
func TestDiaryGetArgsValidation(t *testing.T) {
	diaryGetDate = ""
	if err := diaryGetCmd.Args(diaryGetCmd, []string{"d1", "d2"}); err == nil {
		t.Fatal("expected args validation error for two positional ids")
	}
	if err := diaryGetCmd.Args(diaryGetCmd, nil); err != nil {
		t.Fatalf("no positional args should be valid (--date mode): %v", err)
	}
	if err := diaryGetCmd.Args(diaryGetCmd, []string{"d1"}); err != nil {
		t.Fatalf("single positional id should be valid: %v", err)
	}
}
