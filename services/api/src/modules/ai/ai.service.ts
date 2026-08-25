import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type InlineExtension,
  ModelRuntime,
  type SessionInfo,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'
import { aiModel, aiSessionDir, env } from '@/env'
import { aiMemoryService } from '@/modules/ai-memory/ai-memory.service'
import { AppError, ErrorCode } from '@/shared/errors'
import { logger } from '@/shared/logger'
import {
  buildDynamicSnapshot,
  createDefaultSources,
  shareSnapshotCache,
} from './ai.context-snapshot'
import { buildBaseSystemPrompt } from './ai.system-prompt'
import { buildAiTools } from './ai.tools'

// ---------------------------------------------------------------------------
// AI 会话服务 — 进程内单例。
// 职责：模型/凭据运行时、隔离资源加载器、同会话单实例注册表、会话 CRUD、
// 事件转发、历史渲染模型。不接触 Hono（由 handler 层负责 WS 收发）。
//
// 懒初始化：ModelRuntime / DefaultResourceLoader 只在 isAiEnabled() 或首次
// 创建会话时才创建 —— import 本模块不读模型凭据，无 AI_API_KEY 也不崩。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 模型提供者解析（OpenAI 兼容自定义端点，见需求「换新大模型厂商」）
//
// 模型提供者定义在 pi 的 models.json（含 baseUrl/apiKey/模型清单）。
//   - 开发机：~/.pi/agent/models.json 已含 newapi 提供者（含凭据）→ 直接使用，
//     零配置；与 pi 自身运行共享同一份配置。
//   - 生产/无用户级配置：从 env（AI_BASE_URL / AI_API_KEY）生成一份最小
//     models.json 到 AI 配置目录，再传给 ModelRuntime —— 容器不自带 ~/.pi。
//
// 提供者 id 恒为 "newapi"（与 aiModel 缺省 newapi/ox-alpha 对应）；
// 换端点只改 env，不动代码。
// ---------------------------------------------------------------------------

const USER_MODELS_PATH = join(homedir(), '.pi', 'agent', 'models.json')

/** AI 配置目录：生产 /data/ai（容器卷），dev/test ./.data/ai（相对包根）。 */
const AI_CONFIG_DIR = env.NODE_ENV === 'production' ? '/data/ai' : './.data/ai'
const GENERATED_MODELS_PATH = join(AI_CONFIG_DIR, 'models.json')

const DEFAULT_AI_BASE_URL = 'http://hpcore.hpnet.internal:3005/v1'

// 生成配置只含一个模型：id 取自 AI_MODEL（缺省 ox-alpha）。网关不暴露
// contextWindow/maxTokens 元数据，用保守默认值（可经 AI_CONTEXT_WINDOW /
// AI_MAX_TOKENS 覆盖）——换模型 = 只改 .env，无需改代码。
const DEFAULT_CONTEXT_WINDOW = 1_048_576
const DEFAULT_MAX_TOKENS = 131_072

/** 从 "provider/modelId" 解析出 modelId（无 "/" 时整体作为 id）。 */
export function aiModelId(): string {
  const [, modelId] = aiModel.split('/')
  return modelId ?? aiModel
}

/** 用户级 models.json 是否定义了 newapi 提供者（开发机零配置的判断条件）。 */
async function userHasNewApiProvider(): Promise<boolean> {
  try {
    const raw = await readFile(USER_MODELS_PATH, 'utf8')
    return Boolean((JSON.parse(raw) as { providers?: Record<string, unknown> })?.providers?.newapi)
  } catch {
    return false
  }
}

