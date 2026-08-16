package cmd

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// habitCmd is the parent habit command.
var habitCmd = &cobra.Command{
	Use:   "habit",
	Short: "习惯管理",
	Long: `记录「今天做了什么」的无压力流水账，不做目标打卡。

每个习惯有两种记录方式（创建时选择）：
  做没做型（默认）—— 记录做了/没做，三态：未记录 / ✓做了 / ✗没做；
  计数型 —— 记录做了几次（如喝水），count 为 0 即没做。

坏事好事都能记（kind 仅做视觉区分，不参与逻辑）。`,
	Args: cobra.NoArgs,
}

// =============================================================================
// habit create
// =============================================================================

var habitCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建习惯",
	Long: `创建一个习惯选项。名称必填，类型（好事/坏事）二选一必填；
计数型习惯用 --countable 标记（如喝水/吃药，记录次数而非做没做）。

示例:
  serenique habit create --name 跑步 --good --description "每天 30 分钟"
  serenique habit create -n 熬夜 --bad
  serenique habit create -n 喝水 --good --countable`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		kind, err := resolveHabitKind(habitCreateGood, habitCreateBad, "创建习惯必须指定 --good 或 --bad")
		if err != nil {
			return err
		}
		input := client.CreateHabitInput{
			Name:        habitCreateName,
			Kind:        kind,
			Countable:   habitCreateCountable,
			Description: optionalStr(habitCreateDescription),
		}
		result, err := apiClient.CreateHabit(commandContext(cmd), input)
		if err != nil {
			return err
		}
		printCreateResult("习惯创建成功", result, "习惯创建成功", habitKV(result))
		return nil
	},
}

var (
	habitCreateName        string
	habitCreateGood        bool
	habitCreateBad         bool
	habitCreateCountable   bool
	habitCreateDescription string
)

// =============================================================================
// habit list
// =============================================================================

var habitListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出习惯选项",
	Long: `列出全部习惯选项（按排序号升序）。返回裸数组，无分页。

示例:
  serenique habit list
  serenique habit list --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		items, err := apiClient.ListHabits(commandContext(cmd))
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", items)
			return nil
		}
		if len(items) == 0 {
			printer.PrintMessage("暂无习惯选项")
			return nil
		}
		rows := make([]map[string]string, len(items))
		for i, h := range items {
			rows[i] = habitRow(h)
		}
		printer.PrintTable([]string{"ID", "名称", "类型", "记录方式", "排序"}, rows)
		fmt.Printf("\n共 %d 个习惯\n", len(items))
		return nil
	},
}

// =============================================================================
// habit update
// =============================================================================

var habitUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新习惯",
	Long: `部分更新指定习惯，至少提供一个待更新字段。

类型用 --good / --bad 二选一；记录方式用 --countable / --no-countable 二选一。

