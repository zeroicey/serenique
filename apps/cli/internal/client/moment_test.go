package client

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// TestUpdateMomentSendsPutPathAndBody verifies UpdateMoment issues PUT
// /api/moments/:id with a JSON body of {"text": ...} (the only updatable
// field, per the API's UpdateMomentSchema) and decodes the full entry.
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

	moment, err := c.UpdateMoment(context.Background(), "m1", "改后")
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

// TestUpdateMomentMapsNotFound verifies a 404 (闪念不存在) surfaces as an
// *APIError instead of being swallowed.
func TestUpdateMomentMapsNotFound(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"success":false,"message":"闪念不存在","error":{"code":"NOT_FOUND"}}`))
	})

	_, err := c.UpdateMoment(context.Background(), "nope", "x")
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