/** 写出一份由 env 驱动的最小 models.json（生产容器等无用户级配置时使用）。 */
async function writeGeneratedModelsJson(): Promise<string> {
  await mkdir(AI_CONFIG_DIR, { recursive: true })
  const config = {
    providers: {
      newapi: {
        name: 'NewAPI (OpenAI compatible)',
        baseUrl: env.AI_BASE_URL ?? DEFAULT_AI_BASE_URL,
        api: 'openai-completions',
        // env 未提供 key 时置空：ModelRuntime 可创建但认证失败（isAiEnabled=false），
        // 前端拿到的错误提示引导配置。
        apiKey: env.AI_API_KEY ?? '',
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          maxTokensField: 'max_tokens',
        },
        models: [
          {
            id: aiModelId(),
            name: aiModelId(),
            reasoning: true,
            input: ['text', 'image'],
            contextWindow: env.AI_CONTEXT_WINDOW ?? DEFAULT_CONTEXT_WINDOW,
            maxTokens: env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS,
          },
        ],
      },
    },
  }
  await writeFile(GENERATED_MODELS_PATH, JSON.stringify(config, null, 2))
  return GENERATED_MODELS_PATH
}

/** 解析 ModelRuntime 用的 models.json 路径：显式 AI_API_KEY 优先（env 驱动），
 * 其次用户级配置，否则生成最小配置。只有 key 视为「本次部署的凭据」才触发
 * 覆盖 —— 只配 baseUrl 不配 key 会硬失败且覆盖开发机可用的用户级配置（评审修正）；
 * baseUrl 不参与判断（它有独立缺省值，不构成「必须用 env 配置」的理由）。 */
async function resolveAiModelsPath(): Promise<string> {
  if (env.AI_API_KEY) return writeGeneratedModelsJson()
  if (await userHasNewApiProvider()) return USER_MODELS_PATH
  return writeGeneratedModelsJson()
}

// in-flight 去重：并发首调共享同一个创建 promise（与 sessionRegistry 同模式）。
let runtimePromise: Promise<ModelRuntime> | undefined

async function getRuntime(): Promise<ModelRuntime> {
  // 失败不永久缓存：下次调用重试（运维修复后免重启恢复，如 chown /data/ai）。
  runtimePromise ??= (async () => {
    try {
      const modelsPath = await resolveAiModelsPath()
      // env 驱动路径（无用户级配置）下缺少 key → 直接视为未配置，避免「半可用」：
      // 运行时能建但首次对话 401。开发机走用户级配置，key 内联，不受此检查影响。
      if (modelsPath === GENERATED_MODELS_PATH && !env.AI_API_KEY) {
        throw new Error('AI 未配置模型凭据（检查 AI_API_KEY / AI_BASE_URL / AI_MODEL）')
      }
      return await ModelRuntime.create({ modelsPath })
    } catch (err) {
      runtimePromise = undefined // 允许下次重试
      logger.error({ err }, 'AI ModelRuntime 初始化失败')
      throw err instanceof Error ? err : new Error(String(err))
    }
  })()
  return runtimePromise
}

let sharedLoader: DefaultResourceLoader | undefined

async function getLoader(): Promise<DefaultResourceLoader> {
  if (!sharedLoader) {
    const settingsManager = SettingsManager.inMemory()
    sharedLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(), // 指向项目自身，防止 ~/.pi/agent 资源发现
      settingsManager,
      noExtensions: true, // 关键：不加载磁盘扩展 → pi-mcp-adapter 不会启动
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => BASE_SYSTEM_PROMPT,
      appendSystemPromptOverride: () => [],
      // 进程内内联扩展：动态上下文注入（不必扫描磁盘扩展，见四层上下文方案）。
      extensionFactories: [contextInjectorExtension],
    })
    await sharedLoader.reload()
  }
  return sharedLoader
}

/** 解析当前模型；缺失时显式报错而非静默回退第一个可用模型（避免「以为在用
 * A 其实在用 B」——旧目录时代的隐患，评审建议显式化）。 */
async function resolveModel() {
  const modelRuntime = await getRuntime()
  const [provider, modelId] = aiModel.split('/')
  const model = modelRuntime.getModel(provider, modelId)
  if (!model) {
    throw new Error(
      `模型不可用：${aiModel}（检查 AI_MODEL 与端点侧模型清单是否一致；` +
        `开发机另需 ~/.pi/agent/models.json 含该 id）`,
    )
  }
  return model
}

/** 全部业务工具 + 排除 7 个内置工具。注意不能用 tools: []（会把业务工具过滤掉）。 */
const EXCLUDED_BUILTIN_TOOLS = ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls']

