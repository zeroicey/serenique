import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shiftDate } from '@/features/habit/lib'
import { todayLocal } from '@/lib/date'
import { useHabitUIStore } from '@/stores/habit-ui'

// 今天页日期栏：日期选择 + 前一天/后一天/今天（可翻到前几天补记）。
export function HabitDateNav() {
  const { viewedDate, setViewedDate } = useHabitUIStore()
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="前一天"
        onClick={() => setViewedDate(shiftDate(viewedDate, -1))}
      >
        <ChevronLeft />
      </Button>
      <Input
        type="date"
        value={viewedDate}
        onChange={(e) => e.target.value && setViewedDate(e.target.value)}
        className="w-fit"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label="后一天"
        onClick={() => setViewedDate(shiftDate(viewedDate, 1))}
      >
        <ChevronRight />
      </Button>
      <Button variant="secondary" onClick={() => setViewedDate(todayLocal())}>
        今天
      </Button>
    </div>
  )
}
