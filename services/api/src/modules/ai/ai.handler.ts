import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { WSContext } from 'hono/ws'
import { getAuthVars } from '@/modules/auth/auth.middleware'
import { aiService, forwardEvents, toRenderMessages } from './ai.service'

// ---------------------------------------------------------------------------
// AI WebSocket 协议层 — 每个连接持有「当前会话」，协议消息见 ai.types.ts。
//
// 关键设计（评审确认）：
//  - createAiWebSocket 是工厂：upgradeWebSocket 由调用方（index.ts 的
//    createBunWebSocket() 单例）注入 —— 必须与 Bun.serve 的 websocket
//    来自同一次 createBunWebSocket() 调用，否则底层 handler 实例不匹配。
//    本文件**禁止**自己调 createBunWebSocket()。
//  - Origin 门禁在 ai.router.ts 的中间件完成（403 拒绝升级），本文件不重复。
//  - 认证由 app.ts 挂载的 authMiddleware 完成（/api/ai/ws 不在 PUBLIC_ROUTES，
//    未认证升级请求 401）；此处 getAuthVars(c) 读取身份，供后续多用户扩展。
//
// 实测发现的三个硬约束（冒烟时踩坑，勿回退）：
//  1. hono bun adapter 每次事件回调（open/message/close）都新建 WSContext
//     实例，对象引用不同 —— connections 必须以 ws.raw（底层 Bun
//     ServerWebSocket，同一连接共享）作 key，否则消息被静默丢弃。
//  2. SessionManager 新建会话（continueRecent 无 recent / create）在首次
//     保存消息前不落盘，SessionManager.list 找不到 —— prompt 主路径不能
//     依赖 findSessionPath 重开，必须直接用 Conn 持有的 session 实例
//     （registry 本来就保证同会话进程内单实例）。
//  3. Bun 对 unhandled rejection 默认崩溃进程 —— handleMessage 必须全局
//     try/catch，任何分支异常转 error 消息，绝不让 rejection 逃逸。
//
// 会话生命周期（评审确认）：同会话可被多个连接同时持有（需求 4.2.1），
// 用跨连接引用计数（sessionRefCount）决定何时真正释放实例 —— 只有最后一
// 个连接离开才 releaseSession（dispose 会 abort 在途 turn + 断开事件订阅，
// 提前释放会让另一标签页静默失明）。删除是用户显式操作，例外：无条件
// releaseSession + 清 refCount。
// ---------------------------------------------------------------------------

/**
 * Origin 白名单校验（纯函数，单测覆盖）。
 * undefined（无 Origin 头 = 同源 / 非浏览器客户端）→ 放行；
 * 有 Origin 头 → 必须严格相等命中白名单（不忽略端口差异）。
 */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  if (!origin) return true
  return allowed.includes(origin)
}

type Conn = {
  /** 当前会话 id（可能未落盘，见头注释 2）。 */
  sessionId?: string
  /** 当前会话实例（registry 单实例，prompt 主路径直接使用，不做磁盘重开）。 */
  session?: AgentSession
  /** 会话身份（cookie 登录才携带；token 身份为 null）。单用户设计暂不强制，保留供扩展。 */
  userId?: string
  /** 当前会话事件订阅的退订函数。 */
  unsubscribe?: () => void
  /** onOpen 完成前到达的消息暂存（防御性：Bun 保证 open 先于 message，通常为空）。 */
  pending: string[]
}

// 关键：hono bun adapter 的每次事件回调（open/message/close）都会新建一个
// WSContext 实例（createWSContext(ws)），对象引用各不相同；但它们的 raw
// 都指向同一个底层 Bun ServerWebSocket。因此以 ws.raw 作 key —— 否则
// connections.get(ws) 在 onMessage/onClose 里永远 miss，消息被静默丢弃。
const connections = new Map<unknown, Conn>()

/** 按底层连接取连接状态（raw 为 undefined 时安全返回 undefined）。 */
function getConn(ws: WSContext): Conn | undefined {
  return ws.raw ? connections.get(ws.raw) : undefined
}

// ---- 会话跨连接引用计数 -----------------------------------------------
// 同一会话可被多个连接同时持有；实例（AgentSession）在进程内唯一（registry），
// dispose 会 abort 在途 turn / 断开事件订阅 / 停止持久化 —— 只有最后一个
// 连接放弃时才能 releaseSession。删除例外：用户显式删除无条件释放。
const sessionRefCount = new Map<string, number>()

function acquireSession(id: string) {
  sessionRefCount.set(id, (sessionRefCount.get(id) ?? 0) + 1)
}

