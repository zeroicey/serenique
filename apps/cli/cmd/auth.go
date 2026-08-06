package cmd

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
)

// AuthStatus 匹配 API 的 GET /api/auth/me 响应 data。
type AuthStatus struct {
	Authenticated bool `json:"authenticated"`
}

// authCmd 是 auth 命令组的父命令。
var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "认证管理",
	Long:  "配置、验证 Serenique 的认证密钥（部署时在服务端 .env 配置的 AUTH_TOKEN）。",
	Args:  cobra.NoArgs,
}

// auth login
var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "配置认证密钥",
	Long: `将认证密钥写入配置文件并验证连通性。

示例:
  serenique auth login
  serenique auth login --token <secret>   # 非交互式（供脚本/AI 使用）`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		token := strings.TrimSpace(authLoginToken)
		if token == "" {
			fmt.Fprint(os.Stderr, "请输入认证密钥: ")
			line, err := bufio.NewReader(os.Stdin).ReadString('\n')
			if err != nil {
				return fmt.Errorf("读取输入失败: %w", err)
			}
			token = strings.TrimSpace(line)
		}
		if token == "" {
			return errors.New("认证密钥不能为空")
		}

		// 用候选密钥验证连通性（沿用当前 baseurl）
		probe, err := client.NewClient(apiClient.BaseURL, token)
		if err != nil {
			return err
		}
		var status AuthStatus
		if err := probe.Get(commandContext(cmd), "/api/auth/me", nil, &status); err != nil {
			return err
		}

		cfg, err := config.Load()
		if err != nil {
			return err
		}
		cfg.Token = token
		if err := config.Save(cfg); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("认证密钥已保存", map[string]any{"token": maskToken(token)})
			return nil
		}
		printer.PrintMessage("✓ 认证密钥已保存到配置文件")
		return nil
	},
}

var authLoginToken string

// auth logout
var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "清除认证密钥",
	Long:  "从配置文件中清除已保存的认证密钥。",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		cfg.Token = ""
		if err := config.Save(cfg); err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("已清除认证密钥", map[string]any{"token": ""})
			return nil
		}
		printer.PrintMessage("✓ 已清除认证密钥")
		return nil
	},
}

// auth me
var authMeCmd = &cobra.Command{
	Use:   "me",
	Short: "验证认证状态",
	Long:  "调用 GET /api/auth/me 验证当前认证密钥是否有效。",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		var status AuthStatus
		if err := apiClient.Get(commandContext(cmd), "/api/auth/me", nil, &status); err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("认证状态", map[string]any{"authenticated": status.Authenticated})
			return nil
		}
		printer.PrintKeyValue(map[string]string{"认证状态": fmt.Sprintf("%v", status.Authenticated)})
		return nil
	},
}

func init() {
	authLoginCmd.Flags().StringVar(&authLoginToken, "token", "", "认证密钥（省略则交互式输入）")
	authCmd.AddCommand(authLoginCmd)
	authCmd.AddCommand(authLogoutCmd)
	authCmd.AddCommand(authMeCmd)
}
