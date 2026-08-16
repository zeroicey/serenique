package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// habitListJSON renders a fake habit option list response.
func habitListJSON(hs ...map[string]any) string {
	b, _ := json.Marshal(map[string]any{"success": true, "message": "ok", "data": hs})
	return string(b)
}

func habitJSON(id, name, kind string, countable bool) map[string]any {
	return map[string]any{
		"id": id, "name": name, "kind": kind, "countable": countable,
		"sortOrder": 0, "createdAt": "x", "updatedAt": "x",
	}
}

// habitEntryJSON renders a fake single-entry response (create/update shape).
func habitEntryJSON(id, name, kind string, countable bool) string {
	b, _ := json.Marshal(map[string]any{"success": true, "message": "ok", "data": habitJSON(id, name, kind, countable)})
	return string(b)
}

// =============================================================================
// habit create
// =============================================================================

func TestHabitCreateSendsNameKindCountable(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitEntryJSON("h1", "喝水", "good", true)))
	}, true, func(srv *httptest.Server) {
		habitCreateName = "喝水"
		habitCreateGood = true
		habitCreateBad = false
		habitCreateCountable = true
		t.Cleanup(func() {
			habitCreateName, habitCreateGood, habitCreateBad, habitCreateCountable = "", false, false, false
		})
		if err := habitCreateCmd.RunE(habitCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotPath != "/api/habits" {
		t.Fatalf("path = %q, want /api/habits", gotPath)
	}
	if gotBody["name"] != "喝水" || gotBody["kind"] != "good" || gotBody["countable"] != true {
		t.Fatalf("body = %v, want name=喝水 kind=good countable=true", gotBody)
	}
}

func TestHabitCreateRejectsMissingKind(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached without --good/--bad")
	}, true, func(srv *httptest.Server) {
		habitCreateName = "跑步"
		habitCreateGood, habitCreateBad = false, false
		t.Cleanup(func() { habitCreateName = "" })
		if err := habitCreateCmd.RunE(habitCreateCmd, nil); err == nil {
			t.Fatal("expected error when neither --good nor --bad is set")
		}
	})
}

func TestHabitCreateRejectsBothKinds(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached with both --good and --bad")
	}, true, func(srv *httptest.Server) {
		habitCreateName = "跑步"
		habitCreateGood, habitCreateBad = true, true
		t.Cleanup(func() { habitCreateName, habitCreateGood, habitCreateBad = "", false, false })
		if err := habitCreateCmd.RunE(habitCreateCmd, nil); err == nil {
			t.Fatal("expected error when both --good and --bad are set")
		}
	})
}

func TestHabitCreateDefaultsNonCountable(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitEntryJSON("h1", "跑步", "good", false)))
	}, true, func(srv *httptest.Server) {
		habitCreateName = "跑步"
		habitCreateGood, habitCreateBad, habitCreateCountable = true, false, false
		t.Cleanup(func() {
			habitCreateName, habitCreateGood, habitCreateBad, habitCreateCountable = "", false, false, false
		})
		if err := habitCreateCmd.RunE(habitCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	// countable=false 因 omitempty 不序列化；服务端默认 false，省略等价于发送 false。
	if v, ok := gotBody["countable"]; ok && v != false {
		t.Fatalf("countable = %v, want false by default", gotBody["countable"])
	}
}

// =============================================================================
// habit list
// =============================================================================

func TestHabitListDecodesEntries(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/habits" {
			t.Errorf("path = %q, want /api/habits", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitListJSON(habitJSON("h1", "跑步", "good", false), habitJSON("h2", "喝水", "good", true))))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		if err := habitListCmd.RunE(habitListCmd, nil); err != nil {
			t.Fatal(err)
		}
		items, ok := rec.lastSuccess.data.([]client.HabitEntry)
		if !ok {
			t.Fatalf("data is %T, want []client.HabitEntry", rec.lastSuccess.data)
		}
		if len(items) != 2 || items[1].Name != "喝水" || !items[1].Countable {
			t.Fatalf("entries = %+v", items)
		}
	})
}

// =============================================================================
// habit update
// =============================================================================

