package client

import (
	"context"
	"net/url"
)

// Task status values, matching the API's TaskStatusSchema enum (task.types.ts):
// todo / done / abandon.
const (
	TaskStatusTodo    = "todo"
	TaskStatusDone    = "done"
	TaskStatusAbandon = "abandon"
)

// IsTaskStatus reports whether s is a valid task status. The API enforces the
// same set via a zod enum plus a DB CHECK constraint; the CLI checks it up front
// so a typo'd --status fails with an actionable message instead of a
// server-side validation error.
func IsTaskStatus(s string) bool {
	switch s {
	case TaskStatusTodo, TaskStatusDone, TaskStatusAbandon:
		return true
	default:
		return false
	}
}

// TaskEntry mirrors the API's TaskEntry response (task.types.ts). Times are ISO
// 8601 strings; CompletedAt is null until the task is completed (status "done").
type TaskEntry struct {
	ID          string  `json:"id"`
	GroupID     string  `json:"groupId"`
	Title       string  `json:"title"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	CompletedAt *string `json:"completedAt"`
}

// TaskGroupEntry mirrors the API's TaskGroupEntry response (task.types.ts).
type TaskGroupEntry struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// =============================================================================
// Task groups — /api/task-groups
// =============================================================================

// ListTaskGroups fetches a page of task groups (updated_at DESC). page/pageSize
// are set by the caller in query.
func (c *Client) ListTaskGroups(ctx context.Context, query url.Values) ([]TaskGroupEntry, int, error) {
	return List[TaskGroupEntry](c, ctx, "/api/task-groups", query)
}

// CreateTaskGroup creates a task group with the given title.
func (c *Client) CreateTaskGroup(ctx context.Context, title string) (*TaskGroupEntry, error) {
	var result TaskGroupEntry
	if err := c.Post(ctx, "/api/task-groups", map[string]string{"title": title}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetTaskGroup fetches a single task group by id.
func (c *Client) GetTaskGroup(ctx context.Context, id string) (*TaskGroupEntry, error) {
	var result TaskGroupEntry
	if err := c.Get(ctx, "/api/task-groups/"+id, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateTaskGroup renames a task group (title is its only mutable field).
func (c *Client) UpdateTaskGroup(ctx context.Context, id, title string) (*TaskGroupEntry, error) {
	var result TaskGroupEntry
	if err := c.Put(ctx, "/api/task-groups/"+id, map[string]string{"title": title}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteTaskGroup deletes a task group; its tasks are removed via the DB's
// ON DELETE CASCADE.
func (c *Client) DeleteTaskGroup(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/task-groups/"+id)
}

// =============================================================================
// Tasks — /api/tasks
// =============================================================================

// CreateTaskInput mirrors the API's CreateTaskSchema. Status is optional; an
// empty value is omitted from the body and the server defaults it to "todo".
type CreateTaskInput struct {
	Title   string `json:"title"`
	GroupID string `json:"groupId"`
	Status  string `json:"status,omitempty"`
}

// UpdateTaskInput mirrors the API's UpdateTaskSchema: every field is optional,
// and a nil field leaves the existing value unchanged. Title's min length is 1,
// so an empty string is never a legitimate value — nil is used to mean
// "not provided".
type UpdateTaskInput struct {
	Title   *string `json:"title,omitempty"`
	GroupID *string `json:"groupId,omitempty"`
	Status  *string `json:"status,omitempty"`
}

// ListTasks fetches a page of tasks (created_at DESC). Set groupId/status in
// query to filter by task group or status; page/pageSize are set by the caller.
func (c *Client) ListTasks(ctx context.Context, query url.Values) ([]TaskEntry, int, error) {
	return List[TaskEntry](c, ctx, "/api/tasks", query)
}

// CreateTask creates a task under a task group.
func (c *Client) CreateTask(ctx context.Context, input CreateTaskInput) (*TaskEntry, error) {
	var result TaskEntry
	if err := c.Post(ctx, "/api/tasks", input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetTask fetches a single task by id.
func (c *Client) GetTask(ctx context.Context, id string) (*TaskEntry, error) {
	var result TaskEntry
	if err := c.Get(ctx, "/api/tasks/"+id, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateTask partially updates a task; nil UpdateTaskInput fields are unchanged.
func (c *Client) UpdateTask(ctx context.Context, id string, input UpdateTaskInput) (*TaskEntry, error) {
	var result TaskEntry
	if err := c.Put(ctx, "/api/tasks/"+id, input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteTask deletes a task by id.
func (c *Client) DeleteTask(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/tasks/"+id)
}
