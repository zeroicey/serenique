package client

import (
	"context"
	"net/url"
)

// MomentEntry mirrors the API's MomentEntry response (moment.types.ts).
type MomentEntry struct {
	ID           string                  `json:"id"`
	Text         string                  `json:"text"`
	CreatedAt    string                  `json:"createdAt"`
	UpdatedAt    string                  `json:"updatedAt"`
	Attachments  []MomentAttachmentEntry `json:"attachments"`
	Comments     []MomentCommentEntry    `json:"comments"`
	CommentCount int                     `json:"commentCount"`
	// Tags mirrors the API's embedded tags[] (TagEntry) on moment detail and
	// list responses. The field lands in the same batch as the API change so
	// `moment get/list --json` round-trips tags instead of silently dropping
	// them (Go's json decoder ignores unknown fields).
	Tags []TagEntry `json:"tags"`
}

// MomentBlobEntry mirrors the API's nested blob object inside a moment
// attachment (moment.types.ts MomentBlobEntry). The API always includes it, so
// JSON mode round-trips the full payload including the ready fileUrl.
type MomentBlobEntry struct {
	ID           string         `json:"id"`
	OriginalName string         `json:"originalName"`
	MimeType     string         `json:"mimeType"`
	Size         int64          `json:"size"`
	Metadata     map[string]any `json:"metadata"`
	Width        *int           `json:"width"`
	Height       *int           `json:"height"`
	Duration     *float64       `json:"duration"`
	CreatedAt    string         `json:"createdAt"`
	FileURL      string         `json:"fileUrl"`
}

// MomentAttachmentEntry mirrors the API's moment attachment record
// (moment.types.ts MomentAttachmentEntry), which always carries metadata —
// mirroring BlobAttachmentEntry in blob.go so attachment-level metadata created
// via the API is not dropped from `moment get --json` output.
type MomentAttachmentEntry struct {
	ID          string           `json:"id"`
	BlobID      string           `json:"blobId"`
	Role        string           `json:"role"`
	DisplayName *string          `json:"displayName"`
	SortOrder   int              `json:"sortOrder"`
	Metadata    map[string]any   `json:"metadata"`
	CreatedAt   string           `json:"createdAt"`
	UpdatedAt   string           `json:"updatedAt"`
	Blob        *MomentBlobEntry `json:"blob,omitempty"`
}

// MomentCommentEntry mirrors the API's moment comment object
// (comment.types.ts MomentCommentEntry). Comments are a sub-resource nested
// under /api/moments/:id/comments.
type MomentCommentEntry struct {
	ID        string `json:"id"`
	MomentID  string `json:"momentId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// =============================================================================
// Moments — /api/moments
// =============================================================================

// ListMoments fetches a page of moments (created_at DESC). Set tag in query to
// filter by tag id (the API's additive ?tag= filter, compatible with
// page/pageSize); page/pageSize are set by the caller.
func (c *Client) ListMoments(ctx context.Context, query url.Values) ([]MomentEntry, int, error) {
	return List[MomentEntry](c, ctx, "/api/moments", query)
}

// UpdateMoment replaces a moment's text — its only updatable field (the API's
// UpdateMomentSchema requires 1..10000 chars). The API answers with the full
// updated moment (attachments/comments included), mirroring PUT
// /api/moments/:id.
func (c *Client) UpdateMoment(ctx context.Context, id, text string) (*MomentEntry, error) {
	var result MomentEntry
	if err := c.Put(ctx, "/api/moments/"+id, map[string]string{"text": text}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// =============================================================================
// Moment tags — /api/moments/:id/tags (thin wrappers over the tag service)
// =============================================================================

// AddMomentTag binds an existing tag to a moment. A duplicate bind is rejected
// by the server with 409.
func (c *Client) AddMomentTag(ctx context.Context, momentID, tagID string) (*TagRelationEntry, error) {
	var result TagRelationEntry
	if err := c.Post(ctx, "/api/moments/"+momentID+"/tags", map[string]string{"tagId": tagID}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// RemoveMomentTag removes a tag from a moment (DELETE /api/moments/:id/tags/:tagId).
func (c *Client) RemoveMomentTag(ctx context.Context, momentID, tagID string) error {
	return c.Delete(ctx, "/api/moments/"+momentID+"/tags/"+tagID)
}

// ReplaceMomentTags replaces a moment's whole tag set (PUT /api/moments/:id/tags).
// The API treats tagIds as an idempotent set: already-bound tags are tolerated,
// only nonexistent tag ids fail (404), duplicates are deduped, and an empty
// array clears all tags. The response is the new tags[].
func (c *Client) ReplaceMomentTags(ctx context.Context, momentID string, tagIDs []string) ([]TagEntry, error) {
	var result []TagEntry
	if err := c.Put(ctx, "/api/moments/"+momentID+"/tags", map[string]any{"tagIds": tagIDs}, &result); err != nil {
		return nil, err
	}
	return result, nil
}
