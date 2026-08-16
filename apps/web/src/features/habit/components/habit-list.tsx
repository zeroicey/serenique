import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dailyByHabit, sortHabits } from '@/features/habit/lib'
import { useHabitDaily, useHabits } from '@/features/habit/queries'
import { useHabitUIStore } from '@/stores/habit-ui'
import { HabitRow } from './habit-row'

// 今天页习惯列表：习惯选项（sortOrder 序）+ 当天每日状态 join 渲染。
// 空态给新建引导；加载态骨架。
export function HabitList() {
  const viewedDate = useHabitUIStore((s) => s.viewedDate)
  const openCreate = useHabitUIStore((s) => s.openCreate)
  const { data: habits, isLoading: habitsLoading } = useHabits()
  const { data: dailyList, isLoading: dailyLoading } = useHabitDaily(viewedDate)

  if (habitsLoading || dailyLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (!habits || habits.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          还没有习惯。新建几个想记录的事项，比如「跑步」「读书」「喝水」。
        </p>
        <Button onClick={openCreate}>
          <Plus />
          新建习惯
        </Button>
      </div>
    )
  }

  const dailyMap = dailyByHabit(dailyList ?? [])

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border bg-card">
      {[...habits].sort(sortHabits).map((habit) => (
        <HabitRow key={habit.id} habit={habit} daily={dailyMap.get(habit.id)} date={viewedDate} />
      ))}
    </div>
  )
}
