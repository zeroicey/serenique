package cmd

import (
	"fmt"

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

// diaryCmd is the parent diary command.
var diaryCmd = &cobra.Command{
	Use:   "diary",
	Short: "日记管理",
	Long:  "管理日记，支持创建、查看、更新和删除日记。",
	Args:  cobra.NoArgs,
}

// diary list
var diaryListCmd *cobra.Command

var (
	diaryListPage     int
	diaryListPageSize int
	diaryListAll      bool
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
		body := map[string]string{"content": diaryCreateContent}
		if diaryCreateDate != "" {
			body["diaryDate"] = diaryCreateDate
		}

		var result DiaryEntry
		if err := apiClient.Post(commandContext(cmd), "/api/diaries", body, &result); err != nil {
			return err
		}

		printCreateResult("日记创建成功", result, "日记创建成功", map[string]string{
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
	Use:   "get [<id>]",
	Short: "查看日记详情",
	Long: `根据 ID 或日期查看日记的完整内容。二选一：传 <id> 按 ID 查询，或传 --date 按日期查询。

示例:
  serenique diary get a1b2c3d4-e5f6-7890-abcd-ef1234567890
  serenique diary get --date 2026-08-05`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		var result DiaryEntry

		if diaryGetDate != "" {
			if err := apiClient.Get(commandContext(cmd), "/api/diaries/by-date/"+diaryGetDate, nil, &result); err != nil {
				return err
			}
		} else {
			if len(args) != 1 {
				return fmt.Errorf("需要指定日记 ID 或使用 --date 按日期查询")
			}
			if err := apiClient.Get(commandContext(cmd), "/api/diaries/"+args[0], nil, &result); err != nil {
				return err
			}
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"日期":   result.DiaryDate,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var diaryGetDate string

// diary update
var diaryUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新日记内容",
	Long: `更新指定日记的内容。

示例:
  serenique diary update a1b2c3d4 --content "更新后的内容"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		body := map[string]string{"content": diaryUpdateContent}

		var result DiaryEntry
		if err := apiClient.Put(commandContext(cmd), "/api/diaries/"+args[0], body, &result); err != nil {
			return err
		}

		printCreateResult("日记更新成功", result, "日记更新成功", map[string]string{
			"ID":   result.ID,
			"日期":   result.DiaryDate,
			"内容":   result.Content,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var diaryUpdateContent string

// diary delete
var diaryDeleteCmd *cobra.Command

var diaryDeleteForce bool

func init() {
	// diary list
	diaryListCmd = paginatedListCommand[DiaryEntry](listSpec[DiaryEntry]{
		use:   "list",
		short: "列出日记",
		long: `分页查询日记列表。使用 --all 一次返回全部记录。

示例:
  serenique diary list
  serenique diary list --all
  serenique diary list --page 1 --page-size 50
  serenique diary list --json`,
		path:     "/api/diaries",
		emptyMsg: "暂无日记记录",
		headers:  []string{"ID", "日期", "内容预览", "创建时间"},
		row: func(d DiaryEntry) map[string]string {
			return map[string]string{
				"ID":   shortID(d.ID),
				"日期":   d.DiaryDate,
				"内容预览": truncateRunes(d.Content, 40),
				"创建时间": prefix(d.CreatedAt, 10),
			}
		},
	}, &diaryListPage, &diaryListPageSize, &diaryListAll)
	diaryListCmd.Flags().IntVarP(&diaryListPage, "page", "p", 1, "页码")
	diaryListCmd.Flags().IntVarP(&diaryListPageSize, "page-size", "l", 50, "每页条数")
	diaryListCmd.Flags().BoolVar(&diaryListAll, "all", false, "一次返回全部记录（自动翻页）")

	// diary create flags
	diaryCreateCmd.Flags().StringVarP(&diaryCreateContent, "content", "m", "", "日记内容 (必填)")
	diaryCreateCmd.Flags().StringVarP(&diaryCreateDate, "date", "d", "", "日期 YYYY-MM-DD（默认今天）")
	diaryCreateCmd.MarkFlagRequired("content")

	// diary get flags
	diaryGetCmd.Flags().StringVarP(&diaryGetDate, "date", "d", "", "按日期查询 YYYY-MM-DD（与 <id> 二选一）")

	// diary update flags
	diaryUpdateCmd.Flags().StringVarP(&diaryUpdateContent, "content", "m", "", "新内容 (必填)")
	diaryUpdateCmd.MarkFlagRequired("content")

	// diary delete
	diaryDeleteCmd = deleteCommand("delete <id>", "删除日记", `删除指定的日记。此操作不可撤销，默认需要确认。

示例:
  serenique diary delete a1b2c3d4
  serenique diary delete a1b2c3d4 --force`, "日记", false,
		func(id string) string { return "/api/diaries/" + id }, &diaryDeleteForce)
	diaryDeleteCmd.Flags().BoolVarP(&diaryDeleteForce, "force", "f", false, "跳过确认提示")

	diaryCmd.AddCommand(diaryListCmd)
	diaryCmd.AddCommand(diaryCreateCmd)
	diaryCmd.AddCommand(diaryGetCmd)
	diaryCmd.AddCommand(diaryUpdateCmd)
	diaryCmd.AddCommand(diaryDeleteCmd)
}
