package cmd

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/config"
)

// initCmd represents the serenique init command.
var initCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化 Serenique CLI 配置",
	Long: `初始化 Serenique CLI 配置，交互式提示输入 baseurl 和 token。
配置文件保存在 ~/.serenique/config.yaml。

也可以通过命令行参数直接设置：
  serenique init --baseurl http://localhost:3000 --token mytoken`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Loads the existing config (or defaults) so re-init can reuse values.
		// The path is already pinned by PersistentPreRunE via --config/-c.
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		scanner := bufio.NewScanner(os.Stdin)

		// Prompts are written to stderr so stdout stays a clean channel (and a
		// single parseable JSON document in --json mode).
		eof := false
		if flagBaseURL != "" {
			cfg.BaseURL = flagBaseURL
		} else {
			fmt.Fprintf(os.Stderr, "API 服务地址 [%s]: ", cfg.BaseURL)
			if scanner.Scan() {
				input := strings.TrimSpace(scanner.Text())
				if input != "" {
					cfg.BaseURL = input
				}
			} else {
				eof = true
			}
		}

		if flagToken != "" {
			cfg.Token = flagToken
		} else {
			fmt.Fprintf(os.Stderr, "认证令牌 (可选，直接回车跳过) [%s]: ", maskToken(cfg.Token))
			if scanner.Scan() {
				input := strings.TrimSpace(scanner.Text())
				if input != "" {
					cfg.Token = input
				}
			} else {
				eof = true
			}
		}

		// Non-interactive stdin (pipe, CI, AI agent) hits EOF immediately: the
		// prompts above read nothing. Without explicit --baseurl/--token this
		// would silently write the untouched default/localhost config, which is
		// never what the caller asked for. Fail loudly instead.
		if eof && flagBaseURL == "" && flagToken == "" {
			return errors.New("检测到非交互式输入（EOF）：请通过 --baseurl/--token 参数指定，或在终端中运行 serenique init")
		}

		if err := config.Save(cfg); err != nil {
			return err
		}

		configPath, err := config.Path()
		if err != nil {
			return err
		}
		if useJSON {
			// Never echo the raw token to stdout: --json output is captured and
			// logged by AI/script consumers. Mirror the masking used in table mode.
			printer.PrintSuccess("配置已保存", map[string]any{
				"configPath": configPath,
				"baseurl":    cfg.BaseURL,
				"token":      maskToken(cfg.Token),
			})
			return nil
		}

		fmt.Printf("\n✓ 配置已保存到 %s\n", configPath)
		fmt.Printf("  baseurl: %s\n", cfg.BaseURL)
		if cfg.Token != "" {
			fmt.Printf("  token:   %s\n", maskToken(cfg.Token))
		} else {
			fmt.Println("  token:   (未设置)")
		}

		return nil
	},
}

func maskToken(token string) string {
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return strings.Repeat("*", len(token))
	}
	return token[:4] + strings.Repeat("*", len(token)-8) + token[len(token)-4:]
}
