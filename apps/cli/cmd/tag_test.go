package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zeroicey/serenique-cli/internal/client"
)

const tagResponseJSON = `{"id":"t1","name":"work","momentCount":2,"createdAt":"2026-08-08T01:00:00Z","updatedAt":"2026-08-08T01:00:00Z"}`

// =============================================================================
// tag create
// =============================================================================

func TestTagCreateSendsName(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	var rec *recordingPrinter
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":` + tagResponseJSON + `}`))
	}, true, func(srv *httptest.Server) {
		rec = &recordingPrinter{}
		printer = rec
		tagCreateName = "工作"
		t.Cleanup(func() { tagCreateName = "" })
		if err := tagCreateCmd.RunE(tagCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/tags" {
		t.Fatalf("path = %q, want /api/tags", gotPath)
	}
	if gotBody["name"] != "工作" {
		t.Fatalf("name = %v, want 工作", gotBody["name"])
	}
	tag, ok := rec.lastSuccess.data.(*client.TagEntry)
	if !ok {
		t.Fatalf("data is %T, want *client.TagEntry", rec.lastSuccess.data)
	}
	if tag.ID != "t1" || tag.MomentCount != 2 {
		t.Fatalf("tag = %+v", tag)
	}
}

func TestTagCreateMapsDuplicateToError(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"success":false,"message":"标签已存在","error":{"code":"CONFLICT"}}`))
	}, true, func(srv *httptest.Server) {
		tagCreateName = "工作"
		t.Cleanup(func() { tagCreateName = "" })
		if err := tagCreateCmd.RunE(tagCreateCmd, nil); err == nil {
			t.Fatal("expected error for duplicate tag name")
		}
	})
}

// =============================================================================
// tag list
// =============================================================================

func TestTagListDecodesEnvelope(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Errorf("path = %q, want /api/tags", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[` + tagResponseJSON + `],"total":1}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		tagListPage = 1
		tagListPageSize = 10
		tagListAll = false
		t.Cleanup(func() {
			tagListPage = 1
			tagListPageSize = 50
			tagListAll = false
		})
		if err := tagListCmd.RunE(tagListCmd, nil); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(map[string]any)
		if !ok {
			t.Fatalf("data is %T, want map[string]any", rec.lastSuccess.data)
		}
		if data["total"] != 1 {
			t.Fatalf("total = %v, want 1", data["total"])
		}
		items, ok := data["items"].([]client.TagEntry)
		if !ok || len(items) != 1 {
			t.Fatalf("items = %T %v, want 1 TagEntry", data["items"], data["items"])
		}
		if items[0].Name != "work" || items[0].MomentCount != 2 {
			t.Fatalf("items[0] = %+v", items[0])
		}
	})
}

// =============================================================================
// tag get
// =============================================================================

func TestTagGetDecodesEntry(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags/t1" {
			t.Errorf("path = %q, want /api/tags/t1", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":` + tagResponseJSON + `}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := tagGetCmd.RunE(tagGetCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		data, ok := rec.lastSuccess.data.(*client.TagEntry)
		if !ok {
			t.Fatalf("data is %T, want *client.TagEntry", rec.lastSuccess.data)
		}
		if data.ID != "t1" || data.Name != "work" || data.MomentCount != 2 {
			t.Fatalf("entry = %+v", data)
		}
	})
}

// =============================================================================
// tag rename
// =============================================================================

func TestTagRenameSendsPut(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":` + tagResponseJSON + `}`))
	}, true, func(srv *httptest.Server) {
		tagRenameName = "工作"
		t.Cleanup(func() { tagRenameName = "" })
		if err := tagRenameCmd.RunE(tagRenameCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotMethod != "PUT" || gotPath != "/api/tags/t1" {
		t.Fatalf("request = %s %s, want PUT /api/tags/t1", gotMethod, gotPath)
	}
	if gotBody["name"] != "工作" {
		t.Fatalf("name = %v, want 工作", gotBody["name"])
	}
}

// =============================================================================
// tag delete
// =============================================================================

func TestTagDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		tagDeleteForce = true
		t.Cleanup(func() { tagDeleteForce = false })
		if err := tagDeleteCmd.RunE(tagDeleteCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/tags/t1" {
			t.Fatalf("request = %s %s, want DELETE /api/tags/t1", gotMethod, gotPath)
		}
		if rec.lastSuccess.message != "标签已删除" {
			t.Fatalf("message = %q, want 标签已删除", rec.lastSuccess.message)
		}
	})
}

