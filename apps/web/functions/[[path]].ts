// SPA fallback（Pages Functions 优先级高于静态资产与 _redirects）：
// - 无扩展名路径（SPA 路由，如 /ai）→ 回退 index.html。注意不能 fetch
//   '/index.html'（ASSETS 返回 308 -> /），直接 fetch 根路径。
// - 带扩展名路径 → 先试静态文件；ASSETS 对缺失文件内建 SPA fallback
//   （返回 200 + index.html），按 content-type 识别并转为真 404 + no-store。
//   关键：缺失 chunk 绝不能返回 text/html —— fallback 响应带 max-age=14400，
//   浏览器/边缘会把 HTML 当模块缓存 4 小时，部署后传播窗口内访问一次即
//   持续报 "MIME type is not a module"；no-store 让 404 不被缓存，自愈。
export const onRequest = async (context: {
  request: Request
  env: Record<string, unknown>
}): Promise<Response> => {
  const ASSETS = (context.env as { ASSETS: { fetch: (r: Request) => Promise<Response> } }).ASSETS
  const url = new URL(context.request.url)
  const hasFileExtension = /\.[a-zA-Z0-9]{1,8}$/.test(url.pathname)
  if (!hasFileExtension && !url.pathname.startsWith('/.well-known/')) {
    url.pathname = '/'
    const resp = await ASSETS.fetch(new Request(url.toString(), context.request))
    // index.html 不缓存：保证部署后用户刷新即拿到最新 HTML（引用最新 chunk）。
    return new Response(resp.body, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('content-type') ?? 'text/html', 'Cache-Control': 'no-store' },
    })
  }
  const resp = await ASSETS.fetch(context.request)
  if (resp.status !== 200 || resp.headers.get('content-type')?.includes('text/html')) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  }
  return resp
}
