package client

import (
	"context"
	"net/url"
)

// TagOwnerTypeMoment is the ownerType value for moments — the only type in the
// API's owner-type registry today (tag.domain.ts). The registry will grow as
// diary/event/task start attaching tags.
const TagOwnerTypeMoment = "moment"

// TagEntry mirrors the API's TagEntry response (tag.types.ts). MomentCount is
// the number of moments carrying this tag (moment is currently the only
// registered ownerType).
type TagEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	MomentCount int    `json:"momentCount"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// TagRelationEntry mirrors the API's tag-relation record returned by a single
// attach (tag.types.ts TagRelationEntry).
type TagRelationEntry struct {
	ID        string `json:"id"`
	TagID     string `json:"tagId"`
	OwnerType string `json:"ownerType"`
	OwnerID   string `json:"ownerId"`
	CreatedAt string `json:"createdAt"`
}

// AttachTagInput mirrors the API's AttachTagSchema / DetachTagSchema: a
// polymorphic ownerType/ownerId pair, following the blob_attachments pattern.
type AttachTagInput struct {
	OwnerType string `json:"ownerType"`
	OwnerID   string `json:"ownerId"`
}

// =============================================================================
// Tags — /api/tags
// =============================================================================

// ListTags fetches a page of tags. page/pageSize are set by the caller in
// query.
func (c *Client) ListTags(ctx context.Context, query url.Values) ([]TagEntry, int, error) {
	return List[TagEntry](c, ctx, "/api/tags", query)
}

// CreateTag creates a tag with the given name. The server normalizes the name
// (trim + lowercase) and rejects duplicates with 409.
func (c *Client) CreateTag(ctx context.Context, name string) (*TagEntry, error) {
	var result TagEntry
	if err := c.Post(ctx, "/api/tags", map[string]string{"name": name}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetTag fetches a single tag by id (momentCount included).
func (c *Client) GetTag(ctx context.Context, id string) (*TagEntry, error) {
	var result TagEntry
	if err := c.Get(ctx, "/api/tags/"+id, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// RenameTag renames a tag. Existing tag-owner relations are unaffected — they
// reference the tag id, not the name.
func (c *Client) RenameTag(ctx context.Context, id, name string) (*TagEntry, error) {
	var result TagEntry
	if err := c.Put(ctx, "/api/tags/"+id, map[string]string{"name": name}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteTag deletes a tag; its relations are removed via the DB's
// ON DELETE CASCADE.
func (c *Client) DeleteTag(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/tags/"+id)
}

// =============================================================================
// Tag relations — /api/tags/:id/attach | /detach
// =============================================================================

// AttachTag binds a tag to an owner entity (e.g. a moment). A duplicate
// (tag, owner) bind is rejected by the server with 409.
func (c *Client) AttachTag(ctx context.Context, tagID, ownerType, ownerID string) (*TagRelationEntry, error) {
	var result TagRelationEntry
	if err := c.Post(ctx, "/api/tags/"+tagID+"/attach", AttachTagInput{OwnerType: ownerType, OwnerID: ownerID}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DetachTag removes a tag-owner bind. The pair travels in the request body
// (the API's DetachTagSchema); a bind that does not exist yields 404.
func (c *Client) DetachTag(ctx context.Context, tagID, ownerType, ownerID string) error {
	return c.DeleteWithBody(ctx, "/api/tags/"+tagID+"/detach", AttachTagInput{OwnerType: ownerType, OwnerID: ownerID})
}
