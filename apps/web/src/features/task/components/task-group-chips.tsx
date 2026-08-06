import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { TaskGroupEntry } from '@/features/task/api'

interface TaskGroupChipsProps {
  isPending: boolean
  groups: TaskGroupEntry[]
  selectedGroupId: string | null
  onSelect: (id: string) => void
}

// 移动端任务组选择：横向滚动 chips 行（桌面端被左侧面板替代，sm:hidden）。
export function TaskGroupChips({
  isPending,
  groups,
  selectedGroupId,
  onSelect,
}: TaskGroupChipsProps) {
  if (isPending) {
    return (
      <div className="flex gap-1 sm:hidden">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    )
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 sm:hidden">
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onSelect(group.id)}
          className={cn(
            'shrink-0 cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors',
            group.id === selectedGroupId
              ? 'bg-primary text-primary-foreground'
              : 'bg-card hover:bg-accent',
          )}
        >
          {group.title}
        </button>
      ))}
    </div>
  )
}
