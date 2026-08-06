import { useState } from 'react'
import { useTaskGroups } from '@/features/task/queries'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskGroupPanel } from '@/features/task/components/task-group-panel'
import { TaskGroupChips } from '@/features/task/components/task-group-chips'
import { TaskList } from '@/features/task/components/task-list'

// 任务页：左侧任务组面板（桌面）+ 右侧任务列表；移动端用 chips 选择任务组。
// 选中态保存在页面本地；任务组被删后自动回退到第一个。
export default function TaskPage() {
  const { data: groups, isPending } = useTaskGroups()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const selectedGroup: TaskGroupEntry | null =
    groups?.find((g) => g.id === selectedGroupId) ?? groups?.[0] ?? null

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[960px] gap-2 p-2">
        <div className="hidden w-[220px] shrink-0 sm:flex">
          <TaskGroupPanel
            isPending={isPending}
            groups={groups ?? []}
            selectedGroupId={selectedGroup?.id ?? null}
            onSelect={setSelectedGroupId}
          />
        </div>
        <div className="flex w-full flex-col gap-2">
          <TaskGroupChips
            isPending={isPending}
            groups={groups ?? []}
            selectedGroupId={selectedGroup?.id ?? null}
            onSelect={setSelectedGroupId}
          />
          <TaskList group={selectedGroup} />
        </div>
      </div>
    </div>
  )
}
