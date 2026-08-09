import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { unlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { aiModel, aiSessionDir } from "@/env";
import { ErrorCode, AppError } from "@/shared/errors";
import { buildAiTools } from "./ai.tools";
import { buildSystemPrompt } from "./ai.system-prompt";

// ---------------------------------------------------------------------------
// AI 会话服务 — 进程内单例。
// 职责：模型/凭据运行时、隔离资源加载器、同会话单实例注册表、会话 CRUD、
// 事件转发、历史渲染模型。不接触 Hono（由 handler 层负责 WS 收发）。
//
// 懒初始化：ModelRuntime / DefaultResourceLoader 只在 isAiEnabled() 或首次
// 创建会话时才创建 —— import 本模块不读模型凭据，无 DEEPSEEK_API_KEY 也不崩。
// ---------------------------------------------------------------------------

let sharedModelRuntime: ModelRuntime | undefined;
let sharedLoader: DefaultResourceLoader | undefined;
let runtimeError: Error | undefined;

async function getRuntime(): Promise<ModelRuntime> {
  if (runtimeError) throw runtimeError;
  if (!sharedModelRuntime) {
    try {
      sharedModelRuntime = await ModelRuntime.create();
    } catch (err) {
      runtimeError = err instanceof Error ? err : new Error(String(err));
      throw runtimeError;
    }
  }
  return sharedModelRuntime;
}

async function getLoader(): Promise<DefaultResourceLoader> {
  if (!sharedLoader) {
    const settingsManager = SettingsManager.inMemory();
    sharedLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(), // 指向项目自身，防止 ~/.pi/agent 资源发现
      settingsManager,
      noExtensions: true, // 关键：不加载扩展 → pi-mcp-adapter 不会启动
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => buildSystemPrompt(new Date()),
      appendSystemPromptOverride: () => [],
    });
    await sharedLoader.reload();
  }
  return sharedLoader;
}

async function resolveModel() {
  const modelRuntime = await getRuntime();
  const [provider, modelId] = aiModel.split("/");
  return (
    modelRuntime.getModel(provider, modelId) ??
    (await modelRuntime.getAvailable())[0]
  );
}

/** 全部业务工具 + 排除 7 个内置工具。注意不能用 tools: []（会把业务工具过滤掉）。 */
const EXCLUDED_BUILTIN_TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"];

// ---- 同会话单实例注册表 -----------------------------------------------
// SessionManager 无文件锁：同一会话两个 AgentSession 实例会互相覆盖
// jsonl（assistant 首条时整文件重写）。注册表保证同会话进程内只有一个实例。
// 存 Promise 而非实例：创建是异步的，check-then-act 之间并发调用（双标签页 /
// WS 重连竞速）会创建两个实例——in-flight 去重把并发调用合并到同一个 promise。
const sessionRegistry = new Map<string, Promise<AgentSession>>();

/**
 * 创建（或恢复）一个绑定到 sm 的 AgentSession：隔离 loader + 模型 +
 * customTools + excludeTools（SDK 0.84.1 CreateAgentSessionOptions 的字段名
 * 是 excludeTools，非 excludedToolNames —— 后者是内部 AgentSessionConfig 字段）
 * + systemPromptOverride（经 loader 注入，见 ai.system-prompt.ts）。
 */
export async function createAgentSessionFor(
  sm: SessionManager,
): Promise<AgentSession> {
  const [loader, modelRuntime, model] = await Promise.all([
    getLoader(),
    getRuntime(),
    resolveModel(),
  ]);
  const { session } = await createAgentSession({
    resourceLoader: loader,
    settingsManager: SettingsManager.inMemory(),
    sessionManager: sm,
    model,
    modelRuntime,
    customTools: buildAiTools(),
    excludeTools: EXCLUDED_BUILTIN_TOOLS,
    thinkingLevel: "high",
  });
  return session;
}

/**
 * 会话目录。aiSessionDir 来自 env：生产 /data/sessions（绝对路径）；dev/test
 * 缺省 ./.data/sessions（相对路径）。相对路径以包根（services/api/）为基准：
 * import.meta.dir 是本文件所在目录（src/modules/ai/），../../.. 上溯到包根，
 * 再拼接 aiSessionDir —— 避免数据落到 src/ 下，也不依赖进程 cwd（bun test /
 * systemd 等不同 cwd 下仍指向同一目录）。
 */
const SESSION_DIR = isAbsolute(aiSessionDir)
  ? aiSessionDir
  : resolve(import.meta.dir, "../../..", aiSessionDir);

/** 会话列表（按修改时间倒序）。 */
export async function listSessions(): Promise<Array<{
  id: string;
  name: string;
  messageCount: number;
  modified: string;
}>> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR);
  return infos
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .map((info) => ({
      id: info.id,
      name: info.name ?? (info.firstMessage ? info.firstMessage.slice(0, 30) : "新会话"),
      messageCount: info.messageCount,
      modified: info.modified.toISOString(),
    }));
}

export async function findSessionPath(id: string): Promise<string | undefined> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR);
  return infos.find((info) => info.id === id)?.path;
}

export async function openRecentOrCreate() {
  const sm = SessionManager.continueRecent(process.cwd(), SESSION_DIR);
  return { sm, session: await getOrCreateSession(sm) };
}

export async function openSession(path: string) {
  const sm = SessionManager.open(path, SESSION_DIR, process.cwd());
  return { sm, session: await getOrCreateSession(sm) };
}

