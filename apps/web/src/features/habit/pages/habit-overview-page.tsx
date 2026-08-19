import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { HabitFormDialog } from '@/features/habit/components/habit-form-dialog'
import { HabitOverview } from '@/features/habit/components/habit-overview'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
]

// 总览页：返回今天页 + 窗口切换（7/30/90）+ 新建习惯 + 频率统计 + 按天流水。
// 顶部导航栏已移除（2026-08-20）：原顶栏 HabitNav 的「返回/新建」下沉到本页；
// 仅新建弹窗开关由本页 useState 持有（总览页无行编辑入口，原 habit-ui store 已删除）。
export default function HabitOverviewPage() {
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [createOpen, setCreateOpen] = useState(false)

  const openCreate = () => setCreateOpen(true)
  const close = () => setCreateOpen(false)

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/habit')}>
            <ArrowLeft />
            今天
          </Button>
          <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={openCreate}>
            <Plus />
            新建习惯
          </Button>
        </div>
        <HabitOverview days={days} />
      </div>
      <HabitFormDialog open={createOpen} editing={null} onClose={close} />
    </div>
  )
}
