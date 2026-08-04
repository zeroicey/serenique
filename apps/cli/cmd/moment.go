package cmd

import (
	"context"
	"fmt"
	"net/url"
	"strconv"

	"github.com/spf13/cobra"
)

// Moment types matching the API response.
type MomentEntry struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

type MomentListResult struct {
	Items []MomentEntry `json:"items"`
	Total int           `json:"total"`
}

// momentCmd is the parent moment command.
var momentCmd = &cobra.Command{
	Use:   "moment",
	Short: "闪念管理",
	Long:  "管理闪念笔记（轻量级快速记录），支持创建、列出和删除。",
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

		var result MomentListResult
		if err := apiClient.Get(ctx, "/api/moments", query, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		if result.Total == 0 {
			printer.PrintMessage("暂无闪念记录")
			return nil
		}

		headers := []string{"ID", "内容", "创建时间"}
		rows := make([]map[string]string, len(result.Items))
		for i, m := range result.Items {
			preview := m.Content
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
		fmt.Printf("\n共 %d 条记录\n", result.Total)
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
  serenique moment create --content "突然想到一个好主意..."
  serenique moment create -m "记录一个灵感"`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		body := map[string]string{"content": momentCreateContent}

		var result MomentEntry
		if err := apiClient.Post(ctx, "/api/moments", body, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		if useJSON {
			printer.PrintSuccess("闪念创建成功", result)
			return nil
		}

		printer.PrintSuccess("闪念创建成功", nil)
		fmt.Println()
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var momentCreateContent string

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
			return nil
		}

		printer.PrintMessage("✓ 闪念已删除")
		return nil
	},
}

var momentDeleteForce bool

func init() {
	// moment list flags
	momentListCmd.Flags().IntVarP(&momentListPage, "page", "p", 1, "页码")
	momentListCmd.Flags().IntVarP(&momentListPageSize, "page-size", "l", 10, "每页条数")

	// moment create flags
	momentCreateCmd.Flags().StringVarP(&momentCreateContent, "content", "m", "", "闪念内容，最长 500 字 (必填)")
	momentCreateCmd.MarkFlagRequired("content")

	// moment delete flags
	momentDeleteCmd.Flags().BoolVarP(&momentDeleteForce, "force", "f", false, "跳过确认提示")

	momentCmd.AddCommand(momentListCmd)
	momentCmd.AddCommand(momentCreateCmd)
	momentCmd.AddCommand(momentDeleteCmd)
}
