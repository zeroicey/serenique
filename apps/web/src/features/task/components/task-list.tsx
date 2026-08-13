import { Skeleton } from '@/components/ui/skeleton'
import { sortTasks } from '@/features/task/lib'
import { useTasks } from '@/features/task/queries'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskItem } from './task-item'
import { TaskCreateInput } from './task-create-input'

interface TaskListProps {
  group: TaskGroupEntry | null
}

// 任务列表 + 底部新增输入框。无外框卡片（对齐 moment 列表风格），任务组名由顶栏
// 下拉（TaskGroupSwitcher）展示，此处不再重复。
export function TaskList({ group }: TaskListProps) {
  const { data: tasks, isPending } = useTasks(group?.id ?? null)

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">请先创建一个任务组。</p>
      </div>
    )
  }

  const sorted = sortTasks(tasks ?? [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {isPending ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-muted-foreground">暂无任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      <TaskCreateInput groupId={group.id} />
    </div>
  )
}
