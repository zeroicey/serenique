import { useTaskGroups } from '@/features/task/queries'
import { useTaskStore } from '@/features/task/store/task-store'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskList } from '@/features/task/components/task-list'

// 任务页：任务组选择已移到全局顶栏右侧下拉（TaskGroupSwitcher，路由 handle.headerRight），
// 页面只渲染任务列表。选中态存 task-store（仅 id）；任务组被删后自动回退到第一个。
export default function TaskPage() {
  const { data: groups } = useTaskGroups()
  const selectedGroupId = useTaskStore((s) => s.selectedGroupId)

  const selectedGroup: TaskGroupEntry | null =
    groups?.find((g) => g.id === selectedGroupId) ?? groups?.[0] ?? null

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[960px] gap-2 p-2">
        <div className="flex w-full flex-col gap-2">
          <TaskList group={selectedGroup} />
        </div>
      </div>
    </div>
  )
}
