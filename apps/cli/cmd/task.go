package cmd

import (
	"fmt"
	"net/url"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// taskCmd is the parent task command.
var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "任务管理",
	Long:  "管理任务与任务组。任务必须归属于某个任务组；状态取值 todo / done / abandon。",
	Args:  cobra.NoArgs,
}

// =============================================================================
// task group
// =============================================================================

// taskGroupCmd is the parent task-group command.
var taskGroupCmd = &cobra.Command{
	Use:   "group",
	Short: "任务组管理",
	Long:  "管理任务组。一个任务组可包含多个任务，删除任务组会级联删除组内任务。",
	Args:  cobra.NoArgs,
}

// task group create
var taskGroupCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建任务组",
	Long: `创建一个新的任务组。

示例:
  serenique task group create --title "工作"
  serenique task group create -n "个人"`,
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.CreateTaskGroup(commandContext(cmd), taskGroupCreateTitle)
		if err != nil {
			return err
		}
		printCreateResult("任务组创建成功", result, "任务组创建成功", map[string]string{
			"ID":   result.ID,
			"标题":   result.Title,
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var taskGroupCreateTitle string

// task group list
var taskGroupListCmd *cobra.Command

var (
	taskGroupListPage     int
	taskGroupListPageSize int
	taskGroupListAll      bool
)

// task group get
var taskGroupGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看任务组详情",
	Long: `根据 ID 查看任务组信息。

示例:
  serenique task group get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.GetTaskGroup(commandContext(cmd), args[0])
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"标题":   result.Title,
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

// task group update
var taskGroupUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新任务组",
	Long: `更新指定的任务组（当前仅支持修改标题）。

示例:
  serenique task group update a1b2c3d4 --title "新标题"
  serenique task group update a1b2c3d4 -n "新标题"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.UpdateTaskGroup(commandContext(cmd), args[0], taskGroupUpdateTitle)
		if err != nil {
			return err
		}
		printCreateResult("任务组已更新", result, "任务组已更新", map[string]string{
			"ID":   result.ID,
			"标题":   result.Title,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var taskGroupUpdateTitle string

// task group delete
var taskGroupDeleteCmd *cobra.Command

var taskGroupDeleteForce bool

// =============================================================================
// task
// =============================================================================

// task create
var taskCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建任务",
	Long: `创建一个任务并归属到某个任务组。状态可选，默认 todo。

示例:
  serenique task create --title "写周报" --group-id a1b2c3d4
  serenique task create -n "读文档" -g a1b2c3d4 --status done`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateTaskStatus(taskCreateStatus); err != nil {
			return err
		}
		input := client.CreateTaskInput{
			Title:   taskCreateTitle,
			GroupID: taskCreateGroupID,
			Status:  taskCreateStatus,
		}

		result, err := apiClient.CreateTask(commandContext(cmd), input)
		if err != nil {
			return err
		}
		printCreateResult("任务创建成功", result, "任务创建成功", map[string]string{
			"ID":   result.ID,
			"任务组":  shortID(result.GroupID),
			"标题":   result.Title,
			"状态":   taskStatusLabel(result.Status),
			"创建时间": result.CreatedAt,
			"完成时间": nullableStr(result.CompletedAt),
		})
		return nil
	},
}

var (
	taskCreateTitle   string
	taskCreateGroupID string
	taskCreateStatus  string
)

// task list
var taskListCmd *cobra.Command

var (
	taskListPage     int
	taskListPageSize int
	taskListGroupID  string
	taskListStatus   string
	taskListAll      bool
)

// task get
var taskGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看任务详情",
	Long: `根据 ID 查看任务详情。

示例:
  serenique task get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.GetTask(commandContext(cmd), args[0])
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"任务组":  shortID(result.GroupID),
			"标题":   result.Title,
			"状态":   taskStatusLabel(result.Status),
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
			"完成时间": nullableStr(result.CompletedAt),
		})
		return nil
	},
}

// task update
var taskUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "更新任务",
	Long: `更新指定任务，可修改标题、任务组或状态，至少需要提供一个字段。

状态取值: todo / done / abandon。
完成时间 (completedAt) 由服务端根据状态自动同步：
  进入 done 时写入，离开 done 时清空。

示例:
  serenique task update a1b2c3d4 --title "新标题"
  serenique task update a1b2c3d4 --status done
  serenique task update a1b2c3d4 --group-id c3d4e5f6 --status abandon`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		input := client.UpdateTaskInput{}
		changed := false

		if cmd.Flags().Changed("title") {
			input.Title = &taskUpdateTitle
			changed = true
		}
		if cmd.Flags().Changed("group-id") {
			input.GroupID = &taskUpdateGroupID
			changed = true
		}
		if cmd.Flags().Changed("status") {
			if err := validateTaskStatus(taskUpdateStatus); err != nil {
				return err
			}
			input.Status = &taskUpdateStatus
			changed = true
		}
		if !changed {
			return fmt.Errorf("至少需要提供一个待更新字段（--title / --group-id / --status）")
		}

		result, err := apiClient.UpdateTask(commandContext(cmd), args[0], input)
		if err != nil {
			return err
		}
		printCreateResult("任务更新成功", result, "任务更新成功", map[string]string{
			"ID":   result.ID,
			"任务组":  shortID(result.GroupID),
			"标题":   result.Title,
			"状态":   taskStatusLabel(result.Status),
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
			"完成时间": nullableStr(result.CompletedAt),
		})
		return nil
	},
}

var (
	taskUpdateTitle   string
	taskUpdateGroupID string
	taskUpdateStatus  string
)

// task delete
var taskDeleteCmd *cobra.Command

var taskDeleteForce bool

// =============================================================================
// Helpers
// =============================================================================

// validateTaskStatus rejects a status value outside the API's allowed set with
// an actionable message, mirroring the server's zod enum + DB CHECK constraint.
func validateTaskStatus(s string) error {
	if !client.IsTaskStatus(s) {
		return fmt.Errorf("无效的任务状态 %q（可选: todo / done / abandon）", s)
	}
	return nil
}

// taskStatusLabel maps an API status value to a Chinese label for table-mode
// display. JSON mode always emits the raw API value (status: todo/done/abandon).
func taskStatusLabel(s string) string {
	switch s {
	case client.TaskStatusDone:
		return "已完成"
	case client.TaskStatusAbandon:
		return "已放弃"
	default:
		return "待办"
	}
}

// nullableStr renders a nullable string field for key/value display, using "-"
// for null (e.g. a task's completedAt before it is done).
func nullableStr(s *string) string {
	if s == nil {
		return "-"
	}
	return *s
}

func init() {
	// ---- task group subcommands ----
	taskGroupCreateCmd.Flags().StringVarP(&taskGroupCreateTitle, "title", "n", "", "任务组标题 (必填)")
	taskGroupCreateCmd.MarkFlagRequired("title")

	taskGroupListCmd = paginatedListCommand[client.TaskGroupEntry](listSpec[client.TaskGroupEntry]{
		use:   "list",
		short: "列出任务组",
		long: `分页查询任务组列表（按更新时间倒序）。使用 --all 一次返回全部记录。

示例:
  serenique task group list
  serenique task group list --all
  serenique task group list --page 1 --page-size 50
  serenique task group list --json`,
		path:     "/api/task-groups",
		emptyMsg: "暂无任务组",
		headers:  []string{"ID", "标题", "创建时间", "更新时间"},
		row: func(g client.TaskGroupEntry) map[string]string {
			return map[string]string{
				"ID":   shortID(g.ID),
				"标题":   truncateRunes(g.Title, 30),
				"创建时间": prefix(g.CreatedAt, 10),
				"更新时间": prefix(g.UpdatedAt, 10),
			}
		},
	}, &taskGroupListPage, &taskGroupListPageSize, &taskGroupListAll)
	taskGroupListCmd.Flags().IntVarP(&taskGroupListPage, "page", "p", 1, "页码")
	taskGroupListCmd.Flags().IntVarP(&taskGroupListPageSize, "page-size", "l", 50, "每页条数")
	taskGroupListCmd.Flags().BoolVar(&taskGroupListAll, "all", false, "一次返回全部记录（自动翻页）")

	taskGroupUpdateCmd.Flags().StringVarP(&taskGroupUpdateTitle, "title", "n", "", "新标题 (必填)")
	taskGroupUpdateCmd.MarkFlagRequired("title")

	taskGroupDeleteCmd = deleteCommand("delete <id>", "删除任务组", `删除指定的任务组。任务组内的任务会被级联删除，此操作不可撤销，默认需要确认。

示例:
  serenique task group delete a1b2c3d4
  serenique task group delete a1b2c3d4 --force`, "任务组", true,
		func(id string) string { return "/api/task-groups/" + id }, &taskGroupDeleteForce)
	taskGroupDeleteCmd.Flags().BoolVarP(&taskGroupDeleteForce, "force", "f", false, "跳过确认提示")

	// ---- task subcommands ----
	taskCreateCmd.Flags().StringVarP(&taskCreateTitle, "title", "n", "", "任务标题 (必填)")
	taskCreateCmd.Flags().StringVarP(&taskCreateGroupID, "group-id", "g", "", "任务组 ID (必填)")
	taskCreateCmd.Flags().StringVarP(&taskCreateStatus, "status", "s", "todo", "任务状态 (todo / done / abandon)")
	taskCreateCmd.MarkFlagRequired("title")
	taskCreateCmd.MarkFlagRequired("group-id")

	taskListCmd = paginatedListCommand[client.TaskEntry](listSpec[client.TaskEntry]{
		use:   "list",
		short: "列出任务",
		long: `分页查询任务列表（按创建时间倒序），可按任务组和状态过滤。使用 --all 一次返回全部记录。

示例:
  serenique task list
  serenique task list --all
  serenique task list --group-id a1b2c3d4
  serenique task list --status done
  serenique task list --group-id a1b2c3d4 --status todo
  serenique task list --page 1 --page-size 50
  serenique task list --json`,
		path:     "/api/tasks",
		emptyMsg: "暂无任务",
		headers:  []string{"ID", "任务组", "标题", "状态", "创建时间"},
		row: func(t client.TaskEntry) map[string]string {
			return map[string]string{
				"ID":   shortID(t.ID),
				"任务组":  shortID(t.GroupID),
				"标题":   truncateRunes(t.Title, 30),
				"状态":   taskStatusLabel(t.Status),
				"创建时间": prefix(t.CreatedAt, 10),
			}
		},
		extraQuery: func(q url.Values) {
			if taskListGroupID != "" {
				q.Set("groupId", taskListGroupID)
			}
			if taskListStatus != "" {
				q.Set("status", taskListStatus)
			}
		},
	}, &taskListPage, &taskListPageSize, &taskListAll)
	// The list factory has no pre-validation hook; inject one so a typo'd
	// --status fails with an actionable message before hitting the network.
	taskListCmd.PreRunE = func(cmd *cobra.Command, args []string) error {
		if taskListStatus != "" {
			return validateTaskStatus(taskListStatus)
		}
		return nil
	}
	taskListCmd.Flags().IntVarP(&taskListPage, "page", "p", 1, "页码")
	taskListCmd.Flags().IntVarP(&taskListPageSize, "page-size", "l", 50, "每页条数")
	taskListCmd.Flags().StringVarP(&taskListGroupID, "group-id", "g", "", "按任务组 ID 过滤")
	taskListCmd.Flags().StringVarP(&taskListStatus, "status", "s", "", "按状态过滤 (todo / done / abandon)")
	taskListCmd.Flags().BoolVar(&taskListAll, "all", false, "一次返回全部记录（自动翻页）")

	taskUpdateCmd.Flags().StringVarP(&taskUpdateTitle, "title", "n", "", "新标题")
	taskUpdateCmd.Flags().StringVarP(&taskUpdateGroupID, "group-id", "g", "", "移动到的目标任务组 ID")
	taskUpdateCmd.Flags().StringVarP(&taskUpdateStatus, "status", "s", "", "新状态 (todo / done / abandon)")

	taskDeleteCmd = deleteCommand("delete <id>", "删除任务", `删除指定的任务。此操作不可撤销，默认需要确认。

示例:
  serenique task delete a1b2c3d4
  serenique task delete a1b2c3d4 --force`, "任务", true,
		func(id string) string { return "/api/tasks/" + id }, &taskDeleteForce)
	taskDeleteCmd.Flags().BoolVarP(&taskDeleteForce, "force", "f", false, "跳过确认提示")

	taskGroupCmd.AddCommand(taskGroupCreateCmd)
	taskGroupCmd.AddCommand(taskGroupListCmd)
	taskGroupCmd.AddCommand(taskGroupGetCmd)
	taskGroupCmd.AddCommand(taskGroupUpdateCmd)
	taskGroupCmd.AddCommand(taskGroupDeleteCmd)

	taskCmd.AddCommand(taskGroupCmd)
	taskCmd.AddCommand(taskCreateCmd)
	taskCmd.AddCommand(taskListCmd)
	taskCmd.AddCommand(taskGetCmd)
	taskCmd.AddCommand(taskUpdateCmd)
	taskCmd.AddCommand(taskDeleteCmd)
}
