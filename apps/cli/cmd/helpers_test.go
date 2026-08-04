package cmd

import (
	"io"
	"os"
	"strings"
	"testing"
	"unicode/utf8"
)

// withStdin replaces os.Stdin with a pipe whose read end contains input (or is
// at EOF when input is empty), restoring the original on cleanup.
func withStdin(t *testing.T, input string) {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	if input != "" {
		if _, err := w.WriteString(input); err != nil {
			t.Fatal(err)
		}
	}
	w.Close()
	old := os.Stdin
	os.Stdin = r
	t.Cleanup(func() {
		os.Stdin = old
		r.Close()
	})
}

// captureStderr swaps os.Stderr, runs fn, and returns everything written to
// stderr while it was swapped.
func captureStderr(t *testing.T, fn func()) string {
	t.Helper()
	return captureStream(t, &os.Stderr, fn)
}

// captureStdout swaps os.Stdout, runs fn, and returns everything written to
// stdout while it was swapped.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	return captureStream(t, &os.Stdout, fn)
}

// captureStream swaps the given os package stream var (*os.File, i.e.
// os.Stdout/os.Stderr), runs fn, and returns everything written to it while
// swapped.
func captureStream(t *testing.T, stream **os.File, fn func()) string {
	t.Helper()
	old := *stream
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	*stream = w
	t.Cleanup(func() {
		*stream = old
		w.Close()
		r.Close()
	})
	fn()
	w.Close()
	b, _ := io.ReadAll(r)
	return string(b)
}

func TestConfirmForceSkipsPrompt(t *testing.T) {
	if err := confirm("确认删除", true); err != nil {
		t.Fatalf("force should skip prompting, got %v", err)
	}
}

func TestConfirmYes(t *testing.T) {
	withStdin(t, "y\n")
	if err := confirm("确认删除", false); err != nil {
		t.Fatalf("expected confirm on 'y', got %v", err)
	}
}

func TestConfirmCapitalY(t *testing.T) {
	withStdin(t, "Y\n")
	if err := confirm("确认删除", false); err != nil {
		t.Fatalf("expected confirm on 'Y', got %v", err)
	}
}

func TestConfirmNo(t *testing.T) {
	withStdin(t, "n\n")
	if err := confirm("确认删除", false); err == nil {
		t.Fatal("expected error when declining")
	}
}

func TestConfirmEOFIsHardError(t *testing.T) {
	// Empty input means the read end is at EOF immediately — the non-interactive
	// stdin case (pipe, CI, AI agent). It must be a hard error, not a silent
	// success.
	withStdin(t, "")
	if err := confirm("确认删除", false); err == nil {
		t.Fatal("expected hard error on EOF, got nil")
	}
}

func TestConfirmPromptGoesToStderr(t *testing.T) {
	withStdin(t, "") // EOF — never a successful confirmation
	out := captureStderr(t, func() {
		_ = confirm("确认永久删除文件 abc", false)
	})
	if !strings.Contains(out, "确认永久删除文件 abc") {
		t.Fatalf("prompt should be written to stderr, got %q", out)
	}
}

func TestTruncateRunesShortNoOp(t *testing.T) {
	if got := truncateRunes("短", 40); got != "短" {
		t.Fatalf("short string should be unchanged, got %q", got)
	}
	if got := truncateRunes("", 10); got != "" {
		t.Fatalf("empty string should stay empty, got %q", got)
	}
	if got := truncateRunes("abcde", 5); got != "abcde" {
		t.Fatalf("exact-length string should be unchanged, got %q", got)
	}
}

func TestTruncateRunesDoesNotSplitCJK(t *testing.T) {
	in := "MCP 工具调用流程：先用 search 发现工具 → describe 查看参数 → call 执行调用。"
	out := truncateRunes(in, 10)
	if !utf8.ValidString(out) {
		t.Fatalf("output is not valid UTF-8: %q", out)
	}
	// 10 runes + "..." = 13 runes max.
	if n := utf8.RuneCountInString(out); n > 13 {
		t.Fatalf("output has %d runes, want <= 13", n)
	}
	if !strings.HasSuffix(out, "...") {
		t.Fatalf("expected ellipsis suffix, got %q", out)
	}
}

func TestTruncateRunesExact(t *testing.T) {
	if got := truncateRunes("一二三四五六七八九十", 5); got != "一二三四五..." {
		t.Fatalf("truncateRunes = %q, want 一二三四五...", got)
	}
}

func TestShortIDToleratesShortAndLongInput(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"ab", "ab"},            // free-form ownerId shorter than 8 — must not panic
		{"abcdefgh", "abcdefgh"}, // exactly 8 runes — unchanged
		{"abcdefghi", "abcdefgh..."},
		{"一二三四五六七八", "一二三四五六七八"}, // 8 runes — unchanged
		{"一二三四五六七八九", "一二三四五六七八..."}, // multi-byte truncation must not split a rune
	}
	for _, tc := range cases {
		if got := shortID(tc.in); got != tc.want {
			t.Errorf("shortID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
