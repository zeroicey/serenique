package cmd

import (
	"fmt"
	"strconv"

	"github.com/spf13/cobra"
	"github.com/zeroicey/serenique-cli/internal/client"
)

// tagCmd is the parent tag command. Tags are an independent resource attachable
// to any business content (moments today) via a polymorphic ownerType/ownerId
// relation.
var tagCmd = &cobra.Command{
	Use:   "tag",
	Short: "标签管理",
	Long:  "管理标签及其与业务内容的关联。标签是独立资源，通过 ownerType/ownerId 挂载到内容（当前支持闪念 moment）。",
	Args:  cobra.NoArgs,
}

// tag list
var tagListCmd *cobra.Command

var (
	tagListPage     int
	tagListPageSize int
	tagListAll      bool
)

// tag create
var tagCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "创建标签",
	Long: `创建一个标签。名称会被服务端归一化（trim + 转小写）并保证唯一，重复名称返回 409。

示例:
  serenique tag create --name "工作"
  serenique tag create -n "重要"`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.CreateTag(commandContext(cmd), tagCreateName)
		if err != nil {
			return err
		}
		printCreateResult("标签创建成功", result, "标签创建成功", map[string]string{
			"ID":   result.ID,
			"名称":   result.Name,
			"使用次数": strconv.Itoa(result.MomentCount),
			"创建时间": result.CreatedAt,
		})
		return nil
	},
}

var tagCreateName string

// tag get
var tagGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "查看标签详情",
	Long: `根据 ID 查看标签信息（含使用次数）。

示例:
  serenique tag get a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.GetTag(commandContext(cmd), args[0])
		if err != nil {
			return err
		}
		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}
		printer.PrintKeyValue(map[string]string{
			"ID":   result.ID,
			"名称":   result.Name,
			"使用次数": strconv.Itoa(result.MomentCount),
			"创建时间": result.CreatedAt,
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

// tag rename
var tagRenameCmd = &cobra.Command{
	Use:   "rename <id>",
	Short: "重命名标签",
	Long: `修改标签名称。重命名后已绑定的关联保持不变（关联挂在标签 ID 上，与名称无关）。
名称会被服务端归一化（trim + 转小写）并保证唯一。

示例:
  serenique tag rename a1b2c3d4 --name "新名称"
  serenique tag rename a1b2c3d4 -n "新名称"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		result, err := apiClient.RenameTag(commandContext(cmd), args[0], tagRenameName)
		if err != nil {
			return err
		}
		printCreateResult("标签已重命名", result, "标签已重命名", map[string]string{
			"ID":   result.ID,
			"名称":   result.Name,
			"使用次数": strconv.Itoa(result.MomentCount),
			"更新时间": result.UpdatedAt,
		})
		return nil
	},
}

var tagRenameName string

// tag delete
var tagDeleteCmd *cobra.Command

var tagDeleteForce bool

// tag attach
var tagAttachCmd = &cobra.Command{
	Use:   "attach <id>",
	Short: "为内容绑定标签",
	Long: `将标签绑定到某个业务内容（当前仅支持闪念 moment）。同一标签对同一内容重复绑定会返回 409。

示例:
  serenique tag attach a1b2c3d4 --owner-type moment --owner-id e5f6a1b2`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateTagOwnerType(tagAttachOwnerType); err != nil {
			return err
		}
		result, err := apiClient.AttachTag(commandContext(cmd), args[0], tagAttachOwnerType, tagAttachOwnerID)
		if err != nil {
			return err
		}
		kv := map[string]string{
			"标签 ID": shortID(args[0]),
			"内容类型":  tagAttachOwnerType,
			"内容 ID": shortID(tagAttachOwnerID),
		}
		if result.ID != "" {
			kv["关联 ID"] = shortID(result.ID)
		}
		printCreateResult("标签绑定成功", result, "标签绑定成功", kv)
		return nil
	},
}

var (
	tagAttachOwnerType string
	tagAttachOwnerID   string
)

// tag detach
var tagDetachCmd = &cobra.Command{
	Use:   "detach <id>",
	Short: "解除内容上的标签",
	Long: `解除标签与某个业务内容的绑定。此操作仅删除关联，不会删除标签本身。

示例:
  serenique tag detach a1b2c3d4 --owner-type moment --owner-id e5f6a1b2`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateTagOwnerType(tagDetachOwnerType); err != nil {
			return err
		}
		if err := apiClient.DetachTag(commandContext(cmd), args[0], tagDetachOwnerType, tagDetachOwnerID); err != nil {
			return err
		}
		printDeleteResult("标签关联已解除", args[0])
		return nil
	},
}

