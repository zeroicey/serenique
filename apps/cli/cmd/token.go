package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// tokenCmd 是 token 命令组的父命令。管理可撤销的 API Token（GitHub PAT 模式），
// 供 CLI/脚本访问 API 使用。
var tokenCmd = &cobra.Command{
	Use:   "token",
	Short: "API Token 管理",
	Long: `管理 API Token（GitHub PAT 模式，供 CLI/脚本访问 API 使用）。

创建接口本身需要认证：首次使用需先在浏览器登录 Web 后，在「API Token 管理」
页创建令牌；之后即可用已有令牌通过 serenique token create 创建更多令牌。`,
	Args: cobra.NoArgs,
}

// token list
var tokenListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出 API 令牌",
	Long: `列出全部 API 令牌（含已撤销，无明文——服务端只保存哈希与前缀）。
令牌 ID 用于 token revoke 撤销。

示例:
  serenique token list
  serenique token list --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		items, err := apiClient.ListTokens(commandContext(cmd))
		if err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", map[string]any{"items": items})
			return nil
		}
		if len(items) == 0 {
			printer.PrintMessage("暂无 API 令牌")
			return nil
		}

		rows := make([]map[string]string, len(items))
		for i, it := range items {
			rows[i] = map[string]string{
				"ID":     shortID(it.ID),
				"前缀":     it.Prefix,
				"名称":     truncateRunes(it.Name, 30),
				"创建时间":   prefix(it.CreatedAt, 19),
				"最近使用":   orDashTime(it.LastUsedAt),
				"撤销时间":   orDashTime(it.RevokedAt),
			}
		}
		printer.PrintTable([]string{"ID", "前缀", "名称", "创建时间", "最近使用", "撤销时间"}, rows)
		fmt.Printf("\n共 %d 个令牌\n", len(items))
		return nil
	},
}

// token create
var tokenCreateCmd = &cobra.Command{
	Use:   "create <name>",
	Short: "创建 API 令牌",
	Long: `创建一个新的 API 令牌（≤100 字符名称）。明文仅在本次响应中返回一次，
请立即妥善保存——服务端只保存 SHA-256 哈希，之后无法再查看明文。

注意：创建接口本身需要认证（Bearer 即可）。首次使用需先在浏览器登录 Web 后，
在「API Token 管理」页创建令牌；之后可用已有令牌创建更多令牌。

示例:
  serenique token create macbook
  serenique token create server`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.CreateToken(commandContext(cmd), args[0])
		if err != nil {
			return err
		}

		// 明文仅此一次：stderr 提示（stdout 保持干净的结果通道）。这是令牌打码
		// 约定的唯一例外——创建响应是拿到明文的唯一机会。
		fmt.Fprintln(os.Stderr, "⚠ 明文仅此一次展示，请立即妥善保存！")

		if useJSON {
			// --json 下完整输出 data.plaintext（机器消费模式同样需要拿到明文）。
			printer.PrintSuccess("令牌创建成功（明文仅此一次展示，请立即保存）", result)
			return nil
		}
		printer.PrintSuccess("令牌创建成功（明文仅此一次展示，请立即保存）", nil)
		fmt.Println()
		printer.PrintKeyValue(map[string]string{
			"明文":   result.Plaintext,
			"前缀":   result.Item.Prefix,
			"名称":   result.Item.Name,
			"ID":   shortID(result.Item.ID),
			"创建时间": result.Item.CreatedAt,
		})
		return nil
	},
}

// token revoke
var tokenRevokeCmd = &cobra.Command{
	Use:   "revoke <id>",
	Short: "撤销 API 令牌",
	Long: `撤销指定的 API 令牌：撤销后该令牌立即失效且不可恢复（记录保留，列表仍可见）。
令牌 ID 可通过 serenique token list 查看。

示例:
  serenique token revoke a1b2c3d4-e5f6-7890-abcd-ef1234567890
  serenique token revoke <id> --force`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm(fmt.Sprintf("确认撤销 API 令牌 %s（撤销后不可恢复）", args[0]), tokenRevokeForce); err != nil {
			return err
		}
		if err := apiClient.RevokeToken(commandContext(cmd), args[0]); err != nil {
			return err
		}
		printDeleteResult("令牌已撤销", args[0])
		return nil
	},
}

var tokenRevokeForce bool

// orDashTime renders a nullable timestamp for table display: "-" when unset.
func orDashTime(s string) string {
	if s == "" {
		return "-"
	}
	return prefix(s, 19)
}

func init() {
	tokenRevokeCmd.Flags().BoolVarP(&tokenRevokeForce, "force", "f", false, "跳过确认提示")

	tokenCmd.AddCommand(tokenListCmd)
	tokenCmd.AddCommand(tokenCreateCmd)
	tokenCmd.AddCommand(tokenRevokeCmd)
}
