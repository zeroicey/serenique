// Package client provides a typed HTTP client for the Serenique API.
//
// It handles the unified response format ({success, message, data, error}),
// auth headers, multipart file upload, and file download streaming.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// DefaultTimeout is the HTTP client timeout for all requests.
const DefaultTimeout = 60 * time.Second

// Client wraps the Serenique API HTTP client.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client

	// transferOnce guards lazy construction of the shared streaming-transfer
	// client so a multi-file `blob upload` reuses one keep-alive connection and
	// TLS session instead of re-handshaking per file.
	transferOnce   sync.Once
	transferClient *http.Client
}

// APIResponse is the unified response envelope from the server.
type APIResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   json.RawMessage `json:"error,omitempty"`
}

// APIError wraps an error returned by the API.
type APIError struct {
	Message    string
	HTTPStatus int
	Details    json.RawMessage
}

func (e *APIError) Error() string {
	if len(e.Details) > 0 {
		return fmt.Sprintf("%s (HTTP %d, details: %s)", e.Message, e.HTTPStatus, string(e.Details))
	}
	return fmt.Sprintf("%s (HTTP %d)", e.Message, e.HTTPStatus)
}

// NewClient creates a new API client.
func NewClient(baseURL, token string) (*Client, error) {
	// Strip trailing slash for consistent URL building
	baseURL = strings.TrimRight(baseURL, "/")
	if err := ValidateBaseURL(baseURL); err != nil {
		return nil, err
	}

	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}, nil
}

// ValidateBaseURL rejects a base URL that cannot produce well-formed requests —
// an empty scheme or host, or a non-HTTP(S) scheme — with an actionable message.
// Failing here (at client construction, right after config resolution) surfaces
// a config typo like `http://` or a bare host immediately instead of as a
// cryptic "http: no Host in request URL" wrapped in a generic network hint at
// request time. The audience includes AI agents setting config via env vars.
func ValidateBaseURL(raw string) error {
	baseURL := strings.TrimRight(raw, "/")
	u, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Errorf("无效的 baseurl %q: %v", baseURL, err)
	}
	if u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("无效的 baseurl %q: 必须包含协议和主机名，例如 http://localhost:3000", baseURL)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("无效的 baseurl %q: 仅支持 http 或 https 协议", baseURL)
	}
	return nil
}

// transferHTTPClient returns the shared HTTP client with no overall request
// timeout, used only for streaming file transfers. Uploads and downloads of
// large blobs (the API allows up to 100MB) can legitimately run longer than
// DefaultTimeout (60s). The transport keeps a finite ResponseHeaderTimeout so
// a server that accepts a connection and then never sends response headers
// fails fast, while large bodies are still allowed to stream once headers have
// arrived. The client is built once and cached on the Client so a multi-file
// `blob upload` reuses one keep-alive connection instead of re-establishing a
// TCP connection and re-running the TLS handshake per file. A body that stalls
// mid-stream is aborted by the transfer watchdog (newTransferWatchdog), so a
// hung server does not hang forever.
func (c *Client) transferHTTPClient() *http.Client {
	c.transferOnce.Do(func() {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.ResponseHeaderTimeout = 30 * time.Second
		c.transferClient = &http.Client{Transport: transport}
	})
	return c.transferClient
}

// transferIdleTimeout is the maximum time a streaming transfer may go without
// any bytes flowing (a download with no body data, or an upload whose server
// stops reading) before it is aborted. Bounds a stalled peer so transfers
// never hang forever. A variable so tests can shorten it.
var transferIdleTimeout = 30 * time.Second

// transferWatchdog aborts a transfer that makes no progress for
// transferIdleTimeout. mark() records activity (each chunk read or written); a
// watchdog goroutine cancels the request context when idle elapses without a
// mark, which unblocks the blocked read/write with an error. timedOut reports
// whether the watchdog (rather than the user, via signal) was the cause, so the
// caller can surface a clear timeout message.
type transferWatchdog struct {
	cancel   context.CancelFunc
	idle     time.Duration
	lastMark atomic.Int64 // UnixNano of the most recent mark()
	timedOut atomic.Bool
	done     chan struct{}
	once     sync.Once
}

func newTransferWatchdog(cancel context.CancelFunc) *transferWatchdog {
	w := &transferWatchdog{
		cancel: cancel,
		idle:   transferIdleTimeout,
		done:   make(chan struct{}),
	}
	w.lastMark.Store(time.Now().UnixNano())
	go w.run()
	return w
}

// mark records that a chunk of the transfer just flowed.
func (w *transferWatchdog) mark() { w.lastMark.Store(time.Now().UnixNano()) }

