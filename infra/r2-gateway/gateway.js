/**
 * serenique-r2-gateway — 私有 R2 访问网关（Serenique 签名直链）
 *
 * 职责：挂在自定义域名 s3.0icey.icu 上，作为私有 bucket 的唯一公网入口。
 * - 所有请求必须携带签名参数 `e`(expires, unix 秒) + `s`(HMAC-SHA256 hex)。
 *   签名域：HMAC(R2_ACCESS_SIGNING_SECRET, `v1:${storagePath}:${expires}`)，与
 *   services/api 侧 blob.domain 的 signR2Access 保持一致（改了任一侧要同步改造）。
 * - 无有效签名 / 已过期 → 403。bucket 本身永不公开（不启用 r2.dev、不绑 bucket 级自定义域名）。
 * - 支持 Range / 206（视频、音频流式），透传 Content-Range。
 * - CORS：仅放行 Serenique 前端 origin。
 * - Cache：`private, max-age=300`——浏览器本地缓存 5 分钟，边缘不缓存（隐私优先）。
 *
 * Bindings（wrangler.toml / dashboard）：
 *   BUCKET                     r2_bucket  → serenique
 *   R2_ACCESS_SIGNING_SECRET   secret_text（与服务端 env 同值）
 */

const ALLOWED_ORIGINS = new Set([
  'https://serenique.0icey.icu',
  'https://serenique-web.pages.dev',
  'http://localhost:5173',
])

function corsHeaders(request) {
  const origin = request.headers.get('Origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, ETag, Content-Length',
      Vary: 'Origin',
    }
  }
  return {}
}

const encoder = new TextEncoder()
/** HMAC-SHA256 hex。常数时间比较，避免时序侧信道。 */
async function validSignature(secret, storagePath, expires, sig) {
  const msg = encoder.encode(`v1:${storagePath}:${expires}`)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}

/** 解析单个 bytes range（形如 bytes=0-99 / bytes=100- / bytes=-50）。多段 range 不支持 → 返回 undefined（回退整文件）。 */
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return undefined
  const start = m[1] === '' ? undefined : Number(m[1])
  const end = m[2] === '' ? undefined : Number(m[2])
  if (start === undefined && end === undefined) return undefined
  if (start === undefined) return { suffix: end } // bytes=-N：末尾 N 字节
  return { offset: start, length: end === undefined ? undefined : end - start + 1 }
}

/** storagePath 安全校验：防路径穿越（../、/ 前缀等）。 */
function safeKey(pathname) {
  const decoded = decodeURIComponent(pathname)
  const key = decoded.replace(/^\/+/, '')
  if (!key || key.includes('..') || key.includes('//')) return null
  return key
}

export default {
  async fetch(request, env) {
    let url
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad Request', { status: 400 })
    }
    const cors = corsHeaders(request)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    let key
    try {
      key = safeKey(url.pathname)
    } catch {
      return new Response('Bad Request', { status: 400, headers: cors })
    }
    const expires = url.searchParams.get('e')
    const sig = url.searchParams.get('s')

    if (!key || !expires || !/^\d+$/.test(expires) || !sig) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }
    if (Number(expires) * 1000 < Date.now()) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }
    if (!(await validSignature(env.R2_ACCESS_SIGNING_SECRET, key, expires, sig))) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }

    const rangeHeader = request.headers.get('Range')
    const range = rangeHeader ? parseRange(rangeHeader) : undefined
    const object = await env.BUCKET.get(key, range ? { range } : undefined)
    if (!object) {
      return new Response('Not Found', { status: 404, headers: cors })
    }

    const headers = new Headers(cors)
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'private, max-age=300')
    headers.set('ETag', object.httpEtag)
    headers.set('Accept-Ranges', 'bytes')
    // 注意：R2 的 object.range 即使未请求 range 也总存在（offset 0 / length=size 表示完整对象），
    // 因此必须同时满足「请求带 Range 头」才按 206 响应，否则全量请求会误标 Partial Content。
    if (rangeHeader && object.range) {
      const { offset, length } = object.range
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
      headers.set('Content-Length', String(length))
      return new Response(request.method === 'HEAD' ? null : object.body, {
        status: 206,
        headers,
      })
    }
    headers.set('Content-Length', String(object.size))
    return new Response(request.method === 'HEAD' ? null : object.body, {
      status: 200,
      headers,
    })
  },
}