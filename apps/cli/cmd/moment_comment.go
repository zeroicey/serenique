package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// momentCommentCmd is the parent moment comment command, nested under momentCmd.
// Comments are a sub-resource of moments (nested under /api/moments/:id/comments),
// so the subcommand name is the singular noun "comment", mirroring "task group".
var momentCommentCmd = &cobra.Command{
	Use:   "comment",
	Short: "闪念评论管理",
	Long:  "管理闪念下的评论，支持列出、添加、更新和删除。",
	Args:  cobra.NoArgs,
}

// moment comment list
var momentCommentListCmd = &cobra.Command{
	Use:   "list <moment-id>",
	Short: "列出闪念评论",
	Long: `列出指定闪念的全部评论（按时间正序）。

示例:
  serenique moment comment list a1b2c3d4-e5f6-7890-abcd-ef1234567890
  serenique moment comment list a1b2c3d4 --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		var result []client.MomentCommentEntry
		if err := apiClient.Get(commandContext(cmd), "/api/moments/"+args[0]+"/comments", nil, &result); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		if len(result) == 0 {
			printer.PrintMessage("暂无评论")
			return nil
		}

		headers := []string{"ID", "内容", "创建时间"}
		rows := make([]map[string]string, len(result))
		for i, c := range result {
			rows[i] = map[string]string{
				"ID":   shortID(c.ID),
				"内容":   truncateRunes(c.Content, 50),
				"创建时间": prefix(c.CreatedAt, 19),
			}
		}
		printer.PrintTable(headers, rows)
		fmt.Printf("\n共 %d 条评论\n", len(result))
		return nil
	},
}

// moment comment add
var momentCommentAddCmd = &cobra.Command{
	Use:   "add <moment-id>",
	Short: "添加闪念评论",
	Long: `为指定闪念添加一条评论。内容 1..2000 字。

示例:
  serenique moment comment add a1b2c3d4-e5f6-7890-abcd-ef1234567890 -m "说得对"
  serenique moment comment add a1b2c3d4 --content "补充一点..."`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		body := map[string]string{"content": momentCommentAddContent}

		var result client.MomentCommentEntry
		if err := apiClient.Post(commandContext(cmd), "/api/moments/"+args[0]+"/comments", body, &result); err != nil {
			return err
		}

		printCreateResult("评论创建成功", result, "评论创建成功", map[string]string{
			"ID":   result.ID,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var momentCommentAddContent string

// moment comment update
var momentCommentUpdateCmd = &cobra.Command{
	Use:   "update <moment-id> <comment-id>",
	Short: "更新闪念评论",
	Long: `更新指定闪念上的一条评论内容。内容 1..2000 字。

示例:
  serenique moment comment update a1b2c3d4 e5f6a1b2 -m "修改后的内容"
  serenique moment comment update a1b2c3d4 e5f6a1b2 --content "修改后的内容"`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		body := map[string]string{"content": momentCommentUpdateContent}

		var result client.MomentCommentEntry
		if err := apiClient.Put(commandContext(cmd), "/api/moments/"+args[0]+"/comments/"+args[1], body, &result); err != nil {
			return err
		}

		printCreateResult("评论更新成功", result, "评论更新成功", map[string]string{
			"ID":   result.ID,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var momentCommentUpdateContent string

// moment comment delete
var momentCommentDeleteCmd = &cobra.Command{
	Use:   "delete <moment-id> <comment-id>",
	Short: "删除闪念评论",
	Long: `删除指定闪念上的一条评论。此操作不可撤销，默认需要确认。

示例:
  serenique moment comment delete a1b2c3d4 e5f6a1b2
  serenique moment comment delete a1b2c3d4 e5f6a1b2 --force`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm("确认删除闪念评论 "+args[1], momentCommentDeleteForce); err != nil {
			return err
		}

		if err := apiClient.Delete(commandContext(cmd), "/api/moments/"+args[0]+"/comments/"+args[1]); err != nil {
			return err
		}

		printDeleteResult("评论已删除", args[1])
		return nil
	},
}

var momentCommentDeleteForce bool

func init() {
	// The --content flag is shared by add/update; shorthand is -m (not -c, which
	// the root --config persistent flag already claims and would collide with).
	momentCommentAddCmd.Flags().StringVarP(&momentCommentAddContent, "content", "m", "", "评论内容，1..2000 字 (必填)")
	momentCommentAddCmd.MarkFlagRequired("content")
	momentCommentUpdateCmd.Flags().StringVarP(&momentCommentUpdateContent, "content", "m", "", "新评论内容，1..2000 字 (必填)")
	momentCommentUpdateCmd.MarkFlagRequired("content")
	momentCommentDeleteCmd.Flags().BoolVarP(&momentCommentDeleteForce, "force", "f", false, "跳过确认提示")

	momentCommentCmd.AddCommand(momentCommentListCmd)
	momentCommentCmd.AddCommand(momentCommentAddCmd)
	momentCommentCmd.AddCommand(momentCommentUpdateCmd)
	momentCommentCmd.AddCommand(momentCommentDeleteCmd)

	momentCmd.AddCommand(momentCommentCmd)
}
