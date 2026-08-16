import { HabitDateNav } from '@/features/habit/components/habit-date-nav'
import { HabitFormDialog } from '@/features/habit/components/habit-form-dialog'
import { HabitList } from '@/features/habit/components/habit-list'

// 今天页：日期栏（可翻到前几天补记）+ 习惯列表（做/没做 或 ±1 计数）。
export default function HabitPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2">
        <HabitDateNav />
        <HabitList />
      </div>
      <HabitFormDialog />
    </div>
  )
}
