package cmd

import (
	"fmt"
	"strconv"

	"github.com/spf13/cobra"
)

// Moment types matching the API response.
type MomentEntry struct {
	ID          string                  `json:"id"`
	Text        string                  `json:"text"`
	CreatedAt   string                  `json:"createdAt"`
	UpdatedAt   string                  `json:"updatedAt"`
	Attachments []MomentAttachmentEntry `json:"attachments"`
}

// MomentBlobEntry matches the API's nested blob object inside a moment
// attachment (moment.types.ts MomentBlobEntry). The API always includes it, so
// JSON mode round-trips the full payload including the ready fileUrl.
type MomentBlobEntry struct {
	ID           string         `json:"id"`
	OriginalName string         `json:"originalName"`
	MimeType     string         `json:"mimeType"`
	Size         int64          `json:"size"`
	Metadata     map[string]any `json:"metadata"`
	Width        *int           `json:"width"`
	Height       *int           `json:"height"`
	Duration     *float64       `json:"duration"`
	CreatedAt    string         `json:"createdAt"`
	FileURL      string         `json:"fileUrl"`
}

// MomentAttachmentEntry matches the API's moment attachment record
// (moment.types.ts MomentAttachmentEntry), which always carries metadata —
// mirroring BlobAttachmentEntry in blob.go so attachment-level metadata created
// via the API is not dropped from `moment get --json` output.
type MomentAttachmentEntry struct {
	ID          string           `json:"id"`
	BlobID      string           `json:"blobId"`
	Role        string           `json:"role"`
	DisplayName *string          `json:"displayName"`
	SortOrder   int              `json:"sortOrder"`
	Metadata    map[string]any   `json:"metadata"`
	CreatedAt   string           `json:"createdAt"`
	UpdatedAt   string           `json:"updatedAt"`
	Blob        *MomentBlobEntry `json:"blob,omitempty"`
}

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
		body := map[string]string{"text": momentCreateText}

		var result MomentEntry
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

var momentCreateText string

// moment get
var momentGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看闪念详情",
	Long: `根据 ID 查看闪念的完整内容及其附件列表。

示例:
  serenique moment get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		var result MomentEntry
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
					"ID":    a.ID[:8] + "...",
					"文件 ID": a.BlobID[:8] + "...",
					"角色":    a.Role,
					"显示名称":  dn,
					"排序":    strconv.Itoa(a.SortOrder),
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

		var result MomentAttachmentEntry
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

func init() {
	// moment list
	momentListCmd = paginatedListCommand[MomentEntry](listSpec[MomentEntry]{
		use:   "list",
		short: "列出闪念",
		long: `分页查询闪念列表。

示例:
  serenique moment list
  serenique moment list --page 1 --page-size 20
  serenique moment list --json`,
		path:        "/api/moments",
		emptyMsg:    "暂无闪念记录",
		headers:     []string{"ID", "内容", "创建时间"},
		defaultSize: 10,
		row: func(m MomentEntry) map[string]string {
			return map[string]string{
				"ID":   m.ID[:8] + "...",
				"内容":   truncateRunes(m.Text, 50),
				"创建时间": m.CreatedAt[:19],
			}
		},
	}, &momentListPage, &momentListPageSize)
	momentListCmd.Flags().IntVarP(&momentListPage, "page", "p", 1, "页码")
	momentListCmd.Flags().IntVarP(&momentListPageSize, "page-size", "l", 10, "每页条数")

	// moment create flags
	momentCreateCmd.Flags().StringVarP(&momentCreateText, "text", "m", "", "闪念内容，最长 500 字 (必填)")
	momentCreateCmd.MarkFlagRequired("text")

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
	momentCmd.AddCommand(momentDeleteCmd)
	momentCmd.AddCommand(momentAttachCmd)
	momentCmd.AddCommand(momentDetachCmd)
}
