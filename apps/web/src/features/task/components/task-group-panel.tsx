import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskGroupItem } from './task-group-item'
import { TaskGroupDialog } from './task-group-dialog'

interface TaskGroupPanelProps {
  isPending: boolean
  groups: TaskGroupEntry[]
  selectedGroupId: string | null
  onSelect: (id: string) => void
}

// 左侧任务组面板（桌面端）：标题栏 + 新建按钮 + 任务组列表。
export function TaskGroupPanel({
  isPending,
  groups,
  selectedGroupId,
  onSelect,
}: TaskGroupPanelProps) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium">任务组</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer"
          onClick={() => setCreateOpen(true)}
          aria-label="新建任务组"
        >
          <Plus />
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">还没有任务组</p>
      ) : (
        <div className="space-y-1">
          {groups.map((group) => (
            <TaskGroupItem
              key={group.id}
              group={group}
              selected={group.id === selectedGroupId}
              onSelect={() => onSelect(group.id)}
            />
          ))}
        </div>
      )}

      <TaskGroupDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
