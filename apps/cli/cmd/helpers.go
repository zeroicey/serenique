package cmd

import (
	"errors"
	"fmt"
	"os"
)

// confirm asks the user to confirm a destructive action.
//
// The prompt is written to stderr — never stdout — so stdout stays a clean
// channel for the actual result (and a single parseable JSON document in
// --json mode). It returns nil when confirmed or when force is true; otherwise
// it returns an error so the command exits non-zero. A missing or declined
// confirmation is therefore never mistaken for success by scripts and CI:
// reading from a non-interactive stdin (pipe, CI, AI agent) hits EOF
// immediately, which is treated as "not confirmed".
func confirm(prompt string, force bool) error {
	if force {
		return nil
	}
	fmt.Fprintf(os.Stderr, "%s (y/N): ", prompt)
	var resp string
	if _, err := fmt.Fscanln(os.Stdin, &resp); err != nil {
		// EOF or read error — there is no confirmation.
		return errors.New("操作已取消")
	}
	if resp != "y" && resp != "Y" {
		return errors.New("操作已取消")
	}
	return nil
}

// truncateRunes truncates s to at most n runes, appending "..." when it was
// cut. Truncating by rune count (not byte offset) guarantees a multi-byte UTF-8
// character is never split mid-rune, which would otherwise emit invalid UTF-8
// for CJK journal text.
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

// shortID abbreviates a server-supplied identifier for table display, keeping
// the first 8 runes and appending "...". Unlike the DB-generated UUIDs used for
// ids/blobId/createdAt (which are always long enough to slice), free-form
// fields like an attachment's ownerId may be arbitrarily short — the API's
// CreateBlobAttachmentSchema only requires min(1). A naive s[:8] would panic
// with "index out of range" on such values, so this helper tolerates short
// input. Truncating by runes (not bytes) also avoids splitting a multi-byte
// UTF-8 character.
func shortID(s string) string {
	r := []rune(s)
	if len(r) <= 8 {
		return s
	}
	return string(r[:8]) + "..."
}

// renderedError marks an error whose message the command already printed
// inline (e.g. per-file failures in a batch upload). Execute() still exits
// non-zero — the batch did fail — but does not render the message a second
// time, preserving the "errors render exactly once" contract.
type renderedError struct {
	message string
}

func (e *renderedError) Error() string { return e.message }

// printDeleteResult renders a destructive-action success. Table mode keeps the
// "✓ " prefix; JSON mode emits the same {message, data} envelope as create/get
// so AI/script consumers do not have to special-case deletes.
func printDeleteResult(message, id string) {
	if useJSON {
		printer.PrintSuccess(message, map[string]any{"id": id})
		return
	}
	printer.PrintMessage("✓ " + message)
}

// validatePageParams rejects out-of-range list pagination up front with an
// actionable Chinese message, instead of letting the server return a generic
// validation error (the API enforces page>=1 and pageSize<=50).
func validatePageParams(page, pageSize int) error {
	if page < 1 {
		return fmt.Errorf("页码必须大于等于 1")
	}
	if pageSize < 1 {
		return fmt.Errorf("每页条数必须大于等于 1")
	}
	if pageSize > 50 {
		return fmt.Errorf("每页条数不能超过 50")
	}
	return nil
}

// attachmentBody builds the POST body for creating an attachment reference,
// shared by the moment and blob attach commands so the two never drift apart.
// sortOrder is only included when explicitly set (the server auto-increments it
// otherwise); extra fields (e.g. ownerType/ownerId) are merged in.
func attachmentBody(blobID, role, displayName string, sortOrder int, sortOrderSet bool, extra map[string]any) map[string]any {
	body := map[string]any{
		"blobId":   blobID,
		"role":     role,
		"metadata": map[string]any{},
	}
	if sortOrderSet {
		body["sortOrder"] = sortOrder
	}
	if displayName != "" {
		body["displayName"] = displayName
	}
	for k, v := range extra {
		body[k] = v
	}
	return body
}
