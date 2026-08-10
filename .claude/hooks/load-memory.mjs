#!/usr/bin/env node
/**
 * SessionStart hook — 把项目记忆摘要注入上下文（stdout 会被 Claude Code 注入会话）。
 *
 * 等价于 Open Code 侧「开始写时自动读取并逐句学习」：
 *   读取 .ai/README.md（索引 + 规则）+ 最近 worklog + 未消化 inbox。
 * 脚本自身绝不抛错（try/catch），失败静默退出 0，不干扰会话。
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join, dirname, sep } from "node:path"

// 从启动目录向上找仓库根（含 .ai/ 与 CLAUDE.md 的目录）
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

// 只从管道读 stdin（hook 总是会注入 JSON）；终端手动运行时跳过，避免 readFileSync(0) 阻塞
function readStdin() {
  if (process.stdin.isTTY) return null
  try { return readFileSync(0, "utf8") } catch { return null }
}

function main() {
  let cwd = process.cwd()
  const raw = readStdin()
  if (raw) {
    try {
      const input = JSON.parse(raw)
      if (input && typeof input.cwd === "string") cwd = input.cwd
    } catch {}
  }
  const root = findRoot(cwd)
  const AI = join(root, ".ai")
  const out = []

  // 1. .ai/README.md（索引 + 规则）—— 项目记忆入口
  const readme = join(AI, "README.md")
  if (existsSync(readme)) {
    out.push("===== 项目记忆入口 .ai/README.md =====")
    out.push(readFileSync(readme, "utf8").trimEnd())
  }

  // 2. 最近 worklog（按修改时间取 3 个，各截头部）
  const wlDir = join(AI, "worklog")
  if (existsSync(wlDir)) {
    try {
      const recent = readdirSync(wlDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({ f, t: statSync(join(wlDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(0, 3)
      if (recent.length) {
        out.push("===== 最近 worklog =====")
        for (const { f } of recent) {
          const head = readFileSync(join(wlDir, f), "utf8").split("\n").slice(0, 8).join("\n")
          out.push(`--- ${f} ---\n${head}`)
        }
      }
    } catch {}
  }

  // 3. 未消化 inbox 片段
  const inboxDir = join(AI, "inbox")
  if (existsSync(inboxDir)) {
    try {
      const files = readdirSync(inboxDir).filter((f) => f.endsWith(".md") && f !== ".gitkeep")
      if (files.length) {
        out.push("===== 未消化 inbox 片段 =====")
        for (const f of files) {
          const lines = readFileSync(join(inboxDir, f), "utf8").split("\n").filter(Boolean)
          out.push(`--- ${f} ---\n${lines.slice(0, 6).join("\n")}`)
        }
      }
    } catch {}
  }

  if (out.length) process.stdout.write(out.join("\n\n") + "\n")
}

try { main() } catch {}
