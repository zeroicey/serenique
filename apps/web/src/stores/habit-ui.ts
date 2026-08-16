import { create } from 'zustand'
import type { HabitEntry } from '@/features/habit/api'
import { todayLocal } from '@/lib/date'

// 习惯 feature 的 UI 会话状态（仅 UI 态；服务端数据不走 zustand，见前端架构硬约束）。
// viewedDate 供今天页与新建弹窗共用；createOpen/editingHabit 驱动习惯选项管理弹窗。

interface HabitUIState {
  /** 当前查看日期（YYYY-MM-DD，本地时区）。 */
  viewedDate: string
  setViewedDate: (date: string) => void
  createOpen: boolean
  editingHabit: HabitEntry | null
  openCreate: () => void
  openEdit: (habit: HabitEntry) => void
  close: () => void
}

export const useHabitUIStore = create<HabitUIState>((set) => ({
  viewedDate: todayLocal(),
  setViewedDate: (date) => set({ viewedDate: date }),
  createOpen: false,
  editingHabit: null,
  openCreate: () => set({ createOpen: true, editingHabit: null }),
  openEdit: (habit) => set({ editingHabit: habit, createOpen: true }),
  close: () => set({ createOpen: false, editingHabit: null }),
}))