export async function createNewSession() {
  const sm = SessionManager.create(process.cwd(), SESSION_DIR);
  return { sm, session: await getOrCreateSession(sm) };
}

/** 同会话单实例：注册表命中（含 in-flight 创建中）直接复用，否则创建并登记。 */
export async function getOrCreateSession(
  sm: SessionManager,
): Promise<AgentSession> {
  const id = sm.getSessionId();
  const existing = sessionRegistry.get(id);
  if (existing) return existing;
  // 先登记再 await：await 之前的同步段内不可能有并发插入（JS 单线程，
  // 本函数在第一个 await 之前没有让出点），并发调用在此合并到同一 promise。
  const promise = createAgentSessionFor(sm);
  sessionRegistry.set(id, promise);
  try {
    return await promise;
  } catch (err) {
    sessionRegistry.delete(id); // 创建失败不残留，下次重试
    throw err;
  }
}

export function releaseSession(id: string): void {
  const promise = sessionRegistry.get(id);
  if (promise) {
    sessionRegistry.delete(id);
    // dispose 须在创建完成（resolve）后调用；失败时静默忽略。
    promise.then((session) => session.dispose()).catch(() => {});
  }
}

export async function deleteSession(id: string): Promise<void> {
  const path = await findSessionPath(id);
  if (!path) throw new AppError(ErrorCode.NOT_FOUND, `会话不存在: ${id}`, 404);
  releaseSession(id);
  await unlink(path);
}

// ---- 事件转发 ----------------------------------------------------------
// target: 收 JSON 字符串（WS 发送）。转发事件与 pi-test/server.ts 对齐。
// 返回退订函数；close 后由调用方兜底（本函数不感知 WS 状态）。
export function forwardEvents(
  target: (json: string) => void,
  session: AgentSession,
): () => void {
  return session.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const a = event.assistantMessageEvent;
        if (a.type === "text_delta" || a.type === "thinking_delta") {
          target(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: a.type, delta: a.delta } }));
        }
        break;
      }
      case "tool_execution_start":
        target(JSON.stringify({ type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args }));
        break;
      case "tool_execution_update":
        target(JSON.stringify({ type: "tool_execution_update", toolCallId: event.toolCallId, toolName: event.toolName, partialResult: summarize(event.partialResult, 500) }));
        break;
      case "tool_execution_end":
        target(JSON.stringify({ type: "tool_execution_end", toolCallId: event.toolCallId, toolName: event.toolName, result: summarize(event.result), isError: event.isError }));
        break;
      case "agent_start":
      case "agent_settled":
      case "turn_start":
      case "turn_end":
      case "agent_end":
        target(JSON.stringify({ type: event.type }));
        break;
    }
  });
}

function summarize(value: unknown, max = 2000): string {
  if (value === null || value === undefined) return String(value);
  // 兼容两种输入形状：content 数组本身（toolResult 消息的 m.content）或
  // 包装对象 { content: [...] }（tool_execution_end 事件的 result）。
  const content = Array.isArray(value) ? value : (value as any)?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c?.type === "text" ? c.text : c?.type === "image" ? "[image]" : JSON.stringify(c)))
      .join("\n");
    return text.length > max ? text.slice(0, max) + "…(截断)" : text;
  }
  if (typeof value === "string") return value.length > max ? value.slice(0, max) + "…(截断)" : value;
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…(截断)" : s;
  } catch {
    return String(value).slice(0, max);
  }
}

// ---- 历史渲染模型 ------------------------------------------------------
export type RenderToolCall = {
  id: string;
  name: string;
  args: unknown;
  result: string;
  isError: boolean;
};
export type RenderMessage = {
  role: "user" | "assistant";
  text: string;
  thinking: string;
  toolCalls: RenderToolCall[];
};

/** 消息历史 → 前端渲染模型（纯函数）。toolResult 不产生独立消息，按 toolCallId 关联到 assistant 的 toolCall。 */
export function toRenderMessages(messages: AgentMessage[]): RenderMessage[] {
  const results = new Map<string, { result: string; isError: boolean }>();
  for (const m of messages) {
    if (m.role === "toolResult") {
      results.set(m.toolCallId, { result: summarize(m.content), isError: m.isError });
    }
  }
  const out: RenderMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", text: userText(m.content), thinking: "", toolCalls: [] });
    } else if (m.role === "assistant") {
      let text = "";
      let thinking = "";
      const toolCalls: RenderToolCall[] = [];
      for (const c of m.content) {
        if (c.type === "text") text += c.text;
        else if (c.type === "thinking") thinking += c.thinking;
        else if (c.type === "toolCall") {
          const tr = results.get(c.id);
          toolCalls.push({
            id: c.id,
            name: c.name,
            args: c.arguments,
            result: tr?.result ?? "",
            isError: tr?.isError ?? false,
          });
        }
      }
      out.push({ role: "assistant", text, thinking, toolCalls });
    }
  }
  return out;
}

function userText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((c) => c.text ?? "[image]").join("\n");
}

export const aiService = {
  isAiEnabled: async (): Promise<boolean> => {
    try {
      await getRuntime();
      return true;
    } catch {
      return false;
    }
  },
  listSessions,
  findSessionPath,
  openRecentOrCreate,
  openSession,
  createNewSession,
  getOrCreateSession,
  createAgentSessionFor,
  releaseSession,
  deleteSession,
  forwardEvents,
};
