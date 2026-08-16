import { Check, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { OverviewRecord } from '@/features/habit/api'
import {
  monthDayLabel,
  overviewDayList,
  sortStats,
  statText,
  weekdayLabel,
} from '@/features/habit/lib'
import { useHabitOverview, useHabits } from '@/features/habit/queries'
import { cn } from '@/lib/utils'

interface HabitOverviewProps {
  /** 统计窗口（天），与 URL 查询或页面状态一致。 */
  days: number
}

// 总览页：频率统计（每习惯 doneDays/totalCount + 简单条形）+ 按天倒序流水。
export function HabitOverview({ days }: HabitOverviewProps) {
  const { data: overview, isLoading } = useHabitOverview(days)
  const { data: habits } = useHabits()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!overview) return null

  const habitOrder = new Map((habits ?? []).map((h) => [h.id, h.sortOrder]))
  const stats = sortStats(overview.stats, habitOrder)
  const daysList = overviewDayList(overview.byDate)

  return (
    <div className="flex flex-col gap-4">
      {/* 频率统计 */}
      {stats.length > 0 && (
        <section className="rounded-lg border bg-card p-3">
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
            近 {overview.days} 天频率
          </h2>
          <div className="flex flex-col gap-2.5">
            {stats.map((stat) => (
              <div key={stat.habitId} className="flex items-center gap-3 px-1">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    stat.kind === 'good' ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                />
                <span className="w-24 shrink-0 truncate text-sm">{stat.name}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  {stat.countable ? (
                    // 计数型：条形不适用，留空占位。
                    <span />
                  ) : (
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (stat.doneDays / overview.days) * 100)}%` }}
                    />
                  )}
                </div>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {statText(stat, overview.days)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 按天流水 */}
      {daysList.length > 0 ? (
        <section className="flex flex-col gap-3">
          {daysList.map(({ date, records }) => (
            <div key={date} className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className="tabular-nums">{monthDayLabel(date)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {weekdayLabel(date)}
                </span>
              </h3>
              <div className="flex flex-col divide-y divide-border">
                {records.map((record) => (
                  <HabitOverviewRow key={record.habitId} record={record} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          近 {overview.days} 天还没有任何记录。
        </p>
      )}
    </div>
  )
}

function HabitOverviewRow({ record }: { record: OverviewRecord }) {
  const state = record.status
  return (
    <div className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
      {record.countable ? (
        <span className="text-xs tabular-nums text-muted-foreground">×{record.count}</span>
      ) : (
        <span
          className={cn(
            'flex items-center gap-0.5 text-xs',
            state === 'done' && 'text-emerald-600 dark:text-emerald-400',
            state === 'not_done' && 'text-red-500 dark:text-red-400',
            state === null && 'text-muted-foreground',
          )}
        >
          {state === 'done' ? <Check size={13} /> : state === 'not_done' ? <X size={13} /> : '·'}
          {state === 'done' ? '做了' : state === 'not_done' ? '没做' : '未记录'}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{record.name}</span>
    </div>
  )
}
