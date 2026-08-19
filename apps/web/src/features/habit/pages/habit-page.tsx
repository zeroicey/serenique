import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import type { HabitEntry } from '@/features/habit/api'
import { HabitDateNav } from '@/features/habit/components/habit-date-nav'
import { HabitFormDialog } from '@/features/habit/components/habit-form-dialog'
import { HabitList } from '@/features/habit/components/habit-list'
import { todayLocal } from '@/lib/date'

// 今天页：页面顶部操作行（日期栏 + 总览入口 + 新建习惯）+ 习惯列表 + 新建/编辑弹窗。
// 顶部导航栏已移除（2026-08-20）：原顶栏 HabitNav / HabitDateNav 下沉到本页；
// viewedDate/createOpen/editingHabit 由本页 useState 持有（原 habit-ui store 已删除）。
export default function HabitPage() {
  const navigate = useNavigate()
  const [viewedDate, setViewedDate] = useState(todayLocal())
  const [createOpen, setCreateOpen] = useState(false)
  const [editingHabit, setEditingHabit] = useState<HabitEntry | null>(null)

  const openCreate = () => setCreateOpen(true)
  const openEdit = (habit: HabitEntry) => {
    setEditingHabit(habit)
    setCreateOpen(true)
  }
  const close = () => {
    setCreateOpen(false)
    setEditingHabit(null)
  }

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <HabitDateNav viewedDate={viewedDate} onDateChange={setViewedDate} />
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/habit/overview')}>
              总览
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus />
              新建习惯
            </Button>
          </div>
        </div>
        <HabitList viewedDate={viewedDate} openCreate={openCreate} onEdit={openEdit} />
      </div>
      <HabitFormDialog open={createOpen} editing={editingHabit} onClose={close} />
    </div>
  )
}