/** 连接放弃当前会话：退订、置空 conn 引用；仅最后一个连接离开才释放实例。 */
function releaseConnectionSession(conn: Conn) {
  const id = conn.sessionId
  if (!id) return
  conn.unsubscribe?.()
  conn.unsubscribe = undefined
  conn.session = undefined
  conn.sessionId = undefined
  const count = (sessionRefCount.get(id) ?? 1) - 1
  if (count <= 0) {
    sessionRefCount.delete(id)
    aiService.releaseSession(id) // 最后一个连接离开 → 释放实例
  } else {
    sessionRefCount.set(id, count)
  }
}

/**
 * 无条件放弃会话（删除语义）：即使其它连接仍持有也释放实例并清 refCount。
 * 已落盘删除时 deleteSession 内部已 releaseSession（此处幂等），未落盘删除
 * 时由这里补上。返回后 conn 不再指向该会话（F2：createNewSession 失败时
 * conn 也不悬空）。
 */
function dropConnectionSession(conn: Conn, deletedId: string) {
  sessionRefCount.delete(deletedId)
  if (conn.sessionId === deletedId) {
    conn.unsubscribe?.()
    conn.unsubscribe = undefined
    conn.session = undefined
    conn.sessionId = undefined
  }
  aiService.releaseSession(deletedId)
}

function safeSend(ws: WSContext, json: string) {
  try {
    if (ws.readyState === 1) ws.send(json)
  } catch {
    // socket 已关闭等情况静默忽略
  }
}

/** 切换到新会话：退订旧事件流、登记新订阅与实例、更新 conn 指向、引用 +1。 */
function attachSession(conn: Conn, ws: WSContext, sessionId: string, session: AgentSession) {
  conn.unsubscribe?.()
  conn.sessionId = sessionId
  conn.session = session
  conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session)
  acquireSession(sessionId)
}

/** 删除当前会话后的收尾：无条件释放 + 重置 conn + 建新会话（失败时 conn 已重置）。 */
async function resetAfterDelete(conn: Conn, ws: WSContext, deletedId: string) {
  dropConnectionSession(conn, deletedId)
  const { sm, session } = await aiService.createNewSession()
  attachSession(conn, ws, sm.getSessionId(), session)
  return { sm, session }
}

/** session_switched 的应答构造（切换/新建/删除当前会话后共用）。 */
function sessionPayload(sessionId: string, session: AgentSession) {
  return JSON.stringify({
    type: 'session_switched',
    sessionId,
    model: `${session.model?.provider}/${session.model?.id}`,
    messages: toRenderMessages(session.messages),
  })
}

export function createAiWebSocket(upgradeWebSocket: typeof import('hono/bun').upgradeWebSocket) {
  return upgradeWebSocket((c) => {
    // 认证在 authMiddleware 中已完成（/api/* 全部经过）；此处取身份：
    const auth = getAuthVars(c)

    return {
      async onOpen(_evt, ws) {
        const conn: Conn = { pending: [], ...(auth.userId ? { userId: auth.userId } : {}) }
        connections.set(ws.raw, conn)
        try {
          if (!(await aiService.isAiEnabled())) {
            throw new Error('AI 未配置模型凭据（检查 DEEPSEEK_API_KEY / AI_MODEL）')
          }
          const { sm, session } = await aiService.openRecentOrCreate()
          conn.sessionId = sm.getSessionId()
          conn.session = session
          conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session)
          acquireSession(conn.sessionId)
          safeSend(
            ws,
            JSON.stringify({
              type: 'session_ready',
              sessionId: conn.sessionId,
              model: `${session.model?.provider}/${session.model?.id}`,
              messages: toRenderMessages(session.messages),
            }),
          )
          for (const raw of conn.pending) handleMessage(ws, raw)
          conn.pending = []
        } catch (err) {
          safeSend(ws, JSON.stringify({ type: 'error', message: (err as Error).message }))
          ws.close()
        }
      },
      onMessage(evt, ws) {
        // handleMessage 内部已全局 try/catch，此处兜底防未来改动引入逃逸
        handleMessage(ws, String(evt.data)).catch(() => {})
      },
      onClose(_evt, ws) {
        const conn = getConn(ws)
        if (conn) releaseConnectionSession(conn)
        if (ws.raw) connections.delete(ws.raw)
      },
    }
  })
}

