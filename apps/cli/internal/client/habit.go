package client

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

// Habit kind values, matching the API's HabitKindSchema enum (habit.types.ts):
// good (好事) / bad (坏事). The kind only drives visual distinction (green/red);
// it never affects logic.
const (
	HabitKindGood = "good"
	HabitKindBad  = "bad"
)

// Habit daily status values, matching the API's HabitStatusSchema enum
// (habit.types.ts): done (做了) / not_done (没做). nil status = unrecorded.
const (
	HabitStatusDone    = "done"
	HabitStatusNotDone = "not_done"
)

// IsHabitKind reports whether s is a valid habit kind. The API enforces the
// same set via a zod enum plus a DB CHECK constraint; the CLI checks it up
// front so a typo'd kind fails with an actionable message instead of a
// server-side validation error.
func IsHabitKind(s string) bool {
	switch s {
	case HabitKindGood, HabitKindBad:
		return true
	default:
		return false
	}
}

// IsHabitStatus reports whether s is a valid daily status value (done/not_done).
func IsHabitStatus(s string) bool {
	switch s {
	case HabitStatusDone, HabitStatusNotDone:
		return true
	default:
		return false
	}
}

// HabitEntry mirrors the API's HabitEntry response (habit.types.ts). Countable
// selects the record mode: false (做没做型, e.g. 跑步) records status; true
// (计数型, e.g. 喝水) records a count.
type HabitEntry struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Countable bool   `json:"countable"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// HabitDailyEntry mirrors the API's daily status entry: one row per
// (habit, date). Status is nil when unrecorded (非计数型); Count is the number
// of times for countable habits (0 = not done). Note is an optional remark.
type HabitDailyEntry struct {
	HabitID string  `json:"habitId"`
	Status  *string `json:"status"`
	Count   int     `json:"count"`
	Note    *string `json:"note"`
}

// HabitOverview mirrors GET /api/habit-daily/overview: day-grouped records
// (with habit name/kind joined in by the server) plus per-habit stats.
type HabitOverview struct {
	Days   int                            `json:"days"`
	ByDate map[string][]HabitOverviewItem `json:"byDate"`
	Stats  []HabitStat                    `json:"stats"`
}

// HabitOverviewItem is one record inside overview.ByDate; name/kind are joined
// in by the server so the CLI does not have to cross-reference the habit list.
type HabitOverviewItem struct {
	HabitID string  `json:"habitId"`
	Name    string  `json:"name"`
	Kind    string  `json:"kind"`
	Status  *string `json:"status"`
	Count   int     `json:"count"`
	Note    *string `json:"note"`
}

// HabitStat is one habit's frequency summary over the overview window.
type HabitStat struct {
	HabitID     string `json:"habitId"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Countable   bool   `json:"countable"`
	DoneDays    int    `json:"doneDays"`
	NotDoneDays int    `json:"notDoneDays"`
	TotalCount  int    `json:"totalCount"`
}

// CreateHabitInput mirrors the API's CreateHabitSchema. Countable defaults to
// false on the server; omitting it is equivalent to sending false.
type CreateHabitInput struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Countable bool   `json:"countable,omitempty"`
}

// UpdateHabitInput mirrors the API's UpdateHabitSchema: every field is
// optional and a nil field leaves the existing value unchanged.
type UpdateHabitInput struct {
	Name      *string `json:"name,omitempty"`
	Kind      *string `json:"kind,omitempty"`
	Countable *bool   `json:"countable,omitempty"`
	SortOrder *int    `json:"sortOrder,omitempty"`
}

// SetDailyInput mirrors the API's SetDailySchema: for non-countable habits the
// caller sends Status; for countable habits Count. Note is optional for both;
// a non-nil empty Note clears the remark (the API normalizes "" to null).
type SetDailyInput struct {
	Status *string `json:"status,omitempty"`
	Count  *int    `json:"count,omitempty"`
	Note   *string `json:"note,omitempty"`
}

// =============================================================================
// Habits — /api/habits
// =============================================================================

// ListHabits fetches the full habit option list (sort_order asc, created_at
// asc). The endpoint returns a bare array, not a paginated envelope.
func (c *Client) ListHabits(ctx context.Context) ([]HabitEntry, error) {
	var result []HabitEntry
	if err := c.Get(ctx, "/api/habits", nil, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateHabit creates a habit option.
func (c *Client) CreateHabit(ctx context.Context, input CreateHabitInput) (*HabitEntry, error) {
	var result HabitEntry
	if err := c.Post(ctx, "/api/habits", input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateHabit partially updates a habit; nil UpdateHabitInput fields are
// unchanged.
func (c *Client) UpdateHabit(ctx context.Context, id string, input UpdateHabitInput) (*HabitEntry, error) {
	var result HabitEntry
	if err := c.Put(ctx, "/api/habits/"+id, input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteHabit deletes a habit option; its daily records are removed via the
// DB's ON DELETE CASCADE.
func (c *Client) DeleteHabit(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/habits/"+id)
}

// =============================================================================
// Habit daily status — /api/habit-daily + /api/habits/:habitId/daily/:date
// =============================================================================

// ListDaily fetches every habit's status for one day.
func (c *Client) ListDaily(ctx context.Context, date string) ([]HabitDailyEntry, error) {
	var result []HabitDailyEntry
	query := url.Values{}
	query.Set("date", date)
	if err := c.Get(ctx, "/api/habit-daily", query, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// SetDaily upserts one habit's status for one day (status, count, note).
func (c *Client) SetDaily(ctx context.Context, habitID, date string, input SetDailyInput) (*HabitDailyEntry, error) {
	var result HabitDailyEntry
	path := fmt.Sprintf("/api/habits/%s/daily/%s", habitID, date)
	if err := c.Put(ctx, path, input, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ClearDaily removes one habit's record for one day (back to unrecorded).
func (c *Client) ClearDaily(ctx context.Context, habitID, date string) error {
	path := fmt.Sprintf("/api/habits/%s/daily/%s", habitID, date)
	return c.Delete(ctx, path)
}

// GetHabitOverview fetches the overview: day-grouped records plus per-habit
// frequency stats over the last days days.
func (c *Client) GetHabitOverview(ctx context.Context, days int) (*HabitOverview, error) {
	var result HabitOverview
	query := url.Values{}
	query.Set("days", strconv.Itoa(days))
	if err := c.Get(ctx, "/api/habit-daily/overview", query, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