示例:
  serenique habit update a1b2c3d4 --name "晨跑"
  serenique habit update a1b2c3d4 --bad
  serenique habit update a1b2c3d4 --countable --sort-order 3
  serenique habit update a1b2c3d4 --description "晨跑 5 公里"
  serenique habit update a1b2c3d4 --description ""`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		input := client.UpdateHabitInput{}
		changed := false

		if cmd.Flags().Changed("name") {
			input.Name = &habitUpdateName
			changed = true
		}
		if habitUpdateGood && habitUpdateBad {
			return fmt.Errorf("--good 与 --bad 不能同时指定")
		}
		if habitUpdateGood || habitUpdateBad {
			kind := client.HabitKindBad
			if habitUpdateGood {
				kind = client.HabitKindGood
			}
			input.Kind = &kind
			changed = true
		}
		if cmd.Flags().Changed("countable") && cmd.Flags().Changed("no-countable") {
			return fmt.Errorf("--countable 与 --no-countable 不能同时指定")
		}
		if cmd.Flags().Changed("countable") {
			v := true
			input.Countable = &v
			changed = true
		}
		if cmd.Flags().Changed("no-countable") {
			v := false
			input.Countable = &v
			changed = true
		}
		if cmd.Flags().Changed("sort-order") {
			input.SortOrder = &habitUpdateSortOrder
			changed = true
		}
		if cmd.Flags().Changed("description") {
			input.Description = &habitUpdateDescription
			changed = true
		}
		if !changed {
			return fmt.Errorf("至少需要提供一个待更新字段（--name / --good / --bad / --countable / --no-countable / --sort-order / --description）")
		}

		result, err := apiClient.UpdateHabit(commandContext(cmd), args[0], input)
		if err != nil {
			return err
		}
		printCreateResult("习惯更新成功", result, "习惯更新成功", habitKV(result))
		return nil
	},
}

var (
	habitUpdateName         string
	habitUpdateGood         bool
	habitUpdateBad          bool
	habitUpdateCountable    bool
	habitUpdateNotCountable bool
	habitUpdateSortOrder    int
	habitUpdateDescription  string
)

// =============================================================================
// habit delete
// =============================================================================

var habitDeleteCmd *cobra.Command

var habitDeleteForce bool

// =============================================================================
// habit today
// =============================================================================

var habitTodayCmd = &cobra.Command{
	Use:   "today",
	Short: "查看某天的习惯记录",
	Long: `查看指定日期（默认今天）各习惯的记录状态：
做没做型显示 未记录 / ✓做了 / ✗没做，计数型显示 ×N；习惯有简介时显示简介。

示例:
  serenique habit today
  serenique habit today --date 2026-08-16
  serenique habit today --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		date := habitTodayDate
		if date == "" {
			date = time.Now().Format("2006-01-02")
		}
		if err := validateHabitDate(date, "--date"); err != nil {
			return err
		}
		ctx := commandContext(cmd)
		habits, err := apiClient.ListHabits(ctx)
		if err != nil {
			return err
		}
		dailies, err := apiClient.ListDaily(ctx, date)
		if err != nil {
			return err
		}
		dailyByHabit := make(map[string]client.HabitDailyEntry, len(dailies))
		for _, d := range dailies {
			dailyByHabit[d.HabitID] = d
		}

		if useJSON {
			printer.PrintSuccess("查询成功", map[string]any{"date": date, "habits": habits, "daily": dailies})
			return nil
		}
		if len(habits) == 0 {
			printer.PrintMessage("暂无习惯选项")
			return nil
		}
		rows := make([]map[string]string, 0, len(habits))
		for _, h := range habits {
			entry, ok := dailyByHabit[h.ID]
			if !ok {
				entry = client.HabitDailyEntry{HabitID: h.ID}
			}
			rows = append(rows, map[string]string{
				"ID":   shortID(h.ID),
				"名称":   h.Name,
				"类型":   habitKindLabel(h.Kind),
				"记录方式": habitTypeLabel(h.Countable),
				"状态":   habitStatusLabel(entry, h.Countable),
				"简介":   habitDescText(h.Description, 20),
			})
		}
		printer.PrintMessage(date + " 的习惯记录:")
		printer.PrintTable([]string{"ID", "名称", "类型", "记录方式", "状态", "简介"}, rows)
		return nil
	},
}

var habitTodayDate string

// =============================================================================
// habit do / not（做没做型）
// =============================================================================

var habitDoCmd = &cobra.Command{
	Use:   "do <id>",
	Short: "标记做了（做没做型习惯）",
	Long: `将某个做没做型习惯标记为「做了」。可指定日期（默认今天）。
--undo 撤销该天记录（回到未记录）。

示例:
  serenique habit do a1b2c3d4
  serenique habit do a1b2c3d4 --date 2026-08-16
  serenique habit do a1b2c3d4 --undo`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return habitSetStatus(cmd, args[0], client.HabitStatusDone, habitDoDate, habitDoUndo)
	},
}

