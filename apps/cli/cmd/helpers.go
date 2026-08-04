package cmd

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// commandContext returns the context attached to a cobra command, which the root
// command derives from os signals (see Execute) so an interrupt cancels
// in-flight requests. When the command was not run through ExecuteContext (unit
// tests invoking RunE directly), cobra leaves the context nil; fall back to
// context.Background() so those callers keep working.
func commandContext(cmd *cobra.Command) context.Context {
	if ctx := cmd.Context(); ctx != nil {
		return ctx
	}
	return context.Background()
}

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

// prefix returns the first n runes of s, or s unchanged when it is shorter.
// UUIDs and full ISO timestamps are long enough to slice with fixed bounds
// today, but a future server contract change could return shorter values —
// slicing without this guard would panic with "index out of range". Unlike
// truncateRunes, no "..." is appended (a truncated timestamp column should not
// gain an ellipsis).
func prefix(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
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

// printCreateResult renders a create-style success in both modes: JSON mode
// emits the {message, data} envelope; table mode prints a ✓ line, a blank line,
// and the key-value detail block. Shared by the create/update/attach/link
// commands so their success tails cannot drift apart.
func printCreateResult(jsonMessage string, jsonData any, tableMessage string, kv map[string]string) {
	if useJSON {
		printer.PrintSuccess(jsonMessage, jsonData)
		return
	}
	printer.PrintSuccess(tableMessage, nil)
	fmt.Println()
	printer.PrintKeyValue(kv)
}

// deleteCommand builds a "delete <id>" subcommand that confirms the destructive
// action (unless --force), issues the DELETE, and renders the result. noun is
// the Chinese resource label used in the confirmation prompt and success message
// (e.g. "日记"); permanent words the prompt as "确认永久删除"; apiPath maps the
// id to the API path; force receives the --force flag value. Keeps the three
// delete commands' confirmation + call + render scaffolding in one place.
func deleteCommand(use, short, long, noun string, permanent bool, apiPath func(id string) string, force *bool) *cobra.Command {
	prompt := "确认删除"
	if permanent {
		prompt = "确认永久删除"
	}
	return &cobra.Command{
		Use:   use,
		Short: short,
		Long:  long,
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := confirm(fmt.Sprintf("%s%s %s", prompt, noun, args[0]), *force); err != nil {
				return err
			}
			if err := apiClient.Delete(commandContext(cmd), apiPath(args[0])); err != nil {
				return err
			}
			printDeleteResult(noun+"已删除", args[0])
			return nil
		},
	}
}

// listSpec parameterizes the shared paginated-list command. T is the API entry
// type; row maps one entry to its table row.
type listSpec[T any] struct {
	use   string
	short string
	long  string
	path  string

	emptyMsg string
	headers  []string
	row      func(T) map[string]string

	// extraQuery mutates the query values beyond page/pageSize (e.g. mimeType).
	extraQuery func(q url.Values)
}

// paginatedListCommand builds a "list" subcommand that fetches {items, total},
// renders a table with a "共 N 条记录" footer in table mode, and the same
// {items, total} envelope in JSON mode. page/pageSize are bound to the provided
// vars so each module keeps its own flag state (and default page size); allVar
// backs a --all flag that walks every page so scripts and AI agents get the full
// dataset in one call. A page past the end (total>0 but no items) prints an
// explicit "本页无数据" message instead of an empty "(无数据)" table followed by
// the total footer.
func paginatedListCommand[T any](spec listSpec[T], pageVar, sizeVar *int, allVar *bool) *cobra.Command {
	return &cobra.Command{
		Use:   spec.use,
		Short: spec.short,
		Long:  spec.long,
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := commandContext(cmd)

			var items []T
			var total int
			var err error
			if *allVar {
				// --all overrides page/pageSize entirely.
				items, total, err = fetchAll[T](apiClient, ctx, spec)
			} else {
				if err = validatePageParams(*pageVar, *sizeVar); err != nil {
					return err
				}
				query := url.Values{}
				query.Set("page", strconv.Itoa(*pageVar))
				query.Set("pageSize", strconv.Itoa(*sizeVar))
				if spec.extraQuery != nil {
					spec.extraQuery(query)
				}
				items, total, err = client.List[T](apiClient, ctx, spec.path, query)
			}
			if err != nil {
				return err
			}

			if useJSON {
				printer.PrintSuccess("查询成功", map[string]any{"items": items, "total": total})
				return nil
			}

			if total == 0 {
				printer.PrintMessage(spec.emptyMsg)
				return nil
			}
			if len(items) == 0 {
				printer.PrintMessage(fmt.Sprintf("本页无数据，共 %d 条记录", total))
				return nil
			}

			rows := make([]map[string]string, len(items))
			for i, it := range items {
				rows[i] = spec.row(it)
			}
			printer.PrintTable(spec.headers, rows)
			fmt.Printf("\n共 %d 条记录\n", total)
			return nil
		},
	}
}

// maxAllPages bounds --all pagination so a misbehaving server that keeps
// returning full pages (or an unbounded dataset) cannot make the loop run
// forever. At pageSize 50 this allows up to 500,000 records.
const maxAllPages = 10000

// fetchAll walks every page of a paginated list endpoint at the API's maximum
// page size (50, shared by all list endpoints) and returns the combined result.
// It powers the list commands' --all flag, which exists so AI/script consumers
// get the full dataset in a single call instead of having to paginate and risk
// missing page 2+. The loop stops when a page returns fewer than pageSize items
// (the last, possibly partial, page) or the accumulated items cover the reported
// total; filters (spec.extraQuery, e.g. mimeType) are applied to every page.
func fetchAll[T any](c *client.Client, ctx context.Context, spec listSpec[T]) ([]T, int, error) {
	const pageSize = 50 // every list endpoint caps pageSize at 50

	var items []T
	total := 0
	for page := 1; ; page++ {
		query := url.Values{}
		query.Set("page", strconv.Itoa(page))
		query.Set("pageSize", strconv.Itoa(pageSize))
		if spec.extraQuery != nil {
			spec.extraQuery(query)
		}

		pageItems, pageTotal, err := client.List[T](c, ctx, spec.path, query)
		if err != nil {
			return nil, 0, err
		}
		total = pageTotal
		items = append(items, pageItems...)

		if len(pageItems) < pageSize || len(items) >= total {
			break
		}
		if page >= maxAllPages {
			return nil, 0, fmt.Errorf("数据量过大：已超过 %d 页（每页 %d 条），请改用分页查询", maxAllPages, pageSize)
		}
	}
	return items, total, nil
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
