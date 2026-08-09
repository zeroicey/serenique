package cmd

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
)

// authCmd 是 auth 命令组的父命令。
var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "认证管理",
	Long:  "配置、验证 Serenique 的 API Token（GitHub PAT 模式，可在 Web 设置页「API Token 管理」创建/撤销）。",
	Args:  cobra.NoArgs,
}

// auth login
var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "配置 API Token",
	Long: `将 API Token 写入配置文件并验证有效性。

API Token 在 Web 设置页「API Token 管理」中创建（首次配置需先在浏览器登录 Web
后创建令牌；之后可用已有令牌通过 serenique token create 再建）。
Token 仅保存在本机 ~/.serenique/config.yaml（0600 权限）。

示例:
  serenique auth login
  serenique auth login --token serenique_xxx   # 非交互式（供脚本/AI 使用）`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		token := strings.TrimSpace(authLoginToken)
		if token == "" {
			fmt.Fprint(os.Stderr, "请输入 API Token（Web 设置页「API Token 管理」创建；直接回车取消）: ")
			line, err := bufio.NewReader(os.Stdin).ReadString('\n')
			if err != nil {
				if errors.Is(err, io.EOF) {
					return errors.New("已取消：未输入 API Token")
				}
				return fmt.Errorf("读取输入失败: %w", err)
			}
			token = strings.TrimSpace(line)
		}
		if token == "" {
			return errors.New("API Token 不能为空")
		}

		// 用候选 Token 探测连通性（沿用当前 baseurl）。服务端只存哈希，前置
		// 校验只能带令牌请求一次受保护端点：200 = 令牌被接受，401 = 无效/已撤销。
		probe, err := client.NewClient(apiClient.BaseURL, token)
		if err != nil {
			return err
		}
		if _, err := probe.Me(commandContext(cmd)); err != nil {
			if isUnauthorized(err) {
				return errors.New("令牌无效或已被撤销（HTTP 401）：请确认令牌后重试")
			}
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
			printer.PrintSuccess("API Token 已保存", map[string]any{"token": maskToken(token)})
			return nil
		}
		printer.PrintMessage("✓ API Token 已保存到配置文件")
		return nil
	},
}

var authLoginToken string

// auth logout
var (
	authLogoutRevoke bool
	authLogoutForce  bool
)

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "清除本机 API Token",
	Long: `从配置文件中清除本机保存的 API Token。默认只删本地配置，服务端令牌仍有效；
如需一并撤销服务端令牌请加 --revoke（按前缀匹配服务端令牌，默认需确认）。

示例:
  serenique auth logout
  serenique auth logout --revoke      # 同时撤销服务端令牌
  serenique auth logout --revoke --force`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		if cfg.Token == "" {
			printer.PrintMessage("本机未配置 API Token，无需清除")
			return nil
		}

		revoked := false
		if authLogoutRevoke {
			var err error
			revoked, err = revokeStoredToken(cmd, cfg.Token)
			if err != nil {
				return err
			}
		}

		cfg.Token = ""
		if err := config.Save(cfg); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("已清除本机 API Token", map[string]any{"token": "", "revoked": revoked})
			return nil
		}
		if revoked {
			printer.PrintMessage("✓ 已清除本机 API Token 并撤销服务端令牌")
			return nil
		}
		if authLogoutRevoke {
			// --revoke 但服务端无匹配（已撤销/不存在）：stderr 已提示，此处不再重复。
			printer.PrintMessage("✓ 已清除本机 API Token")
			return nil
		}
		printer.PrintMessage("✓ 已清除本机 API Token（服务端令牌仍有效，如需撤销请使用 serenique token revoke 或 Web 管理页）")
		return nil
	},
}