async function handleMessage(ws: WSContext, raw: string) {
  const conn = getConn(ws)
  if (!conn) return
  try {
    let msg:
      | { type: 'prompt' | 'steer' | 'followUp'; text?: string }
      | { type: 'abort' | 'list_sessions' | 'new_session' }
      | { type: 'switch_session' | 'delete_session'; sessionId: string }
    try {
      msg = JSON.parse(raw)
    } catch {
      return safeSend(ws, JSON.stringify({ type: 'error', message: '非法消息' }))
    }

    switch (msg.type) {
      case 'prompt':
      case 'steer':
      case 'followUp': {
        // 主路径直接用 Conn 持有的会话实例（新建会话可能未落盘，磁盘重开
        // 会失败；registry 保证实例唯一）。异常兜底：实例丢失时重新打开。
        let session = conn.session
        if (!session) {
          const opened = await aiService.openRecentOrCreate()
          session = opened.session
          conn.sessionId = opened.sm.getSessionId()
          conn.session = session
          conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session)
          acquireSession(conn.sessionId)
        }
        const p =
          msg.type === 'prompt'
            ? session.prompt(msg.text ?? '')
            : msg.type === 'steer'
              ? session.steer(msg.text ?? '')
              : session.followUp(msg.text ?? '')
        p.catch((err) =>
          safeSend(ws, JSON.stringify({ type: 'error', message: (err as Error).message })),
        )
        break
      }
      case 'abort':
        conn.session?.abort().catch(() => {})
        break
      case 'list_sessions': {
        const sessions = await aiService.listSessions()
        safeSend(ws, JSON.stringify({ type: 'sessions', sessions }))
        break
      }
      case 'new_session': {
        const { sm, session } = await aiService.createNewSession()
        // 放弃旧会话（引用 -1；仅本连接是最后一个持有者时才释放实例）
        releaseConnectionSession(conn)
        attachSession(conn, ws, sm.getSessionId(), session)
        safeSend(ws, sessionPayload(sm.getSessionId(), session))
        const sessions = await aiService.listSessions()
        safeSend(ws, JSON.stringify({ type: 'sessions', sessions }))
        break
      }
      case 'switch_session': {
        // 切到当前会话：no-op（必须早于 findSessionPath）。若继续走
        // openSession → registry 命中同一活实例 → releaseSession 会对
        // 它 dispose（abort 在途 turn、清空事件监听）→ attachSession 挂上
        // 已销毁实例：在途 prompt 被误 abort，后续事件静默丢失。
        if (msg.sessionId === conn.sessionId) return
        const path = await aiService.findSessionPath(msg.sessionId)
        if (!path) {
          return safeSend(
            ws,
            JSON.stringify({ type: 'error', message: `会话不存在: ${msg.sessionId}` }),
          )
        }
        const { sm, session } = await aiService.openSession(path)
        releaseConnectionSession(conn) // 放弃旧会话（引用 -1）
        attachSession(conn, ws, sm.getSessionId(), session)
        safeSend(ws, sessionPayload(sm.getSessionId(), session))
        break
      }
      case 'delete_session': {
        // 删除「当前会话」且未落盘（新建未对话，磁盘无文件）：findSessionPath
        // 找不到 → deleteSession 必抛 404，该会话永远删不掉。走「无条件释放
        // + 建新会话」，不报 404。
        if (msg.sessionId === conn.sessionId) {
          const path = await aiService.findSessionPath(msg.sessionId)
          if (!path) {
            // F2：resetAfterDelete 先重置 conn 再建新会话 —— createNewSession
            // 失败（如凭据失效）时 conn 不悬空，下次 prompt 走兜底重开
            const { sm, session } = await resetAfterDelete(conn, ws, msg.sessionId)
            safeSend(ws, JSON.stringify({ type: 'session_deleted', sessionId: msg.sessionId }))
            safeSend(ws, sessionPayload(sm.getSessionId(), session))
            const sessions = await aiService.listSessions()
            safeSend(ws, JSON.stringify({ type: 'sessions', sessions }))
            break
          }
          // 已落盘 → 落入下方通用删除流程
        }
        // 删除例外（用户显式操作）：无条件释放实例（deleteSession 内部
        // releaseSession + unlink），即使其它连接仍持有该会话。
        await aiService.deleteSession(msg.sessionId)
        safeSend(ws, JSON.stringify({ type: 'session_deleted', sessionId: msg.sessionId }))
        if (conn.sessionId === msg.sessionId) {
          const { sm, session } = await resetAfterDelete(conn, ws, msg.sessionId)
          safeSend(ws, sessionPayload(sm.getSessionId(), session))
        }
        const sessions = await aiService.listSessions()
        safeSend(ws, JSON.stringify({ type: 'sessions', sessions }))
        break
      }
      default:
        // 运行时可能是任意未知类型（联合类型只覆盖已知消息）——取原始 type 字段报错。
        safeSend(
          ws,
          JSON.stringify({
            type: 'error',
            message: `未知消息类型: ${(msg as { type: string }).type}`,
          }),
        )
    }
  } catch (err) {
    // 全局兜底：任何分支的异常（含未落盘会话等）转 error 消息，绝不
    // 让 rejection 逃逸 —— Bun 对 unhandled rejection 默认崩溃进程。
    safeSend(ws, JSON.stringify({ type: 'error', message: (err as Error).message }))
  }
}
