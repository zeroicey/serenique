package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// resetFlagChanged clears the Changed markers on a command's flags. pflag's
// Changed marker persists once a flag is Set (e.g. via Flags().Set in a test)
// and there is no public "unset", so tests that exercise the update command's
// "only send what changed" logic must clear it explicitly to stay independent.
func resetFlagChanged(c *cobra.Command) {
	c.Flags().VisitAll(func(f *pflag.Flag) { f.Changed = false })
}

// =============================================================================
// Task group commands
// =============================================================================

func TestTaskGroupCreateSendsTitle(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"g1","title":"工作","createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		taskGroupCreateTitle = "工作"
		t.Cleanup(func() { taskGroupCreateTitle = "" })
		if err := taskGroupCreateCmd.RunE(taskGroupCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/task-groups" {
		t.Fatalf("path = %q, want /api/task-groups", gotPath)
	}
	if gotBody["title"] != "工作" {
		t.Fatalf("title = %v, want 工作", gotBody["title"])
	}
}

func TestTaskGroupUpdateSendsTitle(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"g1","title":"新标题","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		taskGroupUpdateTitle = "新标题"
		t.Cleanup(func() { taskGroupUpdateTitle = "" })
		if err := taskGroupUpdateCmd.RunE(taskGroupUpdateCmd, []string{"g1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotMethod != "PUT" || gotPath != "/api/task-groups/g1" {
		t.Fatalf("request = %s %s, want PUT /api/task-groups/g1", gotMethod, gotPath)
	}
	if gotBody["title"] != "新标题" {
		t.Fatalf("title = %v, want 新标题", gotBody["title"])
	}
}

func TestTaskGroupGetDecodesEntry(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/task-groups/g1" {
			t.Errorf("path = %q, want /api/task-groups/g1", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"g1","title":"工作","createdAt":"x","updatedAt":"x"}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := taskGroupGetCmd.RunE(taskGroupGetCmd, []string{"g1"}); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(*client.TaskGroupEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.TaskGroupEntry", rec.lastSuccess.data)
		}
		if data.ID != "g1" || data.Title != "工作" {
			t.Fatalf("entry = %+v", data)
		}
	})
}

func TestTaskGroupDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		taskGroupDeleteForce = true
		t.Cleanup(func() { taskGroupDeleteForce = false })
		if err := taskGroupDeleteCmd.RunE(taskGroupDeleteCmd, []string{"g1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/task-groups/g1" {
			t.Fatalf("request = %s %s, want DELETE /api/task-groups/g1", gotMethod, gotPath)
		}
	})
}

// =============================================================================
// Task commands
// =============================================================================

func TestTaskCreateSendsTitleGroupAndStatus(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"done","createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z","completedAt":"2026-08-05T00:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		taskCreateTitle = "hi"
		taskCreateGroupID = "g1"
		taskCreateStatus = "done"
		t.Cleanup(func() {
			taskCreateTitle = ""
			taskCreateGroupID = ""
			taskCreateStatus = "todo"
		})
		if err := taskCreateCmd.RunE(taskCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/tasks" {
		t.Fatalf("path = %q, want /api/tasks", gotPath)
	}
	if gotBody["title"] != "hi" || gotBody["groupId"] != "g1" || gotBody["status"] != "done" {
		t.Fatalf("body = %v, want title=hi groupId=g1 status=done", gotBody)
	}
}

func TestTaskCreateDefaultsStatusTodo(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"todo","createdAt":"x","updatedAt":"x","completedAt":null}}`))
	}, true, func(srv *httptest.Server) {
		taskCreateTitle = "hi"
		taskCreateGroupID = "g1"
		taskCreateStatus = "todo"
		t.Cleanup(func() { taskCreateTitle, taskCreateGroupID, taskCreateStatus = "", "", "todo" })
		if err := taskCreateCmd.RunE(taskCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotBody["status"] != "todo" {
		t.Fatalf("status = %v, want todo", gotBody["status"])
	}
}

func TestTaskCreateRejectsInvalidStatus(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an invalid status")
	}, true, func(srv *httptest.Server) {
		taskCreateTitle = "hi"
		taskCreateGroupID = "g1"
		taskCreateStatus = "bogus"
		t.Cleanup(func() { taskCreateTitle, taskCreateGroupID, taskCreateStatus = "", "", "todo" })
		if err := taskCreateCmd.RunE(taskCreateCmd, nil); err == nil {
			t.Fatal("expected error for invalid status")
		}
	})
}

func TestTaskGetDecodesEntry(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tasks/t1" {
			t.Errorf("path = %q, want /api/tasks/t1", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"todo","createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z","completedAt":null}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := taskGetCmd.RunE(taskGetCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(*client.TaskEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.TaskEntry", rec.lastSuccess.data)
		}
		if data.ID != "t1" || data.GroupID != "g1" || data.Status != "todo" {
			t.Fatalf("entry = %+v", data)
		}
		if data.CompletedAt != nil {
			t.Fatalf("completedAt = %v, want nil (null in API response)", *data.CompletedAt)
		}
	})
}

func TestTaskUpdateRequiresField(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when no update field is provided")
	}, true, func(srv *httptest.Server) {
		taskUpdateTitle = ""
		taskUpdateGroupID = ""
		taskUpdateStatus = ""
		resetFlagChanged(taskUpdateCmd)
		t.Cleanup(func() { taskUpdateTitle, taskUpdateGroupID, taskUpdateStatus = "", "", "" })
		if err := taskUpdateCmd.RunE(taskUpdateCmd, []string{"t1"}); err == nil {
			t.Fatal("expected error when no update field is provided")
		}
	})
}

func TestTaskUpdateSendsOnlyChangedFields(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"新标题","status":"todo","createdAt":"x","updatedAt":"x","completedAt":null}}`))
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(taskUpdateCmd)
		if err := taskUpdateCmd.Flags().Set("title", "新标题"); err != nil {
			t.Fatal(err)
		}
		taskUpdateGroupID = ""
		taskUpdateStatus = ""
		t.Cleanup(func() {
			taskUpdateTitle, taskUpdateGroupID, taskUpdateStatus = "", "", ""
			resetFlagChanged(taskUpdateCmd)
		})
		if err := taskUpdateCmd.RunE(taskUpdateCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		if gotBody["title"] != "新标题" {
			t.Fatalf("title = %v, want 新标题", gotBody["title"])
		}
		if _, ok := gotBody["groupId"]; ok {
			t.Fatalf("groupId should be omitted when unchanged, got %v", gotBody)
		}
		if _, ok := gotBody["status"]; ok {
			t.Fatalf("status should be omitted when unchanged, got %v", gotBody)
		}
	})
}

