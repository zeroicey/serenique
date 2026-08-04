package cmd

import (
	"bufio"
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
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		// Load existing config if available (for re-init)
		existing, _ := config.Load()
		if existing != nil {
			cfg = existing
		}

		scanner := bufio.NewScanner(os.Stdin)

		// BaseURL
		if flagBaseURL != "" {
			cfg.BaseURL = flagBaseURL
		} else {
			fmt.Printf("API 服务地址 [%s]: ", cfg.BaseURL)
			if scanner.Scan() {
				input := strings.TrimSpace(scanner.Text())
				if input != "" {
					cfg.BaseURL = input
				}
			}
		}

		// Token
		if flagToken != "" {
			cfg.Token = flagToken
		} else {
			fmt.Printf("认证令牌 (可选，直接回车跳过) [%s]: ", maskToken(cfg.Token))
			if scanner.Scan() {
				input := strings.TrimSpace(scanner.Text())
				if input != "" {
					cfg.Token = input
				}
			}
		}

		if err := config.Save(cfg); err != nil {
			return err
		}

		configPath, _ := config.Path()
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

func init() {
	initCmd.Flags().StringVar(&flagBaseURL, "baseurl", "", "API 服务地址")
	initCmd.Flags().StringVar(&flagToken, "token", "", "认证令牌")
}