var (
	habitDoDate string
	habitDoUndo bool
)

var habitNotCmd = &cobra.Command{
	Use:   "not <id>",
	Short: "标记没做（做没做型习惯）",
	Long: `将某个做没做型习惯标记为「没做」。可指定日期（默认今天）。
--undo 撤销该天记录（回到未记录）。

示例:
  serenique habit not a1b2c3d4
  serenique habit not a1b2c3d4 --date 2026-08-16
  serenique habit not a1b2c3d4 --undo`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return habitSetStatus(cmd, args[0], client.HabitStatusNotDone, habitNotDate, habitNotUndo)
	},
}

var (
	habitNotDate string
	habitNotUndo bool
)

// habitSetStatus implements the shared do/not logic: resolves the habit,
// validates it is NOT countable, then either clears the day (--undo) or writes
// the given status. date/undo are passed in explicitly by the do/not commands
// so this helper never references the command variables directly (which would
// create an init cycle).
func habitSetStatus(cmd *cobra.Command, id, status, date string, undo bool) error {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if err := validateHabitDate(date, "--date"); err != nil {
		return err
	}
	ctx := commandContext(cmd)
	habit, err := requireHabitByID(ctx, id)
	if err != nil {
		return err
	}
	if habit.Countable {
		return fmt.Errorf("习惯 %q 是计数型，请用 habit count 子命令记录次数", habit.Name)
	}

	if undo {
		if err := apiClient.ClearDaily(ctx, id, date); err != nil {
			return err
		}
		printDeleteResult("习惯记录已撤销", id)
		return nil
	}

	input := client.SetDailyInput{Status: &status}
	if _, err := apiClient.SetDaily(ctx, id, date, input); err != nil {
		return err
	}
	verb := "做了"
	if status == client.HabitStatusNotDone {
		verb = "没做"
	}
	if useJSON {
		printer.PrintSuccess(fmt.Sprintf("已标记%s", verb), map[string]any{"habitId": id, "date": date, "status": status})
		return nil
	}
	printer.PrintMessage(fmt.Sprintf("✓ 已标记 %q %s（%s）", habit.Name, verb, date))
	return nil
}

// =============================================================================
// habit count（计数型）
// =============================================================================

var habitCountCmd = &cobra.Command{
	Use:   "count <id>",
	Short: "设置次数（计数型习惯）",
	Long: `设置某个计数型习惯在指定日期的次数（默认今天）。
--set N 直接设置次数；--inc / --dec 在当前值上增/减 1（下限 0）。
--set 与 --inc/--dec 互斥，三选一必填。

示例:
  serenique habit count a1b2c3d4 --set 8
  serenique habit count a1b2c3d4 --inc
  serenique habit count a1b2c3d4 --dec --date 2026-08-16`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		date := habitCountDate
		if date == "" {
			date = time.Now().Format("2006-01-02")
		}
		if err := validateHabitDate(date, "--date"); err != nil {
			return err
		}
		setFlag := cmd.Flags().Changed("set")
		incFlag := cmd.Flags().Changed("inc")
		decFlag := cmd.Flags().Changed("dec")
		modes := 0
		if setFlag {
			modes++
		}
		if incFlag {
			modes++
		}
		if decFlag {
			modes++
		}
		if modes == 0 {
			return fmt.Errorf("必须指定 --set N、--inc 或 --dec 之一")
		}
		if modes > 1 {
			return fmt.Errorf("--set 与 --inc/--dec 互斥，只能使用其一")
		}

		ctx := commandContext(cmd)
		habit, err := requireHabitByID(ctx, args[0])
		if err != nil {
			return err
		}
		if !habit.Countable {
			return fmt.Errorf("习惯 %q 是做没做型，请用 habit do / habit not 子命令标记", habit.Name)
		}

		var count int
		switch {
		case setFlag:
			if habitCountSet < 0 {
				return fmt.Errorf("次数不能为负数")
			}
			count = habitCountSet
		case incFlag, decFlag:
			current := 0
			dailies, err := apiClient.ListDaily(ctx, date)
			if err != nil {
				return err
			}
			for _, d := range dailies {
				if d.HabitID == args[0] {
					current = d.Count
					break
				}
			}
			count = current
			if incFlag {
				count++
			} else {
				count--
			}
			if count < 0 {
				count = 0
			}
		}

		input := client.SetDailyInput{Count: &count}
		if _, err := apiClient.SetDaily(ctx, args[0], date, input); err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("次数已更新", map[string]any{"habitId": args[0], "date": date, "count": count})
			return nil
		}
		printer.PrintMessage(fmt.Sprintf("✓ %q 已记录 %d 次（%s）", habit.Name, count, date))
		return nil
	},
}