func TestTagDeleteRequiresConfirmation(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when confirmation is declined")
	}, true, func(srv *httptest.Server) {
		withStdin(t, "") // immediate EOF — the pipe/CI/AI-agent case
		tagDeleteForce = false
		t.Cleanup(func() { tagDeleteForce = false })
		if err := tagDeleteCmd.RunE(tagDeleteCmd, []string{"t1"}); err == nil {
			t.Fatal("expected error when confirmation is not provided")
		}
	})
}

// =============================================================================
// tag attach / detach
// =============================================================================

func TestTagAttachSendsOwnerPair(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"r1","tagId":"t1","ownerType":"moment","ownerId":"m1","createdAt":"2026-08-08T01:00:00Z"}}`))
	}, true, func(srv *httptest.Server) {
		tagAttachOwnerType = "moment"
		tagAttachOwnerID = "m1"
		t.Cleanup(func() { tagAttachOwnerType, tagAttachOwnerID = "", "" })
		if err := tagAttachCmd.RunE(tagAttachCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/tags/t1/attach" {
		t.Fatalf("path = %q, want /api/tags/t1/attach", gotPath)
	}
	if gotBody["ownerType"] != "moment" || gotBody["ownerId"] != "m1" {
		t.Fatalf("body = %v, want ownerType=moment ownerId=m1", gotBody)
	}
}

func TestTagAttachRejectsUnknownOwnerType(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached for an unsupported owner-type")
	}, true, func(srv *httptest.Server) {
		tagAttachOwnerType = "diary"
		tagAttachOwnerID = "d1"
		t.Cleanup(func() { tagAttachOwnerType, tagAttachOwnerID = "", "" })
		err := tagAttachCmd.RunE(tagAttachCmd, []string{"t1"})
		if err == nil {
			t.Fatal("expected error for unsupported owner-type")
		}
		if !strings.Contains(err.Error(), "moment") {
			t.Fatalf("error should point at the supported owner-type, got %v", err)
		}
	})
}

func TestTagDetachSendsDelete(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		tagDetachOwnerType = "moment"
		tagDetachOwnerID = "m1"
		t.Cleanup(func() { tagDetachOwnerType, tagDetachOwnerID = "", "" })
		if err := tagDetachCmd.RunE(tagDetachCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
	})
	if gotMethod != "DELETE" || gotPath != "/api/tags/t1/detach" {
		t.Fatalf("request = %s %s, want DELETE /api/tags/t1/detach", gotMethod, gotPath)
	}
	if gotBody["ownerType"] != "moment" || gotBody["ownerId"] != "m1" {
		t.Fatalf("body = %v, want ownerType=moment ownerId=m1", gotBody)
	}
}

// =============================================================================
// Helpers
// =============================================================================

func TestValidateTagOwnerType(t *testing.T) {
	if err := validateTagOwnerType(client.TagOwnerTypeMoment); err != nil {
		t.Fatalf("moment owner-type rejected: %v", err)
	}
	for _, bad := range []string{"", "diary", "MOMENT", "event"} {
		if err := validateTagOwnerType(bad); err == nil {
			t.Errorf("validateTagOwnerType(%q) should fail", bad)
		}
	}
}

// TestTagCommandsRegistered verifies the tag subtree hangs under rootCmd with
// the expected subcommands.
func TestTagCommandsRegistered(t *testing.T) {
	rootFound, _, err := rootCmd.Find([]string{"tag"})
	if err != nil {
		t.Fatalf("tag command not found under root: %v", err)
	}
	if rootFound != tagCmd {
		t.Fatalf("root tag = %v, want tagCmd", rootFound)
	}
	names := map[string]bool{}
	for _, c := range tagCmd.Commands() {
		names[c.Name()] = true
	}
	for _, want := range []string{"list", "create", "get", "rename", "delete", "attach", "detach"} {
		if !names[want] {
			t.Errorf("tag %s not registered", want)
		}
	}
}