func TestHabitUpdateSendsOnlyChangedFields(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitEntryJSON("h1", "新名", "good", false)))
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(habitUpdateCmd)
		if err := habitUpdateCmd.Flags().Set("name", "新名"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			habitUpdateName = ""
			resetFlagChanged(habitUpdateCmd)
		})
		if err := habitUpdateCmd.RunE(habitUpdateCmd, []string{"h1"}); err != nil {
			t.Fatal(err)
		}
		if gotBody["name"] != "新名" {
			t.Fatalf("name = %v, want 新名", gotBody["name"])
		}
		if _, ok := gotBody["kind"]; ok {
			t.Fatalf("kind should be omitted when unchanged, got %v", gotBody)
		}
		if _, ok := gotBody["countable"]; ok {
			t.Fatalf("countable should be omitted when unchanged, got %v", gotBody)
		}
	})
}

func TestHabitUpdateSendsKindAndCountable(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitEntryJSON("h1", "跑步", "bad", true)))
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(habitUpdateCmd)
		habitUpdateBad = true
		if err := habitUpdateCmd.Flags().Set("countable", "true"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			habitUpdateBad = false
			resetFlagChanged(habitUpdateCmd)
		})
		if err := habitUpdateCmd.RunE(habitUpdateCmd, []string{"h1"}); err != nil {
			t.Fatal(err)
		}
		if gotBody["kind"] != "bad" || gotBody["countable"] != true {
			t.Fatalf("body = %v, want kind=bad countable=true", gotBody)
		}
	})
}

func TestHabitUpdateRequiresField(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached when no update field is provided")
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(habitUpdateCmd)
		habitUpdateGood, habitUpdateBad = false, false
		t.Cleanup(func() { resetFlagChanged(habitUpdateCmd) })
		if err := habitUpdateCmd.RunE(habitUpdateCmd, []string{"h1"}); err == nil {
			t.Fatal("expected error when no update field is provided")
		}
	})
}

func TestHabitUpdateRejectsBothKinds(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached with both --good and --bad")
	}, true, func(srv *httptest.Server) {
		habitUpdateGood, habitUpdateBad = true, true
		t.Cleanup(func() { habitUpdateGood, habitUpdateBad = false, false })
		if err := habitUpdateCmd.RunE(habitUpdateCmd, []string{"h1"}); err == nil {
			t.Fatal("expected error when both --good and --bad are set")
		}
	})
}

func TestHabitUpdateRejectsBothCountableFlags(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached with both --countable and --no-countable")
	}, true, func(srv *httptest.Server) {
		resetFlagChanged(habitUpdateCmd)
		if err := habitUpdateCmd.Flags().Set("countable", "true"); err != nil {
			t.Fatal(err)
		}
		if err := habitUpdateCmd.Flags().Set("no-countable", "true"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { resetFlagChanged(habitUpdateCmd) })
		if err := habitUpdateCmd.RunE(habitUpdateCmd, []string{"h1"}); err == nil {
			t.Fatal("expected error when both --countable and --no-countable are set")
		}
	})
}

// =============================================================================
// habit delete
// =============================================================================

func TestHabitDeleteIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		habitDeleteForce = true
		t.Cleanup(func() { habitDeleteForce = false })
		if err := habitDeleteCmd.RunE(habitDeleteCmd, []string{"h1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/habits/h1" {
			t.Fatalf("request = %s %s, want DELETE /api/habits/h1", gotMethod, gotPath)
		}
	})
}

// =============================================================================
// habit do / not
// =============================================================================

