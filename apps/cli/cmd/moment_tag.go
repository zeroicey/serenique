package cmd

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

// momentTagCmd is the parent moment tag command, nested under momentCmd. Tags
// on a moment are a nested sub-resource (/api/moments/:id/tags), so the
// subcommand name is the singular noun "tag", mirroring "moment comment".
var momentTagCmd = &cobra.Command{
	Use:   "tag",
	Short: "闪念标签管理",
	Long:  "管理闪念上的标签，支持添加、移除和整体替换。",
	Args:  cobra.NoArgs,
}

// moment tag add
var momentTagAddCmd = &cobra.Command{
	Use:   "add <moment-id> <tag-id>",
	Short: "为闪念添加标签",
	Long: `将已存在的标签绑定到闪念。重复绑定会被服务端拒绝（409）。

示例:
  serenique moment tag add a1b2c3d4 e5f6a1b2`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.AddMomentTag(commandContext(cmd), args[0], args[1])
		if err != nil {
			return err
		}
		kv := map[string]string{
			"标签 ID": shortID(args[1]),
			"闪念 ID": shortID(args[0]),
		}
		if result.ID != "" {
			kv["关联 ID"] = shortID(result.ID)
		}
		printCreateResult("标签绑定成功", result, "标签绑定成功", kv)
		return nil
	},
}

// moment tag remove
var momentTagRemoveCmd = &cobra.Command{
	Use:   "remove <moment-id> <tag-id>",
	Short: "移除闪念上的标签",
	Long: `解除闪念与标签的绑定。此操作仅删除关联，不会删除标签本身。默认需要确认。

示例:
  serenique moment tag remove a1b2c3d4 e5f6a1b2
  serenique moment tag remove a1b2c3d4 e5f6a1b2 --force`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm("确认移除闪念标签 "+args[1], momentTagRemoveForce); err != nil {
			return err
		}
		if err := apiClient.RemoveMomentTag(commandContext(cmd), args[0], args[1]); err != nil {
			return err
		}
		printDeleteResult("标签关联已移除", args[1])
		return nil
	},
}

var momentTagRemoveForce bool

// moment tag set
var momentTagSetCmd = &cobra.Command{
	Use:   "set <moment-id> <tag-id>[,tag-id...]",
	Short: "整体替换闪念的标签",
	Long: `将闪念的标签整体替换为给定集合（幂等：已在集合中的保持不变，缺失的补上，多余的移除）。
标签 ID 用逗号分隔；传入空串表示清空全部标签；不存在的标签 ID 会导致整个操作失败。

示例:
  serenique moment tag set a1b2c3d4 t1,t2,t3
  serenique moment tag set a1b2c3d4 "t1, t2"
  serenique moment tag set a1b2c3d4 ""`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		var tagIDs []string
		var err error
		if args[1] != "" {
			if tagIDs, err = parseTagIDList(args[1]); err != nil {
				return err
			}
		} else {
			// 空参数 = 空数组 = 清空全部标签（API 的幂等集合语义）。
			tagIDs = []string{}
		}

		result, err := apiClient.ReplaceMomentTags(commandContext(cmd), args[0], tagIDs)
		if err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("标签已更新", result)
			return nil
		}
		if len(result) == 0 {
			printer.PrintMessage("该闪念暂无标签")
			return nil
		}
		printer.PrintMessage("当前标签:")
		headers := []string{"ID", "名称", "使用次数"}
		rows := make([]map[string]string, len(result))
		for i, t := range result {
			rows[i] = map[string]string{
				"ID":   shortID(t.ID),
				"名称":   truncateRunes(t.Name, 30),
				"使用次数": strconv.Itoa(t.MomentCount),
			}
		}
		printer.PrintTable(headers, rows)
		return nil
	},
}

// parseTagIDList splits a comma-separated tag id list, trimming surrounding
// whitespace. An empty segment (e.g. "t1,,t2") is an error rather than being
// silently dropped, so a typo'd separator never sends a partial tag set.
func parseTagIDList(s string) ([]string, error) {
	parts := strings.Split(s, ",")
	ids := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			return nil, fmt.Errorf("标签 ID 列表包含空白项（检查逗号附近是否有多余的空格或逗号）")
		}
		ids = append(ids, p)
	}
	return ids, nil
}

func init() {
	momentTagRemoveCmd.Flags().BoolVarP(&momentTagRemoveForce, "force", "f", false, "跳过确认提示")

	momentTagCmd.AddCommand(momentTagAddCmd)
	momentTagCmd.AddCommand(momentTagRemoveCmd)
	momentTagCmd.AddCommand(momentTagSetCmd)

	momentCmd.AddCommand(momentTagCmd)
}
