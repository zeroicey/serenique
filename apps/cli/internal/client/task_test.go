package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestCreateTaskPostsBody(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"done","createdAt":"x","updatedAt":"x","completedAt":"x"}}`))
	})

	task, err := c.CreateTask(context.Background(), CreateTaskInput{Title: "hi", GroupID: "g1", Status: "done"})
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/tasks" {
		t.Fatalf("path = %q, want /api/tasks", gotPath)
	}
	if gotBody["title"] != "hi" || gotBody["groupId"] != "g1" || gotBody["status"] != "done" {
		t.Fatalf("body = %v", gotBody)
	}
	if task.ID != "t1" || task.Status != "done" {
		t.Fatalf("task = %+v", task)
	}
	if task.CompletedAt == nil || *task.CompletedAt != "x" {
		t.Fatalf("completedAt = %v, want &x", task.CompletedAt)
	}
}

func TestCreateTaskDefaultsStatusByOmission(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"todo","createdAt":"x","updatedAt":"x","completedAt":null}}`))
	})
	if _, err := c.CreateTask(context.Background(), CreateTaskInput{Title: "hi", GroupID: "g1"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := gotBody["status"]; ok {
		t.Fatalf("status should be omitted when empty (server defaults to todo), got %v", gotBody)
	}
}

func TestUpdateTaskSendsPartialBody(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"新标题","status":"todo","createdAt":"x","updatedAt":"x","completedAt":null}}`))
	})
	title := "新标题"
	if _, err := c.UpdateTask(context.Background(), "t1", UpdateTaskInput{Title: &title}); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/tasks/t1" {
		t.Fatalf("path = %q, want /api/tasks/t1", gotPath)
	}
	if gotBody["title"] != "新标题" {
		t.Fatalf("title = %v, want 新标题", gotBody["title"])
	}
	if _, ok := gotBody["groupId"]; ok {
		t.Fatalf("groupId should be omitted when nil, got %v", gotBody)
	}
}

func TestListTasksUnpacksEnvelope(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tasks" {
			t.Errorf("path = %q, want /api/tasks", r.URL.Path)
		}
		if q := r.URL.Query().Get("groupId"); q != "g1" {
			t.Errorf("groupId = %q, want g1", q)
		}
		if q := r.URL.Query().Get("status"); q != "done" {
			t.Errorf("status = %q, want done", q)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"t1","groupId":"g1","title":"hi","status":"done","createdAt":"x","updatedAt":"x","completedAt":"x"}],"total":1}}`))
	})
	query := url.Values{}
	query.Set("groupId", "g1")
	query.Set("status", "done")
	items, total, err := c.ListTasks(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != "t1" || items[0].Status != "done" {
		t.Fatalf("items = %+v, total = %d", items, total)
	}
}

func TestListTaskGroupsUnpacksEnvelope(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/task-groups" {
			t.Errorf("path = %q, want /api/task-groups", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[{"id":"g1","title":"工作","createdAt":"x","updatedAt":"x"}],"total":1}}`))
	})
	items, total, err := c.ListTaskGroups(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(items) != 1 || items[0].Title != "工作" {
		t.Fatalf("items = %+v, total = %d", items, total)
	}
}

func TestTaskAndGroupCRUDPaths(t *testing.T) {
	// Exercises the remaining typed methods — CreateTaskGroup / GetTaskGroup /
	// UpdateTaskGroup / DeleteTaskGroup / GetTask / DeleteTask — against the
	// documented routes.
	var hits []string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "DELETE" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		switch {
		case strings.HasSuffix(r.URL.Path, "/task-groups"):
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"g1","title":"工作","createdAt":"x","updatedAt":"x"}}`))
		case strings.HasPrefix(r.URL.Path, "/api/task-groups/"):
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"g1","title":"工作","createdAt":"x","updatedAt":"x"}}`))
		case strings.HasPrefix(r.URL.Path, "/api/tasks/"):
			w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"hi","status":"todo","createdAt":"x","updatedAt":"x","completedAt":null}}`))
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	})

	ctx := context.Background()
	if _, err := c.CreateTaskGroup(ctx, "工作"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.GetTaskGroup(ctx, "g1"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.UpdateTaskGroup(ctx, "g1", "新标题"); err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteTaskGroup(ctx, "g1"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.GetTask(ctx, "t1"); err != nil {
		t.Fatal(err)
	}
	if err := c.DeleteTask(ctx, "t1"); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"POST /api/task-groups",
		"GET /api/task-groups/g1",
		"PUT /api/task-groups/g1",
		"DELETE /api/task-groups/g1",
		"GET /api/tasks/t1",
		"DELETE /api/tasks/t1",
	}
	if len(hits) != len(want) {
		t.Fatalf("hits = %v, want %v", hits, want)
	}
	for i, w := range want {
		if hits[i] != w {
			t.Fatalf("hit[%d] = %q, want %q (all hits: %v)", i, hits[i], w, hits)
		}
	}
}