func TestTaskUpdateRejectsInvalidStatus(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an invalid status")
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(taskUpdateCmd)
		if err := taskUpdateCmd.Flags().Set("status", "bogus"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			taskUpdateStatus = ""
			resetFlagChanged(taskUpdateCmd)
		})
		if err := taskUpdateCmd.RunE(taskUpdateCmd, []string{"t1"}); err == nil {
			t.Fatal("expected error for invalid status")
		}
	})
}

func TestTaskDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		taskDeleteForce = true
		t.Cleanup(func() { taskDeleteForce = false })
		if err := taskDeleteCmd.RunE(taskDeleteCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/tasks/t1" {
			t.Fatalf("request = %s %s, want DELETE /api/tasks/t1", gotMethod, gotPath)
		}
	})
}

// =============================================================================
// Task list — filters and status validation
// =============================================================================

func TestTaskListSendsGroupAndStatusFilters(t *testing.T) {
	var gotQuery url.Values
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[],"total":0}}`))
	}, true, func(srv *httptest.Server) {
		taskListGroupID = "g1"
		taskListStatus = "done"
		taskListAll = false
		taskListPage = 1
		taskListPageSize = 10
		t.Cleanup(func() {
			taskListGroupID = ""
			taskListStatus = ""
			taskListAll = false
			taskListPage = 1
			taskListPageSize = 50
		})
		if err := taskListCmd.RunE(taskListCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotQuery.Get("groupId") != "g1" || gotQuery.Get("status") != "done" {
		t.Fatalf("query = %v, want groupId=g1 status=done", gotQuery)
	}
}

func TestTaskListPreRunRejectsInvalidStatus(t *testing.T) {
	taskListStatus = "bogus"
	t.Cleanup(func() { taskListStatus = "" })
	if err := taskListCmd.PreRunE(taskListCmd, nil); err == nil {
		t.Fatal("expected error for invalid status filter")
	}
}

func TestTaskListPreRunAcceptsValidStatus(t *testing.T) {
	taskListStatus = "done"
	t.Cleanup(func() { taskListStatus = "" })
	if err := taskListCmd.PreRunE(taskListCmd, nil); err != nil {
		t.Fatalf("valid status rejected: %v", err)
	}
}

// =============================================================================
// Status helpers
// =============================================================================

func TestTaskStatusHelpers(t *testing.T) {
	for _, ok := range []string{"todo", "done", "abandon"} {
		if err := validateTaskStatus(ok); err != nil {
			t.Errorf("validateTaskStatus(%q) = %v, want nil", ok, err)
		}
	}
	if err := validateTaskStatus("bogus"); err == nil {
		t.Error("validateTaskStatus(bogus) should fail")
	}
	if got := taskStatusLabel("done"); got != "已完成" {
		t.Errorf("taskStatusLabel(done) = %q, want 已完成", got)
	}
	if got := taskStatusLabel("abandon"); got != "已放弃" {
		t.Errorf("taskStatusLabel(abandon) = %q, want 已放弃", got)
	}
	if got := taskStatusLabel("todo"); got != "待办" {
		t.Errorf("taskStatusLabel(todo) = %q, want 待办", got)
	}
	if got := nullableStr(nil); got != "-" {
		t.Errorf("nullableStr(nil) = %q, want -", got)
	}
	v := "2026-08-05T00:00:00Z"
	if got := nullableStr(&v); got != v {
		t.Errorf("nullableStr(&v) = %q, want %q", got, v)
	}
}