// stop shuts the watchdog down after a transfer completes normally.
func (w *transferWatchdog) stop() { w.once.Do(func() { close(w.done) }) }

func (w *transferWatchdog) run() {
	ticker := time.NewTicker(w.idle / 2)
	defer ticker.Stop()
	for {
		select {
		case <-w.done:
			return
		case <-ticker.C:
			if time.Since(time.Unix(0, w.lastMark.Load())) >= w.idle {
				w.timedOut.Store(true)
				w.cancel()
				return
			}
		}
	}
}

// activityReader wraps a transfer source so each chunk of progress resets the
// watchdog's idle timer (used for the local file being uploaded).
type activityReader struct {
	io.Reader
	w *transferWatchdog
}

func (r *activityReader) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if n > 0 {
		r.w.mark()
	}
	return n, err
}

// activityBody wraps a streaming response body so each received chunk resets
// the watchdog's idle timer.
type activityBody struct {
	io.ReadCloser
	w *transferWatchdog
}

func (b *activityBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if n > 0 {
		b.w.mark()
	}
	return n, err
}

// =============================================================================
// Generic request methods
// =============================================================================

// Get sends a GET request and unmarshals the response data into result.
func (c *Client) Get(ctx context.Context, path string, query url.Values, result any) error {
	fullURL := c.url(path)
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)

	return c.do(req, result)
}

