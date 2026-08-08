package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
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
		comments, ok := rec.lastSuccess.data.([]client.MomentCommentEntry)
		if !ok {
			t.Fatalf("data is %T, want []client.MomentCommentEntry", rec.lastSuccess.data)
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
// moment edit
// =============================================================================

// TestMomentEditCommandRegistered verifies `moment edit` hangs under momentCmd.
func TestMomentEditCommandRegistered(t *testing.T) {
	found, _, err := momentCmd.Find([]string{"edit"})
	if err != nil {
		t.Fatalf("moment edit not found: %v", err)
	}
	if found != momentEditCmd {
		t.Fatalf("moment edit = %v, want momentEditCmd", found)
	}
}

// TestMomentEditTextShorthandIsM guards the flag contract: the edit --text
// shorthand must be -m (never -c, claimed by the root --config persistent
// flag), and the flag must be marked required so an empty value fails before
// any network call.
func TestMomentEditTextShorthandIsM(t *testing.T) {
	f := momentEditCmd.Flags().Lookup("text")
	if f == nil {
		t.Fatal("moment edit missing --text flag")
	}
	if f.Shorthand != "m" {
		t.Fatalf("moment edit --text shorthand = %q, want m", f.Shorthand)
	}
	ann := f.Annotations[cobra.BashCompOneRequiredFlag]
	if len(ann) == 0 {
		t.Error("moment edit --text should be marked required")
	}
}

// TestMomentEditShowsCurrentAndSendsPutAfterConfirm verifies the edit flow:
// GET the current moment and print its text to stderr, then — after a
// confirmed prompt — PUT the new text, and render the updated moment.
func TestMomentEditShowsCurrentAndSendsPutAfterConfirm(t *testing.T) {
	var hits []string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"旧内容","createdAt":"2026-08-08T01:00:00Z","updatedAt":"2026-08-08T01:00:00Z","attachments":[],"comments":[],"commentCount":0}}`))
			return
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Write([]byte(`{"success":true,"message":"闪念更新成功","data":{"id":"m1","text":"改后","createdAt":"2026-08-08T01:00:00Z","updatedAt":"2026-08-08T02:00:00Z","attachments":[],"comments":[],"commentCount":0}}`))
	}, false, func(srv *httptest.Server) {
		withStdin(t, "y\n")
		momentEditText = "改后"
		t.Cleanup(func() { momentEditText = "" })

		var stderr, stdout string
		stderr = captureStderr(t, func() {
			stdout = captureStdout(t, func() {
				if err := momentEditCmd.RunE(momentEditCmd, []string{"m1"}); err != nil {
					t.Fatal(err)
				}
			})
		})
		if !strings.Contains(stderr, "当前内容: 旧内容") {
			t.Fatalf("stderr should show the current text, got %q", stderr)
		}
		if !strings.Contains(stdout, "✓ 闪念更新成功") {
			t.Fatalf("stdout should render the success line, got %q", stdout)
		}
	})

	want := []string{"GET /api/moments/m1", "PUT /api/moments/m1"}
	if len(hits) != len(want) {
		t.Fatalf("hits = %v, want %v", hits, want)
	}
	for i, w := range want {
		if hits[i] != w {
			t.Fatalf("hit[%d] = %q, want %q (all hits: %v)", i, hits[i], w, hits)
		}
	}
	if gotBody["text"] != "改后" {
		t.Fatalf("text = %v, want 改后", gotBody["text"])
	}
}

// TestMomentEditJSONModeRendersUpdatedMoment verifies --json mode emits the
// updated moment entry (the full API payload, attachments/comments included)
// as the single JSON document.
func TestMomentEditJSONModeRendersUpdatedMoment(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"旧内容","createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
			return
		}
		w.Write([]byte(`{"success":true,"message":"闪念更新成功","data":{"id":"m1","text":"改后","createdAt":"x","updatedAt":"y","attachments":[],"comments":[{"id":"c1","momentId":"m1","content":"第一条","createdAt":"x","updatedAt":"x"}],"commentCount":1}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		withStdin(t, "y\n")
		momentEditText = "改后"
		t.Cleanup(func() { momentEditText = "" })
		if err := momentEditCmd.RunE(momentEditCmd, []string{"m1"}); err != nil {
			t.Fatal(err)
		}
		moment, ok := rec.lastSuccess.data.(*client.MomentEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.MomentEntry", rec.lastSuccess.data)
		}
		if moment.Text != "改后" || moment.UpdatedAt != "y" {
			t.Fatalf("moment = %+v", moment)
		}
		if moment.CommentCount != 1 || len(moment.Comments) != 1 {
			t.Fatalf("comments should round-trip in JSON mode, got %+v", moment)
		}
	})
}

