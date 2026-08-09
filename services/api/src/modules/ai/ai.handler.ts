import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { WSContext } from "hono/ws";
import type { upgradeWebSocket } from "hono/bun";
import { getAuthVars } from "@/modules/auth/auth.middleware";
import {
  aiService,
  forwardEvents,
  toRenderMessages,
} from "./ai.service";

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
// ---------------------------------------------------------------------------

/**
 * Origin 白名单校验（纯函数，单测覆盖）。
 * undefined（无 Origin 头 = 同源 / 非浏览器客户端）→ 放行；
 * 有 Origin 头 → 必须严格相等命中白名单（不忽略端口差异）。
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true;
  return allowed.includes(origin);
}

type Conn = {
  /** 当前会话 id（可能未落盘，见头注释 2）。 */
  sessionId?: string;
  /** 当前会话实例（registry 单实例，prompt 主路径直接使用，不做磁盘重开）。 */
  session?: AgentSession;
  /** 会话身份（cookie 登录才携带；token 身份为 null）。单用户设计暂不强制，保留供扩展。 */
  userId?: string;
  /** 当前会话事件订阅的退订函数。 */
  unsubscribe?: () => void;
  /** onOpen 完成前到达的消息暂存（防御性：Bun 保证 open 先于 message，通常为空）。 */
  pending: string[];
};

// 关键：hono bun adapter 的每次事件回调（open/message/close）都会新建一个
// WSContext 实例（createWSContext(ws)），对象引用各不相同；但它们的 raw
// 都指向同一个底层 Bun ServerWebSocket。因此以 ws.raw 作 key —— 否则
// connections.get(ws) 在 onMessage/onClose 里永远 miss，消息被静默丢弃。
const connections = new Map<unknown, Conn>();

/** 按底层连接取连接状态（raw 为 undefined 时安全返回 undefined）。 */
function getConn(ws: WSContext): Conn | undefined {
  return ws.raw ? connections.get(ws.raw) : undefined;
}

function safeSend(ws: WSContext, json: string) {
  try {
    if (ws.readyState === 1) ws.send(json);
  } catch {
    // socket 已关闭等情况静默忽略
  }
}

/** 切换到新会话：退订旧事件流、登记新订阅与实例、更新 conn 指向。 */
function attachSession(
  conn: Conn,
  ws: WSContext,
  sessionId: string,
  session: AgentSession,
) {
  conn.unsubscribe?.();
  conn.sessionId = sessionId;
  conn.session = session;
  conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
}

/** session_switched 的应答构造（切换/新建/删除当前会话后共用）。 */
function sessionPayload(sessionId: string, session: AgentSession) {
  return JSON.stringify({
    type: "session_switched",
    sessionId,
    model: `${session.model?.provider}/${session.model?.id}`,
    messages: toRenderMessages(session.messages),
  });
}

export function createAiWebSocket(
  upgradeWebSocket: typeof import("hono/bun").upgradeWebSocket,
) {
  return upgradeWebSocket((c) => {
    // 认证在 authMiddleware 中已完成（/api/* 全部经过）；此处取身份：
    const auth = getAuthVars(c);

    return {
      async onOpen(_evt, ws) {
        const conn: Conn = { pending: [], ...(auth.userId ? { userId: auth.userId } : {}) };
        connections.set(ws.raw, conn);
        try {
          if (!(await aiService.isAiEnabled())) {
            throw new Error("AI 未配置模型凭据（检查 DEEPSEEK_API_KEY / AI_MODEL）");
          }
          const { sm, session } = await aiService.openRecentOrCreate();
          conn.sessionId = sm.getSessionId();
          conn.session = session;
          conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
          safeSend(
            ws,
            JSON.stringify({
              type: "session_ready",
              sessionId: conn.sessionId,
              model: `${session.model?.provider}/${session.model?.id}`,
              messages: toRenderMessages(session.messages),
            }),
          );
          for (const raw of conn.pending) handleMessage(ws, raw);
          conn.pending = [];
        } catch (err) {
          safeSend(
            ws,
            JSON.stringify({ type: "error", message: (err as Error).message }),
          );
          ws.close();
        }
      },
      onMessage(evt, ws) {
        // handleMessage 内部已全局 try/catch，此处兜底防未来改动引入逃逸
        handleMessage(ws, String(evt.data)).catch(() => {});
      },
      onClose(_evt, ws) {
        const conn = getConn(ws);
        if (conn?.unsubscribe) conn.unsubscribe();
        if (conn?.sessionId) aiService.releaseSession(conn.sessionId);
        if (ws.raw) connections.delete(ws.raw);
      },
    };
  });
}

