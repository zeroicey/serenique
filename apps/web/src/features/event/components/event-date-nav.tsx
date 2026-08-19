import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shiftDate } from '@/features/event/lib'
import { todayLocal } from '@/lib/date'

interface EventDateNavProps {
  viewedDate: string
  onDateChange: (date: string) => void
}

// 单日视图日期栏（过滤表单）：日期选择 + 前一天/今天/后一天。
// 原顶栏 headerRight 已随顶部导航栏移除，日期状态由所属页面 useState 持有并注入。
export function EventDateNav({ viewedDate, onDateChange }: EventDateNavProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="前一天"
        onClick={() => onDateChange(shiftDate(viewedDate, -1))}
      >
        <ChevronLeft />
      </Button>
      <Input
        type="date"
        value={viewedDate}
        onChange={(e) => e.target.value && onDateChange(e.target.value)}
        className="w-fit"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label="后一天"
        onClick={() => onDateChange(shiftDate(viewedDate, 1))}
      >
        <ChevronRight />
      </Button>
      <Button variant="secondary" onClick={() => onDateChange(todayLocal())}>
        今天
      </Button>
    </div>
  )
}
