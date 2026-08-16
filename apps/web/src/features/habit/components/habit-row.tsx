import { Check, Minus, MoreHorizontal, Plus, SquarePen, StickyNote, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { DailyStatus, HabitDailyEntry, HabitEntry } from '@/features/habit/api'
import { useClearDaily, useDeleteHabit, useSetDaily } from '@/features/habit/queries'
import { cn } from '@/lib/utils'
import { useHabitUIStore } from '@/stores/habit-ui'

interface HabitRowProps {
  habit: HabitEntry
  /** 当天该习惯的状态记录；undefined = 未记录。 */
  daily: HabitDailyEntry | undefined
  /** 当前查看日期（YYYY-MM-DD）。 */
  date: string
}

// 单行习惯：做没做型 → ✓做了 / ✗没做 三态；计数型 → ×N + ±1。
// 备注内联编辑（Enter 保存 / Esc 取消）；下拉菜单：编辑 / 删除。
// 高频点击（做/没做/±1）成功不弹 toast；备注与删除仍给反馈。
export function HabitRow({ habit, daily, date }: HabitRowProps) {
  const { mutate: setDaily } = useSetDaily()
  const { mutate: clearDaily } = useClearDaily()
  const { mutate: deleteHabit } = useDeleteHabit()
  const { openEdit } = useHabitUIStore()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  // 本地乐观状态：连续点击（±1 / 切换状态）时请求未返回前用本地值累加，
  // 避免每次点击都基于旧的 daily prop 计算。API 的 DailyEntry 不返回
  // updatedAt，本地值在请求成功（query invalidate 重挂/刷新）后自然让位。
  const [localStatus, setLocalStatus] = useState<DailyStatus | null>(null)
  const [localCount, setLocalCount] = useState<number | null>(null)

  const count = localCount ?? daily?.count ?? 0
  const status = localStatus ?? daily?.status ?? null
  const note = daily?.note ?? ''

  const setStatus = (next: DailyStatus) => {
    if (status === next) {
      setLocalStatus(null)
      clearDaily({ habitId: habit.id, date })
    } else {
      setLocalStatus(next)
      setDaily({ habitId: habit.id, date, status: next })
    }
  }

  const increment = () => {
    const next = count + 1
    setLocalCount(next)
    setDaily({ habitId: habit.id, date, count: next })
  }

  const decrement = () => {
    if (count <= 1) {
      setLocalCount(null)
      clearDaily({ habitId: habit.id, date })
    } else {
      const next = count - 1
      setLocalCount(next)
      setDaily({ habitId: habit.id, date, count: next })
    }
  }

  const openNoteEdit = () => {
    setNoteDraft(note)
    setEditingNote(true)
  }

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    setEditingNote(false)
    if (daily) {
      // 已有记录：带原状态 + 新备注一起 upsert（用本地乐观值，避免连续编辑时用旧值）。
      setDaily({
        habitId: habit.id,
        date,
        status: status ?? undefined,
        count: habit.countable ? count : undefined,
        note: trimmed || null,
      })
    } else if (trimmed) {
      // 无记录且备注非空：仅传 note（upsert 契约允许只带 note）。
      setDaily({ habitId: habit.id, date, note: trimmed })
    }
  }

  return (
    <>
      <div className="flex w-full items-center gap-3 px-3 py-3">
        <span
          aria-hidden
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            habit.kind === 'good' ? 'bg-emerald-500' : 'bg-red-500',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="break-words text-sm font-medium">{habit.name}</span>
            {habit.countable && <Badge variant="secondary">计数</Badge>}
          </div>
          {!editingNote && note && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p>
          )}
        </div>

        {habit.countable ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              aria-label="减少次数"
              disabled={count === 0}
              onClick={decrement}
            >
              <Minus />
            </Button>
            <span className="w-10 text-center text-sm tabular-nums text-muted-foreground">
              ×{count}
            </span>
            <Button size="sm" variant="outline" aria-label="增加次数" onClick={increment}>
              <Plus />
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant={status === 'done' ? 'default' : 'outline'}
              className={cn(status === 'done' && 'bg-emerald-600 hover:bg-emerald-600/80')}
              onClick={() => setStatus('done')}
            >
              <Check />
              做了
            </Button>
            <Button
              size="sm"
              variant={status === 'not_done' ? 'default' : 'outline'}
              className={cn(status === 'not_done' && 'bg-red-500 hover:bg-red-500/80')}
              onClick={() => setStatus('not_done')}
            >
              <X />
              没做
            </Button>
          </div>
        )}

        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="编辑备注"
          className="shrink-0"
          onClick={openNoteEdit}
        >
          <StickyNote />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="习惯操作"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          >
            <MoreHorizontal size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(habit)}>
              <SquarePen className="mr-2 h-4 w-4" />
              编辑习惯
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除习惯
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editingNote && (
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <Input
            aria-label="备注输入"
            placeholder="备注（可选，如：5km）"
            value={noteDraft}
            maxLength={500}
            autoFocus
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNote()
              if (e.key === 'Escape') setEditingNote(false)
            }}
          />
          <Button size="sm" aria-label="保存备注" onClick={saveNote}>
            <Check />
            保存
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="取消备注"
            onClick={() => setEditingNote(false)}
          >
            <X />
          </Button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除习惯</DialogTitle>
            <DialogDescription>
              确定删除「{habit.name}」吗？历史记录会一并删除，不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteHabit(habit.id)
                setDeleteOpen(false)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
