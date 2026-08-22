package client

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// UploadUrlEntry mirrors the API's UploadUrlEntry (blob.types.ts): a signed
// PUT credential for the R2 gateway direct upload. The URL points at the R2
// gateway host (not the API base) and carries its own signature, so no
// Authorization header is needed on the PUT itself.
type UploadUrlEntry struct {
	BlobID      string `json:"blobId"`
	StoragePath string `json:"storagePath"`
	Method      string `json:"method"`
	URL         string `json:"url"`
	ThumbURL    string `json:"thumbUrl,omitempty"`
	Expires     int64  `json:"expires"`
	ExpiresAt   string `json:"expiresAt"`
	Mode        string `json:"mode"`
}

// ErrDirectUploadUnsupported signals the API rejected the direct-upload
// credential request because the storage backend is not r2 (local backend).
// Callers fall back to the legacy multipart endpoint, which the API keeps for
// local backends.
var ErrDirectUploadUnsupported = errors.New("直传上传仅在 r2 存储后端可用")

const uploadURLPath = "/api/blobs/upload-url"

// CreateUploadUrl asks the API to pre-allocate a storage path and sign a PUT
// URL for a direct r2 upload. size must match the file exactly: the signature
// binds the content length and the gateway rejects mismatches with 403.
func (c *Client) CreateUploadUrl(ctx context.Context, filename, mimeType string, size int64) (*UploadUrlEntry, error) {
	var out UploadUrlEntry
	err := c.Post(ctx, uploadURLPath, map[string]any{
		"filename": filename,
		"mimeType": mimeType,
		"size":     size,
	}, &out)
	if err != nil {
		// The API rejects the direct path on local backends with this exact
		// validation message; anything else is a real failure.
		var apiErr *APIError
		if errors.As(err, &apiErr) && strings.Contains(apiErr.Message, "仅在 r2 存储后端可用") {
			return nil, ErrDirectUploadUnsupported
		}
		return nil, err
	}
	return &out, nil
}

// hashingReader feeds every byte read into h while it is being read from, so a
// streaming upload can compute the SHA-256 checksum without reading the file
// twice.
type hashingReader struct {
	io.Reader
	h hash.Hash
}

func (r *hashingReader) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if n > 0 {
		r.h.Write(p[:n])
	}
	return n, err
}

