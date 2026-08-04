// Package client provides a typed HTTP client for the Serenique API.
//
// It handles the unified response format ({success, message, data, error}),
// auth headers, multipart file upload, and file download streaming.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DefaultTimeout is the HTTP client timeout for all requests.
const DefaultTimeout = 60 * time.Second

// Client wraps the Serenique API HTTP client.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
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
func NewClient(baseURL, token string) *Client {
	// Strip trailing slash for consistent URL building
	baseURL = strings.TrimRight(baseURL, "/")

	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}
}

// transferHTTPClient returns an HTTP client with no request timeout, used only
// for streaming file transfers. Uploads and downloads of large blobs (the API
// allows up to 100MB) can legitimately run longer than DefaultTimeout (60s).
// Context cancellation still applies, so a hung server does not hang forever.
func (c *Client) transferHTTPClient() *http.Client {
	return &http.Client{}
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
func (c *Client) Delete(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.url(path), nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	c.setHeaders(req)

	return c.do(req, nil)
}

// List sends a GET request to a paginated endpoint and unpacks the
// {items, total} envelope. The query values are passed through unchanged
// (callers set page/pageSize themselves).
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

		if _, err := io.Copy(part, file); err != nil {
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
	return c.doWithClient(c.transferHTTPClient(), req, result)
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
		return fmt.Errorf("下载失败 (HTTP %d): %s", resp.StatusCode, string(body))
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

	_, err = io.Copy(tmp, resp.Body)
	if err != nil {
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	// 204 No Content — success with no body, nothing to unmarshal
	if resp.StatusCode == 204 {
		return nil
	}

	var apiResp APIResponse
	parseErr := json.Unmarshal(body, &apiResp)

	// Non-2xx status is always an error, even for a success:true envelope or a
	// non-envelope body.
	if resp.StatusCode >= 400 {
		if parseErr == nil {
			return &APIError{Message: apiResp.Message, HTTPStatus: resp.StatusCode, Details: apiResp.Error}
		}
		snippet := strings.TrimSpace(string(body))
		if len(snippet) > 300 {
			snippet = snippet[:300] + "..."
		}
		if snippet == "" {
			snippet = "(空响应体)"
		}
		return &APIError{Message: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, snippet), HTTPStatus: resp.StatusCode}
	}

	if parseErr != nil {
		return fmt.Errorf("服务器返回了意外的响应格式 (HTTP %d): %s", resp.StatusCode, string(body))
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
