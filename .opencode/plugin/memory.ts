import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, appendFile } from "node:fs/promises"
import { join } from "node:path"

const INBOX_DIR = ".ai/inbox"

function todayFile(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return join(INBOX_DIR, `${y}-${m}-${day}.md`)
}

export function shouldCapture(text: string, hasEdits: boolean): boolean {
  return hasEdits || text.length >= 80
}

export function preview(text: string, max = 200): string {
  return text.slice(0, max).replace(/\n+/g, " ")
}

const CAPTURED_SESSIONS = new Set<string>()

export default (async ({ client }) => {
  return {
    event: async ({ event }: { event: any }) => {
      if (event.type !== "session.idle") return

      const sessionID: string | undefined = event.properties?.sessionID
      if (!sessionID || CAPTURED_SESSIONS.has(sessionID)) return
      CAPTURED_SESSIONS.add(sessionID)

      try {
        const sessionRes = await client.session.get({ path: { id: sessionID } })
        const session = sessionRes.data
        const msgsRes = await client.session.messages({
          path: { id: sessionID },
          query: { limit: 50 },
        })
        const entries = msgsRes.data ?? []
        const last = entries.reverse().find((m) => m.info.role === "assistant")
        if (!last) return

        const text = last.parts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join(" ")
          .trim()
        const hasEdits = last.parts.some(
          (p) => p.type === "tool" && p.state.status === "completed",
        )
        if (!shouldCapture(text, hasEdits)) return

        const title = session?.title || sessionID.slice(0, 8)
        const now = new Date().toISOString()

        await mkdir(INBOX_DIR, { recursive: true })
        await appendFile(
          todayFile(),
          `## ${now} — 会话「${title}」\n- 会话 ID：\`${sessionID}\`\n- 预览：${preview(text)}\n\n`,
        )
      } catch (err) {
        console.error("[memory-plugin] capture failed:", err)
      }
    },
  }
}) satisfies Plugin
