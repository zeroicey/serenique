import { useState } from 'react'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskGroupSwitcher } from '@/features/task/components/task-group-switcher'
import { TaskList } from '@/features/task/components/task-list'
import { useTaskGroups } from '@/features/task/queries'

// 任务页：任务组切换器（原全局顶栏右侧下拉已下沉到页面内，2026-08-20）置顶显示，
// 下方渲染任务列表。选中态由本页 useState 持有（仅 id）；任务组被删后自动回退到第一个。
export default function TaskPage() {
  const { data: groups } = useTaskGroups()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const selectedGroup: TaskGroupEntry | null =
    groups?.find((g) => g.id === selectedGroupId) ?? groups?.[0] ?? null

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[960px] flex-col gap-2 p-2">
        <div className="flex justify-end">
          <TaskGroupSwitcher selectedGroupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />
        </div>
        <TaskList group={selectedGroup} />
      </div>
    </div>
  )
}
