import { create } from 'zustand'
import type { EventEntry } from '@/features/event/api'
import { todayLocal } from '@/lib/date'

// 事件 feature 的 UI 会话状态（仅 UI 态；服务端数据不走 zustand，见前端架构硬约束）。
// viewedDate 供顶栏「新建日历」与页面共用：新建弹窗默认值取当前查看日期。

interface EventUIState {
  /** 当前查看日期（YYYY-MM-DD，本地时区）；新建弹窗默认日期来源。 */
  viewedDate: string
  setViewedDate: (date: string) => void
  createOpen: boolean
  editingEvent: EventEntry | null
  openCreate: () => void
  openEdit: (event: EventEntry) => void
  close: () => void
}

export const useEventUIStore = create<EventUIState>((set) => ({
  viewedDate: todayLocal(),
  setViewedDate: (date) => set({ viewedDate: date }),
  createOpen: false,
  editingEvent: null,
  openCreate: () => set({ createOpen: true, editingEvent: null }),
  openEdit: (event) => set({ editingEvent: event, createOpen: true }),
  close: () => set({ createOpen: false, editingEvent: null }),
}))
