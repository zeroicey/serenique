/**
 * 项目记忆自动注入扩展（移植自 registry，适配 serenique 的 decisions/ ADR 目录）
 *
 * 在每轮 before_agent_start 时，把 .ai/ 的近期记忆摘要注入系统提示：
 *   - 最近一个 worklog 的 ## 主题标题（钩子，详情按需读文件）
 *   - decisions/ 目录最新 ADR 的标题（最新决策）
 *   - inbox/ 未消化片段列表
 *
 * 设计原则（三层记忆的 L2 层）：
 *   - 注入克制：总摘要 ≤ 1.8KB，只给"最近发生了什么"的钩子，不全文灌入
 *   - 每轮刷新：模块级缓存 + mtime 指纹，会话中写新记忆后下一轮自动重算
 *   - 按需深读：agent 需要细节时仍用 read 工具读 .ai/ 原文（L3）
 *
 * 与 context-mode 的分工：ctx_search 负责全量事件检索（自动原材料），
 * 本扩展只负责把 .ai/ 正式文档的近期摘要送进上下文。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const MAX_DIGEST_CHARS = 1800;
const MAX_WORKLOG_TITLES = 6;
const MAX_DECISIONS = 5;

/** 从启动目录向上找仓库根（含 .ai/ 与 .pi/ 的目录） */
function findRepoRoot(start: string): string | null {
  let dir = start;
  while (dir) {
    if (existsSync(join(dir, ".ai")) && existsSync(join(dir, ".pi")))
      return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function readSafe(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** 最新的 worklog 文件（按 mtime） */
function latestWorklogFile(aiDir: string): string | null {
  try {
    const files = readdirSync(join(aiDir, "worklog")).filter((f) =>
      f.endsWith(".md"),
    );
    if (files.length === 0) return null;
    const latest = files.sort(
      (a, b) =>
        statSync(join(aiDir, "worklog", b)).mtimeMs -
        statSync(join(aiDir, "worklog", a)).mtimeMs,
    )[0];
    if (!latest) return null;
    return join(aiDir, "worklog", latest);
  } catch {
    return null;
  }
}

function worklogDigest(root: string): string {
  const file = latestWorklogFile(join(root, ".ai"));
  if (!file) return "";
  const titles: string[] = [];
  for (const line of readSafe(file).split("\n")) {
    if (!line.startsWith("## ")) continue;
    titles.push(line.slice(3).trim());
    if (titles.length >= MAX_WORKLOG_TITLES) break;
  }
  if (titles.length === 0) return "";
  return `最近 worklog（${basename(file)}）主题：\n${titles.map((t) => `- ${t}`).join("\n")}`;
}

/** 单个 ADR 文件的标题（首个 # 行，无则回退文件名） */
function adrTitle(file: string): string {
  for (const line of readSafe(file).split("\n")) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return basename(file).replace(/\.md$/, "");
}

function decisionsDigest(root: string): string {
  const dir = join(root, ".ai", "decisions");
  if (!existsSync(dir)) return "";
  // 目录模式（serenique ADR）：按文件名（日期）倒序取最新 N 个标题
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, MAX_DECISIONS);
    if (files.length === 0) return "";
    const titles = files.map((f) => `- ${adrTitle(join(dir, f))}`);
    return `最新决策（decisions/）：\n${titles.join("\n")}`;
  } catch {
    return "";
  }
}

function inboxDigest(root: string): string {
  try {
    const files = readdirSync(join(root, ".ai", "inbox")).filter((f) =>
      f.endsWith(".md"),
    );
    if (files.length === 0) return "";
    return `inbox 有 ${files.length} 个未消化片段：${files.join(", ")}（消化进正式位置后删除）`;
  } catch {
    return "";
  }
}

/** 记忆新鲜度指纹：关键文件 mtime + inbox 文件列表，变了才重算摘要 */
function freshnessKey(root: string): string {
  const aiDir = join(root, ".ai");
  const parts: string[] = [];
  const wl = latestWorklogFile(aiDir);
  if (wl) parts.push(`wl:${statSync(wl).mtimeMs}`);
  try {
    const dcDir = join(aiDir, "decisions");
    if (existsSync(dcDir)) {
      const files = readdirSync(dcDir).filter((f) => f.endsWith(".md"));
      parts.push(
        `dc:${files
          .map((f) => `${f}:${statSync(join(dcDir, f)).mtimeMs}`)
          .sort((a, b) => a.localeCompare(b))
          .join(",")}`,
      );
    }
    const inboxFiles = readdirSync(join(aiDir, "inbox")).sort((a, b) =>
      a.localeCompare(b),
    );
    parts.push(`ib:${inboxFiles.join(",")}`);
  } catch {
    // 目录缺失时忽略
  }
  return parts.join("|");
}

function buildDigest(root: string): string {
  const parts: string[] = [];
  const wl = worklogDigest(root);
  if (wl) parts.push(wl);
  const dc = decisionsDigest(root);
  if (dc) parts.push(dc);
  const ib = inboxDigest(root);
  if (ib) parts.push(ib);
  if (parts.length === 0) return "";
  const body = parts.join("\n\n").slice(0, MAX_DIGEST_CHARS);
  return `## 项目记忆摘要（自动注入 · 来源 .ai/，需要细节请 read 原文）\n\n${body}`;
}

let cachedKey = "";
let cachedDigest = "";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const root = findRepoRoot(event.systemPromptOptions?.cwd ?? process.cwd());
    if (!root) return;

    const key = freshnessKey(root);
    if (key !== cachedKey) {
      cachedKey = key;
      cachedDigest = buildDigest(root);
    }
    if (!cachedDigest) return;

    return { systemPrompt: `${event.systemPrompt}\n\n${cachedDigest}` };
  });
}
