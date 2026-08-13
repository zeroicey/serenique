import { create } from 'zustand'

// 任务 feature 的 UI 会话状态：仅存当前选中的任务组 id。
// 服务端数据（任务组列表 / 任务列表）一律走 TanStack Query，不进本 store（前端架构硬约束）。

interface TaskUIState {
  /** 当前选中的任务组 id；null = 未显式选择（页面回退到第一个任务组）。 */
  selectedGroupId: string | null
  setSelectedGroupId: (id: string | null) => void
}

export const useTaskStore = create<TaskUIState>((set) => ({
  selectedGroupId: null,
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),
}))