var (
	habitCountDate string
	habitCountSet  int
	habitCountInc  bool
	habitCountDec  bool
)

// =============================================================================
// habit overview
// =============================================================================

var habitOverviewCmd = &cobra.Command{
	Use:   "overview",
	Short: "查看习惯总览",
	Long: `查看最近 N 天（默认 30，上限 365）的习惯总览：
按天分组的流水 + 每个习惯的频率统计（做没做型统计做了几天，计数型统计总次数）。

示例:
  serenique habit overview
  serenique habit overview --days 7
  serenique habit overview --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		days := habitOverviewDays
		if days < 1 || days > 365 {
			return fmt.Errorf("--days 必须在 1~365 之间")
		}
		ov, err := apiClient.GetHabitOverview(commandContext(cmd), days)
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", ov)
			return nil
		}

		// 按天流水（日期字典序 = 时间序，倒序展示最近的在前）
		dates := make([]string, 0, len(ov.ByDate))
		for d := range ov.ByDate {
			dates = append(dates, d)
		}
		sort.Strings(dates)
		for i := len(dates) - 1; i >= 0; i-- {
			date := dates[i]
			items := ov.ByDate[date]
			fmt.Printf("=== %s ===\n", date)
			if len(items) == 0 {
				fmt.Println("  (无记录)")
				continue
			}
			for _, it := range items {
				fmt.Printf("  %s\n", habitOverviewItemLine(it))
			}
		}

		// 频率统计
		fmt.Printf("\n近 %d 天统计:\n", days)
		for _, s := range ov.Stats {
			line := fmt.Sprintf("  %s [%s] ", s.Name, habitKindLabel(s.Kind))
			if s.Countable {
				line += fmt.Sprintf("共 %d 次 / 记了 %d 天", s.TotalCount, s.DoneDays)
			} else {
				line += fmt.Sprintf("做了 %d 天 / 没做 %d 天", s.DoneDays, s.NotDoneDays)
			}
			fmt.Println(line)
		}
		return nil
	},
}

var habitOverviewDays int

// =============================================================================
// Helpers
// =============================================================================

// resolveHabitKind maps the --good/--bad pair to a kind value, rejecting both
// or neither. msg is used when neither is set (create requires one; update
// leaves kind untouched when both are absent).
func resolveHabitKind(good, bad bool, noneMsg string) (string, error) {
	if good && bad {
		return "", fmt.Errorf("--good 与 --bad 不能同时指定")
	}
	if !good && !bad {
		return "", fmt.Errorf("%s", noneMsg)
	}
	if good {
		return client.HabitKindGood, nil
	}
	return client.HabitKindBad, nil
}

// requireHabitByID fetches the habit list and returns the entry with the given
// id, or an actionable error when it does not exist.
func requireHabitByID(ctx context.Context, id string) (*client.HabitEntry, error) {
	habits, err := apiClient.ListHabits(ctx)
	if err != nil {
		return nil, err
	}
	for i := range habits {
		if habits[i].ID == id {
			return &habits[i], nil
		}
	}
	return nil, fmt.Errorf("习惯不存在: %s", id)
}

// habitKindLabel maps the API kind value to a Chinese label for table-mode
// display. JSON mode always emits the raw API value (kind: good/bad).
func habitKindLabel(kind string) string {
	if kind == client.HabitKindGood {
		return "好事"
	}
	return "坏事"
}

// habitTypeLabel maps countable to its Chinese label.
func habitTypeLabel(countable bool) string {
	if countable {
		return "计数型"
	}
	return "做没做型"
}

// habitStatusLabel renders a daily entry's status for table-mode display:
// countable habits show ×N (未记录 when 0); non-countable habits show the
// three-state 未记录 / ✓做了 / ✗没做.
func habitStatusLabel(entry client.HabitDailyEntry, countable bool) string {
	if countable {
		if entry.Count > 0 {
			return fmt.Sprintf("×%d", entry.Count)
		}
		return "未记录"
	}
	if entry.Status == nil {
		return "未记录"
	}
	switch *entry.Status {
	case client.HabitStatusDone:
		return "✓ 做了"
	case client.HabitStatusNotDone:
		return "✗ 没做"
	default:
		return *entry.Status
	}
}

// habitOverviewItemLine renders one overview record as a text line: countable
// habits show ×N (count=0 records are filtered out), non-countable habits show
// ✓/✗.
func habitOverviewItemLine(it client.HabitOverviewItem) string {
	var mark string
	if it.Count > 0 {
		mark = fmt.Sprintf("×%d", it.Count)
	} else if it.Status != nil && *it.Status == client.HabitStatusNotDone {
		mark = "✗"
	} else {
		mark = "✓"
	}
	return fmt.Sprintf("%s %s", mark, it.Name)
}

// habitRow renders one habit option as a table row.
func habitRow(h client.HabitEntry) map[string]string {
	return map[string]string{
		"ID":   shortID(h.ID),
		"名称":   truncateRunes(h.Name, 20),
		"类型":   habitKindLabel(h.Kind),
		"记录方式": habitTypeLabel(h.Countable),
		"排序":   strconv.Itoa(h.SortOrder),
	}
}

// habitKV renders the shared create/update success detail block.
func habitKV(h *client.HabitEntry) map[string]string {
	kv := map[string]string{
		"ID":   h.ID,
		"名称":   h.Name,
		"类型":   habitKindLabel(h.Kind),
		"记录方式": habitTypeLabel(h.Countable),
		"排序":   strconv.Itoa(h.SortOrder),
		"创建时间": prefix(h.CreatedAt, 10),
		"更新时间": prefix(h.UpdatedAt, 10),
	}
	if h.Description != nil && *h.Description != "" {
		kv["简介"] = truncateRunes(*h.Description, 40)
	}
	return kv
}

// optionalStr returns a *string pointing to s, or nil when s is empty — used
// for optional request fields so an empty value is simply omitted.
func optionalStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// habitDescText renders a habit's optional description (简介) for table-mode
// display: an empty/absent description renders as an empty cell.
func habitDescText(s *string, max int) string {
	if s == nil || *s == "" {
		return ""
	}
	return truncateRunes(*s, max)
}

// validateHabitDate rejects a date that is not a valid YYYY-MM-DD calendar
// date. Go's time.Parse normalizes out-of-range dates (e.g. 2026-02-30 →
// 2026-03-02) without an error, so a round-trip check catches them; the parse
// itself enforces the exact YYYY-MM-DD shape and rejects partial/extra input.
func validateHabitDate(s, label string) error {
	parsed, err := time.Parse("2006-01-02", s)
	if err != nil || parsed.Format("2006-01-02") != s {
		return fmt.Errorf("无效的%s %q：必须是有效的日历日期（YYYY-MM-DD）", label, s)
	}
	return nil
}

func init() {
	// ---- habit create ----
	habitCreateCmd.Flags().StringVarP(&habitCreateName, "name", "n", "", "习惯名称 (必填)")
	habitCreateCmd.Flags().BoolVar(&habitCreateGood, "good", false, "标记为好事")
	habitCreateCmd.Flags().BoolVar(&habitCreateBad, "bad", false, "标记为坏事")
	habitCreateCmd.Flags().BoolVar(&habitCreateCountable, "countable", false, "计数型习惯（记录次数，如喝水）")
	habitCreateCmd.Flags().StringVar(&habitCreateDescription, "description", "", "习惯简介（可选）")
	habitCreateCmd.MarkFlagRequired("name")

	// ---- habit update ----
	habitUpdateCmd.Flags().StringVarP(&habitUpdateName, "name", "n", "", "新名称")
	habitUpdateCmd.Flags().BoolVar(&habitUpdateGood, "good", false, "改为好事")
	habitUpdateCmd.Flags().BoolVar(&habitUpdateBad, "bad", false, "改为坏事")
	habitUpdateCmd.Flags().BoolVar(&habitUpdateCountable, "countable", false, "改为计数型")
	habitUpdateCmd.Flags().BoolVar(&habitUpdateNotCountable, "no-countable", false, "改为做没做型")
	habitUpdateCmd.Flags().IntVar(&habitUpdateSortOrder, "sort-order", 0, "新排序号")
	habitUpdateCmd.Flags().StringVar(&habitUpdateDescription, "description", "", "新简介（传空串清空）")

	// ---- habit delete ----
	habitDeleteCmd = deleteCommand("delete <id>", "删除习惯", `删除指定的习惯及其全部每日记录。此操作不可撤销，默认需要确认。

示例:
  serenique habit delete a1b2c3d4
  serenique habit delete a1b2c3d4 --force`, "习惯", true,
		func(id string) string { return "/api/habits/" + id }, &habitDeleteForce)
	habitDeleteCmd.Flags().BoolVarP(&habitDeleteForce, "force", "f", false, "跳过确认提示")

	// ---- habit today ----
	habitTodayCmd.Flags().StringVar(&habitTodayDate, "date", "", "日期 (YYYY-MM-DD)，默认今天")

	// ---- habit do / not ----
	habitDoCmd.Flags().StringVar(&habitDoDate, "date", "", "日期 (YYYY-MM-DD)，默认今天")
	habitDoCmd.Flags().BoolVar(&habitDoUndo, "undo", false, "撤销该天记录（回到未记录）")

	habitNotCmd.Flags().StringVar(&habitNotDate, "date", "", "日期 (YYYY-MM-DD)，默认今天")
	habitNotCmd.Flags().BoolVar(&habitNotUndo, "undo", false, "撤销该天记录（回到未记录）")

	// ---- habit count ----
	habitCountCmd.Flags().StringVar(&habitCountDate, "date", "", "日期 (YYYY-MM-DD)，默认今天")
	habitCountCmd.Flags().IntVar(&habitCountSet, "set", -1, "直接设置次数")
	habitCountCmd.Flags().BoolVar(&habitCountInc, "inc", false, "次数 +1")
	habitCountCmd.Flags().BoolVar(&habitCountDec, "dec", false, "次数 -1（下限 0）")

	// ---- habit overview ----
	habitOverviewCmd.Flags().IntVar(&habitOverviewDays, "days", 30, "统计窗口天数 (1~365)")

	habitCmd.AddCommand(habitCreateCmd)
	habitCmd.AddCommand(habitListCmd)
	habitCmd.AddCommand(habitUpdateCmd)
	habitCmd.AddCommand(habitDeleteCmd)
	habitCmd.AddCommand(habitTodayCmd)
	habitCmd.AddCommand(habitDoCmd)
	habitCmd.AddCommand(habitNotCmd)
	habitCmd.AddCommand(habitCountCmd)
	habitCmd.AddCommand(habitOverviewCmd)
}