// auth me
var authMeCmd = &cobra.Command{
	Use:   "me",
	Short: "验证认证状态",
	Long: `调用 GET /api/auth/me 验证当前 API Token 并显示用户信息。

注意：令牌身份返回单用户资料（服务端对有效令牌返回 authenticated:true +
user:单用户行；尚未注册用户时 user 为 null）。完整用户资料亦可在浏览器会话
（Web 设置页）查看。

示例:
  serenique auth me
  serenique auth me --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.Me(commandContext(cmd))
		if err != nil {
			if isUnauthorized(err) {
				return errors.New("未认证（401）：请先运行 serenique auth login 配置 API Token")
			}
			return err
		}

		if useJSON {
			// 原样透传 API 载荷 {authenticated, user}，供 AI/脚本判断。
			printer.PrintSuccess("认证状态", result)
			return nil
		}

		if result.User != nil {
			printer.PrintKeyValue(map[string]string{
				"认证状态": "已登录",
				"用户 ID": result.User.ID,
				"姓名":   orDash(result.User.Name),
				"邮箱":   orDash(result.User.Email),
				"生日":   orDash(result.User.Birthday),
			})
			return nil
		}
		if apiClient.Token != "" {
			// HTTP 200 且令牌身份：鉴权通过，但服务端暂无用户资料。
			printer.PrintKeyValue(map[string]string{
				"认证状态": "令牌有效（用户资料未设置）",
			})
			return nil
		}
		printer.PrintKeyValue(map[string]string{"认证状态": "未登录"})
		fmt.Fprintln(os.Stderr, "提示: 请先运行 serenique auth login 配置 API Token")
		return nil
	},
}

// revokeStoredToken 按前缀在服务端匹配本机存储的令牌并撤销（CLI 只存明文、
// 没有 token id；服务端 api_tokens 只存哈希 + 随机段前 8 位前缀，所以先列
// 表、再按重新计算的前缀精确匹配）。返回是否真的在服务端执行了撤销。
//
//   - 恰好 1 个未撤销匹配 → 确认后撤销，返回 true；
//   - 0 个匹配 → 令牌在服务端已不存在/已撤销，仅提示并继续本地清除（false）；
//   - 多个同前缀匹配 → 歧义，报错要求用 serenique token revoke <id> 手动撤销
//     （不删本地，避免用户误以为服务端已撤销）。
func revokeStoredToken(cmd *cobra.Command, stored string) (bool, error) {
	ctx := commandContext(cmd)
	items, err := apiClient.ListTokens(ctx)
	if err != nil {
		return false, fmt.Errorf("撤销失败：无法获取服务端令牌列表: %w", err)
	}
	candidate := tokenListPrefix(stored)

	var matches []client.TokenEntry
	for _, it := range items {
		if it.RevokedAt == "" && it.Prefix == candidate {
			matches = append(matches, it)
		}
	}

	switch len(matches) {
	case 0:
		fmt.Fprintln(os.Stderr, "⚠ 服务端未找到与本地令牌匹配的有效记录（可能已被撤销），仅清除本机令牌")
		return false, nil
	case 1:
		if err := confirm(fmt.Sprintf("确认撤销服务端令牌 %s（%s）", matches[0].Name, shortID(matches[0].ID)), authLogoutForce); err != nil {
			return false, err
		}
		if err := apiClient.RevokeToken(ctx, matches[0].ID); err != nil {
			return false, fmt.Errorf("撤销失败: %w", err)
		}
		return true, nil
	default:
		return false, fmt.Errorf("服务端存在 %d 个前缀相同的令牌，无法自动匹配；请使用 serenique token revoke <id> 手动撤销", len(matches))
	}
}

// tokenListPrefix 复刻 API 的 prefixOf：品牌前缀 serenique_ 恒定无熵，
// 随机段才是身份信息，列表 prefix 取随机段前 8 位。服务端只存哈希 + 该前缀，
// 因此用本机明文重新计算即可匹配服务端记录。
func tokenListPrefix(stored string) string {
	s := strings.TrimPrefix(stored, client.TokenBrandPrefix)
	return prefix(s, 8)
}

func init() {
	authLoginCmd.Flags().StringVar(&authLoginToken, "token", "", "API Token（省略则交互式输入）")
	authLogoutCmd.Flags().BoolVar(&authLogoutRevoke, "revoke", false, "同时撤销服务端令牌（按前缀匹配）")
	authLogoutCmd.Flags().BoolVarP(&authLogoutForce, "force", "f", false, "跳过撤销确认提示")
	authCmd.AddCommand(authLoginCmd)
	authCmd.AddCommand(authLogoutCmd)
	authCmd.AddCommand(authMeCmd)
}
