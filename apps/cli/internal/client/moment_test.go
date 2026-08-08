package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"testing"
)

// TestUpdateMomentSendsPutPathAndBody verifies UpdateMoment issues PUT
// /api/moments/:id with a JSON body of {"text": ...} when no location is given
// (old text-only edits must keep the location unchanged) and decodes the full
// entry.
func TestUpdateMomentSendsPutPathAndBody(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"闪念更新成功","data":{"id":"m1","text":"改后","createdAt":"x","updatedAt":"y","attachments":[],"comments":[],"commentCount":0}}`))
	})

	moment, err := c.UpdateMoment(context.Background(), "m1", UpdateMomentInput{Text: "改后"})
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != "PUT" || gotPath != "/api/moments/m1" {
		t.Fatalf("request = %s %s, want PUT /api/moments/m1", gotMethod, gotPath)
	}
	if len(gotBody) != 1 || gotBody["text"] != "改后" {
		t.Fatalf("body = %v, want {\"text\":\"改后\"}", gotBody)
	}
	if moment.ID != "m1" || moment.Text != "改后" || moment.UpdatedAt != "y" {
		t.Fatalf("moment = %+v", moment)
	}
}

// TestUpdateMomentLocationThreeState verifies the location body contract:
// non-nil Location sends an object, ClearLocation sends an explicit null, and
// neither (plain text edit) omits the field entirely.
func TestUpdateMomentLocationThreeState(t *testing.T) {
	for _, tc := range []struct {
		name      string
		input     UpdateMomentInput
		wantField bool
		wantBody  any
	}{
		{
			name:      "text only omits location",
			input:     UpdateMomentInput{Text: "t"},
			wantField: false,
		},
		{
			name: "set location object",
			input: UpdateMomentInput{
				Text:     "t",
				Location: &MomentLocation{Name: ptr("北京·三里屯"), Latitude: ptr(39.9), Longitude: ptr(116.4)},
			},
			wantField: true,
			wantBody:  map[string]any{"name": "北京·三里屯", "latitude": 39.9, "longitude": 116.4},
		},
		{
			name:      "coordinates only",
			input:     UpdateMomentInput{Text: "t", Location: &MomentLocation{Latitude: ptr(31.2)}},
			wantField: true,
			wantBody:  map[string]any{"latitude": 31.2},
		},
		{
			name:      "clear sends explicit null",
			input:     UpdateMomentInput{Text: "t", ClearLocation: true},
			wantField: true,
			wantBody:  nil,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var gotBody map[string]any
			_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				b, _ := io.ReadAll(r.Body)
				_ = json.Unmarshal(b, &gotBody)
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"t","createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
			})
			if _, err := c.UpdateMoment(context.Background(), "m1", tc.input); err != nil {
				t.Fatal(err)
			}
			loc, ok := gotBody["location"]
			if !tc.wantField {
				if ok {
					t.Fatalf("body = %v, want no location field", gotBody)
				}
				return
			}
			if !ok {
				t.Fatalf("body = %v, want a location field", gotBody)
			}
			if loc == nil {
				if tc.wantBody != nil {
					t.Fatalf("location = null, want %v", tc.wantBody)
				}
				return
			}
			obj := loc.(map[string]any)
			want := tc.wantBody.(map[string]any)
			if len(obj) != len(want) {
				t.Fatalf("location = %v, want %v", obj, want)
			}
			for k, v := range want {
				if obj[k] != v {
					t.Fatalf("location[%s] = %v, want %v", k, obj[k], v)
				}
			}
		})
	}
}

// TestMomentEntryDecodesLocation guards the round-trip contract: the API's
// optional location object must survive decode into MomentEntry so
// `moment get/list --json` never drops it, and a missing/null location decodes
// to nil.
func TestMomentEntryDecodesLocation(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","location":{"name":"北京·三里屯","latitude":39.9,"longitude":116.4},"createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
	})

	var m MomentEntry
	if err := c.Get(context.Background(), "/api/moments/m1", nil, &m); err != nil {
		t.Fatal(err)
	}
	if m.Location == nil || m.Location.Name == nil || *m.Location.Name != "北京·三里屯" {
		t.Fatalf("location = %+v, want name 北京·三里屯", m.Location)
	}
	if m.Location.Latitude == nil || *m.Location.Latitude != 39.9 || m.Location.Longitude == nil || *m.Location.Longitude != 116.4 {
		t.Fatalf("location = %+v, want 39.9/116.4", m.Location)
	}
}

// TestMomentEntryNullLocationDecodesToNil verifies `"location": null` and a
// missing field both decode to a nil Location (old servers never sent it).
func TestMomentEntryNullLocationDecodesToNil(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","location":null,"createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0}}`))
	})

	var m MomentEntry
	if err := c.Get(context.Background(), "/api/moments/m1", nil, &m); err != nil {
		t.Fatal(err)
	}
	if m.Location != nil {
		t.Fatalf("location = %+v, want nil", m.Location)
	}
}

func ptr[T any](v T) *T { return &v }