// putToGateway streams the open file to the signed R2 gateway URL. Content-Type
// is forwarded so the gateway can store it as R2 object metadata. Content-Length
// must be set explicitly: the gateway reads the header directly and verifies it
// against the size bound inside the signature — a chunked request (the default
// for a non-bytes.Reader body) is rejected with 403. Returns the SHA-256 hex
// checksum computed while streaming.
func (c *Client) putToGateway(ctx context.Context, cred *UploadUrlEntry, file *os.File, size int64, mimeType string, watchdog *transferWatchdog) (string, error) {
	h := sha256.New()
	body := &hashingReader{
		Reader: &activityReader{Reader: file, w: watchdog},
		h:      h,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, cred.URL, body)
	if err != nil {
		return "", fmt.Errorf("创建直传请求失败: %w", err)
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", mimeType)

	resp, err := c.transferHTTPClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("直传请求失败: %w", err)
	}
	defer resp.Body.Close()

	// Drain a bounded amount so keep-alive can reuse the connection; the body
	// is a tiny gateway status line.
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("网关直传失败 (HTTP %d): %s", resp.StatusCode, snippet(bodyBytes))
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// UploadFileSmart uploads a single file, adapting to the API's storage backend:
// r2 production uses the direct flow (upload-url -> signed PUT to the gateway
// -> confirm); local backends keep the legacy multipart endpoint. The fallback
// is detected from the API rejecting the credential request on local backends.
// result receives the created blob entry (same shape as UploadFile's result).
func (c *Client) UploadFileSmart(ctx context.Context, filePath string, result any) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("无法打开文件 %s: %w", filePath, err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return fmt.Errorf("读取文件信息失败: %w", err)
	}
	size := info.Size()

	// Best-effort MIME from the extension (the API stores it as object metadata
	// and uses it for the storagePath mime-main directory). Parameters such as
	// Go's "text/plain; charset=utf-8" are stripped so the stored value stays a
	// clean media type.
	name := filepath.Base(filePath)
	mimeType := mime.TypeByExtension(filepath.Ext(name))
	if i := strings.IndexByte(mimeType, ';'); i >= 0 {
		mimeType = strings.TrimSpace(mimeType[:i])
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	cred, err := c.CreateUploadUrl(ctx, name, mimeType, size)
	if errors.Is(err, ErrDirectUploadUnsupported) {
		// Local backend: the legacy multipart endpoint is the supported path.
		return c.UploadFile(ctx, "/api/blobs/upload", filePath, result)
	}
	if err != nil {
		return err
	}

	// r2 backend: stream the file to the signed gateway URL. A gateway that
	// stops reading would stall the file reads, so the watchdog cancels the
	// request context after an idle interval instead of hanging forever.
	ctx, cancel := context.WithCancel(ctx)
	watchdog := newTransferWatchdog(cancel)
	defer watchdog.stop()

	checksum, err := c.putToGateway(ctx, cred, file, size, mimeType, watchdog)
	if err != nil {
		if watchdog.timedOut.Load() {
			return fmt.Errorf("直传超时：%s 内无数据传输", transferIdleTimeout)
		}
		return err
	}

	// Finalize: the API dedups by checksum or inserts the blobs row. Note this
	// uses the default (timeout-bounded) client — it is a tiny JSON call.
	return c.Post(ctx, "/api/blobs/confirm", map[string]any{
		"blobId":       cred.BlobID,
		"storagePath":  cred.StoragePath,
		"originalName": name,
		"mimeType":     mimeType,
		"size":         size,
		"checksum":     checksum,
	}, result)
}

// BlobDeleteResult mirrors the API's BlobDeleteResult (blob.types.ts): the
// r2 backend returns signed gateway delete URLs after removing the DB row.
// local backend returns 204 and no deleteUrls.
type BlobDeleteResult struct {
	Deleted    bool     `json:"deleted"`
	DeleteURLs []string `json:"deleteUrls"`
}

// R2 网关官方域名：签名删除 DELETE 的白名单（防御性校验，对齐 Web
// R2_GATEWAY_ORIGIN / 移动端 kR2GatewayOrigin）。仅放行该 origin 的 deleteUrl。
// 包级 var（非 const）以便测试注入 httptest 地址；生产值固定为官方网关。
var r2GatewayOrigin = "https://s3.0icey.icu"

// DeleteBlob deletes a physical blob. On the r2 backend the API returns signed
// gateway delete URLs (DB row already removed): this method fires those
// gateway DELETEs synchronously (best-effort, failures only warn) so objects
// are actually removed from R2 — mirroring the web/mobile reference behavior.
// On the local backend the API returns 204 and nothing extra happens.
func (c *Client) DeleteBlob(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.url("/api/blobs/"+id), nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Close = true

	var result BlobDeleteResult
	if err := c.do(req, &result); err != nil {
		return err
	}
	for _, u := range result.DeleteURLs {
		if !isR2GatewayURL(u) {
			continue // 防御性：仅官方网关，防恶意/错误 URL
		}
		if err := c.deleteGatewayObject(ctx, u); err != nil {
			fmt.Fprintf(os.Stderr, "⚠️ 网关删除失败（对象将留待孤儿清理兜底）: %v\n", err)
		}
	}
	return nil
}

func isR2GatewayURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Scheme+"://"+u.Host == r2GatewayOrigin
}

func (c *Client) deleteGatewayObject(ctx context.Context, target string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, target, nil)
	if err != nil {
		return fmt.Errorf("创建网关删除请求失败: %w", err)
	}
	// 签名在 query 上，无需 Authorization 头；用传输 client（有超时 watchdog）。
	resp, err := c.transferHTTPClient().Do(req)
	if err != nil {
		return fmt.Errorf("网关删除请求失败: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("网关删除失败 (HTTP %d)", resp.StatusCode)
	}
	return nil
}