// habitServerWithHabit mocks a server that serves the given habit option list
// and records the daily-set PUT request body/path.
func habitSetDailyServer(t *testing.T, habitsJSON string, method *string, path *string, body *map[string]any) {
	t.Helper()
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/habits" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitsJSON))
			return
		}
		*method, *path = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, body)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"habitId":"h1","status":"done","count":0,"note":null}}`))
	}, true, func(srv *httptest.Server) {})
}

func TestHabitDoSendsStatusDone(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	habitSetDailyServer(t, habitListJSON(habitJSON("h1", "跑步", "good", false)), &gotMethod, &gotPath, &gotBody)

	habitDoDate = "2026-08-16"
	habitDoUndo = false
	t.Cleanup(func() { habitDoDate, habitDoUndo = "", false })
	if err := habitDoCmd.RunE(habitDoCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotMethod != "PUT" || gotPath != "/api/habits/h1/daily/2026-08-16" {
		t.Fatalf("request = %s %s, want PUT /api/habits/h1/daily/2026-08-16", gotMethod, gotPath)
	}
	if gotBody["status"] != "done" {
		t.Fatalf("status = %v, want done", gotBody["status"])
	}
}

func TestHabitDoSendsNote(t *testing.T) {
	var gotBody map[string]any
	var method, path string
	habitSetDailyServer(t, habitListJSON(habitJSON("h1", "跑步", "good", false)), &method, &path, &gotBody)

	habitDoDate, habitDoUndo = "2026-08-16", false
	if err := habitDoCmd.Flags().Set("note", "5km"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		habitDoDate, habitDoUndo = "", false
		resetFlagChanged(habitDoCmd)
	})
	if err := habitDoCmd.RunE(habitDoCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotBody["note"] != "5km" {
		t.Fatalf("note = %v, want 5km", gotBody["note"])
	}
}

func TestHabitNotSendsStatusNotDone(t *testing.T) {
	var gotBody map[string]any
	var method, path string
	habitSetDailyServer(t, habitListJSON(habitJSON("h1", "熬夜", "bad", false)), &method, &path, &gotBody)

	habitNotDate, habitNotUndo = "2026-08-16", false
	t.Cleanup(func() { habitNotDate, habitNotUndo = "", false })
	if err := habitNotCmd.RunE(habitNotCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotBody["status"] != "not_done" {
		t.Fatalf("status = %v, want not_done", gotBody["status"])
	}
}

func TestHabitDoRejectsCountableHabit(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitListJSON(habitJSON("h1", "喝水", "good", true))))
	}, true, func(srv *httptest.Server) {
		habitDoDate, habitDoUndo = "2026-08-16", false
		t.Cleanup(func() { habitDoDate, habitDoUndo = "", false })
		err := habitDoCmd.RunE(habitDoCmd, []string{"h1"})
		if err == nil {
			t.Fatal("expected error when marking a countable habit with do")
		}
		if !strings.Contains(err.Error(), "计数型") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHabitDoUndoClearsDaily(t *testing.T) {
	var gotMethod, gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/habits" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitListJSON(habitJSON("h1", "跑步", "good", false))))
			return
		}
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}, true, func(srv *httptest.Server) {
		habitDoDate, habitDoUndo = "2026-08-16", true
		t.Cleanup(func() { habitDoDate, habitDoUndo = "", false })
		if err := habitDoCmd.RunE(habitDoCmd, []string{"h1"}); err != nil {
			t.Fatal(err)
		}
		if gotMethod != "DELETE" || gotPath != "/api/habits/h1/daily/2026-08-16" {
			t.Fatalf("request = %s %s, want DELETE /api/habits/h1/daily/2026-08-16", gotMethod, gotPath)
		}
	})
}

// =============================================================================
// habit count
// =============================================================================

func TestHabitCountSetSendsCount(t *testing.T) {
	var gotBody map[string]any
	var method, path string
	habitSetDailyServer(t, habitListJSON(habitJSON("h1", "喝水", "good", true)), &method, &path, &gotBody)

	habitCountDate, habitCountSet = "2026-08-16", 8
	habitCountInc, habitCountDec = false, false
	if err := habitCountCmd.Flags().Set("set", "8"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		habitCountDate, habitCountSet = "", -1
		resetFlagChanged(habitCountCmd)
	})
	if err := habitCountCmd.RunE(habitCountCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotBody["count"] != float64(8) {
		t.Fatalf("count = %v, want 8", gotBody["count"])
	}
}

func TestHabitCountIncIncrementsCurrent(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/habits":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitListJSON(habitJSON("h1", "喝水", "good", true))))
		case "/api/habit-daily":
			// 当前 count=2，--inc 应 PUT count=3
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"message":"ok","data":[{"habitId":"h1","status":null,"count":2,"note":null}]}`))
		default:
			b, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(b, &gotBody)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"message":"ok","data":{"habitId":"h1","status":null,"count":3,"note":null}}`))
		}
	}, true, func(srv *httptest.Server) {})

	habitCountDate, habitCountSet = "2026-08-16", -1
	habitCountInc, habitCountDec = true, false
	if err := habitCountCmd.Flags().Set("inc", "true"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		habitCountDate, habitCountSet = "", -1
		resetFlagChanged(habitCountCmd)
	})
	if err := habitCountCmd.RunE(habitCountCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotBody["count"] != float64(3) {
		t.Fatalf("count = %v, want 3 (current 2 + 1)", gotBody["count"])
	}
}

func TestHabitCountDecFloorAtZero(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/habits":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitListJSON(habitJSON("h1", "喝水", "good", true))))
		case "/api/habit-daily":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"message":"ok","data":[{"habitId":"h1","status":null,"count":0,"note":null}]}`))
		default:
			b, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(b, &gotBody)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"message":"ok","data":{"habitId":"h1","status":null,"count":0,"note":null}}`))
		}
	}, true, func(srv *httptest.Server) {})

	habitCountDate, habitCountSet = "2026-08-16", -1
	habitCountInc, habitCountDec = false, true
	if err := habitCountCmd.Flags().Set("dec", "true"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		habitCountDate, habitCountSet = "", -1
		resetFlagChanged(habitCountCmd)
	})
	if err := habitCountCmd.RunE(habitCountCmd, []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	if gotBody["count"] != float64(0) {
		t.Fatalf("count = %v, want 0 (floor at zero)", gotBody["count"])
	}
}

func TestHabitCountRejectsNoMode(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached without --set/--inc/--dec")
	}, true, func(srv *httptest.Server) {
		habitCountDate, habitCountSet = "2026-08-16", -1
		habitCountInc, habitCountDec = false, false
		t.Cleanup(func() { habitCountDate, habitCountSet = "", -1 })
		if err := habitCountCmd.RunE(habitCountCmd, []string{"h1"}); err == nil {
			t.Fatal("expected error without --set/--inc/--dec")
		}
	})
}

func TestHabitCountRejectsNonCountable(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(habitListJSON(habitJSON("h1", "跑步", "good", false))))
	}, true, func(srv *httptest.Server) {
		habitCountDate, habitCountSet = "2026-08-16", -1
		habitCountInc, habitCountDec = false, false
		t.Cleanup(func() { habitCountDate, habitCountSet = "", -1 })
		if err := habitCountCmd.Flags().Set("set", "3"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { resetFlagChanged(habitCountCmd) })
		err := habitCountCmd.RunE(habitCountCmd, []string{"h1"})
		if err == nil {
			t.Fatal("expected error when counting a non-countable habit")
		}
		if !strings.Contains(err.Error(), "做没做型") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

// =============================================================================
// habit today
// =============================================================================

func TestHabitTodayFetchesDateQuery(t *testing.T) {
	var gotQuery url.Values
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/habits" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitListJSON(habitJSON("h1", "跑步", "good", false))))
			return
		}
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[{"habitId":"h1","status":"done","count":0,"note":"5km"}]}`))
	}, true, func(srv *httptest.Server) {
		habitTodayDate = "2026-08-16"
		t.Cleanup(func() { habitTodayDate = "" })
		if err := habitTodayCmd.RunE(habitTodayCmd, nil); err != nil {
			t.Fatal(err)
		}
		if gotQuery.Get("date") != "2026-08-16" {
			t.Fatalf("date query = %q, want 2026-08-16", gotQuery.Get("date"))
		}
	})
}

