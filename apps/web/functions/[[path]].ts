// SPA fallback（Pages Functions 优先级高于静态资产与 _redirects）：
// - 无扩展名路径（SPA 路由，如 /ai）→ 回退 index.html。注意不能 fetch
//   '/index.html'（ASSETS 返回 308 -> /），直接 fetch 根路径。
// - .well-known/ 路径 → 透传（AASA / assetlinks 由子函数处理，本函数不会
//   收到，但保留兜底防御）。
// - 静态资源（/assets/*、logo 等）已在 functions/_routes.json 中 exclude，
//   不经过本函数，直连静态存储 —— 避免 ASSETS.fetch 在自定义域名下间歇
//   返回 SPA fallback（200+text/html）导致 chunk 404 抖动。
export const onRequest = async (context: {
  request: Request
  env: Record<string, unknown>
}): Promise<Response> => {
  const ASSETS = (context.env as { ASSETS: { fetch: (r: Request) => Promise<Response> } }).ASSETS
  const url = new URL(context.request.url)
  const hasFileExtension = /\.[a-zA-Z0-9]{1,8}$/.test(url.pathname)
  if (hasFileExtension && !url.pathname.startsWith('/.well-known/')) {
    // 防御：理论上 assets 已被 _routes.json 排除，不会走到这里。
    // 若仍到达（如 _routes.json 未生效），原样返回静态文件，不做 404 转换。
    return ASSETS.fetch(context.request)
  }
  url.pathname = '/'
  const resp = await ASSETS.fetch(new Request(url.toString(), context.request))
  // index.html 不缓存：保证部署后用户刷新即拿到最新 HTML（引用最新 chunk）。
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('content-type') ?? 'text/html',
      'Cache-Control': 'no-store',
    },
  })
}
