package cmd

import (
	"fmt"
	"os"
	"strconv"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// momentCmd is the parent moment command.
var momentCmd = &cobra.Command{
	Use:   "moment",
	Short: "闪念管理",
	Long:  "管理闪念笔记（轻量级快速记录），支持创建、列出、删除和附件关联。",
	Args:  cobra.NoArgs,
}

// moment list
var momentListCmd *cobra.Command

var (
	momentListPage     int
	momentListPageSize int
	momentListAll      bool
)

// moment create
var momentCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建闪念",
	Long: `创建一条闪念笔记。内容最长 500 字，可同时关联已上传的文件（用 --blob-id，可重复指定多个）。

示例:
  serenique moment create --text "突然想到一个好主意..."
  serenique moment create -m "记录一个灵感"
  serenique moment create -m "好想法" --blob-id e5f6a1b2 --role cover --display-name "配图"
  serenique moment create -m "好想法" --blob-id e5f6a1b2 --blob-id a1b2c3d4`,
	RunE: func(cmd *cobra.Command, args []string) error {
		body := map[string]any{"text": momentCreateText}
		if len(momentCreateBlobIDs) > 0 {
			// Mirror the API's MomentAttachmentInputSchema so a moment with media
			// is created in one call instead of create + attach (the two-step
			// dance an AI agent otherwise needs two tool calls for).
			body["attachments"] = momentAttachments(
				momentCreateBlobIDs, momentCreateRole, momentCreateDisplayName,
				momentCreateSortOrder, cmd.Flags().Changed("sort-order"))
		}

		var result client.MomentEntry
		if err := apiClient.Post(commandContext(cmd), "/api/moments", body, &result); err != nil {
			return err
		}

		printCreateResult("闪念创建成功", result, "闪念创建成功", map[string]string{
			"ID":   result.ID,
			"内容":   result.Text,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var (
	momentCreateText        string
	momentCreateBlobIDs     []string
	momentCreateRole        string
	momentCreateDisplayName string
	momentCreateSortOrder   int
)

// momentAttachments builds the attachments array for moment create from the
// create command's flag state, mirroring the API's MomentAttachmentInputSchema
// ({blobId, role, displayName?, sortOrder?}). sortOrderSet controls whether
// sortOrder is included at all (the API auto-numbers otherwise); when set with
// multiple blobs, sort orders increment from the flag value so they never tie.
func momentAttachments(blobIDs []string, role, displayName string, sortOrder int, sortOrderSet bool) []map[string]any {
	attachments := make([]map[string]any, 0, len(blobIDs))
	for i, blobID := range blobIDs {
		item := map[string]any{
			"blobId":   blobID,
			"role":     role,
			"metadata": map[string]any{},
		}
		if displayName != "" {
			item["displayName"] = displayName
		}
		if sortOrderSet {
			item["sortOrder"] = sortOrder + i
		}
		attachments = append(attachments, item)
	}
	return attachments
}

// moment get
var momentGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看闪念详情",
	Long: `根据 ID 查看闪念的完整内容及其附件列表。

示例:
  serenique moment get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		var result client.MomentEntry
		if err := apiClient.Get(commandContext(cmd), "/api/moments/"+args[0], nil, &result); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"内容":   result.Text,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
			"评论数":  strconv.Itoa(result.CommentCount),
		})

		if len(result.Attachments) > 0 {
			fmt.Println()
			printer.PrintMessage("附件:")
			headers := []string{"ID", "文件 ID", "角色", "显示名称", "排序"}
			rows := make([]map[string]string, len(result.Attachments))
			for i, a := range result.Attachments {
				dn := "-"
				if a.DisplayName != nil {
					dn = *a.DisplayName
				}
				rows[i] = map[string]string{
					"ID":    shortID(a.ID),
					"文件 ID": shortID(a.BlobID),
					"角色":    a.Role,
					"显示名称":  dn,
					"排序":    strconv.Itoa(a.SortOrder),
				}
			}
			printer.PrintTable(headers, rows)
		}

		if len(result.Comments) > 0 {
			fmt.Println()
			printer.PrintMessage("评论:")
			headers := []string{"ID", "内容", "创建时间"}
			rows := make([]map[string]string, len(result.Comments))
			for i, c := range result.Comments {
				rows[i] = map[string]string{
					"ID":   shortID(c.ID),
					"内容":   truncateRunes(c.Content, 50),
					"创建时间": prefix(c.CreatedAt, 19),
				}
			}
			printer.PrintTable(headers, rows)
		}
		return nil
	},
}

// moment delete
var momentDeleteCmd *cobra.Command

var momentDeleteForce bool

// moment attach
var momentAttachCmd = &cobra.Command{
	Use:   "attach <moment-id>",
	Short: "为闪念关联附件",
	Long: `将已上传的文件关联到闪念。

示例:
  serenique moment attach a1b2c3d4 --blob-id e5f6a1b2
  serenique moment attach a1b2c3d4 --blob-id e5f6a1b2 --role cover --display-name "配图"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		body := attachmentBody(momentAttachBlobID, momentAttachRole, momentAttachDisplayName,
			momentAttachSortOrder, cmd.Flags().Changed("sort-order"), nil)

		var result client.MomentAttachmentEntry
		if err := apiClient.Post(commandContext(cmd), "/api/moments/"+args[0]+"/attachments", body, &result); err != nil {
			return err
		}

		dn := "-"
		if result.DisplayName != nil {
			dn = *result.DisplayName
		}
		printCreateResult("附件关联成功", result, "附件关联成功", map[string]string{
			"ID":    result.ID,
			"文件 ID": result.BlobID,
			"角色":    result.Role,
			"显示名称":  dn,
		})
		return nil
	},
}

var (
	momentAttachBlobID      string
	momentAttachRole        string
	momentAttachDisplayName string
	momentAttachSortOrder   int
)

// moment detach
var momentDetachCmd = &cobra.Command{
	Use:   "detach <moment-id> <attachment-id>",
	Short: "删除闪念附件关联",
	Long: `删除闪念上的一条附件关联。此操作仅删除引用，不会删除物理文件。

示例:
  serenique moment detach a1b2c3d4 e5f6a1b2
  serenique moment detach a1b2c3d4 e5f6a1b2 --force`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm("确认删除闪念附件 "+args[1], momentDetachForce); err != nil {
			return err
		}

		if err := apiClient.Delete(commandContext(cmd), "/api/moments/"+args[0]+"/attachments/"+args[1]); err != nil {
			return err
		}

		printDeleteResult("附件关联已删除", args[1])
		return nil
	},
}

var momentDetachForce bool

// moment edit
var momentEditCmd = &cobra.Command{
	Use:   "edit <id>",
	Short: "编辑闪念正文",
	Long: `修改指定闪念的正文（1..500 字）。命令先读取当前内容供你确认，
提交前必须经过确认交互（非交互 stdin 视为取消）。

示例:
  serenique moment edit a1b2c3d4-e5f6-7890-abcd-ef1234567890 --text "修改后的内容"
  serenique moment edit a1b2c3d4 -m "修改后的内容"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := commandContext(cmd)

		// Read the current moment first: the user sees the existing text before
		// editing, and a missing moment (404 「闪念不存在」) fails here, before
		// any confirmation is requested.
		var current client.MomentEntry
		if err := apiClient.Get(ctx, "/api/moments/"+args[0], nil, &current); err != nil {
			return err
		}
		// Context for the edit goes to stderr — stdout carries only the result.
		fmt.Fprintf(os.Stderr, "当前内容: %s\n", current.Text)

		// Editing text is a state-changing action: confirmation is mandatory
		// (helpers.confirm(); EOF on non-interactive stdin cancels with error).
		if err := confirm("确认更新闪念正文", false); err != nil {
			return err
		}

		result, err := apiClient.UpdateMoment(ctx, args[0], momentEditText)
		if err != nil {
			return err
		}

		printCreateResult("闪念更新成功", result, "闪念更新成功", map[string]string{
			"ID":   result.ID,
			"内容":   result.Text,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var momentEditText string

func init() {
	// moment list
	momentListCmd = paginatedListCommand[client.MomentEntry](listSpec[client.MomentEntry]{
		use:   "list",
		short: "列出闪念",
		long: `分页查询闪念列表。使用 --all 一次返回全部记录。

示例:
  serenique moment list
  serenique moment list --all
  serenique moment list --page 1 --page-size 50
  serenique moment list --json`,
		path:     "/api/moments",
		emptyMsg: "暂无闪念记录",
		headers:  []string{"ID", "内容", "创建时间", "评论"},
		row: func(m client.MomentEntry) map[string]string {
			return map[string]string{
				"ID":   shortID(m.ID),
				"内容":   truncateRunes(m.Text, 50),
				"创建时间": prefix(m.CreatedAt, 19),
				"评论":   strconv.Itoa(m.CommentCount),
			}
		},
	}, &momentListPage, &momentListPageSize, &momentListAll)
	momentListCmd.Flags().IntVarP(&momentListPage, "page", "p", 1, "页码")
	momentListCmd.Flags().IntVarP(&momentListPageSize, "page-size", "l", 50, "每页条数")
	momentListCmd.Flags().BoolVar(&momentListAll, "all", false, "一次返回全部记录（自动翻页）")

	// moment create flags
	momentCreateCmd.Flags().StringVarP(&momentCreateText, "text", "m", "", "闪念内容，最长 500 字 (必填)")
	momentCreateCmd.Flags().StringArrayVar(&momentCreateBlobIDs, "blob-id", nil, "要关联的文件 ID，可重复指定多个")
	momentCreateCmd.Flags().StringVarP(&momentCreateRole, "role", "r", "attachment", "附件角色")
	momentCreateCmd.Flags().StringVarP(&momentCreateDisplayName, "display-name", "n", "", "附件显示名称")
	momentCreateCmd.Flags().IntVar(&momentCreateSortOrder, "sort-order", 0, "附件排序起始值（指定多个附件时依次递增）")
	momentCreateCmd.MarkFlagRequired("text")

	// moment edit flags
	momentEditCmd.Flags().StringVarP(&momentEditText, "text", "m", "", "新的闪念正文，最长 500 字 (必填)")
	momentEditCmd.MarkFlagRequired("text")

	// moment delete
	momentDeleteCmd = deleteCommand("delete <id>", "删除闪念", `删除指定的闪念。此操作不可撤销，默认需要确认。

示例:
  serenique moment delete a1b2c3d4
  serenique moment delete a1b2c3d4 --force`, "闪念", false,
		func(id string) string { return "/api/moments/" + id }, &momentDeleteForce)
	momentDeleteCmd.Flags().BoolVarP(&momentDeleteForce, "force", "f", false, "跳过确认提示")

	// moment attach flags
	momentAttachCmd.Flags().StringVar(&momentAttachBlobID, "blob-id", "", "文件 ID (必填)")
	momentAttachCmd.Flags().StringVarP(&momentAttachRole, "role", "r", "attachment", "关联角色")
	momentAttachCmd.Flags().StringVarP(&momentAttachDisplayName, "display-name", "n", "", "显示名称")
	momentAttachCmd.Flags().IntVar(&momentAttachSortOrder, "sort-order", 0, "排序权重")
	momentAttachCmd.MarkFlagRequired("blob-id")

	// moment detach flags
	momentDetachCmd.Flags().BoolVarP(&momentDetachForce, "force", "f", false, "跳过确认提示")

	momentCmd.AddCommand(momentListCmd)
	momentCmd.AddCommand(momentCreateCmd)
	momentCmd.AddCommand(momentGetCmd)
	momentCmd.AddCommand(momentEditCmd)
	momentCmd.AddCommand(momentDeleteCmd)
	momentCmd.AddCommand(momentAttachCmd)
	momentCmd.AddCommand(momentDetachCmd)
}
