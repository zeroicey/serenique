package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// =============================================================================
// moment comment — subcommand registration
// =============================================================================

// TestMomentCommentCommandsRegistered verifies the comment subtree hangs under
// momentCmd with the expected subcommands (list/add/update/delete).
func TestMomentCommentCommandsRegistered(t *testing.T) {
	commentCmd, _, err := momentCmd.Find([]string{"comment"})
	if err != nil {
		t.Fatalf("moment comment not found: %v", err)
	}
	names := map[string]bool{}
	for _, c := range commentCmd.Commands() {
		names[c.Name()] = true
	}
	for _, want := range []string{"list", "add", "update", "delete"} {
		if !names[want] {
			t.Errorf("moment comment %s not registered", want)
		}
	}
}

// TestMomentCommentContentShorthandIsM guards the flag contract: the comment
// --content shorthand must be -m, never -c — the root --config persistent flag
// already claims -c, and cobra panics at runtime on a shorthand collision (see
// pflag.AddFlag during mergePersistentFlags).
func TestMomentCommentContentShorthandIsM(t *testing.T) {
	for _, cmd := range []struct {
		name string
		cmd  *cobra.Command
	}{
		{"add", momentCommentAddCmd},
		{"update", momentCommentUpdateCmd},
	} {
		f := cmd.cmd.Flags().Lookup("content")
		if f == nil {
			t.Fatalf("%s command missing --content flag", cmd.name)
		}
		if f.Shorthand != "m" {
			t.Fatalf("%s --content shorthand = %q, want m (avoid collision with --config/-c)", cmd.name, f.Shorthand)
		}
		// MarkFlagRequired stores the cobra one-required-flag annotation; verify
		// it so `--content` truly rejects a missing value before any network call.
		ann := f.Annotations[cobra.BashCompOneRequiredFlag]
		if len(ann) == 0 {
			t.Errorf("%s --content should be marked required", cmd.name)
		}
	}
}

// =============================================================================
// moment comment list
// =============================================================================

// TestMomentCommentListFetchesComments verifies GET /api/moments/:id/comments is
// requested and the response array decodes into MomentCommentEntry in JSON mode.
func TestMomentCommentListFetchesComments(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[
			{"id":"c1","momentId":"m1","content":"第一条","createdAt":"2026-08-06T01:00:00Z","updatedAt":"2026-08-06T01:00:00Z"},
			{"id":"c2","momentId":"m1","content":"第二条","createdAt":"2026-08-06T02:00:00Z","updatedAt":"2026-08-06T02:00:00Z"}
		]}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := momentCommentListCmd.RunE(momentCommentListCmd, []string{"m1"}); err != nil {
			t.Fatal(err)
		}
		comments, ok := rec.lastSuccess.data.([]MomentCommentEntry)
		if !ok {
			t.Fatalf("data is %T, want []MomentCommentEntry", rec.lastSuccess.data)
		}
		if len(comments) != 2 {
			t.Fatalf("comments = %d, want 2", len(comments))
		}
		if comments[0].ID != "c1" || comments[0].Content != "第一条" || comments[0].MomentID != "m1" {
			t.Fatalf("comments[0] = %+v", comments[0])
		}
	})

	if gotPath != "/api/moments/m1/comments" {
		t.Fatalf("request path = %q, want /api/moments/m1/comments", gotPath)
	}
}

