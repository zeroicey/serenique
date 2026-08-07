# 2026-08-08 — API：日记「今天」时区口径对齐本地（修复 UTC+8 凌晨拒绝未来日）

## 背景

Web 端幽灵 8/8 日记修复（见 `2026-08-08-web-ghost-diary-timezone-and-moment-ui.md`）把前端「今天」
口径从 UTC 改为本地日期。遗留问题：后端 `services/api/src/modules/diary/diary.domain.ts` 的
`todayStr()` 仍用 UTC（`new Date().toISOString().slice(0, 10)`）。

影响：UTC+8 凌晨 00:00–08:00 时段，本地已是新的一天（如 8/8）而 UTC 仍是前一天（8/7）。
用户为本地「今天」（8/8）创建日记时，前端 schema 放行，但后端 `isFutureDate()` 用 UTC 日期判定，
把本地「今天」当作「未来日期」（8/8 > 8/7）拒绝——与 Web/移动端口径不一致。

## 改动

### 1. `services/api/src/modules/diary/diary.domain.ts`

`todayStr()` 从 UTC 改为**服务器本地时区**，并加可选 `now: Date = new Date()` 参数（沿用本文件
`isFutureDate` 已有的「可注入 today」模式，使边界单测不依赖真实时钟）：

```ts
export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

对齐 Web `todayLocal()`（`apps/web/src/lib/date.ts`）与移动端本地日界。`isFutureDate()` 逻辑不变
（字符串比较 = 日历比较），只是其默认 `today` 现在来自本地日期。

### 2. `services/api/src/modules/diary/diary.service.test.ts`

新增两个单测（在现有「diary domain」块内）：

- `todayStr uses the local date, not UTC, at the UTC+8 early-morning boundary`：
  固定 `now = 2026-08-07T23:30:00Z`（= UTC+8 8/8 07:30）。断言 UTC 日期是 08-07，而 `todayStr`
  必须等于「本地日历日期」。用**时区偏移量推导的本地日期**（`now - getTimezoneOffset()`，不经本地
  getter）作 TZ 无关 oracle，任何机器上都能抓回退到 UTC 的回归；当运行环境确为 UTC+8
  （`getTimezoneOffset() === -480`）时再钉死具体期望 `2026-08-08`。
- `isFutureDate accepts the local today and rejects only strictly-after dates`：
  边界时刻下本地「今天」可写、昨天可写、后天拒绝。

### 3. `services/api/src/modules/diary/diary.service.integration.test.ts`

原「future date」测试用 `new Date(Date.now() + 86400000).toISOString().slice(0, 10)`（UTC 明天）当
「未来日期」。本地口径后，UTC+8 凌晨该字符串恰等于本地「今天」，会被放行导致测试偶发失败。改为钉死
`"2099-01-01"`（与文件里已有的 2020 固定日期风格一致），任意 TZ/任意时刻都严格晚于本地今天，测试确定。

## 排查：其它 UTC「今天」判定

grep `toISOString` / `getUTCFullYear` / `getUTCDate` 等（services/api/src）：

- **唯一的「今天」判定就是 `diary.domain.ts todayStr()`**，已修。
- 其余 `.toISOString()` 都是绝对时间戳序列化（createdAt/updatedAt/event.startAt 等），是「时刻」不是
  「今天」，保持 ISO/UTC 正确，不动。
- `shared/storage.ts` 用 `now.getFullYear()`（本地 getter）拼 blob 磁盘路径年份，本来就是本地，不受影响。
- event 模块 `from`/`to` 是客户端显式传入的时间窗，不涉及「今天」。
- moment 模块无日期判定。

## 验证

- `cd services/api && bun test`：103 pass / 68 skip（集成按 RUN_DB_TESTS 跳过）/ 0 fail ✅
- `bun run typecheck`：通过 ✅
- `RUN_DB_TESTS=1 bun test src/modules/diary/diary.service.integration.test.ts`：7 pass / 0 fail ✅

## 对下一次会话的提示

- 后端「今天」= **服务器本地时区**（`todayStr` 走本地 getter）。若服务跑在容器且时区未设
  `TZ=Asia/Shanghai`，凌晨边界仍可能与用户本地不一致——多用户/多时区场景需改客户端传时区，本次按
  Web/移动端一致口径只对齐服务器本地。
- `todayStr` 已加 `now` 可注入参数，写边界单测不要动真实时钟（bun:test 无现成 `vi.setSystemTime`
  用法），直接 `todayStr(new Date("..."))` 即可。
- 测试 TZ 无关 oracle：`new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)`
  可得到任意机器的本地日历日期，用于抓「回退 UTC」回归。
