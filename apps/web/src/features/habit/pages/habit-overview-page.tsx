import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HabitFormDialog } from '@/features/habit/components/habit-form-dialog'
import { HabitOverview } from '@/features/habit/components/habit-overview'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
]

// 总览页：窗口切换（7/30/90）+ 频率统计 + 按天流水。
export default function HabitOverviewPage() {
  const [days, setDays] = useState(30)
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2">
        <div className="flex items-center justify-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              className={cn(days === r.days && 'bg-emerald-600 hover:bg-emerald-600/80')}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <HabitOverview days={days} />
      </div>
      <HabitFormDialog />
    </div>
  )
}
