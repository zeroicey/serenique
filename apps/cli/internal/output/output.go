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
	"os"
	"strings"
	"text/tabwriter"
)

// Printer is the output interface. Commands use this to render results
// without knowing whether the user chose table or JSON output.
type Printer interface {
	// PrintTable renders a slice of rows as a table with the given column headers.
	PrintTable(headers []string, rows []map[string]string)

	// PrintKeyValue renders flat key-value pairs.
	PrintKeyValue(data map[string]string)

	// PrintSuccess prints a success message with optional data.
	PrintSuccess(message string, data interface{})

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
		fmt.Println("(无数据)")
		return
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	// Header
	fmt.Fprintln(w, strings.Join(headers, "\t"))

	// Separator
	sep := make([]string, len(headers))
	for i := range sep {
		sep[i] = strings.Repeat("-", len(headers[i])+4)
	}
	fmt.Fprintln(w, strings.Join(sep, "\t"))

	// Rows
	for _, row := range rows {
		cols := make([]string, len(headers))
		for i, h := range headers {
			cols[i] = row[h]
		}
		fmt.Fprintln(w, strings.Join(cols, "\t"))
	}

	w.Flush()
}

func (p *TablePrinter) PrintKeyValue(data map[string]string) {
	maxKeyLen := 0
	for k := range data {
		if len(k) > maxKeyLen {
			maxKeyLen = len(k)
		}
	}

	for k, v := range data {
		fmt.Printf("%-*s  %s\n", maxKeyLen, k+":", v)
	}
}

func (p *TablePrinter) PrintSuccess(message string, data interface{}) {
	fmt.Printf("✓ %s\n", message)
	if data != nil {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(b))
	}
}

func (p *TablePrinter) PrintError(message string) {
	fmt.Fprintf(os.Stderr, "✗ 错误: %s\n", message)
}

func (p *TablePrinter) PrintMessage(message string) {
	fmt.Println(message)
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

func (p *JSONPrinter) PrintSuccess(message string, data interface{}) {
	if data == nil {
		p.print(map[string]string{"message": message})
		return
	}
	// If data is already a struct/map, wrap with message
	type successOutput struct {
		Message string      `json:"message"`
		Data    interface{} `json:"data"`
	}
	p.print(successOutput{Message: message, Data: data})
}

func (p *JSONPrinter) PrintError(message string) {
	type errorOutput struct {
		Error string `json:"error"`
	}
	b, _ := json.MarshalIndent(errorOutput{Error: message}, "", "  ")
	fmt.Fprintln(os.Stderr, string(b))
}

func (p *JSONPrinter) PrintMessage(message string) {
	p.print(map[string]string{"message": message})
}

func (p *JSONPrinter) print(v interface{}) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"error": "JSON序列化失败: %s"}`, err.Error())
		return
	}
	fmt.Println(string(b))
}
