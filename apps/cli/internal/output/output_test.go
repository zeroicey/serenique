package output

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// runWithWriters invokes fn with stdout/stderr captured to buffers.
func runWithWriters(fn func()) (outStr, errStr string) {
	var out, err bytes.Buffer
	oldOut, oldErr := stdout, stderr
	stdout, stderr = &out, &err
	defer func() { stdout, stderr = oldOut, oldErr }()
	fn()
	return out.String(), err.String()
}

func TestJSONModeStdoutIsPureJSON(t *testing.T) {
	p := NewPrinter(true)
	stdout, stderr := runWithWriters(func() {
		p.PrintSuccess("上传成功", map[string]interface{}{"id": "abc"})
	})
	if !json.Valid([]byte(stdout)) {
		t.Fatalf("stdout is not valid JSON: %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	// Every JSON-mode print call yields a standalone valid JSON document.
	for _, call := range []func(){func() { p.PrintMessage("extra") }} {
		out, _ := runWithWriters(call)
		if !json.Valid([]byte(out)) {
			t.Fatalf("PrintMessage stdout is not valid JSON: %q", out)
		}
	}
}

func TestJSONErrorGoesToStderr(t *testing.T) {
	p := NewPrinter(true)
	stdout, stderr := runWithWriters(func() {
		p.PrintError("something failed")
	})
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout in JSON error mode, got %q", stdout)
	}
	if !json.Valid([]byte(stderr)) {
		t.Fatalf("stderr is not valid JSON: %q", stderr)
	}
}

func TestPrintSuccessJSONShape(t *testing.T) {
	p := NewPrinter(true)
	stdout, _ := runWithWriters(func() {
		p.PrintSuccess("ok", map[string]string{"k": "v"})
	})
	var m struct {
		Message string            `json:"message"`
		Data    map[string]string `json:"data"`
	}
	if err := json.Unmarshal([]byte(stdout), &m); err != nil {
		t.Fatal(err)
	}
	if m.Message != "ok" || m.Data["k"] != "v" {
		t.Fatalf("unexpected shape: %+v", m)
	}
}

func TestPrintKeyValueSorted(t *testing.T) {
	p := NewPrinter(false)
	stdout, _ := runWithWriters(func() {
		p.PrintKeyValue(map[string]string{"Z": "1", "A": "2", "M": "3"})
	})
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 3 {
		t.Fatalf("got %d lines: %q", len(lines), stdout)
	}
	if !strings.HasPrefix(lines[0], "A:") || !strings.HasPrefix(lines[1], "M:") || !strings.HasPrefix(lines[2], "Z:") {
		t.Fatalf("keys not sorted: %q", stdout)
	}
}

func TestPrintKeyValueDeterministic(t *testing.T) {
	p := NewPrinter(false)
	data := map[string]string{"日期": "2026-08-04", "内容": "hello", "ID": "abc"}
	first, _ := runWithWriters(func() { p.PrintKeyValue(data) })
	second, _ := runWithWriters(func() { p.PrintKeyValue(data) })
	if first != second {
		t.Fatalf("key-value output not deterministic:\n%q\n%q", first, second)
	}
}

func TestPrintTableAlignsByDisplayWidth(t *testing.T) {
	p := NewPrinter(false)
	stdout, _ := runWithWriters(func() {
		p.PrintTable([]string{"ID", "日期", "内容"}, []map[string]string{
			{"ID": "abc12345", "日期": "2026-08-04", "内容": "测试内容预览"},
			{"ID": "xy", "日期": "2026-08-03", "内容": "短"},
		})
	})
	lines := strings.Split(strings.TrimRight(stdout, "\n"), "\n")
	// line 0 = header, line 1 = separator, lines 2+ = rows
	if len(lines) < 4 {
		t.Fatalf("expected header+sep+rows, got %d lines: %q", len(lines), stdout)
	}
	rowWidth := displayWidth(lines[2])
	for _, l := range lines[2:] {
		if displayWidth(l) != rowWidth {
			t.Fatalf("row %q has width %d, want %d", l, displayWidth(l), rowWidth)
		}
	}
	if displayWidth(lines[0]) != rowWidth {
		t.Fatalf("header width %d != row width %d", displayWidth(lines[0]), rowWidth)
	}
}

func TestDisplayWidth(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"abc", 3},
		{"中文", 4},
		{"a中b", 4},
		{"", 0},
		{"１２３", 6}, // fullwidth digits
	}
	for _, c := range cases {
		if got := displayWidth(c.in); got != c.want {
			t.Errorf("displayWidth(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}