// ---- 四层上下文注入（需求 .ai/requirements/2026-08-19-ai-memory-context-design.md）----
// L1 系统提示词（人格 + 准则 + 工具用法）会话创建时求值一次（静态不变）；
// L2 用户画像（ai_memory）仅用户编辑时变（按 updatedAt 缓存）；
// L3 动态快照（时间/任务/日程/闪念/习惯）每轮刷新（数据指纹去重省查询）。
// before_agent_start 返回 L1+L2+L3 拼接的 systemPrompt → SDK 整块替换本轮
// 系统提示词、不进消息历史 → 结构上天然不重复不膨胀。
const BASE_SYSTEM_PROMPT = buildBaseSystemPrompt()

/**
 * 进程内内联扩展：挂钩 before_agent_start（每次用户提交后、agent 循环前），
 * 拼 L1+L2+L3 返回给 SDK 作为本轮 system prompt。任一层失败降级：
 *   - L2/L3 段失败 → 跳过对应段（context-snapshot/ai-memory 内部已兜底）
 *   - 整体组装异常 → 不返回（undefined）→ SDK 回退 L1 基座
 */
export const contextInjectorExtension: InlineExtension = {
  name: 'serenique-context-injector',
  hidden: true, // 不显示在启动 Extensions 列表
  factory: (api) => {
    api.on('before_agent_start', async () => {
      try {
        const [profile, dynamic] = await Promise.all([
          aiMemoryService.getUserProfileText(),
          buildDynamicSnapshot(new Date(), createDefaultSources(new Date()), shareSnapshotCache),
        ])
        // 空用户画像 → 跳过 L2 段（用户未填写时不注入空白标题）。
        const layers = [BASE_SYSTEM_PROMPT, profile, dynamic].filter(Boolean)
        return { systemPrompt: layers.join('\n\n') }
      } catch (err) {
        // 快照整体失败：回退为仅 L1（不阻断对话）。
        logger.warn({ err }, 'AI 动态上下文组装失败，回退基础系统提示词')
        return undefined
      }
    })
  },
}

// ---- 同会话单实例注册表 -----------------------------------------------
// SessionManager 无文件锁：同一会话两个 AgentSession 实例会互相覆盖
// jsonl（assistant 首条时整文件重写）。注册表保证同会话进程内只有一个实例。
// 存 Promise 而非实例：创建是异步的，check-then-act 之间并发调用（双标签页 /
// WS 重连竞速）会创建两个实例——in-flight 去重把并发调用合并到同一个 promise。
const sessionRegistry = new Map<string, Promise<AgentSession>>()

/**
 * 创建（或恢复）一个绑定到 sm 的 AgentSession：隔离 loader + 模型 +
 * customTools + excludeTools（SDK 0.84.1 CreateAgentSessionOptions 的字段名
 * 是 excludeTools，非 excludedToolNames —— 后者是内部 AgentSessionConfig 字段）
 * + systemPromptOverride（经 loader 注入，见 ai.system-prompt.ts）。
 */
export async function createAgentSessionFor(sm: SessionManager): Promise<AgentSession> {
  const [loader, modelRuntime, model] = await Promise.all([
    getLoader(),
    getRuntime(),
    resolveModel(),
  ])
  const { session } = await createAgentSession({
    resourceLoader: loader,
    settingsManager: SettingsManager.inMemory(),
    sessionManager: sm,
    model,
    modelRuntime,
    customTools: buildAiTools(),
    excludeTools: EXCLUDED_BUILTIN_TOOLS,
    thinkingLevel: 'high',
  })
  return session
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
  : resolve(import.meta.dir, '../../..', aiSessionDir)

/** 会话列表（按修改时间倒序）。 */
export async function listSessions(): Promise<
  Array<{
    id: string
    name: string
    messageCount: number
    modified: string
  }>
> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR)
  return infos
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .map((info) => ({
      id: info.id,
      name: info.name ?? (info.firstMessage ? info.firstMessage.slice(0, 30) : '新会话'),
      messageCount: info.messageCount,
      modified: info.modified.toISOString(),
      // 链上父会话路径（自动会话链，评审 S1：SDK 原生 parentSession）；前端单一对话流不展示，保留供调试/内部
      parentSessionPath: info.parentSessionPath,
    }))
}

