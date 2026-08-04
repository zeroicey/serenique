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
