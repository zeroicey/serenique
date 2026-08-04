package cmd

import (
	"context"
	"fmt"
	"net/url"
	"strconv"

	"github.com/spf13/cobra"
)

// Diary types matching the API response.
type DiaryEntry struct {
	ID        string `json:"id"`
	DiaryDate string `json:"diaryDate"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type DiaryListResult struct {
	Items []DiaryEntry `json:"items"`
	Total int          `json:"total"`
}

// diaryCmd is the parent diary command.
var diaryCmd = &cobra.Command{
	Use:   "diary",
	Short: "日记管理",
	Long:  "管理日记，支持创建、查看、更新和删除日记。",
}

// diary list
var diaryListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出日记",
	Long: `分页查询日记列表。

示例:
  serenique diary list
  serenique diary list --page 1 --page-size 10
  serenique diary list --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		query := url.Values{}
		query.Set("page", strconv.Itoa(diaryListPage))
		query.Set("pageSize", strconv.Itoa(diaryListPageSize))

		var result DiaryListResult
		if err := apiClient.Get(ctx, "/api/diaries", query, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		if result.Total == 0 {
			printer.PrintMessage("暂无日记记录")
			return nil
		}

		headers := []string{"ID", "日期", "内容预览", "创建时间"}
		rows := make([]map[string]string, len(result.Items))
		for i, d := range result.Items {
			preview := d.Content
			if len(preview) > 40 {
				preview = preview[:40] + "..."
			}
			rows[i] = map[string]string{
				"ID":     d.ID[:8] + "...",
				"日期":     d.DiaryDate,
				"内容预览":   preview,
				"创建时间":   d.CreatedAt[:10],
			}
		}

		printer.PrintTable(headers, rows)
		fmt.Printf("\n共 %d 条记录\n", result.Total)
		return nil
	},
}

var (
	diaryListPage     int
	diaryListPageSize int
)

// diary create
var diaryCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建日记",
	Long: `创建一篇新日记。如果不指定 --date，默认使用今天的日期。
同一天只能有一篇日记，重复创建会返回错误。

示例:
  serenique diary create --content "今天完成了项目的第一阶段..."
  serenique diary create -m "补昨天的日记" --date 2026-08-03`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		body := map[string]string{"content": diaryCreateContent}
		if diaryCreateDate != "" {
			body["diaryDate"] = diaryCreateDate
		}

		var result DiaryEntry
		if err := apiClient.Post(ctx, "/api/diaries", body, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		if useJSON {
			printer.PrintSuccess("日记创建成功", result)
			return nil
		}

		printer.PrintSuccess("日记创建成功", nil)
		fmt.Println()
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"日期":   result.DiaryDate,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var (
	diaryCreateContent string
	diaryCreateDate    string
)

// diary get
var diaryGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看日记详情",
	Long: `根据 ID 查看日记的完整内容。

示例:
  serenique diary get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		var result DiaryEntry
		if err := apiClient.Get(ctx, "/api/diaries/"+args[0], nil, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		printer.PrintKeyValue(map[string]string{
			"ID":     result.ID,
			"日期":     result.DiaryDate,
			"内容":     result.Content,
			"创建时间":   result.CreatedAt,
			"更新时间":   result.UpdatedAt,
		})
		return nil
	},
}

// diary update
var diaryUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新日记内容",
	Long: `更新指定日记的内容。

示例:
  serenique diary update a1b2c3d4 --content "更新后的内容"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		body := map[string]string{"content": diaryUpdateContent}

		var result DiaryEntry
		if err := apiClient.Put(ctx, "/api/diaries/"+args[0], body, &result); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		printer.PrintSuccess("日记更新成功", result)
		return nil
	},
}

var diaryUpdateContent string

// diary delete
var diaryDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "删除日记",
	Long: `删除指定的日记。此操作不可撤销，默认需要确认。

示例:
  serenique diary delete a1b2c3d4
  serenique diary delete a1b2c3d4 --force`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if !diaryDeleteForce {
			fmt.Printf("确认删除日记 %s？(y/N): ", args[0])
			var response string
			fmt.Scanln(&response)
			if response != "y" && response != "Y" {
				printer.PrintMessage("已取消")
				return nil
			}
		}

		ctx := context.Background()
		if err := apiClient.Delete(ctx, "/api/diaries/"+args[0]); err != nil {
			printer.PrintError(err.Error())
			return nil
		}

		printer.PrintMessage("✓ 日记已删除")
		return nil
	},
}

var diaryDeleteForce bool

func init() {
	// diary list flags
	diaryListCmd.Flags().IntVarP(&diaryListPage, "page", "p", 1, "页码")
	diaryListCmd.Flags().IntVarP(&diaryListPageSize, "page-size", "l", 10, "每页条数")

	// diary create flags
	diaryCreateCmd.Flags().StringVarP(&diaryCreateContent, "content", "m", "", "日记内容 (必填)")
	diaryCreateCmd.Flags().StringVarP(&diaryCreateDate, "date", "d", "", "日期 YYYY-MM-DD（默认今天）")
	diaryCreateCmd.MarkFlagRequired("content")

	// diary update flags
	diaryUpdateCmd.Flags().StringVarP(&diaryUpdateContent, "content", "m", "", "新内容 (必填)")
	diaryUpdateCmd.MarkFlagRequired("content")

	// diary delete flags
	diaryDeleteCmd.Flags().BoolVarP(&diaryDeleteForce, "force", "f", false, "跳过确认提示")

	diaryCmd.AddCommand(diaryListCmd)
	diaryCmd.AddCommand(diaryCreateCmd)
	diaryCmd.AddCommand(diaryGetCmd)
	diaryCmd.AddCommand(diaryUpdateCmd)
	diaryCmd.AddCommand(diaryDeleteCmd)
}