export async function findSessionPath(id: string): Promise<string | undefined> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR)
  return infos.find((info) => info.id === id)?.path
}

export async function openRecentOrCreate() {
  const sm = SessionManager.continueRecent(process.cwd(), SESSION_DIR)
  return { sm, session: await getOrCreateSession(sm) }
}

export async function openSession(path: string) {
  const sm = SessionManager.open(path, SESSION_DIR, process.cwd())
  return { sm, session: await getOrCreateSession(sm) }
}

export async function createNewSession(parentSessionId?: string) {
  const sm = SessionManager.create(
    process.cwd(),
    SESSION_DIR,
    parentSessionId ? { parentSession: parentSessionId } : undefined,
  )
  await refreshChainIndex()
  return { sm, session: await getOrCreateSession(sm) }
}

/** 同会话单实例：注册表命中（含 in-flight 创建中）直接复用，否则创建并登记。 */
export async function getOrCreateSession(sm: SessionManager): Promise<AgentSession> {
  const id = sm.getSessionId()
  const existing = sessionRegistry.get(id)
  if (existing) return existing
  // 先登记再 await：await 之前的同步段内不可能有并发插入（JS 单线程，
  // 本函数在第一个 await 之前没有让出点），并发调用在此合并到同一 promise。
  const promise = createAgentSessionFor(sm)
  sessionRegistry.set(id, promise)
  try {
    return await promise
  } catch (err) {
    sessionRegistry.delete(id) // 创建失败不残留，下次重试
    throw err
  }
}

export function releaseSession(id: string): void {
  const promise = sessionRegistry.get(id)
  if (promise) {
    sessionRegistry.delete(id)
    // dispose 须在创建完成（resolve）后调用；失败时静默忽略。
    promise.then((session) => session.dispose()).catch(() => {})
  }
}

export async function deleteSession(id: string): Promise<void> {
  const path = await findSessionPath(id)
  if (!path) throw new AppError(ErrorCode.NOT_FOUND, `会话不存在: ${id}`, 404)
  releaseSession(id)
  await unlink(path)
  void refreshChainIndex().catch(() => {}) // 链索引失效
}

// ---- 自动会话链（评审 D-017/D-018/D-020）-------------------------------
// 单一对话流下会话按 parentSession 串成纯线性链（S0←S1←…←Sn，Sn=链尾=当前）。
// 链指针由 SDK 原生 NewSessionOptions.parentSession 落盘（随 jsonl header 写），
// 跨重启可重建；进程内链索引（SessionInfo 缓存）供合并流组装快速回溯。

/** 24h 间隔自动切换阈值（决策 #3；判定 = 末条消息 .timestamp 距今，非文件 mtime S2）。 */
export const SESSION_IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000

/** 累计会话数超过该值时禁止继续自动建链（防失控：链上会话数量护栏）。 */
export const MAX_CHAIN_LENGTH = 200

let chainIndexCache: Map<string, SessionInfo> | undefined

async function refreshChainIndex(): Promise<void> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR)
  chainIndexCache = new Map(infos.map((info) => [info.id, info]))
}

async function getChainIndex(): Promise<Map<string, SessionInfo>> {
  if (!chainIndexCache) await refreshChainIndex()
  return chainIndexCache!
}

// ---- 链尾注册表（评审 B3：两标签页并发 24h 判定不产生分叉）------------
// 同一父会话的「自动子会话」in-flight 去重：并发判定只会创建一个新链尾并复用。
// 手动 /new 不走此注册表（总是显式 createNewSession 新建）。
const autoChildRegistry = new Map<string, Promise<{ sm: SessionManager; session: AgentSession }>>()

export function getOrCreateAutoChild(
  parentSessionId: string,
): Promise<{ sm: SessionManager; session: AgentSession }> {
  let pending = autoChildRegistry.get(parentSessionId)
  if (!pending) {
    pending = createNewSession(parentSessionId)
    autoChildRegistry.set(parentSessionId, pending)
    pending.catch(() => void autoChildRegistry.delete(parentSessionId))
  }
  return pending
}