var (
	tagDetachOwnerType string
	tagDetachOwnerID   string
)

// =============================================================================
// Helpers
// =============================================================================

// validateTagOwnerType rejects an owner-type outside the API's registry
// (moment is the only registered type today; the registry grows as
// diary/event/task start attaching tags). Checked up front so a typo'd
// --owner-type fails with an actionable message instead of a server-side
// validation error.
func validateTagOwnerType(s string) error {
	if s != client.TagOwnerTypeMoment {
		return fmt.Errorf("不支持的 owner-type %q（当前仅支持 moment）", s)
	}
	return nil
}

func init() {
	// tag list
	tagListCmd = paginatedListCommand[client.TagEntry](listSpec[client.TagEntry]{
		use:   "list",
		short: "列出标签",
		long: `分页查询标签列表（按创建时间倒序）。使用 --all 一次返回全部记录。

示例:
  serenique tag list
  serenique tag list --all
  serenique tag list --page 1 --page-size 50
  serenique tag list --json`,
		path:     "/api/tags",
		emptyMsg: "暂无标签",
		headers:  []string{"ID", "名称", "使用次数"},
		row: func(t client.TagEntry) map[string]string {
			return map[string]string{
				"ID":   shortID(t.ID),
				"名称":   truncateRunes(t.Name, 30),
				"使用次数": strconv.Itoa(t.MomentCount),
			}
		},
	}, &tagListPage, &tagListPageSize, &tagListAll)
	tagListCmd.Flags().IntVarP(&tagListPage, "page", "p", 1, "页码")
	tagListCmd.Flags().IntVarP(&tagListPageSize, "page-size", "l", 50, "每页条数")
	tagListCmd.Flags().BoolVar(&tagListAll, "all", false, "一次返回全部记录（自动翻页）")

	// tag create
	tagCreateCmd.Flags().StringVarP(&tagCreateName, "name", "n", "", "标签名称，≤32 字符（服务端归一化为小写，必填)")
	tagCreateCmd.MarkFlagRequired("name")

	// tag rename
	tagRenameCmd.Flags().StringVarP(&tagRenameName, "name", "n", "", "新名称，≤32 字符（服务端归一化为小写，必填)")
	tagRenameCmd.MarkFlagRequired("name")

	// tag delete
	tagDeleteCmd = deleteCommand("delete <id>", "删除标签", `删除指定的标签。标签的关联关系会一并删除（级联），此操作不可撤销，默认需要确认。

示例:
  serenique tag delete a1b2c3d4
  serenique tag delete a1b2c3d4 --force`, "标签", true,
		func(id string) string { return "/api/tags/" + id }, &tagDeleteForce)
	tagDeleteCmd.Flags().BoolVarP(&tagDeleteForce, "force", "f", false, "跳过确认提示")

	// tag attach
	tagAttachCmd.Flags().StringVar(&tagAttachOwnerType, "owner-type", "", "关联内容类型 (必填，当前仅支持 moment)")
	tagAttachCmd.Flags().StringVar(&tagAttachOwnerID, "owner-id", "", "关联内容 ID (必填)")
	tagAttachCmd.MarkFlagRequired("owner-type")
	tagAttachCmd.MarkFlagRequired("owner-id")

	// tag detach
	tagDetachCmd.Flags().StringVar(&tagDetachOwnerType, "owner-type", "", "关联内容类型 (必填，当前仅支持 moment)")
	tagDetachCmd.Flags().StringVar(&tagDetachOwnerID, "owner-id", "", "关联内容 ID (必填)")
	tagDetachCmd.MarkFlagRequired("owner-type")
	tagDetachCmd.MarkFlagRequired("owner-id")

	tagCmd.AddCommand(tagListCmd)
	tagCmd.AddCommand(tagCreateCmd)
	tagCmd.AddCommand(tagGetCmd)
	tagCmd.AddCommand(tagRenameCmd)
	tagCmd.AddCommand(tagDeleteCmd)
	tagCmd.AddCommand(tagAttachCmd)
	tagCmd.AddCommand(tagDetachCmd)
}
