import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shiftDate } from '@/features/habit/lib'
import { todayLocal } from '@/lib/date'
import { useHabitUIStore } from '@/stores/habit-ui'

// 今天页日期栏（置于顶栏 header 右侧槽）：日期选择 + 前一天/后一天/今天
// （可翻到前几天补记）。header 空间有限，按钮紧凑排布。
export function HabitDateNav() {
  const { viewedDate, setViewedDate } = useHabitUIStore()
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="前一天"
        onClick={() => setViewedDate(shiftDate(viewedDate, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Input
        type="date"
        value={viewedDate}
        onChange={(e) => e.target.value && setViewedDate(e.target.value)}
        className="h-7 w-[9.5rem] text-sm"
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="后一天"
        onClick={() => setViewedDate(shiftDate(viewedDate, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setViewedDate(todayLocal())}
      >
        今天
      </Button>
    </div>
  )
}
