import { Plus, SquarePen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteTaskGroup, useTaskGroups } from '@/features/task/queries'
import { useTaskStore } from '@/features/task/store/task-store'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskGroupDialog } from './task-group-dialog'
import { TaskConfirmDialog } from './task-confirm-dialog'

// 任务组切换：全局顶栏右侧浮动下拉，外观/交互对齐 AI 会话切换器 SessionSwitcher。
// 触发按钮显示当前任务组名（未选中时回退第一个；无任务组显示占位）。面板含新建入口 +
// 任务组列表（当前项高亮），每项 hover 显示重命名 / 删除（删除走二次确认）。
// 选中态只存 task-store（id），任务组数据走 TanStack Query（useTaskGroups）。
export function TaskGroupSwitcher() {
  const { data: groups } = useTaskGroups()
  const selectedGroupId = useTaskStore((s) => s.selectedGroupId)
  const setSelectedGroupId = useTaskStore((s) => s.setSelectedGroupId)
  const { mutate: deleteTaskGroup } = useDeleteTaskGroup()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<TaskGroupEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaskGroupEntry | null>(null)

  const selectedGroup: TaskGroupEntry | null =
    groups?.find((g) => g.id === selectedGroupId) ?? groups?.[0] ?? null

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="max-w-48" />}
        >
          <span className="truncate">{selectedGroup?.title ?? '选择任务组'}</span>
          <span className="text-muted-foreground">▾</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-64">
          <DropdownMenuItem
            onClick={() => {
              setCreateOpen(true)
              setOpen(false)
            }}
          >
            <Plus className="h-4 w-4" />
            新建任务组
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {groups && groups.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              还没有任务组
            </div>
          )}
          {(groups ?? []).map((group) => (
            <div key={group.id} className="group relative flex items-center">
              <DropdownMenuItem
                className={`flex-1 pr-9 ${group.id === selectedGroup?.id ? 'bg-primary/10' : ''}`}
                onClick={() => {
                  if (group.id !== selectedGroup?.id) setSelectedGroupId(group.id)
                  setOpen(false)
                }}
              >
                <span className="truncate">{group.title}</span>
              </DropdownMenuItem>
              <button
                type="button"
                title="重命名任务组"
                aria-label={`重命名任务组 ${group.title}`}
                className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  setRenameTarget(group)
                  setOpen(false)
                }}
              >
                <SquarePen className="size-3.5" />
              </button>
              <button
                type="button"
                title="删除任务组"
                aria-label={`删除任务组 ${group.title}`}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget(group)
                  setOpen(false)
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskGroupDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      <TaskGroupDialog
        mode="rename"
        group={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null)
        }}
      />
      <TaskConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="删除任务组"
        description={
          deleteTarget
            ? `确定删除任务组「${deleteTarget.title}」吗？组内所有任务会一并删除，且不可恢复。`
            : ''
        }
        confirmText="删除"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteTaskGroup(deleteTarget.id)
        }}
      />
    </>
  )
}
