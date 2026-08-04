// Package cmd contains all CLI commands for the Serenique CLI tool.
//
// Global flags (--baseurl, --token, --json, --config) are registered on the
// root command and inherited by all subcommands. The effective config and
// client are resolved in the PersistentPreRunE hook.
package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
	"github.com/zeroicey/serenique-cli/internal/output"
)

// Shared state set by the root command's PersistentPreRunE.
var (
	apiClient *client.Client
	printer   output.Printer
	useJSON   bool
)

// flag overrides
var (
	flagBaseURL string
	flagToken   string
	flagConfig  string
)

// Build-time version metadata. The Makefile's ldflags target the MAIN package's
// copies of these names (main.version / main.commit / main.date); main.go then
// feeds them into SetVersion, which is the ONLY mutation point for these values
// here. The two var blocks must stay in sync in name and default — see main.go.
var (
	version = "dev"
	commit  = "unknown"
	date    = ""
)

// SetVersion wires the ldflags-injected build metadata into the root command
// so `serenique --version` reports it. Called from main before Execute.
func SetVersion(v, c, d string) {
	if v != "" {
		version = v
	}
	if c != "" {
		commit = c
	}
	if d != "" {
		date = d
	}

	display := version
	if commit != "" && commit != "unknown" {
		display = fmt.Sprintf("%s (commit %s)", display, commit)
	}
	if date != "" {
		display = fmt.Sprintf("%s, built %s", display, date)
	}
	rootCmd.Version = display
}

// rootCmd is the base command.
var rootCmd = &cobra.Command{
	Use:   "serenique",
	Short: "Serenique CLI — 个人日记与笔记管理工具",
	Long: `Serenique CLI 是一个命令行工具，用于与 Serenique API 服务交互。

通过该工具，你可以：
  - 管理日记（创建、查看、更新、删除）
  - 管理闪念笔记（创建、查看、删除）
  - 上传和管理文件（上传、下载、关联到业务实体）

使用 "serenique [command] --help" 查看各命令的详细用法。`,
	// Errors are rendered exactly once by Execute() (via the printer, or a
	// plain-text fallback for errors that occur before the printer exists), so
	// cobra must not print its own "Error:" line on top.
	SilenceUsage:  true,
	SilenceErrors: true,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Honor --config/-c before loading config. This runs for every command
		// (including init) so `serenique init --config ...` writes to the target.
		if flagConfig != "" {
			config.SetPath(flagConfig)
		}

		// The printer is set up before anything that can fail so every error
		// path (including a config load failure below) renders consistently.
		printer = output.NewPrinter(useJSON)

		// init creates the config itself — skip loading for it.
		if cmd.Name() == "init" {
			return nil
		}

		// Load config
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		// Resolve effective config (flags > env > file) and build the client
		// directly from the result — no intermediate global.
		resolved := config.Resolve(cfg, flagBaseURL, flagToken)
		apiClient = client.NewClient(resolved.BaseURL, resolved.Token)
		printer = output.NewPrinter(useJSON)

		return nil
	},
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

// Execute runs the root command and owns error rendering: the returned error is
// printed exactly once (via the printer when available, so --json mode gets a
// structured error object on stderr; plain-text otherwise). Command handlers
// must not print errors themselves; the sole exception is a batch command that
// returns a *renderedError to signal failure without re-rendering the already
// printed per-file messages.
//
// Cobra validates args and required flags before PersistentPreRunE runs, so
// errors like `diary get --json` with a missing id occur before the printer is
// constructed. To keep --json mode a reliable contract for AI/scripts, --json/-j
// is detected from os.Args up front and such early errors fall back to a JSON
// error object on stderr instead of a plain-text line.
func Execute() {
	jsonRequested := flagJSONRequested()
	if jsonRequested {
		useJSON = true
	}

	err := rootCmd.Execute()
	if err == nil {
		return
	}
	renderExecutionError(err, jsonRequested)
	os.Exit(1)
}

// renderExecutionError prints a command error exactly once. A *renderedError
// (already printed inline by a batch command) is silenced — the exit code alone
// signals failure. Otherwise the error goes through the printer, or falls back
// to a JSON object on stderr in --json mode, or a plain-text line.
func renderExecutionError(err error, jsonRequested bool) {
	var rendered *renderedError
	if errors.As(err, &rendered) {
		return
	}
	if printer != nil {
		printer.PrintError(err.Error())
	} else if jsonRequested {
		// Pre-printer JSON fallback: mirror the JSONPrinter's error shape but
		// write to os.Stderr directly — the printer binds its stderr at package
		// init, and this branch runs before any printer exists. MarshalIndent
		// with a single-key map yields the identical {"error": ...} document.
		b, _ := json.MarshalIndent(map[string]string{"error": err.Error()}, "", "  ")
		fmt.Fprintln(os.Stderr, string(b))
	} else {
		fmt.Fprintf(os.Stderr, "✗ 错误: %s\n", err.Error())
	}
}

// flagJSONRequested reports whether --json or -j (with or without an explicit
// =true/=false value) appears on the command line, without requiring cobra to
// have parsed flags yet (Execute runs before flag parsing). It matches the
// documented flag spellings plus the =value forms, so `-j=true` pre-arms the
// JSON error fallback just like bare `-j` does. Values are parsed with
// strconv.ParseBool to mirror pflag's accepted boolean spellings (1, t, true,
// 0, f, false...). An unparseable value is treated as JSON-requested: cobra will
// reject it with an error, and rendering that error as JSON matches the user's
// intent. Scanning stops at the first match; bare --json/-j and =false forms
// combine in the same way pflag's last-wins semantics handle them for the
// common cases this pre-scan exists to cover.
func flagJSONRequested() bool {
	return flagJSONRequestedFrom(os.Args[1:])
}

// flagJSONRequestedFrom is the pure argument scan used by flagJSONRequested;
// extracted for testability.
func flagJSONRequestedFrom(args []string) bool {
	for _, a := range args {
		switch {
		case a == "--json" || a == "-j":
			return true
		case strings.HasPrefix(a, "--json="):
			if v, err := strconv.ParseBool(a[len("--json="):]); err == nil {
				return v
			}
			return true // unparseable value — cobra will reject it
		case strings.HasPrefix(a, "-j="):
			if v, err := strconv.ParseBool(a[len("-j="):]); err == nil {
				return v
			}
			return true
		}
	}
	return false
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&flagBaseURL, "baseurl", "b", "", "API 服务地址（覆盖配置文件）")
	rootCmd.PersistentFlags().StringVarP(&flagToken, "token", "t", "", "认证令牌（覆盖配置文件）")
	rootCmd.PersistentFlags().BoolVarP(&useJSON, "json", "j", false, "以 JSON 格式输出（供 AI 和脚本使用）")
	rootCmd.PersistentFlags().StringVarP(&flagConfig, "config", "c", "", "配置文件路径（默认 ~/.serenique/config.yaml）")

	// Register subcommands
	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(configCmd)
	rootCmd.AddCommand(diaryCmd)
	rootCmd.AddCommand(momentCmd)
	rootCmd.AddCommand(blobCmd)
}
