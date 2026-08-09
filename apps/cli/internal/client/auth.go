package client

import (
	"context"
)

// UserEntry mirrors the API's user object (auth.types.ts UserEntry) returned
// by GET /api/auth/me (and /api/users/me). name/email/birthday are nullable
// on the server; null unmarshals into a nil pointer.
type UserEntry struct {
	ID        string  `json:"id"`
	Name      *string `json:"name"`
	Email     *string `json:"email"`
	Birthday  *string `json:"birthday"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

// AuthMeEntry mirrors the API's GET /api/auth/me payload (auth.types.ts
// AuthMeEntry). Note the contract quirk: a Bearer-token identity authenticates
// without a userId, so the API answers {authenticated: false, user: null} even
// for a valid token — only a session cookie carries user profile data. A 401
// is the only reliable "invalid credentials" signal for the CLI.
type AuthMeEntry struct {
	Authenticated bool       `json:"authenticated"`
	User          *UserEntry `json:"user"`
}

// Me returns the auth status and (for session identities) user profile from
// GET /api/auth/me. Used by `auth login` to probe a candidate token (200 =
// accepted, 401 = rejected) and by `auth me`.
func (c *Client) Me(ctx context.Context) (*AuthMeEntry, error) {
	var result AuthMeEntry
	if err := c.Get(ctx, "/api/auth/me", nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
