package client

import (
	"context"
)

// TokenBrandPrefix is the constant prefix of every API token plaintext
// ("serenique_" + 32 random bytes base64url). The brand prefix carries no
// entropy — the random segment after it is the identity. The server stores
// only a SHA-256 hash plus the first 8 chars of the random segment (prefix),
// so a stored plaintext can be matched to its server record by recomputing
// that prefix (see token.domain.ts).
const TokenBrandPrefix = "serenique_"

// TokenEntry mirrors the API's TokenEntry (token.types.ts). It contains no
// plaintext — only the display prefix. lastUsedAt/revokedAt are nullable on
// the server; null unmarshals into "".
type TokenEntry struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	LastUsedAt string `json:"lastUsedAt"`
	RevokedAt  string `json:"revokedAt"`
	CreatedAt  string `json:"createdAt"`
}

// TokenCreateResult mirrors the API's TokenCreateResult (token.types.ts): the
// plaintext appears ONLY in this create response, never again — the server
// keeps only the hash. The CLI deliberately surfaces it in full (both table
// and --json modes); it is the one legitimate exception to token masking.
type TokenCreateResult struct {
	Plaintext string     `json:"plaintext"`
	Item      TokenEntry `json:"item"`
}

// =============================================================================
// Tokens — /api/tokens (manageable API tokens, GitHub-PAT style)
// =============================================================================

// CreateToken creates a new API token with the given name (≤100 chars). The
// response carries the plaintext exactly once.
func (c *Client) CreateToken(ctx context.Context, name string) (*TokenCreateResult, error) {
	var result TokenCreateResult
	if err := c.Post(ctx, "/api/tokens", map[string]string{"name": name}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListTokens returns all API tokens. The endpoint is unpaginated (bare
// {items}, no total) and includes revoked tokens (revokedAt set) so a user can
// audit what was revoked.
func (c *Client) ListTokens(ctx context.Context) ([]TokenEntry, error) {
	var result struct {
		Items []TokenEntry `json:"items"`
	}
	if err := c.Get(ctx, "/api/tokens", nil, &result); err != nil {
		return nil, err
	}
	return result.Items, nil
}

// RevokeToken revokes (soft-deletes) a token by id. The token dies
// immediately; the record remains listed with revokedAt set. Revoking an
// already-revoked or unknown id yields 404.
func (c *Client) RevokeToken(ctx context.Context, id string) error {
	return c.Delete(ctx, "/api/tokens/"+id)
}
