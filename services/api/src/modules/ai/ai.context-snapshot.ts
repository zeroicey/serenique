// L3 动态上下文快照 — 每轮（before_agent_start）组装注入。
//
// 结构（见 .ai/requirements/2026-08-19-ai-memory-context-design.md §4/§6）：
//   时间（每轮强制刷新，不参与指纹）+ 任务/日程/闪念/习惯四段
// 去重：段文本按「数据指纹」缓存（进程级单例 Map），指纹未变（数据没动）
// 就复用上次的段文本，不重建不重查；任一源查询失败 → 跳过该段（降级），
// 快照整体失败 → 回退为仅时间块，不阻断对话。
//
// 纯函数（summarize*/format*/fingerprint*）与数据源（真实 service 查询）
// 分离：单测只测纯函数 + 注入假 source 的编排逻辑；真 DB 查询在
// createDefaultSources() 里，由集成测试覆盖。

import { eventService } from '@/modules/event/event.service'
import { habitService } from '@/modules/habit/habit.service'
import { momentService } from '@/modules/moment/moment.service'
import { taskService } from '@/modules/task/task.service'
import { logger } from '@/shared/logger'

// ---------------------------------------------------------------------------
// 配额（§6 Q2/Q3 定稿：快照整体 ≤1.5~2KB / ~500-700 token）
// ---------------------------------------------------------------------------

export const SNAPSHOT_QUOTAS = {
  /** 未完成任务最多条数。 */
  maxTasks: 8,
  /** 日程窗口（今天起未来天数），窗口内最多条数。 */
  eventWindowDays: 3,
  maxEvents: 6,
  /** 闪念最多条数 + 单条 text 截断长度。 */
  maxMoments: 3,
  momentTextLimit: 60,
  /** 习惯打卡概览窗口天数。 */
  habitOverviewDays: 7,
} as const

// ---------------------------------------------------------------------------
// 纯函数：时间块
// ---------------------------------------------------------------------------

const WEEKDAYS_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const