/** 链上所有会话 id（根→尾）。尾部未落盘（新建未对话）时从 header parent 起步。 */
async function collectChainIds(
  sm: SessionManager,
  index: Map<string, SessionInfo>,
): Promise<string[]> {
  const byPath = new Map<string, SessionInfo>()
  for (const info of index.values()) byPath.set(info.path, info)

  const tailId = sm.getSessionId()
  const ids: string[] = [tailId]
  // 链上总长度护栏（防历史坏数据无限回溯）。
  let parentPath = index.get(tailId)?.parentSessionPath
  if (!parentPath) {
    const headerParent = sm.getHeader()?.parentSession
    if (headerParent) parentPath = index.get(headerParent)?.path
  }
  let depth = 0
  while (parentPath) {
    const parent = byPath.get(parentPath)
    if (!parent || ids.includes(parent.id) || depth++ >= MAX_CHAIN_LENGTH) break // 防环/护栏
    ids.push(parent.id)
    parentPath = parent.parentSessionPath
  }
  return ids.reverse()
}

/**
 * 组装当前链的「合并流」（评审 D-018/D-020）：链上各会话 RenderMessage 按链结构
 * 顺序拼接（根→尾），会话边界插入派生的「已开启新会话」marker，marker **计入**
 * 合并下标（front-anchor 分页下标单调的前提）。合并流 = 纯函数语义：同一链在同一
 * 时刻组装结果稳定，重连可重建；尾部用内存实例，更早会话磁盘恢复（registry 单实例）。
 */
export async function buildMergedStream(tailSession: AgentSession): Promise<RenderMessage[]> {
  const sm = tailSession.sessionManager
  const index = await getChainIndex()
  const ids = await collectChainIds(sm, index)
  const segments: RenderMessage[][] = []
  // 本次新打开的历史段（组装完释放，防长链内存累积，评审建议 3）：
  // 单一对话流 + switch 停用下历史会话不被任何连接持有（conn 恒为链尾），
  // 释放仅 dispose 无监听实例，安全；registry 已存在的活实例复用不释放。
  const opened: string[] = []
  for (const id of ids) {
    if (id === sm.getSessionId()) {
      segments.push(toRenderMessages(tailSession.messages))
    } else {
      const info = index.get(id)
      if (!info) break
      try {
        const reused = sessionRegistry.has(id)
        const { session } = await openSession(info.path)
        segments.push(toRenderMessages(session.messages))
        if (!reused) opened.push(id)
      } catch {
        break // 历史段读取失败：截断到已成功段，缺早期历史可接受，不断服务
      }
    }
  }
  for (const id of opened) releaseSession(id)
  return insertSessionMarkers(segments)
}

// ---- 事件转发 ----------------------------------------------------------
// target: 收 JSON 字符串（WS 发送）。转发事件与 pi-test/server.ts 对齐。
// 返回退订函数；close 后由调用方兜底（本函数不感知 WS 状态）。
export function forwardEvents(
  target: (json: string) => void,
  session: AgentSession,
  onCompactionEnd?: () => void,
): () => void {
  return session.subscribe((event) => {
    switch (event.type) {
      case 'message_update': {
        const a = event.assistantMessageEvent
        if (a.type === 'text_delta' || a.type === 'thinking_delta') {
          target(
            JSON.stringify({
              type: 'message_update',
              assistantMessageEvent: { type: a.type, delta: a.delta },
            }),
          )
        }
        break
      }
      case 'tool_execution_start':
        target(
          JSON.stringify({
            type: 'tool_execution_start',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          }),
        )
        break
      case 'tool_execution_update':
        target(
          JSON.stringify({
            type: 'tool_execution_update',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            partialResult: summarize(event.partialResult, 500),
          }),
        )
        break
      case 'tool_execution_end':
        target(
          JSON.stringify({
            type: 'tool_execution_end',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: summarize(event.result),
            isError: event.isError,
          }),
        )
        break
      case 'agent_start':
      case 'agent_settled':
      case 'turn_start':
      case 'turn_end':
      case 'agent_end':
        target(JSON.stringify({ type: event.type }))
        break
      case 'compaction_start':
        // 就地压缩开始（自动 threshold/overflow 或手动 compact 触发）
        target(JSON.stringify({ type: 'compaction_start', reason: event.reason }))
        break
      case 'compaction_end': {
        // 压缩完成 = 分页基线重同步点（评审 B1）：会话内消息折叠为摘要、合并流
        // total 缩小、旧 anchor 失效。转发事件后由 handler 回调触发重同步下发。
        target(
          JSON.stringify({
            type: 'compaction_end',
            reason: event.reason,
            aborted: event.aborted,
            willRetry: event.willRetry,
            ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
            ...(event.result && !event.aborted
              ? {
                  result: {
                    summary: event.result.summary,
                    tokensBefore: event.result.tokensBefore,
                    firstKeptEntryId: event.result.firstKeptEntryId,
                  },
                }
              : {}),
          }),
        )
        onCompactionEnd?.()
        break
      }
    }
  })
}

