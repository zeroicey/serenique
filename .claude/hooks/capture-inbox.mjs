#!/usr/bin/env node
/**
 * Stop hook — 把每轮实质对话的最后一条 assistant 消息捕获到 .ai/inbox/YYYY-MM-DD.md。
 *
 * 等价于 Open Code 侧 memory 插件（session.idle → inbox）：写完一轮后自动沉淀原始片段，
 * 由 memory-consolidate / remember-* skills 消化进正式记忆。
 *
 * stdin 输入（Claude Code hook 事件）：{ session_id, transcript_path, cwd, prompt_id, last_assistant_message, ... }
 * 取消息优先级：last_assistant_message（官方推荐，transcript 异步写入可能滞后）→ transcript 尾部回退。
 * 去重：以消息 uuid 为指纹，已在 inbox 中则跳过。
 * 脚本自身绝不抛错（try/catch），失败静默退出 0。
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync, openSync, statSync, readSync, closeSync } from "node:fs"
import { join, dirname } from "node:path"

const MIN_LENGTH = 80 // 无工具调用时，文本短于此长度视为非实质工作，不捕获
const TAIL_BYTES = 256 * 1024 // 只读 transcript 尾部，避免长会话全量读取拖慢 Stop hook

// 读取文件尾部（最后一条 assistant 消息必然在末尾，无需读全文件）
function readTail(file, maxBytes) {
  const fd = openSync(file, "r")
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    return buf.toString("utf8")
  } finally {
    closeSync(fd)
  }
}

function findRoot(start) {
  let dir = start
  while (dir) {
    if (existsSync(join(dir, ".ai")) && existsSync(join(dir, "CLAUDE.md"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
  return start
}

// 兼容 content 为字符串 / 数组的两种消息格式
function textOf(content) {
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join(" ")
      .trim()
  }
  return ""
}

// 从 Stop 事件输入的 last_assistant_message 提取（官方推荐：transcript 写入异步、可能滞后，
// 取本轮最终消息应读此字段而非 transcript）。形状不固定，防御性处理。
function extractFromInput(input) {
  const lam = input.last_assistant_message
  if (lam == null) return null
  if (typeof lam === "string") return { text: lam.trim(), hasToolUse: false, id: null }
  const content = Array.isArray(lam.content) ? lam.content : null
  if (content) {
    return {
      text: textOf(content),
      hasToolUse: content.some((b) => b.type === "tool_use"),
      id: lam.uuid || lam.id || null,
    }
  }
  if (typeof lam.text === "string") {
    return { text: lam.text.trim(), hasToolUse: false, id: lam.uuid || lam.id || null }
  }
  return null
}

// 回退：从 transcript 尾部找最后一条 assistant 消息
function extractFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null
  const tail = readTail(transcriptPath, TAIL_BYTES)
  const lines = tail.split("\n").filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry
    try { entry = JSON.parse(lines[i]) } catch { continue }
    if (entry && entry.type === "assistant" && entry.message) {
      const content = entry.message.content ?? []
      return {
        text: textOf(content),
        hasToolUse: Array.isArray(content) && content.some((b) => b.type === "tool_use"),
        id: entry.uuid || null,
      }
    }
  }
  return null
}

// 只从管道读 stdin（hook 总是会注入 JSON）；终端手动运行时跳过，避免 readFileSync(0) 阻塞
function readStdin() {
  if (process.stdin.isTTY) return null
  try { return readFileSync(0, "utf8") } catch { return null }
}

function main() {
  let input = {}
  const raw = readStdin()
  if (raw) { try { input = JSON.parse(raw) } catch { return } }

  const last = extractFromInput(input) || extractFromTranscript(input.transcript_path)
  if (!last) return

  const text = last.text || ""
  if (!text && !last.hasToolUse) return
  if (!last.hasToolUse && text.length < MIN_LENGTH) return

  // 指纹：优先消息 uuid，缺省用 prompt_id + 文本摘要
  const fingerprint =
    last.id || `${input.prompt_id ?? "?"}-${text.slice(0, 120).replace(/\s+/g, " ")}`
  const preview = text.replace(/\s+/g, " ").slice(0, 200)

  const now = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const root = findRoot(input.cwd || process.cwd())
  const inboxDir = join(root, ".ai", "inbox")
  const file = join(inboxDir, `${date}.md`)
  mkdirSync(inboxDir, { recursive: true })

  // 去重：同指纹已捕获过则跳过
  if (existsSync(file) && readFileSync(file, "utf8").includes(fingerprint)) return

  const sid = input.session_id ? `\`${input.session_id}\`` : "（未知）"
  appendFileSync(
    file,
    `## ${now.toISOString()} — 会话 ${sid}\n- 指纹：\`${fingerprint}\`\n- 预览：${preview}\n\n`,
  )
}

try { main() } catch {}
