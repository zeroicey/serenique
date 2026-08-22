/**
 * serenique-r2-gateway — 私有 R2 访问/上传网关（Serenique 签名直链 + 直传）
 *
 * 挂在自定义域名 s3.0icey.icu 上，作为私有 bucket 的唯一公网入口，也是上传的唯一入口。
 * 签名域（HMAC-SHA256 hex，secret = R2_ACCESS_SIGNING_SECRET，与 services/api 侧一致，
 * 任一侧改动必须同步；改动被 blob.domain.test 固定向量锁死）：
 *   - 读  GET/HEAD：`HMAC(secret, "v1:" + storagePath + ":" + expires)`，query 参数 e/s
 *   - 写  PUT     ：`HMAC(secret, "up:" + storagePath + ":" + expires + ":" + contentLength)`
 *                     query 参数 e/s；Content-Length 必须等于签名中的 size（防篡改大小）
 *   - 删  DELETE  ：`HMAC(secret, "del:" + storagePath + ":" + expires)`，query 参数 e/s
 * - 无有效签名 / 已过期 → 403。bucket 永不公开（无 r2.dev、不绑 bucket 级自定义域名）。
 * - 读支持 Range / 206，透传 Content-Range。
 * - CORS：仅放行 Serenique 前端 origin；PUT/DELETE 需要预检（Allow: GET HEAD PUT DELETE OPTIONS）。
 * - 读缓存：`private, max-age=300`；上传不缓存。
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

// 上传大小硬顶（110MB）：与 API BLOB_MAX_SIZE(100MB) 对齐并留 multipart/校验余量。
const MAX_PUT_SIZE = 110 * 1024 * 1024

function corsHeaders(request, extra = {}) {
  const origin = request.headers.get('Origin')
  const base = {
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Content-Length, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, ETag, Content-Length',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return { ...base, 'Access-Control-Allow-Origin': origin, ...extra }
  }
  return {}
}

const encoder = new TextEncoder()
/** 校验 msg 的 HMAC-SHA256 hex 签名。常数时间比较，避免时序侧信道。 */
async function validSig(secret, msg, sig) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(msg)))
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}

/** 解析单个 bytes range（多段不支持 → 返回 undefined 回退整文件）。 */
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return undefined
  const start = m[1] === '' ? undefined : Number(m[1])
  const end = m[2] === '' ? undefined : Number(m[2])
  if (start === undefined && end === undefined) return undefined
  if (start === undefined) return { suffix: end } // bytes=-N：末尾 N 字节
  return { offset: start, length: end === undefined ? undefined : end - start + 1 }
}

/** storagePath 安全校验：防路径穿越。 */
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

    // fail-closed（与 API 侧一致）：漏配签名密钥时绝不把字面量 "undefined" 当
    // HMAC 密钥（validSig 的 encoder.encode(undefined) 会静默编码成功 = 公开伪造
    // v1:/up:/del: 全部签名域）。
    if (!env.R2_ACCESS_SIGNING_SECRET) {
      return new Response('Server Error', { status: 500, headers: cors })
    }

    let key
    try {
      key = safeKey(url.pathname)
    } catch {
      return new Response('Bad Request', { status: 400, headers: cors })
    }
    const expires = url.searchParams.get('e')
    const sig = url.searchParams.get('s')

    // ---- PUT：签名直传写 R2 ----
    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('Content-Length') ?? '')
      if (
        !key ||
        !expires ||
        !/^\d+$/.test(expires) ||
        !sig ||
        !Number.isInteger(contentLength) ||
        contentLength <= 0
      ) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      if (Number(expires) * 1000 < Date.now()) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      if (contentLength > MAX_PUT_SIZE) {
        return new Response('Payload Too Large', { status: 413, headers: cors })
      }
      const ok = await validSig(env.R2_ACCESS_SIGNING_SECRET, `up:${key}:${expires}:${contentLength}`, sig)
      if (!ok) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      const contentType = request.headers.get('Content-Type') || undefined
      await env.BUCKET.put(key, request.body ?? new ReadableStream(), {
        httpMetadata: contentType ? { contentType } : undefined,
      })
      return new Response('OK', { status: 200, headers: cors })
    }

    // ---- DELETE：签名删除对象（防越权删除，签名域 del:；幂等，不存在也 200）----
    if (request.method === 'DELETE') {
      if (!key || !expires || !/^\d+$/.test(expires) || !sig) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      if (Number(expires) * 1000 < Date.now()) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      if (!(await validSig(env.R2_ACCESS_SIGNING_SECRET, `del:${key}:${expires}`, sig))) {
        return new Response('Forbidden', { status: 403, headers: cors })
      }
      await env.BUCKET.delete(key)
      return new Response('OK', { status: 200, headers: cors })
    }

    // ---- GET / HEAD：签名直链读 ----
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    if (!key || !expires || !/^\d+$/.test(expires) || !sig) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }
    if (Number(expires) * 1000 < Date.now()) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }
    if (!(await validSig(env.R2_ACCESS_SIGNING_SECRET, `v1:${key}:${expires}`, sig))) {
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
    // R2 的 object.range 即使未请求也总存在（offset 0 / length=size）；需同时满足「请求带 Range 头」才按 206。
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