// Post sends a POST request with a JSON body and unmarshals the response data into result.
func (c *Client) Post(ctx context.Context, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("序列化请求体失败: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.url(path), bodyReader)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	return c.do(req, result)
}

// Put sends a PUT request with a JSON body and unmarshals the response data into result.
func (c *Client) Put(ctx context.Context, path string, body any, result any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("序列化请求体失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PUT", c.url(path), bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	return c.do(req, result)
}

// Delete sends a DELETE request. Returns nil on success (204 or 200).
//
// The API's Res.noContent endpoints (diary delete, moment delete, moment
// detach) send HTTP 204 with a JSON body — a protocol violation: 204 is
// bodyless, so Go hides resp.Body (NoBody) and the real bytes stay unread on
// the connection. If that connection were returned to the keep-alive pool, the
// next request reusing it would read the stale bytes and net/http would log an
// "Unsolicited response received on idle HTTP channel" warning to stderr,
// corrupting the CLI's structured-error channel. Setting req.Close (Connection:
// close) keeps the connection from being reused, so the hidden body is
// discarded with it. (blob delete/detach send a true bodyless 204 and are
// unaffected, but closing the connection after any delete is harmless.)
func (c *Client) Delete(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.url(path), nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Close = true

	return c.do(req, nil)
}

// DeleteWithBody sends a DELETE with a JSON body, for endpoints whose payload
// is a body rather than a path parameter (e.g. tag detach sends
// {ownerType, ownerId}). It keeps Delete's connection-close behavior — the
// API's Res.noContent endpoints send 204 with a body, and a kept-alive
// connection would leak those stale bytes into the next request.
func (c *Client) DeleteWithBody(ctx context.Context, path string, body any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("序列化请求体失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "DELETE", c.url(path), bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	req.Close = true

	return c.do(req, nil)
}

// List sends a GET request to a paginated endpoint and unpacks the
// {items, total} envelope. The query values are passed through unchanged
// (callers set page/pageSize themselves).
//
// This stays a free function rather than a method because Go does not allow
// generic methods on a non-generic receiver type: `func (c *Client) List[T any]`
// is rejected with "method must have no type parameters".
func List[T any](c *Client, ctx context.Context, path string, query url.Values) ([]T, int, error) {
	var result struct {
		Items []T `json:"items"`
		Total int `json:"total"`
	}
	if err := c.Get(ctx, path, query, &result); err != nil {
		return nil, 0, err
	}
	return result.Items, result.Total, nil
}

// =============================================================================
// File upload
// =============================================================================

// UploadFile uploads a single file via multipart/form-data.
// The file is sent under the field name "file" as expected by the API.
// The result is unmarshalled from the API response data field.
func (c *Client) UploadFile(ctx context.Context, apiPath string, filePath string, result any) error {
	// A server that stops reading the multipart body stalls the pipe write (io
	// .Pipe is unbuffered, so the local file read pace is tied to the server's
	// read pace). The watchdog cancels the request context after
	// transferIdleTimeout with no progress so the upload aborts instead of
	// hanging forever.
	ctx, cancel := context.WithCancel(ctx)
	watchdog := newTransferWatchdog(cancel)
	defer watchdog.stop()

	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("无法打开文件 %s: %w", filePath, err)
	}
	defer file.Close()

	// Use a pipe for streaming large files without buffering entirely in memory
	pr, pw := io.Pipe()
	// If request construction fails after this point we return early without
	// sending anything; closing the read end unblocks the writer goroutine below
	// so it does not leak blocked forever inside io.Copy.
	defer pr.Close()
	writer := multipart.NewWriter(pw)

	// Write multipart body in a goroutine
	go func() {
		defer pw.Close()
		defer writer.Close()

		part, err := writer.CreateFormFile("file", filepath.Base(filePath))
		if err != nil {
			pw.CloseWithError(fmt.Errorf("创建表单字段失败: %w", err))
			return
		}

		if _, err := io.Copy(part, &activityReader{Reader: file, w: watchdog}); err != nil {
			pw.CloseWithError(fmt.Errorf("读取文件失败: %w", err))
			return
		}
	}()

	req, err := http.NewRequestWithContext(ctx, "POST", c.url(apiPath), pr)
	if err != nil {
		return fmt.Errorf("创建上传请求失败: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	// File transfers are not bound by the 60s JSON-endpoint timeout.
	err = c.doWithClient(c.transferHTTPClient(), req, result)
	if err != nil && watchdog.timedOut.Load() {
		return fmt.Errorf("上传超时：%s 内无数据传输", transferIdleTimeout)
	}
	return err
}

// =============================================================================
// File download
// =============================================================================

// DownloadFile downloads a blob file and saves it to outputPath.
// If forceAttachment is true, adds ?download=1 to force Content-Disposition: attachment.
// If overwrite is false, an existing file at outputPath is never replaced.
//
// The body is written to a temp file in the destination directory and atomically
// renamed onto outputPath only after a fully-received copy, so an interrupted
// run never leaves a partial file at the final path, and the overwrite check
// happens immediately before the rename (closing the TOCTOU window between a
// caller's earlier existence check and the actual write).
func (c *Client) DownloadFile(ctx context.Context, blobID string, outputPath string, forceAttachment, overwrite bool) error {
	// A server that sends response headers and then stalls mid-body must not
	// leave io.Copy blocked forever. The watchdog cancels the request context
	// after transferIdleTimeout with no body bytes, aborting the transfer.
	ctx, cancel := context.WithCancel(ctx)
	watchdog := newTransferWatchdog(cancel)
	defer watchdog.stop()

	query := url.Values{}
	if forceAttachment {
		query.Set("download", "1")
	}

	path := fmt.Sprintf("/api/blobs/%s/file", blobID)
	fullURL := c.url(path)
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
	if err != nil {
		return fmt.Errorf("创建下载请求失败: %w", err)
	}
	c.setHeaders(req)

	// Downloads stream the file body; they are not bound by the 60s
	// JSON-endpoint timeout (context cancellation still applies).
	resp, err := c.transferHTTPClient().Do(req)
	if err != nil {
		return fmt.Errorf("下载请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// Try to parse as API response
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var apiResp APIResponse
		if json.Unmarshal(body, &apiResp) == nil && !apiResp.Success {
			return &APIError{Message: apiResp.Message, HTTPStatus: resp.StatusCode, Details: apiResp.Error}
		}
		return fmt.Errorf("下载失败 (HTTP %d): %s", resp.StatusCode, snippet(body))
	}

	// Write to a temp file in the destination directory (so the final rename is
	// atomic on the same filesystem) rather than directly to outputPath.
	dir := filepath.Dir(outputPath)
	tmp, err := os.CreateTemp(dir, ".serenique-dl-*")
	if err != nil {
		return fmt.Errorf("无法创建临时文件（目标目录: %s）: %w", dir, err)
	}
	tmpName := tmp.Name()
	discardTmp := func() {
		tmp.Close()
		os.Remove(tmpName) // no-op once the rename succeeds
	}

	n, err := io.Copy(tmp, &activityBody{ReadCloser: resp.Body, w: watchdog})
	if err != nil {
		// io.Copy surfaces an unexpected EOF (server closed the body early) as
		// io.ErrUnexpectedEOF; without this the partial body would be saved as if
		// complete when there is no Content-Length (e.g. a proxy that strips it).
		switch {
		case watchdog.timedOut.Load():
			err = fmt.Errorf("下载超时：%s 内未收到任何数据", transferIdleTimeout)
		case errors.Is(err, io.ErrUnexpectedEOF):
			err = fmt.Errorf("下载中断：服务器提前关闭了连接（%d 字节已写入）", n)
		}
		discardTmp()
		return fmt.Errorf("写入文件失败: %w", err)
	}
	// Verify the byte count when the server declared one: a truncated body over a
	// Content-Length response that io.Copy could not detect (e.g. a proxy that
	// closes the body early but keeps the connection) would otherwise be renamed
	// over the target as if complete.
	if err := verifyDownloadCount(n, resp.ContentLength); err != nil {
		discardTmp()
		return fmt.Errorf("写入文件失败: %w", err)
	}

	// os.CreateTemp creates the file with 0600; downloaded media blobs are not
	// secrets, so relax to 0644 so they remain readable (e.g. by a static file
	// server) by other local users. The config layer intentionally stays 0600.
	if err := tmp.Chmod(0o644); err != nil {
		discardTmp()
		return fmt.Errorf("设置文件权限失败: %w", err)
	}

	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("关闭文件失败: %w", err)
	}

	// Refuse to silently replace an existing file. The check runs immediately
	// before the atomic rename, minimizing the window in which a file created
	// between a caller's earlier existence check and this write could be clobbered.
	if !overwrite {
		if _, err := os.Lstat(outputPath); err == nil {
			os.Remove(tmpName)
			return fmt.Errorf("目标文件已存在: %s（如需覆盖请使用 --force）", outputPath)
		}
	}

	if err := os.Rename(tmpName, outputPath); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("保存文件失败 (%s): %w", outputPath, err)
	}

	return nil
}

// =============================================================================
// Internal helpers
// =============================================================================

// verifyDownloadCount rejects a truncated body: when the server declared a
// Content-Length, the received byte count must match it. A declared length of -1
// (chunked/unknown) means no check is possible.
func verifyDownloadCount(received, declared int64) error {
	if declared >= 0 && received != declared {
		return fmt.Errorf("下载不完整（收到 %d 字节，预期 %d 字节）", received, declared)
	}
	return nil
}

func (c *Client) url(apiPath string) string {
	return c.BaseURL + apiPath
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
}

// do executes the request with the default (timeout-bounded) client, parses the
// unified response, and unmarshals data into result.
func (c *Client) do(req *http.Request, result any) error {
	return c.doWithClient(c.HTTPClient, req, result)
}

// maxResponseBody caps how much of a response body the client buffers for JSON
// endpoints. List endpoints are bounded by the API's pageSize<=50 cap, so a
// legitimate unified envelope is small; an unbounded read would let a
// misbehaving server (or a proxy error page) balloon memory or produce a giant
// error string. A variable so tests can shrink it.
var maxResponseBody = 4 << 20 // 4 MiB

// snippet renders a raw response body for an error message, trimmed to a
// bounded length so a huge body cannot produce a giant error string.
func snippet(body []byte) string {
	s := strings.TrimSpace(string(body))
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	if s == "" {
		s = "(空响应体)"
	}
	return s
}

// doWithClient executes a request with the given HTTP client, treating any
// non-2xx status as an error even when the body is not the unified envelope
// (Hono default error, proxy error page, HTML, empty body...). When the envelope
// parses its message is preferred; otherwise the raw body is surfaced.
func (c *Client) doWithClient(hc *http.Client, req *http.Request, result any) error {
	resp, err := hc.Do(req)
	if err != nil {
		return fmt.Errorf("请求失败: %w\n提示: 请检查 baseurl 配置和网络连接 (当前: %s)", err, c.BaseURL)
	}
	defer resp.Body.Close()

	// Buffer at most maxResponseBody+1 so an oversized body is detectable and
	// rejected instead of being read fully into memory.
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxResponseBody+1)))
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	// 204 No Content — success with no body, nothing to unmarshal
	if resp.StatusCode == 204 {
		return nil
	}

	if len(body) > maxResponseBody {
		return &APIError{
			Message:    fmt.Sprintf("响应体过大（超过 %d 字节），已被截断", maxResponseBody),
			HTTPStatus: resp.StatusCode,
		}
	}

	var apiResp APIResponse
	parseErr := json.Unmarshal(body, &apiResp)

	// Non-2xx status is always an error, even for a success:true envelope or a
	// non-envelope body.
	if resp.StatusCode >= 400 {
		if parseErr == nil {
			return &APIError{Message: apiResp.Message, HTTPStatus: resp.StatusCode, Details: apiResp.Error}
		}
		return &APIError{Message: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, snippet(body)), HTTPStatus: resp.StatusCode}
	}

	if parseErr != nil {
		return fmt.Errorf("服务器返回了意外的响应格式 (HTTP %d): %s", resp.StatusCode, snippet(body))
	}

	if !apiResp.Success {
		return &APIError{
			Message:    apiResp.Message,
			HTTPStatus: resp.StatusCode,
			Details:    apiResp.Error,
		}
	}

	// Unmarshal data into the caller's result
	if result != nil && len(apiResp.Data) > 0 {
		if err := json.Unmarshal(apiResp.Data, result); err != nil {
			return fmt.Errorf("解析响应数据失败: %w", err)
		}
	}

	return nil
}