// TestMomentEditRequiresConfirmation guards the edit contract: without a
// confirmation on stdin (EOF — the pipe/CI/AI-agent case), the edit must fail
// with a non-nil error and never reach the server with a PUT.
func TestMomentEditRequiresConfirmation(t *testing.T) {
	var putHit bool
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PUT" {
			putHit = true
			t.Error("server should not receive PUT when confirmation is declined")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"旧内容","createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
	}, true, func(srv *httptest.Server) {
		withStdin(t, "") // immediate EOF — the non-interactive case
		momentEditText = "改后"
		t.Cleanup(func() { momentEditText = "" })
		if err := momentEditCmd.RunE(momentEditCmd, []string{"m1"}); err == nil {
			t.Fatal("expected error when confirmation is not provided")
		}
	})
	if putHit {
		t.Fatal("PUT should not be sent when confirmation is declined")
	}
}

// TestMomentEditMissingMomentFails verifies a 404 on the initial GET fails the
// edit before any confirmation is requested (the server's 「闪念不存在」).
func TestMomentEditMissingMomentFails(t *testing.T) {
	var putHit bool
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PUT" {
			putHit = true
		}
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"闪念不存在","error":{"code":"NOT_FOUND"}}`))
	}, true, func(srv *httptest.Server) {
		withStdin(t, "y\n")
		momentEditText = "改后"
		t.Cleanup(func() { momentEditText = "" })
		if err := momentEditCmd.RunE(momentEditCmd, []string{"nope"}); err == nil {
			t.Fatal("expected error for missing moment")
		}
	})
	if putHit {
		t.Fatal("PUT should not be sent when the moment does not exist")
	}
}

// TestMomentEditServerErrorFails verifies a failed PUT (HTTP 500) surfaces as
// an error so the process exits non-zero.
func TestMomentEditServerErrorFails(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"旧内容","createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"message":"服务器内部错误","error":{"code":"INTERNAL"}}`))
	}, true, func(srv *httptest.Server) {
		withStdin(t, "y\n")
		momentEditText = "改后"
		t.Cleanup(func() { momentEditText = "" })
		if err := momentEditCmd.RunE(momentEditCmd, []string{"m1"}); err == nil {
			t.Fatal("expected error when the PUT fails")
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
		var result client.MomentEntry
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

// =============================================================================
// moment tag — subcommand registration and nested tag operations
// =============================================================================

// TestMomentTagCommandsRegistered verifies the tag subtree hangs under
// momentCmd with the expected subcommands (add/remove/set).
func TestMomentTagCommandsRegistered(t *testing.T) {
	tagCmd, _, err := momentCmd.Find([]string{"tag"})
	if err != nil {
		t.Fatalf("moment tag not found: %v", err)
	}
	names := map[string]bool{}
	for _, c := range tagCmd.Commands() {
		names[c.Name()] = true
	}
	for _, want := range []string{"add", "remove", "set"} {
		if !names[want] {
			t.Errorf("moment tag %s not registered", want)
		}
	}
}

// TestMomentListSendsTagFilter verifies `moment list --tag <id>` adds the
// additive ?tag= filter the API uses to filter by tag.
func TestMomentListSendsTagFilter(t *testing.T) {
	var gotQuery string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[],"total":0}}`))
	}, true, func(srv *httptest.Server) {
		momentListTag = "t1"
		momentListPage = 1
		momentListPageSize = 10
		momentListAll = false
		t.Cleanup(func() {
			momentListTag = ""
			momentListPage = 1
			momentListPageSize = 50
			momentListAll = false
		})
		if err := momentListCmd.RunE(momentListCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if !strings.Contains(gotQuery, "tag=t1") {
		t.Fatalf("query = %q, want tag=t1", gotQuery)
	}
}

// TestMomentTagAddSendsTagID verifies POST /api/moments/:id/tags with a JSON
// body of {"tagId": ...}.
func TestMomentTagAddSendsTagID(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"r1","tagId":"t1","ownerType":"moment","ownerId":"m1","createdAt":"2026-08-08T01:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		if err := momentTagAddCmd.RunE(momentTagAddCmd, []string{"m1", "t1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/moments/m1/tags" {
		t.Fatalf("path = %q, want /api/moments/m1/tags", gotPath)
	}
	if gotBody["tagId"] != "t1" {
		t.Fatalf("tagId = %v, want t1", gotBody["tagId"])
	}
}

// TestMomentTagRemoveIssuesDelete verifies DELETE
// /api/moments/:id/tags/:tagId when confirmed with --force.
func TestMomentTagRemoveIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		momentTagRemoveForce = true
		t.Cleanup(func() { momentTagRemoveForce = false })
		if err := momentTagRemoveCmd.RunE(momentTagRemoveCmd, []string{"m1", "t1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/moments/m1/tags/t1" {
			t.Fatalf("request = %s %s, want DELETE /api/moments/m1/tags/t1", gotMethod, gotPath)
		}
	})
}

func TestMomentTagRemoveRequiresConfirmation(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when confirmation is declined")
	}, true, func(srv *httptest.Server) {
		withStdin(t, "") // immediate EOF — the pipe/CI/AI-agent case
		momentTagRemoveForce = false
		t.Cleanup(func() { momentTagRemoveForce = false })
		if err := momentTagRemoveCmd.RunE(momentTagRemoveCmd, []string{"m1", "t1"}); err == nil {
			t.Fatal("expected error when confirmation is not provided")
		}
	})
}

// TestMomentTagSetSendsTagIDs verifies PUT /api/moments/:id/tags with the
// comma-separated ids expanded into a tagIds array.
func TestMomentTagSetSendsTagIDs(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[
			{"id":"t1","name":"work","momentCount":1,"createdAt":"x","updatedAt":"x"},
			{"id":"t2","name":"重要","momentCount":1,"createdAt":"x","updatedAt":"x"}
		]}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := momentTagSetCmd.RunE(momentTagSetCmd, []string{"m1", "t1,t2"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "PUT" || gotPath != "/api/moments/m1/tags" {
			t.Fatalf("request = %s %s, want PUT /api/moments/m1/tags", gotMethod, gotPath)
		}
		ids, ok := gotBody["tagIds"].([]any)
		if !ok || len(ids) != 2 || ids[0] != "t1" || ids[1] != "t2" {
			t.Fatalf("tagIds = %v, want [t1 t2]", gotBody["tagIds"])
		}
		tags, ok := rec.lastSuccess.data.([]client.TagEntry)
		if !ok || len(tags) != 2 {
			t.Fatalf("data = %T %v, want 2 TagEntry", rec.lastSuccess.data, rec.lastSuccess.data)
		}
	})
}

func TestMomentTagSetEmptyClears(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[]}`))
	}, true, func(srv *httptest.Server) {
		if err := momentTagSetCmd.RunE(momentTagSetCmd, []string{"m1", ""}); err != nil {
			t.Fatal(err)
		}
		ids, ok := gotBody["tagIds"].([]any)
		if !ok || len(ids) != 0 {
			t.Fatalf("tagIds = %v (%T), want empty array (clear all)", gotBody["tagIds"], gotBody["tagIds"])
		}
	})
}

func TestMomentTagSetRejectsEmptySegment(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for a malformed tag id list")
	}, true, func(srv *httptest.Server) {
		for _, bad := range []string{"t1,,t2", "t1,", ",t1", "t1, ,t2"} {
			if err := momentTagSetCmd.RunE(momentTagSetCmd, []string{"m1", bad}); err == nil {
				t.Errorf("parseTagIDList(%q) should fail", bad)
			}
		}
	})
}

// =============================================================================
// parseTagIDList
// =============================================================================

func TestParseTagIDList(t *testing.T) {
	ids, err := parseTagIDList("t1,t2,t3")
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 3 || ids[0] != "t1" || ids[2] != "t3" {
		t.Fatalf("ids = %v", ids)
	}
	// Surrounding whitespace around segments is tolerated ("t1, t2").
	ids, err = parseTagIDList(" t1 , t2 ")
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != "t1" || ids[1] != "t2" {
		t.Fatalf("ids = %v", ids)
	}
	// But an empty segment is an error, never silently dropped.
	for _, bad := range []string{"", "t1,", ",t1", "t1,,t2"} {
		if _, err := parseTagIDList(bad); err == nil {
			t.Errorf("parseTagIDList(%q) should fail", bad)
		}
	}
}
