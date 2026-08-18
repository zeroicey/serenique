import { Plus, SquarePen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { TagEntry } from '@/features/tag/api'
import { useCreateTag, useDeleteTag, useRenameTag, useTags } from '@/features/tag/queries'

// 单个标签行：名称 + 使用数（点击跳转该标签下的闪记）+ 重命名 / 删除（二次确认）。
function TagRow({ tag }: { tag: TagEntry }) {
  const navigate = useNavigate()
  const { mutate: rename } = useRenameTag()
  const { mutate: remove } = useDeleteTag()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(tag.name)

  return (
    <div className="flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50">
      <button
        type="button"
        className="flex flex-1 cursor-pointer items-center gap-2 text-left"
        onClick={() => navigate(`/moment?tag=${tag.id}`)}
      >
        <span className="font-medium">#{tag.name}</span>
        <span className="text-xs text-muted-foreground">{tag.momentCount} 条闪记</span>
      </button>

      <Button
        variant="ghost"
        size="sm"
        aria-label={`重命名标签 ${tag.name}`}
        onClick={() => setRenameOpen(true)}
      >
        <SquarePen className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600"
        aria-label={`删除标签 ${tag.name}`}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名标签</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                rename({ id: tag.id, name }, { onSuccess: () => setRenameOpen(false) })
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() =>
                rename({ id: tag.id, name }, { onSuccess: () => setRenameOpen(false) })
              }
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除标签"
        description={`确定删除标签「${tag.name}」吗？删除后该标签从所有闪记移除，不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={() => remove(tag.id)}
      />
    </div>
  )
}

// 标签管理页：顶部新建输入（回车创建）+ 标签列表（增删改名、点名称进对应闪记列表）。
export default function TagPage() {
  const { data: tags } = useTags()
  const { mutate: create } = useCreateTag()
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    create(trimmed, { onSuccess: () => setName('') })
  }

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <div className="flex w-full max-w-[600px] flex-col gap-2 px-2">
        <div className="flex gap-2">
          <Input
            value={name}
            placeholder="新建标签（≤32 字）"
            maxLength={32}
            aria-label="新建标签"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <Button onClick={submit} disabled={!name.trim()}>
            <Plus />
            新建
          </Button>
        </div>

        <div className="flex flex-col gap-0.5">
          {tags && tags.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              还没有标签，新建一个来分类闪记吧
            </div>
          )}
          {tags?.map((t) => (
            <TagRow key={t.id} tag={t} />
          ))}
        </div>
      </div>
    </div>
  )
}