function summarize(value: unknown, max = 2000): string {
  if (value === null || value === undefined) return String(value)
  // 兼容两种输入形状：content 数组本身（toolResult 消息的 m.content）或
  // 包装对象 { content: [...] }（tool_execution_end 事件的 result）。
  const content = Array.isArray(value) ? value : (value as { content?: unknown })?.content
  if (Array.isArray(content)) {
    const text = content
      .map((c) =>
        c?.type === 'text' ? c.text : c?.type === 'image' ? '[image]' : JSON.stringify(c),
      )
      .join('\n')
    return text.length > max ? `${text.slice(0, max)}…(截断)` : text
  }
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…(截断)` : value
  try {
    const s = JSON.stringify(value)
    return s.length > max ? `${s.slice(0, max)}…(截断)` : s
  } catch {
    return String(value).slice(0, max)
  }
}

// ---- 历史渲染模型 ------------------------------------------------------
export type RenderToolCall = {
  id: string
  name: string
  args: unknown
  result: string
  isError: boolean
}
// 扁平结构（非 union）：保证既有消费方（web/flutter render）访问 role/text/
// thinking/toolCalls 保持合法。requested kind 字段区分消息形态（评审 S4）：
//  - 普通对话消息：role='user'|'assistant'，无 kind
//  - 派生边界 marker：kind='system'（自动切换/手动 /new 的链段落分隔）
//  - 真实压缩摘要：kind='compaction'（来自 compactionSummary，可展开 detail）
export type RenderMessage = {
  role?: 'user' | 'assistant'
  text: string
  thinking: string
  toolCalls: RenderToolCall[]
  kind?: 'system' | 'compaction'
  detail?: string
}

/** 派生「已开启新会话」的系统 marker 文案。 */
export const SESSION_BOUNDARY_MARKER_TEXT = '已开启新会话'

/** 压缩摘要 marker 的固定文案。 */
export const COMPACTION_MARKER_TEXT = '已压缩早期对话'

/**
 * 把各会话的 RenderMessage 段拼成合并流（纯函数）：从第 2 段起每段前插一条
 * 「已开启新会话」marker，marker 计入合并下标（front-anchor 分页单调前提）。
 */
export function insertSessionMarkers(segments: RenderMessage[][]): RenderMessage[] {
  const out: RenderMessage[] = []
  for (let i = 0; i < segments.length; i++) {
    if (i > 0)
      out.push({ kind: 'system', text: SESSION_BOUNDARY_MARKER_TEXT, thinking: '', toolCalls: [] })
    out.push(...segments[i])
  }
  return out
}

/** 消息历史 → 前端渲染模型（纯函数）。toolResult 不产生独立消息，按 toolCallId 关联到 assistant 的 toolCall。 */
export function toRenderMessages(messages: AgentMessage[]): RenderMessage[] {
  const results = new Map<string, { result: string; isError: boolean }>()
  for (const m of messages) {
    if (m.role === 'toolResult') {
      results.set(m.toolCallId, { result: summarize(m.content), isError: m.isError })
    }
  }
  const out: RenderMessage[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', text: userText(m.content), thinking: '', toolCalls: [] })
    } else if (m.role === 'assistant') {
      let text = ''
      let thinking = ''
      const toolCalls: RenderToolCall[] = []
      for (const c of m.content) {
        if (c.type === 'text') text += c.text
        else if (c.type === 'thinking') thinking += c.thinking
        else if (c.type === 'toolCall') {
          const tr = results.get(c.id)
          toolCalls.push({
            id: c.id,
            name: c.name,
            args: c.arguments,
            result: tr?.result ?? '',
            isError: tr?.isError ?? false,
          })
        }
      }
      out.push({ role: 'assistant', text, thinking, toolCalls })
    } else if ((m as { role?: string }).role === 'compactionSummary') {
      // SDK 就地压缩后 session.messages 里的摘要消息（评审 §4 实证），当前静默丢弃
      out.push({
        kind: 'compaction',
        text: COMPACTION_MARKER_TEXT,
        detail: (m as { summary?: string }).summary ?? '',
        thinking: '',
        toolCalls: [],
      })
    }
  }
  return out
}

// ---- 分页（懒加载）----------------------------------------------------
// 初始只发最新 N 条 RenderMessage，向上滚动加载更早批次。分页在 RenderMessage[]
// 层面切片（转换完后），不在 AgentMessage[] 层面——避免 toolCall/toolResult 关联
// 断裂：toolResult 不产生独立 RenderMessage，它被关联进 assistant 的 toolCalls
// 数组，所以按 RenderMessage 条数从尾部切片天然保持 turn 完整性。

/** 初始加载条数（最新 N 条 RenderMessage）。 */
export const INITIAL_PAGE_SIZE = 20
/** 向上滚动每批加载条数。 */
export const MORE_PAGE_SIZE = 30
/** load_more 客户端可请求的最大条数（防御：limit<=0 会返回空批次+hasMore=true 空转）。 */
export const MAX_PAGE_SIZE = 200

export type TailResult = {
  messages: RenderMessage[]
  total: number
  hasMore: boolean
}

/**
 * 从尾部取分页的 RenderMessage。
 *
 * @param messages  完整 AgentMessage[]（session.messages）
 * @param limit     取多少条 RenderMessage
 * @param offset    从尾部往前跳过多少条已下发的 RenderMessage（默认 0）
 */
/**
 * 对完整合并 RenderMessage[] 从尾部取分页（marker 计入下标）。
 *
 * @param stream 合并流（含派生 marker 的 RenderMessage[]）
 * @param limit  取多少条
 * @param offset 从尾部往前跳过多少条已下发的（默认 0）
 */
export function tailRenderStream(
  stream: RenderMessage[],
  limit: number = INITIAL_PAGE_SIZE,
  offset: number = 0,
): TailResult {
  const total = stream.length
  const end = Math.max(0, total - offset)
  const start = Math.max(0, end - limit)
  return {
    messages: stream.slice(start, end),
    total,
    hasMore: start > 0,
  }
}

/**
 * 单会话历史 → 尾部切片（保留签名：内部先转 RenderMessage[] 再委托
 * tailRenderStream）。新代码应直接对合并流调用 tailRenderStream。
 */
export function tailRenderMessages(
  messages: AgentMessage[],
  limit: number = INITIAL_PAGE_SIZE,
  offset: number = 0,
): TailResult {
  return tailRenderStream(toRenderMessages(messages), limit, offset)
}

export type OlderPage = {
  messages: RenderMessage[]
  total: number
  hasMore: boolean
  /** 加载后应记录的最早已持有下标（下一次加载的起点，等于本批 nextAnchor）。 */
  nextAnchor: number
}

/**
 * 向上滚动加载更早的一批历史消息。游标 = 客户端当前持有的**最早** RenderMessage
 * 下标（anchor），分页锚定在稳定的前端边界而非易变的尾部：新鲜轮次只在尾部
 * 追加，旧下标永不移动，因此返回 [anchor-limit, anchor) 不会与「已在客户端但
 * 尾部仍在增长」的消息重叠（修复「turn 追加后 load_more 返回重复消息」缺陷）。
 *
 * @param messages 完整 AgentMessage[]（session.messages，尾部可能已随 turn 增长）
 * @param limit    本批取多少条 RenderMessage
 * @param anchor   客户端当前持有的最早 RenderMessage 下标（初始 = total-已发尾部条数）
 */
/**
 * 向上滚动加载更早的一批历史消息（合并流版，评审 D-015 anchor 语义原样推广）：
 * 游标 = 客户端当前持有的最早 RenderMessage 下标（anchor），分页锚定在稳定的
 * 前端边界而非易变尾部——fresh 轮次只在尾部追加，旧下标永不移动。marker 计入
 * 下标，跨会话边界时批次自然包含 marker。
 *
 * @param stream 合并流（完整 RenderMessage[]，尾部可能已随 turn 增长）
 * @param limit  本批取多少条
 * @param anchor 客户端当前持有的最早 RenderMessage 下标
 */
export function nextOlderPageFromStream(
  stream: RenderMessage[],
  limit: number,
  anchor: number,
): OlderPage {
  const total = stream.length
  const end = Math.min(anchor, total) // anchor 可能因压缩重同步/重建略超 total，钳到 total
  const start = Math.max(0, end - limit)
  return {
    messages: stream.slice(start, end),
    total,
    hasMore: start > 0,
    nextAnchor: start,
  }
}

/** 单会话历史向上懒加载（保留签名：委托 nextOlderPageFromStream）。 */
export function nextOlderPage(messages: AgentMessage[], limit: number, anchor: number): OlderPage {
  return nextOlderPageFromStream(toRenderMessages(messages), limit, anchor)
}

export type SessionPage = TailResult & {
  /** 初始分页基线：客户端持有尾部后应记录的最早 RenderMessage 下标（= 尾部起点）。 */
  anchor: number
}

/**
 * 会话就绪/切换/新建共用的初始分页状态：只取尾部 INITIAL_PAGE_SIZE 条，并给出
 * 本次下发的分页基线 anchor（= 尾部起点下标）。每次切会话/建新会话都重算基线
 * （对当前 total 重新取尾部），保证旧游标不跨会话泄漏。
 */
/**
 * 会话就绪/切换/新建共用的初始分页状态（合并流版）：只取尾部 INITIAL_PAGE_SIZE
 * 条，并给出本次下发的分页基线 anchor（= 尾部起点下标）。每次重连/切换/重同步
 * 都重算基线（对当前合并流 total 重新取尾部），保证旧游标不跨链段泄漏。
 */
export function streamPagination(stream: RenderMessage[]): SessionPage {
  const tail = tailRenderStream(stream, INITIAL_PAGE_SIZE, 0)
  return { ...tail, anchor: tail.total - tail.messages.length }
}

/** 单会话初始分页（保留签名：委托 streamPagination）。 */
export function sessionPagination(messages: AgentMessage[]): SessionPage {
  return streamPagination(toRenderMessages(messages))
}

// ---- 24h 自动切换判定（评审 S2：末条消息 timestamp，非 SessionInfo.modified mtime）----
/**
 * 会话是否「空闲超时」——最后一条消息距今 ≥ thresholdMs（默认 24h）。
 * 空会话（无消息）恒为 false。
 */
export function isSessionIdle(
  messages: readonly AgentMessage[],
  now: number = Date.now(),
  thresholdMs: number = SESSION_IDLE_THRESHOLD_MS,
): boolean {
  const last = messages[messages.length - 1]
  if (!last) return false
  const ts = (last as { timestamp?: number }).timestamp
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false
  return now - ts >= thresholdMs
}

function userText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === 'string') return content
  return content.map((c) => c.text ?? '[image]').join('\n')
}

export const aiService = {
  isAiEnabled: async (): Promise<boolean> => {
    try {
      await getRuntime()
      return true
    } catch {
      return false
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
  getOrCreateAutoChild,
  buildMergedStream,
  isSessionIdle,
}
