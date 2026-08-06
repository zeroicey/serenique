import type { TaskEntry, TaskStatus } from './api'

// 任务纯函数：状态标签 + 列表排序。无 DOM / 无 IO，可毫秒级单测。

/** 任务状态 → 中文标签（对齐 CLI 的 taskStatusLabel）。 */
export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'done':
      return '已完成'
    case 'abandon':
      return '已放弃'
    default:
      return '待办'
  }
}

/** 列表排序：待办在前，已完成次之，已放弃最后（稳定排序，同状态保持原顺序）。 */
export function sortTasks(items: TaskEntry[]): TaskEntry[] {
  const rank: Record<TaskStatus, number> = { todo: 0, done: 1, abandon: 2 }
  return [...items].sort((a, b) => rank[a.status] - rank[b.status])
}
