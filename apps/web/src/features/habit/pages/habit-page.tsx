import { HabitFormDialog } from '@/features/habit/components/habit-form-dialog'
import { HabitList } from '@/features/habit/components/habit-list'

// 今天页：习惯列表（做/没做 或 ±1 计数）。日期导航在顶栏 header 右侧槽（router handle.headerRight）。
export default function HabitPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2">
        <HabitList />
      </div>
      <HabitFormDialog />
    </div>
  )
}
