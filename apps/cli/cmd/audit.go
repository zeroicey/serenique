package cmd

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// auditCmd is the parent logs command. It exposes the server's audit-log
// read-side (list / unread count / mark-read) — the write side is internal to
// the API service layer and never exposed to clients.
var auditCmd = &cobra.Command{
	Use:   "logs",
	Short: "服务端审计日志",
	Long:  "查看服务端审计日志（登录、删除、上传等状态变更与安全相关操作）。只读接口，不提供删除。",
	Args:  cobra.NoArgs,
}

// logs unread
var auditUnreadCmd = &cobra.Command{
	Use:   "unread",
	Short: "查看未读日志数",
	Long: `查询当前未读的审计日志数量（供 Web 角标轮询等场景）。

示例:
  serenique logs unread
  serenique logs unread --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.AuditUnreadCount(commandContext(cmd))
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{"未读日志": strconv.Itoa(result.UnreadCount)})
		return nil
	},
}

// logs read
var auditReadCmd = &cobra.Command{
	Use:   "read",
	Short: "标记日志为已读",
	Long: `将审计日志标记为已读。默认全部置为已读；使用 --ids 精准标记指定 ID。

示例:
  serenique logs read
  serenique logs read --ids a1b2c3d4,e5f6a1b2
  serenique logs read --json`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		var ids []string
		if auditReadIDs != "" {
			for _, part := range strings.Split(auditReadIDs, ",") {
				if id := strings.TrimSpace(part); id != "" {
					ids = append(ids, id)
				}
			}
		}
		result, err := apiClient.MarkAuditLogsRead(commandContext(cmd), ids)
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("日志已标记为已读", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{
			"已更新": strconv.Itoa(result.UpdatedCount),
			"未读数": strconv.Itoa(result.UnreadCount),
		})
		return nil
	},
}

var auditReadIDs string

// logs list
var auditListCmd *cobra.Command

var (
	auditListPage       int
	auditListPageSize   int
	auditListAll        bool
	auditListLevel      string
	auditListEvent      string
	auditListUnreadOnly bool
)

// =============================================================================
// Helpers
// =============================================================================

// validateAuditLevel rejects a level value outside the API's allowed set
// (audit.types.ts AUDIT_LEVELS): info / warn / error.
func validateAuditLevel(s string) error {
	if !client.IsAuditLevel(s) {
		return fmt.Errorf("无效的日志级别 %q（可选: info / warn / error）", s)
	}
	return nil
}

// auditLevelLabel maps an API level value to a Chinese label for table-mode
// display. JSON mode always emits the raw API value (level: info/warn/error).
func auditLevelLabel(s string) string {
	switch s {
	case client.AuditLevelError:
		return "错误"
	case client.AuditLevelWarn:
		return "警告"
	default:
		return "信息"
	}
}

// auditReadLabel renders the isRead flag for table display.
func auditReadLabel(isRead bool) string {
	if isRead {
		return "已读"
	}
	return "未读"
}

// auditTimeLabel renders a server UTC ISO timestamp in the local timezone,
// e.g. "2026-08-05 09:00:00". The server always returns UTC (suffix Z); a raw
// prefix would show the UTC wall clock and mislead a user who expects local
// time. Converting to the local timezone keeps the displayed value meaningful.
func auditTimeLabel(s string) string {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		// Defensive: never emit a mangled value for an unexpected format.
		return prefix(s, 19)
	}
	return t.Local().Format("2006-01-02 15:04:05")
}

func init() {
	auditListCmd = paginatedListCommand[client.AuditLogEntry](listSpec[client.AuditLogEntry]{
		use:   "list",
		short: "列出审计日志",
		long: `分页查询服务端审计日志（按时间倒序），可按级别、事件和未读状态过滤。使用 --all 一次返回全部记录。

示例:
  serenique logs list
  serenique logs list --all
  serenique logs list --level warn
  serenique logs list --event auth.login
  serenique logs list --unread-only
  serenique logs list --page 1 --page-size 50
  serenique logs list --json`,
		path:     "/api/audit/logs",
		emptyMsg: "暂无审计日志",
		headers:  []string{"时间", "级别", "事件", "消息", "来源", "IP", "已读"},
		row: func(l client.AuditLogEntry) map[string]string {
			return map[string]string{
				"时间": auditTimeLabel(l.CreatedAt),
				"级别": auditLevelLabel(l.Level),
				"事件": truncateRunes(l.Event, 30),
				"消息": truncateRunes(l.Message, 40),
				"来源": nullableStr(l.Source),
				"IP":  nullableStr(l.IP),
				"已读": auditReadLabel(l.IsRead),
			}
		},
		extraQuery: func(q url.Values) {
			if auditListLevel != "" {
				q.Set("level", auditListLevel)
			}
			if auditListEvent != "" {
				q.Set("event", auditListEvent)
			}
			if auditListUnreadOnly {
				q.Set("unreadOnly", "true")
			}
		},
	}, &auditListPage, &auditListPageSize, &auditListAll)
	// The list factory has no pre-validation hook; inject one so a typo'd
	// --level fails with an actionable message before hitting the network.
	auditListCmd.PreRunE = func(cmd *cobra.Command, args []string) error {
		if auditListLevel != "" {
			return validateAuditLevel(auditListLevel)
		}
		return nil
	}
	// Note: --level deliberately has no shorthand — root's persistent -t is taken
	// and -l already belongs to --page-size.
	auditListCmd.Flags().IntVarP(&auditListPage, "page", "p", 1, "页码")
	auditListCmd.Flags().IntVarP(&auditListPageSize, "page-size", "l", 50, "每页条数")
	auditListCmd.Flags().StringVar(&auditListLevel, "level", "", "按级别过滤 (info / warn / error)")
	auditListCmd.Flags().StringVar(&auditListEvent, "event", "", "按事件类型过滤 (如 auth.login)")
	auditListCmd.Flags().BoolVar(&auditListUnreadOnly, "unread-only", false, "仅显示未读日志")
	auditListCmd.Flags().BoolVar(&auditListAll, "all", false, "一次返回全部记录（自动翻页）")

	auditReadCmd.Flags().StringVar(&auditReadIDs, "ids", "", "要标记为已读的日志 ID（逗号分隔；省略则全部置为已读）")

	auditCmd.AddCommand(auditListCmd)
	auditCmd.AddCommand(auditUnreadCmd)
	auditCmd.AddCommand(auditReadCmd)
}
