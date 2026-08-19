import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shiftDate } from '@/features/habit/lib'
import { todayLocal } from '@/lib/date'

interface HabitDateNavProps {
  viewedDate: string
  onDateChange: (date: string) => void
}

// 今天页日期栏（页面内顶部操作行）：日期选择 + 前一天/后一天/今天（可翻到前几天补记）。
// 原顶栏 headerRight 已随顶部导航栏移除，日期状态由所属页面 useState 持有并注入。
export function HabitDateNav({ viewedDate, onDateChange }: HabitDateNavProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="前一天"
        onClick={() => onDateChange(shiftDate(viewedDate, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Input
        type="date"
        value={viewedDate}
        onChange={(e) => e.target.value && onDateChange(e.target.value)}
        className="h-7 w-[9.5rem] text-sm"
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="后一天"
        onClick={() => onDateChange(shiftDate(viewedDate, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onDateChange(todayLocal())}
      >
        今天
      </Button>
    </div>
  )
}