// TestUpdateMomentMapsNotFound verifies a 404 (闪念不存在) surfaces as an
// *APIError instead of being swallowed.
func TestUpdateMomentMapsNotFound(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"闪念不存在","error":{"code":"NOT_FOUND"}}`))
	})

	_, err := c.UpdateMoment(context.Background(), "nope", UpdateMomentInput{Text: "x"})
	if err == nil {
		t.Fatal("expected error for missing moment")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("error is %T, want *APIError", err)
	}
	if apiErr.Message != "闪念不存在" || apiErr.HTTPStatus != 404 {
		t.Fatalf("apiErr = %+v", apiErr)
	}
}

// =============================================================================
// Moment tags
// =============================================================================

// TestMomentEntryDecodesTags guards the round-trip contract: the API's embedded
// tags[] on moment responses must survive decode into MomentEntry so
// `moment get/list --json` never silently drops them (Go's json decoder
// ignores unknown fields, so a missing field would fail silently).
func TestMomentEntryDecodesTags(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"m1","text":"hi","createdAt":"x","updatedAt":"x","attachments":[],"comments":[],"commentCount":0,"tags":[{"id":"t1","name":"work","momentCount":2,"createdAt":"x","updatedAt":"x"},{"id":"t2","name":"重要","momentCount":1,"createdAt":"x","updatedAt":"x"}]}}`))
	})

	var m MomentEntry
	if err := c.Get(context.Background(), "/api/moments/m1", nil, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Tags) != 2 {
		t.Fatalf("tags = %d, want 2 (silently dropped tags break the round-trip contract)", len(m.Tags))
	}
	if m.Tags[0].ID != "t1" || m.Tags[0].Name != "work" || m.Tags[0].MomentCount != 2 {
		t.Fatalf("tags[0] = %+v", m.Tags[0])
	}
	if m.Tags[1].Name != "重要" {
		t.Fatalf("tags[1] = %+v, want name 重要", m.Tags[1])
	}
}

func TestListMomentsPassesQuery(t *testing.T) {
	var gotQuery url.Values
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/moments" {
			t.Errorf("path = %q, want /api/moments", r.URL.Path)
		}
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"items":[],"total":0}}`))
	})

	query := url.Values{}
	query.Set("tag", "t1")
	_, total, err := c.ListMoments(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery.Get("tag") != "t1" {
		t.Fatalf("query = %v, want tag=t1", gotQuery)
	}
	if total != 0 {
		t.Fatalf("total = %d, want 0", total)
	}
}

func TestAddMomentTagPostsTagID(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"r1","tagId":"t1","ownerType":"moment","ownerId":"m1","createdAt":"x"}}`))
	})

	rel, err := c.AddMomentTag(context.Background(), "m1", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != "POST" || gotPath != "/api/moments/m1/tags" {
		t.Fatalf("request = %s %s, want POST /api/moments/m1/tags", gotMethod, gotPath)
	}
	if gotBody["tagId"] != "t1" {
		t.Fatalf("body = %v, want tagId=t1", gotBody)
	}
	if rel.OwnerID != "m1" || rel.TagID != "t1" {
		t.Fatalf("relation = %+v", rel)
	}
}

func TestRemoveMomentTagIssuesDelete(t *testing.T) {
	var gotMethod, gotPath string
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	})

	if err := c.RemoveMomentTag(context.Background(), "m1", "t1"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != "DELETE" || gotPath != "/api/moments/m1/tags/t1" {
		t.Fatalf("request = %s %s, want DELETE /api/moments/m1/tags/t1", gotMethod, gotPath)
	}
}

func TestReplaceMomentTagsSendsTagIDsAndDecodesResult(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		// The PUT answers with the new tags[] (bare array), per the API contract.
		w.Write([]byte(`{"success":true,"message":"ok","data":[{"id":"t1","name":"work","momentCount":1,"createdAt":"x","updatedAt":"x"}]}`))
	})

	tags, err := c.ReplaceMomentTags(context.Background(), "m1", []string{"t1", "t2"})
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != "PUT" || gotPath != "/api/moments/m1/tags" {
		t.Fatalf("request = %s %s, want PUT /api/moments/m1/tags", gotMethod, gotPath)
	}
	if gotBody["tagIds"] == nil {
		t.Fatalf("body = %v, want tagIds array", gotBody)
	}
	ids, ok := gotBody["tagIds"].([]any)
	if !ok || len(ids) != 2 || ids[0] != "t1" || ids[1] != "t2" {
		t.Fatalf("tagIds = %v, want [t1 t2]", gotBody["tagIds"])
	}
	if len(tags) != 1 || tags[0].ID != "t1" {
		t.Fatalf("tags = %+v, want [t1]", tags)
	}
}

func TestReplaceMomentTagsEmptyArrayClears(t *testing.T) {
	var gotBody map[string]any
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":[]}`))
	})

	tags, err := c.ReplaceMomentTags(context.Background(), "m1", []string{})
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 0 {
		t.Fatalf("tags = %+v, want empty", tags)
	}
	ids, ok := gotBody["tagIds"].([]any)
	if !ok || len(ids) != 0 {
		t.Fatalf("tagIds = %v (%T), want empty array (clearing, not null)", gotBody["tagIds"], gotBody["tagIds"])
	}
}
