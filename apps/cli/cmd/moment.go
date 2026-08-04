package cmd

import (
	"context"
	"fmt"
	"net/url"
	"strconv"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// Moment types matching the API response.
type MomentEntry struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

// MomentAttachmentEntry matches the API's moment attachment record.
type MomentAttachmentEntry struct {
	ID          string  `json:"id"`
	BlobID      string  `json:"blobId"`
	Role        string  `json:"role"`
	DisplayName *string `json:"displayName"`
	SortOrder   int     `json:"sortOrder"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

// momentCmd is the parent moment command.
var momentCmd = &cobra.Command{
	Use:   "moment",
	Short: "闪念管理",
	Long:  "管理闪念笔记（轻量级快速记录），支持创建、列出、删除和附件关联。",
}

// moment list
var momentListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出闪念",
	Long: `分页查询闪念列表。

示例:
  serenique moment list
  serenique moment list --page 1 --page-size 20
  serenique moment list --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		query := url.Values{}
		query.Set("page", strconv.Itoa(momentListPage))
		query.Set("pageSize", strconv.Itoa(momentListPageSize))

		items, total, err := client.List[MomentEntry](apiClient, ctx, "/api/moments", query)
		if err != nil {
			printer.PrintError(err.Error())
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", map[string]interface{}{"items": items, "total": total})
			return nil
		}

		if total == 0 {
			printer.PrintMessage("暂无闪念记录")
			return nil
		}

		headers := []string{"ID", "内容", "创建时间"}
		rows := make([]map[string]string, len(items))
		for i, m := range items {
			preview := m.Text
			if len(preview) > 50 {
				preview = preview[:50] + "..."
			}
			rows[i] = map[string]string{
				"ID":   m.ID[:8] + "...",
				"内容":   preview,
				"创建时间": m.CreatedAt[:19],
			}
		}

		printer.PrintTable(headers, rows)
		fmt.Printf("\n共 %d 条记录\n", total)
		return nil
	},
}

var (
	momentListPage     int
	momentListPageSize int
)

// moment create
var momentCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建闪念",
	Long: `创建一条闪念笔记。内容最长 500 字。

示例:
  serenique moment create --text "突然想到一个好主意..."
  serenique moment create -m "记录一个灵感"`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		body := map[string]string{"text": momentCreateText}

		var result MomentEntry
		if err := apiClient.Post(ctx, "/api/moments", body, &result); err != nil {
			printer.PrintError(err.Error())
			return err
		}

		if useJSON {
			printer.PrintSuccess("闪念创建成功", result)
			return nil
		}

		printer.PrintSuccess("闪念创建成功", nil)
		fmt.Println()
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"内容":   result.Text,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var momentCreateText string

// moment delete
var momentDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "删除闪念",
	Long: `删除指定的闪念。此操作不可撤销，默认需要确认。

示例:
  serenique moment delete a1b2c3d4
  serenique moment delete a1b2c3d4 --force`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if !momentDeleteForce {
			fmt.Printf("确认删除闪念 %s？(y/N): ", args[0])
			var response string
			fmt.Scanln(&response)
			if response != "y" && response != "Y" {
				printer.PrintMessage("已取消")
				return nil
			}
		}

		ctx := context.Background()
		if err := apiClient.Delete(ctx, "/api/moments/"+args[0]); err != nil {
			printer.PrintError(err.Error())
			return err
		}

		printer.PrintMessage("✓ 闪念已删除")
		return nil
	},
}

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
		ctx := context.Background()

		body := map[string]interface{}{
			"blobId":    momentAttachBlobID,
			"role":      momentAttachRole,
			"sortOrder": momentAttachSortOrder,
			"metadata":  map[string]interface{}{},
		}
		if momentAttachDisplayName != "" {
			body["displayName"] = momentAttachDisplayName
		}

		var result MomentAttachmentEntry
		if err := apiClient.Post(ctx, "/api/moments/"+args[0]+"/attachments", body, &result); err != nil {
			printer.PrintError(err.Error())
			return err
		}

		if useJSON {
			printer.PrintSuccess("附件关联成功", result)
			return nil
		}

		printer.PrintSuccess("附件关联成功", nil)
		fmt.Println()
		dn := "-"
		if result.DisplayName != nil {
			dn = *result.DisplayName
		}
		printer.PrintKeyValue(map[string]string{
			"ID":     result.ID,
			"文件 ID":  result.BlobID,
			"角色":     result.Role,
			"显示名称":   dn,
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
		if !momentDetachForce {
			fmt.Printf("确认删除闪念附件 %s？(y/N): ", args[1])
			var response string
			fmt.Scanln(&response)
			if response != "y" && response != "Y" {
				printer.PrintMessage("已取消")
				return nil
			}
		}

		ctx := context.Background()
		if err := apiClient.Delete(ctx, "/api/moments/"+args[0]+"/attachments/"+args[1]); err != nil {
			printer.PrintError(err.Error())
			return err
		}

		printer.PrintMessage("✓ 附件关联已删除")
		return nil
	},
}

var momentDetachForce bool

func init() {
	// moment list flags
	momentListCmd.Flags().IntVarP(&momentListPage, "page", "p", 1, "页码")
	momentListCmd.Flags().IntVarP(&momentListPageSize, "page-size", "l", 10, "每页条数")

	// moment create flags
	momentCreateCmd.Flags().StringVarP(&momentCreateText, "text", "m", "", "闪念内容，最长 500 字 (必填)")
	momentCreateCmd.MarkFlagRequired("text")

	// moment delete flags
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
	momentCmd.AddCommand(momentDeleteCmd)
	momentCmd.AddCommand(momentAttachCmd)
	momentCmd.AddCommand(momentDetachCmd)
}
