package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// eventCmd is the parent event command.
var eventCmd = &cobra.Command{
	Use:   "event",
	Short: "事件管理",
	Long:  "管理日历事件。事件带时间范围（开始/结束，开始必须早于结束）；列表按时间窗口查询。",
	Args:  cobra.NoArgs,
}

// event create
var eventCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建事件",
	Long: `创建一个日历事件。开始时间必须早于结束时间，两者均为 ISO 8601 格式（含时区偏移）。

示例:
  serenique event create --title "产品评审" --start-at 2026-08-05T09:00:00+08:00 --end-at 2026-08-05T10:00:00+08:00
  serenique event create -n "全天活动" -s 2026-08-05T00:00:00Z -e 2026-08-06T00:00:00Z --all-day -l "公园"`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateISO(eventCreateStartAt, "--start-at"); err != nil {
			return err
		}
		if err := validateISO(eventCreateEndAt, "--end-at"); err != nil {
			return err
		}
		input := client.CreateEventInput{
			Title:    eventCreateTitle,
			StartAt:  eventCreateStartAt,
			EndAt:    eventCreateEndAt,
			IsAllDay: eventCreateAllDay,
			Location: eventCreateLocation,
			Note:     eventCreateNote,
		}

		result, err := apiClient.CreateEvent(commandContext(cmd), input)
		if err != nil {
			return err
		}
		printCreateResult("事件创建成功", result, "事件创建成功", map[string]string{
			"ID":      result.ID,
			"标题":     result.Title,
			"开始时间":  eventTimeLabel(result.StartAt),
			"结束时间":  eventTimeLabel(result.EndAt),
			"全天":     eventAllDayLabel(result.IsAllDay),
			"地点":     nullableStr(result.Location),
		})
		return nil
	},
}

var (
	eventCreateTitle     string
	eventCreateStartAt   string
	eventCreateEndAt     string
	eventCreateAllDay    bool
	eventCreateLocation  string
	eventCreateNote      string
)

// event list
var eventListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出事件",
	Long: `按时间窗口查询事件：返回开始或结束落在窗口内（与窗口重叠）的事件，按开始时间升序。

示例:
  serenique event list --from 2026-08-05T00:00:00+08:00 --to 2026-08-06T00:00:00+08:00
  serenique event list -f 2026-08-05T00:00:00Z --to 2026-08-06T00:00:00Z --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateISO(eventListFrom, "--from"); err != nil {
			return err
		}
		if err := validateISO(eventListTo, "--to"); err != nil {
			return err
		}

		items, err := apiClient.ListEvents(commandContext(cmd), eventListFrom, eventListTo)
		if err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", map[string]any{"items": items, "total": len(items)})
			return nil
		}

		if len(items) == 0 {
			printer.PrintMessage("该时间窗口内暂无事件")
			return nil
		}

		rows := make([]map[string]string, len(items))
		for i, e := range items {
			rows[i] = map[string]string{
				"ID":    shortID(e.ID),
				"标题":    truncateRunes(e.Title, 30),
				"开始":    eventTimeLabel(e.StartAt),
				"结束":    eventTimeLabel(e.EndAt),
				"全天":    eventAllDayLabel(e.IsAllDay),
				"地点":    nullableStr(e.Location),
			}
		}
		printer.PrintTable([]string{"ID", "标题", "开始", "结束", "全天", "地点"}, rows)
		fmt.Printf("\n共 %d 条记录\n", len(items))
		return nil
	},
}

var (
	eventListFrom string
	eventListTo   string
)

// event get
var eventGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看事件详情",
	Long: `根据 ID 查看事件信息。

示例:
  serenique event get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.GetEvent(commandContext(cmd), args[0])
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{
			"ID":      result.ID,
			"标题":     result.Title,
			"开始时间":  eventTimeLabel(result.StartAt),
			"结束时间":  eventTimeLabel(result.EndAt),
			"全天":     eventAllDayLabel(result.IsAllDay),
			"地点":     nullableStr(result.Location),
			"备注":     nullableStr(result.Note),
			"创建时间":  prefix(result.CreatedAt, 19),
			"更新时间":  prefix(result.UpdatedAt, 19),
		})
		return nil
	},
}