/** 本地时区 GMT 偏移（如 GMT+8 / GMT-5 / GMT+5:30）。 */
export function formatGmtOffset(now: Date): string {
  const offsetMin = -now.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  return minutes === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

/** 本地日期 YYYY-MM-DD（与 habit.domain 的 formatLocalDate 一致语义）。 */
export function formatLocalDate(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * [当前时间] 段 —— 每轮强制刷新（时间不参与指纹）。
 * `现在是 2026-08-19（星期三）22:41，时区 GMT+8。`
 */
export function formatSnapshotTime(now: Date): string {
  const date = formatLocalDate(now)
  const weekday = WEEKDAYS_CN[now.getDay()]
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `[当前时间]\n现在是 ${date}（${weekday}）${hh}:${mm}，时区 ${formatGmtOffset(now)}。`
}

// ---------------------------------------------------------------------------
// 纯函数：任务/日程/闪念/习惯段
// ---------------------------------------------------------------------------

export type TaskLike = { title: string; status: string; dueDate: string | null }
export type GroupLike = { title: string }

/** dueDate 相对 now 的截止标签：已过期 / 今天到期 / 明天到期 / M月d日 / 无期限。 */
export function dueDateLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return '无期限'
  if (dueDate === today) return '今天到期'
  const tom = addDaysLocal(today, 1)
  if (dueDate === tom) return '明天到期'
  if (dueDate < today) return '已过期'
  const [y, m, d] = dueDate.split('-').map(Number)
  return `${y}-${m}-${d}` // 完整日期避免歧义（跨年/远期）
}

/** YYYY-MM-DD 加 delta 天（纯字符串运算，与 habit.domain.addDays 同 semantics）。 */
export function addDaysLocal(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-')
}

/** 未完成任务段（§6：最近 8 条 + 全部任务组）。now 为「当前时刻」（相对
 *  时间/日期据此推算，默认当前时间——注入方应显式传入同一时刻与 L3 时间
 *  块保持一致）。 */
export function summarizeTasks(
  tasks: TaskLike[],
  groups: GroupLike[],
  now: Date = new Date(),
): string {
  const lines: string[] = []
  if (tasks.length > 0) {
    const today = formatLocalDate(now)
    const items = tasks
      .filter((t) => t.status === 'todo')
      .slice(0, SNAPSHOT_QUOTAS.maxTasks)
      .map((t) => `『${t.title}』(${dueDateLabel(t.dueDate, today)})`)
      .join(' | ')
    if (items) lines.push(`未完成任务（${SNAPSHOT_QUOTAS.maxTasks} 条内）：${items}`)
  }
  if (groups.length > 0) {
    lines.push(`任务组：${groups.map((g) => g.title).join(' / ')}`)
  }
  return lines.length > 0 ? `[任务概览]\n${lines.join('\n')}` : ''
}

export type EventLike = {
  title: string
  startAt: string
  isAllDay: boolean
  location: string | null
}

/** 近期日程段（§6：今天+未来 3 天，≤6 条，含位置）。 */
export function summarizeEvents(events: EventLike[], now: Date): string {
  if (events.length === 0) return ''
  const today = formatLocalDate(now)
  const out = events
    .slice(0, SNAPSHOT_QUOTAS.maxEvents)
    .map((e) => {
      const start = new Date(e.startAt)
      const prefix =
        formatLocalDate(start) === today ? '今天' : `${formatLocalDate(start).slice(5)}`
      const time = e.isAllDay
        ? '全天'
        : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
      const loc = e.location ? ` @${e.location}` : ''
      return `${prefix} ${time} ${e.title}${loc}`
    })
    .join('；')
  return `[近期日程]\n${out}`
}

export type MomentLike = { text: string; createdAt: string }

export function truncateText(text: string, max: number): string {
  // 按 Unicode 码点截断（[...text] 展开为码点），避免从 emoji 等代理对中
  // 间截断产生乱码/半个 emoji（note 项）。
  return [...text].length > max ? `${[...text].slice(0, max).join('')}…` : text
}

/** 最新闪念段（§6：最新 3 条，text 截断 60 字）。 */
export function summarizeMoments(moments: MomentLike[]): string {
  if (moments.length === 0) return ''
  const out = moments
    .slice(0, SNAPSHOT_QUOTAS.maxMoments)
    .map((m) => truncateText(m.text.replace(/\s+/g, ' ').trim(), SNAPSHOT_QUOTAS.momentTextLimit))
    .map((t) => `- 『${t}』`)
    .join('\n')
  return `[最新闪念]\n${out}`
}

export type HabitStatLike = {
  name: string
  kind: string
  countable: boolean
  doneDays: number
  totalCount: number
  days: number
}

/** 最近习惯段（§6：全部习惯名 + 近 7 天概览，一行一条）。 */
export function summarizeHabits(stats: HabitStatLike[]): string {
  if (stats.length === 0) return ''
  const out = stats
    .map((h) => {
      if (h.countable) {
        const perDay = h.days > 0 ? (h.totalCount / h.days).toFixed(1) : '0'
        return `${h.name}（近 ${h.days} 天共 ${h.totalCount} 次，日均 ${perDay}）`
      }
      return `${h.name}（近 ${h.days} 天打卡 ${h.doneDays} 天）`
    })
    .join('\n')
  return `[最近习惯]\n${out}`
}

// ---------------------------------------------------------------------------
// 指纹（纯函数）
// ---------------------------------------------------------------------------

/**
 * 段级别指纹（数据未变判断）：由各 source 的轻量查询提供关键量
 * （条目数 + 最新 updatedAt + 窗口日期等），变化才触发全量 load。
 */
export function fingerprintOf(parts: Array<string | number | undefined>): string {
  return parts.map((p) => (p === undefined ? '' : String(p))).join(':')
}

/**
 * 习惯段指纹：习惯表（count + 最新 updatedAt）+ habit_daily 最新打卡时间 +
 * 当天日期。含 habit_daily 保证「只打卡不改习惯」也会刷新 7 天概览（打卡
 * 只写 habit_daily，不碰 habits.updatedAt）；当天日期保证进程跨天后
 * 「今天」基准更新（与事件段 formatLocalDate(now) 的做法一致）。
 */
export function habitsFingerprint(
  now: Date,
  habitsCount: number,
  latestHabitUpdatedAt: string | undefined,
  latestDailyUpdatedAt: string | undefined,
): string {
  return fingerprintOf([
    formatLocalDate(now),
    habitsCount,
    latestHabitUpdatedAt,
    latestDailyUpdatedAt,
  ])
}

/**
 * 任务段指纹：当天日期 + todo 任务条数 + 任务表最新 updated_at。
 * 当天日期分量保证进程跨天后「今天/明天到期」相对标签随日刷新（med 修复）；
 * MAX(updated_at) 聚合保证编辑任意任务（含非新建最近项）也触发刷新。
 */
export function tasksFingerprint(
  now: Date,
  count: number,
  latestUpdatedAt: string | undefined,
): string {
  return fingerprintOf([formatLocalDate(now), count, latestUpdatedAt])
}

/**
 * 事件段指纹：窗口日期 + 事件条数 + 最新 updated_at。窗口日期分量保证跨天
 * 「今天」窗口基准更新；MAX(updated_at) 聚合保证编辑任意事件也触发刷新。
 */
export function eventsFingerprint(
  now: Date,
  count: number,
  latestUpdatedAt: string | undefined,
): string {
  return fingerprintOf([formatLocalDate(now), count, latestUpdatedAt])
}

/**
 * 闪念段指纹：条数 + 最新 updated_at（闪念段文本无相对日期标签，故无日期
 * 分量）。MAX(updated_at) 聚合保证编辑任意闪念（含非最新项，改 text 会刷新
 * updated_at）也触发刷新。
 */
export function momentsFingerprint(count: number, latestUpdatedAt: string | undefined): string {
  return fingerprintOf([count, latestUpdatedAt])
}

// ---------------------------------------------------------------------------
// 编排：指纹缓存 + 每段降级
// ---------------------------------------------------------------------------

export type SnapshotSource = {
  /** 段唯一键（缓存 key）。 */
  key: string
  /** 轻量指纹（数据更新判断，如 count+最新 updatedAt）。 */
  fingerprint: () => Promise<string>
  /** 全量查询 + 段文本（指纹变化时才被调用）。 */
  load: () => Promise<string>
  /** 组装用的段头（load 返回为 '' 时该段整段跳过）。 */
  section: (text: string) => string
}

export type SnapshotCache = Map<string, { fp: string; text: string }>

/**
 * 组装完整 L3 快照文本（含 [当前时间] 段）。
 * 指纹命中（数据未变）→ 复用缓存段文本；未命中 → load() 后缓存。
 * 某段 load 抛错 → 跳过该段并记录日志（不阻断）；cache 可注入（单测用
 * 空 Map，生产用模块级单例 shareSnapshotCache）。
 */
export async function buildDynamicSnapshot(
  now: Date,
  sources: SnapshotSource[],
  cache: SnapshotCache,
): Promise<string> {
  const sections: string[] = [formatSnapshotTime(now)]
  for (const src of sources) {
    try {
      const fp = await src.fingerprint()
      const cached = cache.get(src.key)
      if (cached && cached.fp === fp) {
        if (cached.text) sections.push(src.section(cached.text))
        continue
      }
      const text = await src.load()
      cache.set(src.key, { fp, text })
      if (text) sections.push(src.section(text))
    } catch (err) {
      logger.warn({ err, key: src.key }, 'AI 动态快照段查询失败，已跳过该段')
    }
  }
  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// 真实数据源（复用现有 service 查询，集成测试覆盖）
// ---------------------------------------------------------------------------

/** 进程级单例缓存（数据未变时跳过 DB 全量查询）。 */
export const shareSnapshotCache: SnapshotCache = new Map()

/**
 * 四段真实数据源：任务（未完成 8 条 + 全部任务组）/ 日程（今天+3 天 ≤6 条，
 * 用从/至 ISO 起止窗口）/ 闪念（最新 3 条）/ 习惯（近 7 天 overview stats）。
 * 指纹均为轻量查询（条数 + 最新 updatedAt [+ 窗口日期]），避免每次全量 load。
 */
export function createDefaultSources(now: Date): SnapshotSource[] {
  const toIso = (d: Date) => d.toISOString()

  const tasksSource: SnapshotSource = {
    key: 'tasks',
    fingerprint: async () => {
      const stats = await taskService.snapshotStats()
      return tasksFingerprint(now, stats.count, stats.updatedAt?.toISOString())
    },
    load: async () => {
      const [page, groups] = await Promise.all([
        taskService.listTasks({ page: 1, pageSize: SNAPSHOT_QUOTAS.maxTasks, status: 'todo' }),
        taskService.listTaskGroups({ page: 1, pageSize: 50 }),
      ])
      return summarizeTasks(page.items, groups.items, now)
    },
    section: (text) => text,
  }

  const windowStart = new Date(now)
  windowStart.setHours(0, 0, 0, 0)
  const windowEnd = new Date(
    `${addDaysLocal(formatLocalDate(now), SNAPSHOT_QUOTAS.eventWindowDays)}T23:59:59`,
  )
  const eventsSource: SnapshotSource = {
    key: 'events',
    fingerprint: async () => {
      const stats = await eventService.snapshotStats()
      return eventsFingerprint(now, stats.count, stats.updatedAt?.toISOString())
    },
    load: async () => {
      const list = await eventService.list({ from: toIso(windowStart), to: toIso(windowEnd) })
      return summarizeEvents(list, now)
    },
    section: (text) => text,
  }

  const momentsSource: SnapshotSource = {
    key: 'moments',
    fingerprint: async () => {
      const stats = await momentService.snapshotStats()
      return momentsFingerprint(stats.count, stats.updatedAt?.toISOString())
    },
    load: async () => {
      const page = await momentService.list({ page: 1, pageSize: SNAPSHOT_QUOTAS.maxMoments })
      return summarizeMoments(page.items)
    },
    section: (text) => text,
  }

  const habitsSource: SnapshotSource = {
    key: 'habits',
    fingerprint: async () => {
      const [stats, latestDaily] = await Promise.all([
        habitService.snapshotStats(),
        habitService.latestDailyUpdatedAt(),
      ])
      return habitsFingerprint(
        now,
        stats.count,
        stats.updatedAt?.toISOString(),
        latestDaily?.toISOString(),
      )
    },
    load: async () => {
      const overview = await habitService.overview({ days: SNAPSHOT_QUOTAS.habitOverviewDays })
      const stats = overview.stats.map((s) => ({
        name: s.name,
        kind: s.kind,
        countable: s.countable,
        doneDays: s.doneDays,
        totalCount: s.totalCount,
        days: overview.days,
      }))
      return summarizeHabits(stats)
    },
    section: (text) => text,
  }

  return [tasksSource, eventsSource, momentsSource, habitsSource]
}
