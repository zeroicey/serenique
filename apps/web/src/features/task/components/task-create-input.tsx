import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateTask } from '@/features/task/queries'

interface TaskCreateInputProps {
  groupId: string
}

// 任务列表底部内联新增：输入 + 回车 / 按钮提交。
export function TaskCreateInput({ groupId }: TaskCreateInputProps) {
  const { mutate: createTask, isPending } = useCreateTask()
  const [title, setTitle] = useState('')
  const trimmed = title.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = () => {
    if (!trimmed) return
    createTask({ title: trimmed, groupId })
    setTitle('')
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
        placeholder="输入任务，回车添加"
        aria-label="任务内容"
      />
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="shrink-0 cursor-pointer"
        aria-label="添加任务"
      >
        <Plus />
        添加
      </Button>
    </div>
  )
}