async function handleMessage(ws: WSContext, raw: string) {
  const conn = getConn(ws);
  if (!conn) return;
  try {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return safeSend(ws, JSON.stringify({ type: "error", message: "非法消息" }));
    }

    switch (msg.type) {
      case "prompt":
      case "steer":
      case "followUp": {
        // 主路径直接用 Conn 持有的会话实例（新建会话可能未落盘，磁盘重开
        // 会失败；registry 保证实例唯一）。异常兜底：实例丢失时重新打开。
        let session = conn.session;
        if (!session) {
          const opened = await aiService.openRecentOrCreate();
          session = opened.session;
          conn.sessionId = opened.sm.getSessionId();
          conn.session = session;
        }
        const p =
          msg.type === "prompt"
            ? session.prompt(msg.text ?? "")
            : msg.type === "steer"
              ? session.steer(msg.text ?? "")
              : session.followUp(msg.text ?? "");
        p.catch((err) =>
          safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message })),
        );
        break;
      }
      case "abort":
        conn.session?.abort().catch(() => {});
        break;
      case "list_sessions": {
        const sessions = await aiService.listSessions();
        safeSend(ws, JSON.stringify({ type: "sessions", sessions }));
        break;
      }
      case "new_session": {
        const { sm, session } = await aiService.createNewSession();
        // 释放旧会话（异步 dispose，无需 await；registry 条目先移除，
        // 避免旧会话残留已 dispose 实例被后续复用）
        if (conn.sessionId) aiService.releaseSession(conn.sessionId);
        attachSession(conn, ws, sm.getSessionId(), session);
        safeSend(ws, sessionPayload(sm.getSessionId(), session));
        const sessions = await aiService.listSessions();
        safeSend(ws, JSON.stringify({ type: "sessions", sessions }));
        break;
      }
      case "switch_session": {
        const path = await aiService.findSessionPath(msg.sessionId);
        if (!path) {
          return safeSend(
            ws,
            JSON.stringify({ type: "error", message: `会话不存在: ${msg.sessionId}` }),
          );
        }
        const { sm, session } = await aiService.openSession(path);
        if (conn.sessionId) aiService.releaseSession(conn.sessionId);
        attachSession(conn, ws, sm.getSessionId(), session);
        safeSend(ws, sessionPayload(sm.getSessionId(), session));
        break;
      }
      case "delete_session": {
        await aiService.deleteSession(msg.sessionId);
        safeSend(ws, JSON.stringify({ type: "session_deleted", sessionId: msg.sessionId }));
        if (conn.sessionId === msg.sessionId) {
          const { sm, session } = await aiService.createNewSession();
          attachSession(conn, ws, sm.getSessionId(), session);
          safeSend(ws, sessionPayload(sm.getSessionId(), session));
        }
        const sessions = await aiService.listSessions();
        safeSend(ws, JSON.stringify({ type: "sessions", sessions }));
        break;
      }
      default:
        safeSend(
          ws,
          JSON.stringify({ type: "error", message: `未知消息类型: ${msg.type}` }),
        );
    }
  } catch (err) {
    // 全局兜底：任何分支的异常（含未落盘会话等）转 error 消息，绝不
    // 让 rejection 逃逸 —— Bun 对 unhandled rejection 默认崩溃进程。
    safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message }));
  }
}
