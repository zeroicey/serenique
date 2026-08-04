// Package output provides formatted output for CLI commands.
//
// Two modes are supported:
//   - Table (default): human-readable aligned output using text/tabwriter
//   - JSON: machine-readable output for AI consumption and scripting
//
// Usage:
//
//	printer := output.NewPrinter(useJSON)
//	printer.PrintTable([]string{"ID", "日期", "内容"}, rows)
//	printer.PrintKeyValue(map[string]string{"ID": "abc", "日期": "2026-08-04"})
//	printer.PrintSuccess("操作成功", data)
//	printer.PrintError("操作失败")
package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
)

// stdout and stderr are optional test overrides. When nil, the printer resolves
// os.Stdout/os.Stderr at call time, so a runtime redirection of the process's
// streams (a test swapping os.Stderr, a tool re-pointing the file descriptors)
// is honored instead of being bound once at package init. Commands never write
// directly to the terminal.
var (
	stdout io.Writer
	stderr io.Writer
)

// out returns the stdout stream: a test override if set, else os.Stdout.
func out() io.Writer {
	if stdout != nil {
		return stdout
	}
	return os.Stdout
}

// errOut returns the stderr stream: a test override if set, else os.Stderr.
func errOut() io.Writer {
	if stderr != nil {
		return stderr
	}
	return os.Stderr
}

// Printer is the output interface. Commands use this to render results
// without knowing whether the user chose table or JSON output.
type Printer interface {
	// PrintTable renders a slice of rows as a table with the given column headers.
	PrintTable(headers []string, rows []map[string]string)

	// PrintKeyValue renders flat key-value pairs.
	PrintKeyValue(data map[string]string)

	// PrintSuccess prints a success message with optional data.
	PrintSuccess(message string, data any)

	// PrintError prints an error message.
	PrintError(message string)

	// PrintMessage prints a plain informational message.
	PrintMessage(message string)
}

// NewPrinter returns the appropriate Printer for the given mode.
func NewPrinter(useJSON bool) Printer {
	if useJSON {
		return &JSONPrinter{}
	}
	return &TablePrinter{}
}

// =============================================================================
// TablePrinter — human-readable output
// =============================================================================

type TablePrinter struct{}

func (p *TablePrinter) PrintTable(headers []string, rows []map[string]string) {
	if len(rows) == 0 {
		fmt.Fprintln(out(), "(无数据)")
		return
	}

	// Compute the display width of each column across header and rows so CJK
	// characters (which render at double width) align correctly.
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = displayWidth(h)
	}
	for _, row := range rows {
		for i, h := range headers {
			if w := displayWidth(row[h]); w > widths[i] {
				widths[i] = w
			}
		}
	}

	padding := "  "
	printLine := func(cells []string) {
		parts := make([]string, len(cells))
		for i, cell := range cells {
			parts[i] = cell + strings.Repeat(" ", widths[i]-displayWidth(cell))
		}
		fmt.Fprintln(out(), strings.Join(parts, padding))
	}

	printLine(headers)

	// Separator cells span exactly the cell width (no +2) so the dashed line,
	// joined with the same 2-space padding as content cells, matches the body's
	// total display width instead of overhanging by 2 columns per column.
	sep := make([]string, len(headers))
	for i := range sep {
		sep[i] = strings.Repeat("-", widths[i])
	}
	fmt.Fprintln(out(), strings.Join(sep, padding))

	for _, row := range rows {
		cells := make([]string, len(headers))
		for i, h := range headers {
			cells[i] = row[h]
		}
		printLine(cells)
	}
}

func (p *TablePrinter) PrintKeyValue(data map[string]string) {
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	maxKeyLen := 0
	for _, k := range keys {
		if w := displayWidth(k); w > maxKeyLen {
			maxKeyLen = w
		}
	}

	for _, k := range keys {
		pad := maxKeyLen - displayWidth(k)
		fmt.Fprintf(out(), "%s:%s  %s\n", k, strings.Repeat(" ", pad), data[k])
	}
}

func (p *TablePrinter) PrintSuccess(message string, data any) {
	fmt.Fprintf(out(), "✓ %s\n", message)
	if data != nil {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Fprintln(out(), string(b))
	}
}

func (p *TablePrinter) PrintError(message string) {
	fmt.Fprintf(errOut(), "✗ 错误: %s\n", message)
}

func (p *TablePrinter) PrintMessage(message string) {
	fmt.Fprintln(out(), message)
}

// displayWidth returns the on-screen width of a string, counting East Asian
// wide characters as 2 columns so CJK content aligns in tables and key/value
// output. ASCII and Latin-1 count as 1 column.
func displayWidth(s string) int {
	w := 0
	for _, r := range s {
		w += runeWidth(r)
	}
	return w
}

func runeWidth(r rune) int {
	switch {
	case r >= 0x1100 && r <= 0x115F, // Hangul Jamo
		r >= 0x2E80 && r <= 0x303E,   // CJK Radicals, Kangxi, CJK Symbols/Punct
		r >= 0x3041 && r <= 0x33FF,   // Hiragana, Katakana, CJK Compatibility
		r >= 0x3400 && r <= 0x4DBF,   // CJK Unified Ideographs Extension A
		r >= 0x4E00 && r <= 0x9FFF,   // CJK Unified Ideographs
		r >= 0xA000 && r <= 0xA4CF,   // Yi Syllables
		r >= 0xAC00 && r <= 0xD7A3,   // Hangul Syllables
		r >= 0xF900 && r <= 0xFAFF,   // CJK Compatibility Ideographs
		r >= 0xFE30 && r <= 0xFE4F,   // CJK Compatibility Forms
		r >= 0xFF00 && r <= 0xFF60,   // Fullwidth Forms
		r >= 0xFFE0 && r <= 0xFFE6,   // Fullwidth Signs
		r >= 0x1F300 && r <= 0x1F64F, // Emoji
		r >= 0x20000 && r <= 0x2FFFD: // CJK Unified Ideographs Extension B+
		return 2
	default:
		return 1
	}
}

// =============================================================================
// JSONPrinter — machine-readable output
// =============================================================================

type JSONPrinter struct{}

func (p *JSONPrinter) PrintTable(headers []string, rows []map[string]string) {
	// For JSON, we restructure into a predictable shape:
	// { "items": [...filtered rows...], "count": N }
	type output struct {
		Items []map[string]string `json:"items"`
		Count int                 `json:"count"`
	}
	p.print(output{Items: rows, Count: len(rows)})
}

func (p *JSONPrinter) PrintKeyValue(data map[string]string) {
	p.print(data)
}

func (p *JSONPrinter) PrintSuccess(message string, data any) {
	if data == nil {
		p.print(map[string]string{"message": message})
		return
	}
	// If data is already a struct/map, wrap with message
	type successOutput struct {
		Message string `json:"message"`
		Data    any    `json:"data"`
	}
	p.print(successOutput{Message: message, Data: data})
}

func (p *JSONPrinter) PrintError(message string) {
	type errorOutput struct {
		Error string `json:"error"`
	}
	b, _ := json.MarshalIndent(errorOutput{Error: message}, "", "  ")
	fmt.Fprintln(errOut(), string(b))
}

func (p *JSONPrinter) PrintMessage(message string) {
	p.print(map[string]string{"message": message})
}

func (p *JSONPrinter) print(v any) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(errOut(), `{"error": "JSON序列化失败: %s"}`, err.Error())
		return
	}
	fmt.Fprintln(out(), string(b))
}
