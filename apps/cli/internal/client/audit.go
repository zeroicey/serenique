package client

import (
	"context"
	"net/url"
)

// Audit level values matching the API's AUDIT_LEVELS constant (audit.types.ts):
// info / warn / error.
const (
	AuditLevelInfo  = "info"
	AuditLevelWarn  = "warn"
	AuditLevelError = "error"
)

// IsAuditLevel reports whether s is a valid audit level. The API enforces the
// same set via a zod enum; the CLI checks it up front so a typo'd --level fails
// with an actionable message instead of a server-side validation error.
func IsAuditLevel(s string) bool {
	switch s {
	case AuditLevelInfo, AuditLevelWarn, AuditLevelError:
		return true
	default:
		return false
	}
}

// AuditLogEntry mirrors the API's LogEntry response (audit.types.ts). Times are
// ISO 8601 strings in UTC; Source/IP/Detail are null until set.
type AuditLogEntry struct {
	ID        string         `json:"id"`
	Event     string         `json:"event"`
	Message   string         `json:"message"`
	Level     string         `json:"level"`
	Source    *string        `json:"source"`
	IP        *string        `json:"ip"`
	Detail    map[string]any `json:"detail"`
	IsRead    bool           `json:"isRead"`
	CreatedAt string         `json:"createdAt"`
}

// AuditUnreadCount mirrors the API's GET /api/audit/logs/unread-count response
// data: { unreadCount: number }.
type AuditUnreadCount struct {
	UnreadCount int `json:"unreadCount"`
}

// AuditMarkReadResult mirrors the API's PUT /api/audit/logs/read response data:
// { updatedCount: number, unreadCount: number }.
type AuditMarkReadResult struct {
	UpdatedCount int `json:"updatedCount"`
	UnreadCount  int `json:"unreadCount"`
}

// =============================================================================
// Audit logs — /api/audit/logs
// =============================================================================

// ListAuditLogs fetches a page of audit logs (created_at DESC). page/pageSize
// are set by the caller in query; level/event/unreadOnly filters may be added.
func (c *Client) ListAuditLogs(ctx context.Context, query url.Values) ([]AuditLogEntry, int, error) {
	return List[AuditLogEntry](c, ctx, "/api/audit/logs", query)
}

// AuditUnreadCount fetches the number of unread audit logs.
func (c *Client) AuditUnreadCount(ctx context.Context) (*AuditUnreadCount, error) {
	var result AuditUnreadCount
	if err := c.Get(ctx, "/api/audit/logs/unread-count", nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// MarkAuditLogsRead marks audit logs as read. When ids is empty, every log is
// marked read (the API treats an absent/empty ids as "all"); otherwise only the
// listed ids are marked.
func (c *Client) MarkAuditLogsRead(ctx context.Context, ids []string) (*AuditMarkReadResult, error) {
	body := map[string]any{}
	if len(ids) > 0 {
		body["ids"] = ids
	}
	var result AuditMarkReadResult
	if err := c.Put(ctx, "/api/audit/logs/read", body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