// =============================================================================
// habit overview
// =============================================================================

func TestHabitOverviewSendsDaysAndDecodes(t *testing.T) {
	var gotQuery url.Values
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"days":7,"byDate":{"2026-08-16":[{"habitId":"h1","name":"跑步","kind":"good","status":"done","count":0,"note":null}]},"stats":[{"habitId":"h1","name":"跑步","kind":"good","countable":false,"doneDays":4,"notDoneDays":1,"totalCount":0}]}}`))
	}, true, func(srv *httptest.Server) {
		rec := &recordingPrinter{}
		printer = rec
		habitOverviewDays = 7
		t.Cleanup(func() { habitOverviewDays = 30 })
		if err := habitOverviewCmd.RunE(habitOverviewCmd, nil); err != nil {
			t.Fatal(err)
		}
		if gotQuery.Get("days") != "7" {
			t.Fatalf("days query = %q, want 7", gotQuery.Get("days"))
		}
		ov, ok := rec.lastSuccess.data.(*client.HabitOverview)
		if !ok {
			t.Fatalf("data is %T, want *client.HabitOverview", rec.lastSuccess.data)
		}
		if ov.Days != 7 || len(ov.Stats) != 1 || ov.Stats[0].DoneDays != 4 {
			t.Fatalf("overview = %+v", ov)
		}
	})
}

func TestHabitOverviewRejectsBadDays(t *testing.T) {
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("server should not be reached with invalid days")
	}, true, func(srv *httptest.Server) {
		for _, days := range []int{0, 366} {
			habitOverviewDays = days
			if err := habitOverviewCmd.RunE(habitOverviewCmd, nil); err == nil {
				t.Fatalf("days=%d should be rejected", days)
			}
		}
		habitOverviewDays = 30
	})
}

// =============================================================================
// Helpers
// =============================================================================

func TestHabitStatusLabels(t *testing.T) {
	if got := habitKindLabel(client.HabitKindGood); got != "好事" {
		t.Errorf("habitKindLabel(good) = %q, want 好事", got)
	}
	if got := habitKindLabel(client.HabitKindBad); got != "坏事" {
		t.Errorf("habitKindLabel(bad) = %q, want 坏事", got)
	}
	if got := habitTypeLabel(true); got != "计数型" {
		t.Errorf("habitTypeLabel(true) = %q, want 计数型", got)
	}
	if got := habitTypeLabel(false); got != "做没做型" {
		t.Errorf("habitTypeLabel(false) = %q, want 做没做型", got)
	}

	// 做没做型三态
	if got := habitStatusLabel(client.HabitDailyEntry{HabitID: "h1"}, false); got != "未记录" {
		t.Errorf("nil status = %q, want 未记录", got)
	}
	done := client.HabitStatusDone
	if got := habitStatusLabel(client.HabitDailyEntry{Status: &done}, false); got != "✓ 做了" {
		t.Errorf("done = %q, want ✓ 做了", got)
	}
	notDone := client.HabitStatusNotDone
	if got := habitStatusLabel(client.HabitDailyEntry{Status: &notDone}, false); got != "✗ 没做" {
		t.Errorf("not_done = %q, want ✗ 没做", got)
	}
	// 计数型
	if got := habitStatusLabel(client.HabitDailyEntry{Count: 0}, true); got != "未记录" {
		t.Errorf("count 0 = %q, want 未记录", got)
	}
	if got := habitStatusLabel(client.HabitDailyEntry{Count: 3}, true); got != "×3" {
		t.Errorf("count 3 = %q, want ×3", got)
	}
}

func TestValidateHabitDate(t *testing.T) {
	for _, ok := range []string{"2026-08-16", "2024-02-29", "2000-01-01"} {
		if err := validateHabitDate(ok, "--date"); err != nil {
			t.Errorf("validateHabitDate(%q) = %v, want nil", ok, err)
		}
	}
	for _, bad := range []string{"", "2026-8-16", "2026-08-16T00:00:00Z", "2026-02-30", "2026-13-01", "abc", "2026-08-1"} {
		if err := validateHabitDate(bad, "--date"); err == nil {
			t.Errorf("validateHabitDate(%q) should fail", bad)
		}
	}
}

func TestHabitOverviewItemLine(t *testing.T) {
	done := client.HabitStatusDone
	notDone := client.HabitStatusNotDone
	note := "5km"

	if got := habitOverviewItemLine(client.HabitOverviewItem{Name: "跑步", Status: &done, Count: 0}); got != "✓ 跑步" {
		t.Errorf("done line = %q, want ✓ 跑步", got)
	}
	if got := habitOverviewItemLine(client.HabitOverviewItem{Name: "熬夜", Status: &notDone, Count: 0}); got != "✗ 熬夜" {
		t.Errorf("not_done line = %q, want ✗ 熬夜", got)
	}
	if got := habitOverviewItemLine(client.HabitOverviewItem{Name: "跑步", Status: &done, Count: 0, Note: &note}); got != "✓ 跑步 — 5km" {
		t.Errorf("note line = %q, want ✓ 跑步 — 5km", got)
	}
	if got := habitOverviewItemLine(client.HabitOverviewItem{Name: "喝水", Status: nil, Count: 3}); got != "×3 喝水" {
		t.Errorf("count line = %q, want ×3 喝水", got)
	}
}

// 编译期确认：do/not 共享逻辑走同一 helper，且默认日期使用本地今天。
func TestHabitDoDefaultsToToday(t *testing.T) {
	var gotPath string
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/habits" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(habitListJSON(habitJSON("h1", "跑步", "good", false))))
			return
		}
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"habitId":"h1","status":"done","count":0,"note":null}}`))
	}, true, func(srv *httptest.Server) {
		habitDoDate, habitDoUndo = "", false
		t.Cleanup(func() { habitDoDate, habitDoUndo = "", false })
		if err := habitDoCmd.RunE(habitDoCmd, []string{"h1"}); err != nil {
			t.Fatal(err)
		}
		want := "/api/habits/h1/daily/" + time.Now().Format("2006-01-02")
		if gotPath != want {
			t.Fatalf("path = %q, want %q (local today)", gotPath, want)
		}
	})
}

// ensureHabitCommandsRegistered 确保 habitCmd 挂在 root 下（编译期 + 运行期双保险）。
func TestHabitCommandRegistered(t *testing.T) {
	found := false
	for _, c := range rootCmd.Commands() {
		if c == habitCmd {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("habitCmd not registered on rootCmd")
	}
}

var _ *cobra.Command = habitTodayCmd
