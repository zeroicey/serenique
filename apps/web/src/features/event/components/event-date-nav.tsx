import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shiftDate } from '@/features/event/lib'
import { todayLocal } from '@/lib/date'
import { useEventUIStore } from '@/stores/event-ui'

// 单日视图日期栏（过滤表单）：日期选择 + 前一天/今天/后一天。
export function EventDateNav() {
  const { viewedDate, setViewedDate } = useEventUIStore()
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
