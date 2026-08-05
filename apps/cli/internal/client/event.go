package client

import (
	"context"
	"net/url"
)

// EventEntry mirrors the API's EventEntry response (event.types.ts). Times are
// ISO 8601 strings in UTC; Location/Note are null until set.
type EventEntry struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	StartAt   string  `json:"startAt"`
	EndAt     string  `json:"endAt"`
	IsAllDay  bool    `json:"isAllDay"`
	Location  *string `json:"location"`
	Note      *string `json:"note"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

// CreateEventInput mirrors the API's CreateEventSchema. StartAt/EndAt are ISO
// 8601 strings with a timezone offset; IsAllDay defaults to false on the server.
// Location/Note are omitted when empty (the server stores null).
type CreateEventInput struct {
	Title    string `json:"title"`
	StartAt  string `json:"startAt"`
	EndAt    string `json:"endAt"`
	IsAllDay bool   `json:"isAllDay"`
	Location string `json:"location,omitempty"`
	Note     string `json:"note,omitempty"`
}

// UpdateEventInput mirrors the API's UpdateEventSchema: every field is optional,
// and a nil field leaves the existing value unchanged. A non-nil Location/Note
// pointer replaces the value — an empty string clears it (matching the server's
// "传空串清空" semantics).
type UpdateEventInput struct {
	Title    *string `json:"title,omitempty"`
	StartAt  *string `json:"startAt,omitempty"`
	EndAt    *string `json:"endAt,omitempty"`
	IsAllDay *bool   `json:"isAllDay,omitempty"`
	Location *string `json:"location,omitempty"`
	Note     *string `json:"note,omitempty"`
}

// =============================================================================
// Events — /api/events
// =============================================================================

// ListEvents fetches events overlapping [from, to) — a time-range query with no
// pagination, matching the API's GET /api/events?from=&to=. The response is a
// plain array (not the {items, total} envelope), ordered by start_at ASC.
func (c *Client) ListEvents(ctx context.Context, from, to string) ([]EventEntry, error) {
	query := url.Values{}
	query.Set("from", from)
	query.Set("to", to)
	var result []EventEntry
	if err := c.Get(ctx, "/api/events", query, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateEvent creates a calendar event. StartAt must be earlier than EndAt.
func (c *Client) CreateEvent(ctx context.Context, input CreateEventInput) (*EventEntry, error) {
	var result EventEntry
	if err := c.Post(ctx, "/api/events", input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetEvent fetches a single event by id.
func (c *Client) GetEvent(ctx context.Context, id string) (*EventEntry, error) {
	var result EventEntry
	if err := c.Get(ctx, "/api/events/"+id, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateEvent partially updates an event; nil UpdateEventInput fields are
// unchanged. Empty-string Location/Note clear the corresponding field.
func (c *Client) UpdateEvent(ctx context.Context, id string, input UpdateEventInput) (*EventEntry, error) {
	var result EventEntry
	if err := c.Put(ctx, "/api/events/"+id, input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteEvent deletes an event by id.
func (c *Client) DeleteEvent(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/events/"+id)
}
