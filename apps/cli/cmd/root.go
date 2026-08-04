// Package cmd contains all CLI commands for the Serenique CLI tool.
//
// Global flags (--baseurl, --token, --json, --config) are registered on the
// root command and inherited by all subcommands. The effective config and
// client are resolved in the PersistentPreRunE hook.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
	"github.com/zeroicey/serenique-cli/internal/output"
)

// Shared state set by the root command's PersistentPreRunE.
var (
	resolvedConfig *config.Config
	apiClient      *client.Client
	printer        output.Printer
	useJSON        bool
)

// flag overrides
var (
	flagBaseURL string
	flagToken   string
	flagConfig  string
)

// Build-time version metadata, injected via -X main.version etc. (see Makefile).
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
	// Errors are already printed by the command handlers (printer.PrintError)
	// or are self-explanatory; do not dump usage text on top of them.
	SilenceUsage: true,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Honor --config/-c before loading config. This runs for every command
		// (including init) so `serenique init --config ...` writes to the target.
		if flagConfig != "" {
			config.SetPath(flagConfig)
		}

		// init creates the config itself — skip loading for it.
		if cmd.Name() == "init" {
			return nil
		}

		// Load config
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		// Resolve effective config (flags > env > file)
		resolvedConfig = config.Resolve(cfg, flagBaseURL, flagToken)

		// Create client and printer
		apiClient = client.NewClient(resolvedConfig.BaseURL, resolvedConfig.Token)
		printer = output.NewPrinter(useJSON)

		return nil
	},
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
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
