package cmd

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"

	"github.com/spf13/cobra"
)

// Blob types matching the API response.
type BlobEntry struct {
	ID           string         `json:"id"`
	OriginalName string         `json:"originalName"`
	MimeType     string         `json:"mimeType"`
	Size         int64          `json:"size"`
	Checksum     string         `json:"checksum"`
	Metadata     map[string]any `json:"metadata"`
	Width        *int           `json:"width"`
	Height       *int           `json:"height"`
	Duration     *float64       `json:"duration"`
	CreatedAt    string         `json:"createdAt"`
}

type BlobAttachmentEntry struct {
	ID          string         `json:"id"`
	BlobID      string         `json:"blobId"`
	OwnerType   string         `json:"ownerType"`
	OwnerID     string         `json:"ownerId"`
	Role        string         `json:"role"`
	DisplayName *string        `json:"displayName"`
	SortOrder   int            `json:"sortOrder"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
}

type BlobAccessLinkEntry struct {
	URL       string `json:"url"`
	Path      string `json:"path"`
	Expires   int64  `json:"expires"`
	ExpiresAt string `json:"expiresAt"`
	Signature string `json:"signature"`
}

type BlobCleanupResult struct {
	Checked int      `json:"checked"`
	Deleted []string `json:"deleted"`
	Failed  []struct {
		Path    string `json:"path"`
		Message string `json:"message"`
	} `json:"failed"`
}

// blobCmd is the parent blob command.
var blobCmd = &cobra.Command{
	Use:   "blob",
	Short: "文件管理",
	Long:  "管理文件（上传、下载、查看元数据、创建临时链接、关联到业务实体等）。",
	Args:  cobra.NoArgs,
}

// =============================================================================
// blob list
// =============================================================================

var blobListCmd *cobra.Command

var (
	blobListPage     int
	blobListPageSize int
	blobListMimeType string
)

// =============================================================================
// blob upload
// =============================================================================

var blobUploadCmd = &cobra.Command{
	Use:   "upload <file...>",
	Short: "上传文件",
	Long: `上传一个或多个文件到 Serenique。支持多文件同时上传。

文件通过 SHA-256 去重 —— 相同内容的文件不会重复存储。

示例:
  serenique blob upload photo.jpg
  serenique blob upload ./images/*.jpg
  serenique blob upload doc.pdf image.png`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := commandContext(cmd)

		// uploadResult describes one file's outcome. In JSON mode the whole
		// batch is emitted as a single document so stdout stays valid JSON.
		type uploadResult struct {
			File   string `json:"file"`
			BlobID string `json:"blobId,omitempty"`
			Error  string `json:"error,omitempty"`
		}

		successCount := 0
		failCount := 0
		results := make([]uploadResult, 0, len(args))
		var firstErr error

		for _, filePath := range args {
			if !useJSON {
				fmt.Printf("上传中: %s ... ", filePath)
			}

			var result BlobEntry
			err := apiClient.UploadFile(ctx, "/api/blobs/upload", filePath, &result)
			if err != nil {
				failCount++
				results = append(results, uploadResult{File: filePath, Error: err.Error()})
				if !useJSON {
					fmt.Printf("失败\n  %s\n", err.Error())
				}
				if firstErr == nil {
					firstErr = err
				}
				continue
			}

			successCount++
			results = append(results, uploadResult{File: filePath, BlobID: result.ID})
			if !useJSON {
				fmt.Printf("✓\n")
				fmt.Printf("  ID: %s, 大小: %s, 类型: %s\n", result.ID, formatSize(result.Size), result.MimeType)
			}
		}

		if useJSON {
			// "success" disambiguates a partially-failed batch: a consumer that
			// parses stdout alone can tell the upload did not fully succeed even
			// though the doc is still the regular {message, data} envelope. The
			// non-zero exit code and the stderr error object remain authoritative.
			printer.PrintSuccess("上传结果", map[string]any{
				"success":   failCount == 0,
				"succeeded": successCount,
				"failed":    failCount,
				"results":   results,
			})
			if firstErr != nil {
				return firstErr
			}
			return nil
		}

		fmt.Printf("\n上传完成: %d 成功, %d 失败\n", successCount, failCount)
		if firstErr != nil {
			// The per-file failures were already printed inline above; return a
			// renderedError so Execute() does not print the message a second
			// time — the exit code still signals the batch failed.
			return &renderedError{message: firstErr.Error()}
		}
		return nil
	},
}

// =============================================================================
// blob info
// =============================================================================

var blobInfoCmd = &cobra.Command{
	Use:   "info <id>",
	Short: "查看文件详情",
	Long: `查看指定文件的元数据信息。

示例:
  serenique blob info a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := commandContext(cmd)

		var result BlobEntry
		if err := apiClient.Get(ctx, "/api/blobs/"+args[0], nil, &result); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("查询成功", result)
			return nil
		}

		data := map[string]string{
			"ID":      result.ID,
			"文件名":     result.OriginalName,
			"MIME 类型": result.MimeType,
			"大小":      formatSize(result.Size),
			"SHA-256": result.Checksum,
			"上传时间":    result.CreatedAt,
		}
		if result.Width != nil && result.Height != nil {
			data["尺寸"] = fmt.Sprintf("%d x %d", *result.Width, *result.Height)
		}
		printer.PrintKeyValue(data)
		return nil
	},
}

// =============================================================================
// blob download
// =============================================================================

var blobDownloadCmd = &cobra.Command{
	Use:   "download <id>",
	Short: "下载文件",
	Long: `下载指定文件。默认使用原始文件名保存到当前目录。

示例:
  serenique blob download a1b2c3d4
  serenique blob download a1b2c3d4 --output ./downloads/photo.jpg
  serenique blob download a1b2c3d4 --download  # 强制作为附件下载`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		blobID := args[0]

		// Get metadata first to know the original filename
		ctx := commandContext(cmd)
		var info BlobEntry

		outputPath := blobDownloadOutput
		if outputPath == "" {
			if err := apiClient.Get(ctx, "/api/blobs/"+blobID, nil, &info); err != nil {
				return err
			}
			// The original name is server-controlled; never pass it straight to
			// os.Create — strip any directory components so a malicious
			// originalName cannot overwrite files outside the working directory.
			outputPath = filepath.Base(info.OriginalName)
			if outputPath == "" || outputPath == "." || outputPath == string(filepath.Separator) {
				return fmt.Errorf("无法从文件名 %q 推导出安全的保存路径，请使用 --output 指定", info.OriginalName)
			}
		}

		// Fast-fail when the target already exists; the client re-checks
		// atomically immediately before its rename, so this is only an early
		// UX optimization (avoids downloading a large file before erroring).
		// Use os.Lstat (not os.Stat) so both layers classify existence
		// identically — DownloadFile's atomic re-check uses Lstat, which sees a
		// dangling symlink as existing and refuses to overwrite it.
		if !blobDownloadOverwrite {
			if _, err := os.Lstat(outputPath); err == nil {
				return fmt.Errorf("目标文件已存在: %s（如需覆盖请使用 --force）", outputPath)
			}
		}

		if !useJSON {
			fmt.Printf("下载中: %s -> %s ...\n", blobID, outputPath)
		}

		if err := apiClient.DownloadFile(ctx, blobID, outputPath, blobDownloadAttachment, blobDownloadOverwrite); err != nil {
			return err
		}

		printer.PrintSuccess(fmt.Sprintf("文件已保存到 %s", outputPath), nil)
		return nil
	},
}

var (
	blobDownloadOutput     string
	blobDownloadAttachment bool // --download: force Content-Disposition: attachment
	blobDownloadOverwrite  bool // --force: overwrite an existing local file
)

// =============================================================================
// blob link
// =============================================================================

var blobLinkCmd = &cobra.Command{
	Use:   "link <id>",
	Short: "创建临时访问链接",
	Long: `为文件创建一个带签名的临时访问链接。

示例:
  serenique blob link a1b2c3d4
  serenique blob link a1b2c3d4 --expires-in 3600  # 1小时后过期`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// The API rejects expires-in outside [1, 604800]; fail with an actionable
		// message before hitting the network.
		if blobLinkExpiresIn < 1 || blobLinkExpiresIn > 604800 {
			return fmt.Errorf("过期时间必须在 1 到 604800 秒之间（最长 7 天）")
		}

		ctx := commandContext(cmd)

		body := map[string]int{"expiresInSeconds": blobLinkExpiresIn}

		var result BlobAccessLinkEntry
		if err := apiClient.Post(ctx, "/api/blobs/"+args[0]+"/access-link", body, &result); err != nil {
			return err
		}

		printCreateResult("生成成功", result, "临时访问链接已生成", map[string]string{
			"URL":  result.URL,
			"过期时间": result.ExpiresAt,
			"有效时长": fmt.Sprintf("%d 秒", blobLinkExpiresIn),
		})
		return nil
	},
}

var blobLinkExpiresIn int

// =============================================================================
// blob delete
// =============================================================================

var blobDeleteCmd *cobra.Command

var blobDeleteForce bool

// =============================================================================
// blob attach
// =============================================================================

var blobAttachCmd = &cobra.Command{
	Use:   "attach <blob-id>",
	Short: "创建业务关联",
	Long: `将文件关联到业务实体（如日记、闪念等）。

示例:
  serenique blob attach a1b2c3d4 --owner-type diary --owner-id b2c3d4e5
  serenique blob attach a1b2c3d4 --owner-type diary --owner-id b2c3d4e5 --role cover --display-name "封面图"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// The API reserves the "moment" owner type for the moment module.
		if blobAttachOwnerType == "moment" {
			return fmt.Errorf("owner-type 为 moment 时，请使用 `serenique moment attach <moment-id> --blob-id %s`", args[0])
		}

		ctx := commandContext(cmd)

		body := attachmentBody(args[0], blobAttachRole, blobAttachDisplayName,
			blobAttachSortOrder, cmd.Flags().Changed("sort-order"), map[string]any{
				"ownerType": blobAttachOwnerType,
				"ownerId":   blobAttachOwnerID,
			})

		var result BlobAttachmentEntry
		if err := apiClient.Post(ctx, "/api/blobs/"+args[0]+"/attachments", body, &result); err != nil {
			return err
		}

		dn := "-"
		if result.DisplayName != nil {
			dn = *result.DisplayName
		}
		printCreateResult("关联成功", result, "关联成功", map[string]string{
			"ID":   result.ID,
			"所属类型": result.OwnerType,
			"所属ID": result.OwnerID,
			"角色":   result.Role,
			"显示名称": dn,
		})
		return nil
	},
}

var (
	blobAttachOwnerType   string
	blobAttachOwnerID     string
	blobAttachRole        string
	blobAttachDisplayName string
	blobAttachSortOrder   int
)

// =============================================================================
// blob attachments
// =============================================================================

var blobAttachmentsCmd = &cobra.Command{
	Use:   "attachments <blob-id>",
	Short: "查看业务关联",
	Long: `查看指定文件的所有业务关联记录。

示例:
  serenique blob attachments a1b2c3d4`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := commandContext(cmd)

		var result []BlobAttachmentEntry
		if err := apiClient.Get(ctx, "/api/blobs/"+args[0]+"/attachments", nil, &result); err != nil {
			return err
		}

		if useJSON {
			// Match the {items, total} envelope used by every other list command.
			printer.PrintSuccess("查询成功", map[string]any{"items": result, "total": len(result)})
			return nil
		}

		if len(result) == 0 {
			printer.PrintMessage("暂无业务关联")
			return nil
		}

		headers := []string{"ID", "所属类型", "所属ID", "角色", "显示名称"}
		rows := make([]map[string]string, len(result))
		for i, a := range result {
			dn := "-"
			if a.DisplayName != nil {
				dn = *a.DisplayName
			}
			rows[i] = map[string]string{
				"ID":   a.ID[:8] + "...",
				"所属类型": a.OwnerType,
				// ownerId is a free-form business id (the API accepts any 1-128
				// char string), not a UUID — never slice it with a fixed bound.
				"所属ID": shortID(a.OwnerID),
				"角色":   a.Role,
				"显示名称": dn,
			}
		}

		printer.PrintTable(headers, rows)
		return nil
	},
}

// =============================================================================
// blob detach
// =============================================================================

var blobDetachCmd = &cobra.Command{
	Use:   "detach <attachment-id>",
	Short: "删除业务关联",
	Long: `删除一条业务关联记录。此操作仅删除引用，不会删除物理文件。

示例:
  serenique blob detach c3d4e5f6
  serenique blob detach c3d4e5f6 --force`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm("确认删除业务关联 "+args[0], blobDetachForce); err != nil {
			return err
		}

		ctx := commandContext(cmd)
		if err := apiClient.Delete(ctx, "/api/blob-attachments/"+args[0]); err != nil {
			return err
		}

		printDeleteResult("业务关联已删除", args[0])
		return nil
	},
}

var blobDetachForce bool

// =============================================================================
// blob cleanup
// =============================================================================

var blobCleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Short: "清理孤儿文件",
	Long: `清理磁盘上未被数据库引用的孤立文件。

⚠️ 这是一个维护操作，建议在服务低负载时执行。

示例:
  serenique blob cleanup
  serenique blob cleanup --force`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := confirm("确认清理孤儿文件？此操作会删除磁盘文件", blobCleanupForce); err != nil {
			return err
		}

		ctx := commandContext(cmd)

		var result BlobCleanupResult
		if err := apiClient.Post(ctx, "/api/blobs/cleanup-orphans", nil, &result); err != nil {
			return err
		}

		if useJSON {
			printer.PrintSuccess("清理完成", result)
			return nil
		}

		// Render through the printer (not raw fmt) so cleanup output follows the
		// same ✓-prefix / key-value conventions as every other command.
		printer.PrintMessage("✓ 清理完成")
		printer.PrintKeyValue(map[string]string{
			"检查文件": strconv.Itoa(result.Checked),
			"已删除":  strconv.Itoa(len(result.Deleted)),
		})
		if len(result.Failed) > 0 {
			printer.PrintMessage(fmt.Sprintf("  失败: %d", len(result.Failed)))
			for _, f := range result.Failed {
				printer.PrintMessage(fmt.Sprintf("    - %s: %s", f.Path, f.Message))
			}
		}
		return nil
	},
}

var blobCleanupForce bool

// =============================================================================
// Helpers
// =============================================================================

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// =============================================================================
// Registration
// =============================================================================

func init() {
	// blob list
	blobListCmd = paginatedListCommand[BlobEntry](listSpec[BlobEntry]{
		use:   "list",
		short: "列出文件",
		long: `分页查询已上传的文件列表，可按 MIME 类型过滤。

示例:
  serenique blob list
  serenique blob list --mime-type image/
  serenique blob list --page 1 --page-size 20
  serenique blob list --json`,
		path:        "/api/blobs",
		emptyMsg:    "暂无文件记录",
		headers:     []string{"ID", "文件名", "类型", "大小", "上传时间"},
		defaultSize: 20,
		row: func(b BlobEntry) map[string]string {
			return map[string]string{
				"ID":   b.ID[:8] + "...",
				"文件名":  b.OriginalName,
				"类型":   b.MimeType,
				"大小":   formatSize(b.Size),
				"上传时间": b.CreatedAt[:10],
			}
		},
		extraQuery: func(q url.Values) {
			if blobListMimeType != "" {
				q.Set("mimeType", blobListMimeType)
			}
		},
	}, &blobListPage, &blobListPageSize)
	blobListCmd.Flags().IntVarP(&blobListPage, "page", "p", 1, "页码")
	blobListCmd.Flags().IntVarP(&blobListPageSize, "page-size", "l", 20, "每页条数")
	blobListCmd.Flags().StringVar(&blobListMimeType, "mime-type", "", "按 MIME 类型过滤 (如 image/)")

	// blob download
	blobDownloadCmd.Flags().StringVarP(&blobDownloadOutput, "output", "o", "", "输出文件路径（默认使用原始文件名）")
	blobDownloadCmd.Flags().BoolVar(&blobDownloadAttachment, "download", false, "强制作为附件下载")
	blobDownloadCmd.Flags().BoolVarP(&blobDownloadOverwrite, "force", "f", false, "覆盖已存在的本地文件")

	// blob link
	blobLinkCmd.Flags().IntVarP(&blobLinkExpiresIn, "expires-in", "e", 900, "过期时间（秒），默认 900（15分钟），最长 604800（7天）")

	// blob delete
	blobDeleteCmd = deleteCommand("delete <id>", "删除文件", `删除指定文件（磁盘文件 + 数据库记录）。如果文件仍被业务实体引用，会返回错误。

示例:
  serenique blob delete a1b2c3d4
  serenique blob delete a1b2c3d4 --force`, "文件", true,
		func(id string) string { return "/api/blobs/" + id }, &blobDeleteForce)
	blobDeleteCmd.Flags().BoolVarP(&blobDeleteForce, "force", "f", false, "跳过确认提示")

	// blob attach
	blobAttachCmd.Flags().StringVar(&blobAttachOwnerType, "owner-type", "", "业务实体类型 (必填)")
	blobAttachCmd.Flags().StringVar(&blobAttachOwnerID, "owner-id", "", "业务实体 ID (必填)")
	blobAttachCmd.Flags().StringVarP(&blobAttachRole, "role", "r", "attachment", "关联角色")
	blobAttachCmd.Flags().StringVarP(&blobAttachDisplayName, "display-name", "n", "", "显示名称")
	blobAttachCmd.Flags().IntVar(&blobAttachSortOrder, "sort-order", 0, "排序权重")
	blobAttachCmd.MarkFlagRequired("owner-type")
	blobAttachCmd.MarkFlagRequired("owner-id")

	// blob detach
	blobDetachCmd.Flags().BoolVarP(&blobDetachForce, "force", "f", false, "跳过确认提示")

	// blob cleanup
	blobCleanupCmd.Flags().BoolVarP(&blobCleanupForce, "force", "f", false, "跳过确认提示")

	blobCmd.AddCommand(blobListCmd)
	blobCmd.AddCommand(blobUploadCmd)
	blobCmd.AddCommand(blobInfoCmd)
	blobCmd.AddCommand(blobDownloadCmd)
	blobCmd.AddCommand(blobLinkCmd)
	blobCmd.AddCommand(blobDeleteCmd)
	blobCmd.AddCommand(blobAttachCmd)
	blobCmd.AddCommand(blobAttachmentsCmd)
	blobCmd.AddCommand(blobDetachCmd)
	blobCmd.AddCommand(blobCleanupCmd)
}
