package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
	"github.com/zeroicey/serenique-cli/internal/config"
)

// configCmd represents the serenique config command.
var configCmd = &cobra.Command{
	Use:   "config",
	Short: "管理 CLI 配置",
	Long:  "查看或修改 Serenique CLI 的配置文件 (~/.serenique/config.yaml)。",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		configPath, err := config.Path()
		if err != nil {
			return err
		}
		if useJSON {
			// Never echo the raw token to stdout (captured/logged by AI/scripts);
			// mirror the masking used in table mode.
			printer.PrintSuccess("配置信息", map[string]any{
				"configPath": configPath,
				"baseurl":    cfg.BaseURL,
				"token":      maskToken(cfg.Token),
			})
			return nil
		}

		// Route table-mode output through the printer (see init.go) so the output
		// package's stream abstraction is the only writer to stdout.
		printer.PrintMessage(fmt.Sprintf("配置文件: %s", configPath))
		printer.PrintMessage("")
		kv := map[string]string{"baseurl": cfg.BaseURL}
		if cfg.Token != "" {
			kv["token"] = maskToken(cfg.Token)
		} else {
			kv["token"] = "(未设置)"
		}
		printer.PrintKeyValue(kv)

		return nil
	},
}

// configSetCmd represents the serenique config set command.
var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "修改配置项",
	Long: `修改配置文件中的指定配置项。

支持的 key:
  baseurl  - API 服务地址
  token    - API 令牌

示例:
  serenique config set baseurl http://localhost:3000
  serenique config set token serenique_xxx`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		value := args[1]

		cfg, err := config.Load()
		if err != nil {
			return err
		}

		switch key {
		case "baseurl":
			// Fail fast on a malformed base URL when it is written, so a config
			// typo never surfaces later as a cryptic request-time network error.
			if err := client.ValidateBaseURL(value); err != nil {
				return err
			}
			cfg.BaseURL = value
		case "token":
			cfg.Token = value
		default:
			return fmt.Errorf("未知的配置项: %s（支持的配置项: baseurl, token）", key)
		}

		if err := config.Save(cfg); err != nil {
			return err
		}

		if useJSON {
			// Mask the echoed value when it is a secret so --json output (captured
			// and logged by AI/scripts) never contains the raw token.
			echoValue := value
			if key == "token" {
				echoValue = maskToken(value)
			}
			printer.PrintSuccess("配置已更新", map[string]any{"key": key, "value": echoValue})
			return nil
		}

		printer.PrintMessage("✓ " + key + " 已更新")
		return nil
	},
}

// configPathCmd represents the serenique config path command.
var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "显示配置文件路径",
	Long:  "显示 Serenique CLI 配置文件的完整路径。",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		configPath, err := config.Path()
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("配置文件路径", map[string]any{"configPath": configPath})
			return nil
		}
		printer.PrintMessage(configPath)
		return nil
	},
}

func init() {
	configCmd.AddCommand(configSetCmd)
	configCmd.AddCommand(configPathCmd)
}