// TestMomentCommentListEmpty prints a friendly empty message in table mode.
func TestMomentCommentListEmpty(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[]}`))
	}, false, func(srv *httptest.Server) {
		out := captureStdout(t, func() {
			if err := momentCommentListCmd.RunE(momentCommentListCmd, []string{"m1"}); err != nil {
				t.Fatal(err)
			}
		})
		if !strings.Contains(out, "暂无评论") {
			t.Fatalf("expected empty message, got %q", out)
		}
	})
}

// =============================================================================
// moment comment add
// =============================================================================

// TestMomentCommentAddSendsContent verifies POST /api/moments/:id/comments with a
// JSON body of {"content": ...} and decodes the created comment.
func TestMomentCommentAddSendsContent(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"c1","momentId":"m1","content":"说得对","createdAt":"2026-08-06T01:00:00Z","updatedAt":"2026-08-06T01:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		momentCommentAddContent = "说得对"
		t.Cleanup(func() { momentCommentAddContent = "" })
		if err := momentCommentAddCmd.RunE(momentCommentAddCmd, []string{"m1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/moments/m1/comments" {
		t.Fatalf("request path = %q, want /api/moments/m1/comments", gotPath)
	}
	if gotBody["content"] != "说得对" {
		t.Fatalf("content = %v, want 说得对", gotBody["content"])
	}
}

// =============================================================================
// moment comment update
// =============================================================================

// TestMomentCommentUpdateSendsContent verifies PUT
// /api/moments/:id/comments/:commentId with a {"content": ...} body.
func TestMomentCommentUpdateSendsContent(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"c1","momentId":"m1","content":"改后","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		momentCommentUpdateContent = "改后"
		t.Cleanup(func() { momentCommentUpdateContent = "" })
		if err := momentCommentUpdateCmd.RunE(momentCommentUpdateCmd, []string{"m1", "c1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotMethod != "PUT" || gotPath != "/api/moments/m1/comments/c1" {
		t.Fatalf("request = %s %s, want PUT /api/moments/m1/comments/c1", gotMethod, gotPath)
	}
	if gotBody["content"] != "改后" {
		t.Fatalf("content = %v, want 改后", gotBody["content"])
	}
}

// =============================================================================
// moment comment delete
// =============================================================================

// TestMomentCommentDeleteIssuesDelete verifies DELETE
// /api/moments/:id/comments/:commentId when confirmed with --force.
func TestMomentCommentDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		momentCommentDeleteForce = true
		t.Cleanup(func() { momentCommentDeleteForce = false })
		if err := momentCommentDeleteCmd.RunE(momentCommentDeleteCmd, []string{"m1", "c1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/moments/m1/comments/c1" {
			t.Fatalf("request = %s %s, want DELETE /api/moments/m1/comments/c1", gotMethod, gotPath)
		}
	})
}

// TestMomentCommentDeleteRequiresConfirmation guards the destructive-action
// contract: without --force, a non-interactive stdin (EOF) must cancel the
// delete with a non-nil error and never reach the server.
func TestMomentCommentDeleteRequiresConfirmation(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when confirmation is declined")
	}, true, func(srv *httptest.Server) {
		withStdin(t, "") // immediate EOF — the pipe/CI/AI-agent case
		momentCommentDeleteForce = false
		t.Cleanup(func() { momentCommentDeleteForce = false })
		if err := momentCommentDeleteCmd.RunE(momentCommentDeleteCmd, []string{"m1", "c1"}); err == nil {
			t.Fatal("expected error when confirmation is not provided")
		}
	})
}

// =============================================================================
// MomentEntry comment fields round-trip
// =============================================================================

// TestMomentEntryDecodesCommentsAndCount verifies the detail response's new
// comments[] and commentCount fields survive decode into MomentEntry, so
// `moment get --json` round-trips them.
func TestMomentEntryDecodesCommentsAndCount(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","createdAt":"x","updatedAt":"x","attachments":[],"comments":[{"id":"c1","momentId":"m1","content":"第一条","createdAt":"x","updatedAt":"x"}],"commentCount":1}}`))
	}, true, func(srv *httptest.Server) {
		var result MomentEntry
		if err := apiClient.Get(commandContext(momentGetCmd), "/api/moments/m1", nil, &result); err != nil {
			t.Fatal(err)
		}
		if result.CommentCount != 1 {
			t.Fatalf("commentCount = %d, want 1", result.CommentCount)
		}
		if len(result.Comments) != 1 {
			t.Fatalf("comments = %d, want 1", len(result.Comments))
		}
		c := result.Comments[0]
		if c.ID != "c1" || c.MomentID != "m1" || c.Content != "第一条" {
			t.Fatalf("comment = %+v", c)
		}
	})
}