// event update
var eventUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新事件",
	Long: `部分更新指定事件，至少提供一个待更新字段。
地点/备注传入空字符串会清空该字段（例如 --location ""）。

示例:
  serenique event update a1b2c3d4 --title "新标题"
  serenique event update a1b2c3d4 --start-at 2026-08-05T10:00:00+08:00
  serenique event update a1b2c3d4 --all-day --location "会议室"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		input := client.UpdateEventInput{}
		changed := false

		if cmd.Flags().Changed("title") {
			input.Title = &eventUpdateTitle
			changed = true
		}
		if cmd.Flags().Changed("start-at") {
			if err := validateISO(eventUpdateStartAt, "--start-at"); err != nil {
				return err
			}
			input.StartAt = &eventUpdateStartAt
			changed = true
		}
		if cmd.Flags().Changed("end-at") {
			if err := validateISO(eventUpdateEndAt, "--end-at"); err != nil {
				return err
			}
			input.EndAt = &eventUpdateEndAt
			changed = true
		}
		if cmd.Flags().Changed("all-day") {
			input.IsAllDay = &eventUpdateAllDay
			changed = true
		}
		if cmd.Flags().Changed("location") {
			input.Location = &eventUpdateLocation
			changed = true
		}
		if cmd.Flags().Changed("note") {
			input.Note = &eventUpdateNote
			changed = true
		}
		if !changed {
			return fmt.Errorf("至少需要提供一个待更新字段（--title / --start-at / --end-at / --all-day / --location / --note）")
		}

		result, err := apiClient.UpdateEvent(commandContext(cmd), args[0], input)
		if err != nil {
			return err
		}
		printCreateResult("事件更新成功", result, "事件更新成功", map[string]string{
			"ID":      result.ID,
			"标题":     result.Title,
			"开始时间":  eventTimeLabel(result.StartAt),
			"结束时间":  eventTimeLabel(result.EndAt),
			"全天":     eventAllDayLabel(result.IsAllDay),
			"地点":     nullableStr(result.Location),
		})
		return nil
	},
}

var (
	eventUpdateTitle    string
	eventUpdateStartAt  string
	eventUpdateEndAt    string
	eventUpdateAllDay   bool
	eventUpdateLocation string
	eventUpdateNote     string
)

// event delete
var eventDeleteCmd *cobra.Command

var eventDeleteForce bool

// =============================================================================
// Helpers
// =============================================================================

// validateISO rejects a datetime value that is not a valid ISO 8601 string with
// a timezone offset — the API's z.iso.datetime({ offset: true }) contract (e.g.
// 2026-08-05T09:00:00+08:00 or ...Z). Checked locally so a typo'd flag fails
// with an actionable message instead of a server-side validation error.
// RFC3339Nano parse is deliberately used: it accepts both the exact-second and
// fractional-second spellings the server accepts, while still requiring the
// offset.
func validateISO(s, label string) error {
	if _, err := time.Parse(time.RFC3339Nano, s); err != nil {
		return fmt.Errorf(
			"无效的%s时间 %q：必须是 ISO 8601 格式（含时区偏移），例如 2026-08-05T09:00:00+08:00",
			label, s,
		)
	}
	return nil
}

// eventTimeLabel renders a server UTC ISO timestamp for table display, trimmed
// to seconds ("2026-08-05T01:00:00"). The server returns UTC (suffix Z); the
// raw offset is not echoed here — callers pass the value they want displayed.
func eventTimeLabel(s string) string {
	return prefix(s, 19)
}

// eventAllDayLabel renders the all-day flag for table display.
func eventAllDayLabel(allDay bool) string {
	if allDay {
		return "全天"
	}
	return "按时段"
}

func init() {
	// ---- event subcommands ----
	eventCreateCmd.Flags().StringVarP(&eventCreateTitle, "title", "n", "", "事件标题 (必填)")
	eventCreateCmd.Flags().StringVarP(&eventCreateStartAt, "start-at", "s", "", "开始时间 (ISO 8601，含时区偏移，必填)")
	eventCreateCmd.Flags().StringVarP(&eventCreateEndAt, "end-at", "e", "", "结束时间 (ISO 8601，含时区偏移，必须晚于开始时间)")
	eventCreateCmd.Flags().BoolVarP(&eventCreateAllDay, "all-day", "a", false, "是否全天事件")
	eventCreateCmd.Flags().StringVarP(&eventCreateLocation, "location", "l", "", "地点")
	eventCreateCmd.Flags().StringVar(&eventCreateNote, "note", "", "备注")
	eventCreateCmd.MarkFlagRequired("title")
	eventCreateCmd.MarkFlagRequired("start-at")
	eventCreateCmd.MarkFlagRequired("end-at")

	eventListCmd.Flags().StringVarP(&eventListFrom, "from", "f", "", "查询窗口开始 (ISO 8601，含时区偏移，必填)")
	// Note: --to deliberately has no shorthand — root's persistent -t is taken.
	eventListCmd.Flags().StringVar(&eventListTo, "to", "", "查询窗口结束 (ISO 8601，含时区偏移，必填)")
	eventListCmd.MarkFlagRequired("from")
	eventListCmd.MarkFlagRequired("to")

	eventUpdateCmd.Flags().StringVarP(&eventUpdateTitle, "title", "n", "", "新标题")
	eventUpdateCmd.Flags().StringVarP(&eventUpdateStartAt, "start-at", "s", "", "新的开始时间 (ISO 8601，含时区偏移)")
	eventUpdateCmd.Flags().StringVarP(&eventUpdateEndAt, "end-at", "e", "", "新的结束时间 (ISO 8601，含时区偏移)")
	eventUpdateCmd.Flags().BoolVarP(&eventUpdateAllDay, "all-day", "a", false, "是否全天事件")
	eventUpdateCmd.Flags().StringVarP(&eventUpdateLocation, "location", "l", "", "新的地点（传空串清空）")
	eventUpdateCmd.Flags().StringVar(&eventUpdateNote, "note", "", "新的备注（传空串清空）")

	eventDeleteCmd = deleteCommand("delete <id>", "删除事件", `删除指定的事件。此操作不可撤销，默认需要确认。

示例:
  serenique event delete a1b2c3d4
  serenique event delete a1b2c3d4 --force`, "事件", true,
		func(id string) string { return "/api/events/" + id }, &eventDeleteForce)
	eventDeleteCmd.Flags().BoolVarP(&eventDeleteForce, "force", "f", false, "跳过确认提示")

	eventCmd.AddCommand(eventCreateCmd)
	eventCmd.AddCommand(eventListCmd)
	eventCmd.AddCommand(eventGetCmd)
	eventCmd.AddCommand(eventUpdateCmd)
	eventCmd.AddCommand(eventDeleteCmd)
}
