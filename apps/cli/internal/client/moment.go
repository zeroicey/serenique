package client

import (
	"context"
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
