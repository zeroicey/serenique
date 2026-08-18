import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAiMemory, useUpdateAiMemory } from '../queries'

// 用户画像（AI 记忆 L2）：用户自维护的自我介绍/偏好，每次对话注入给宁序。
// GET 回填；保存走 PUT upsert。超限（>2048）禁用保存并红色提示（防御，maxLength 已拦）。

const MAX_LEN = 2048

export function AiMemorySection() {
  const { data, isPending, isError, refetch } = useAiMemory()
  const updateMemory = useUpdateAiMemory()
  const [value, setValue] = useState('')

  // 画像加载完成（含保存后 query 失效回填）写入编辑态。
  useEffect(() => {
    if (data) setValue(data.content ?? '')
  }, [data])

  if (isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">加载用户画像中…</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-sm text-muted-foreground">加载用户画像失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const len = value.length
  const overLimit = len > MAX_LEN

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ai-memory">用户画像</Label>
        <Textarea
          id="ai-memory"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="介绍你自己：你是谁、你的偏好、你在意的事…"
          maxLength={MAX_LEN}
          className="min-h-40"
        />
        <p
          className={cn(
            'text-right text-xs tabular-nums',
            overLimit ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {len}/{MAX_LEN}
        </p>
        <p className="text-xs text-muted-foreground">
          这段自我介绍会随每次对话注入给宁序：你是谁、你的偏好，以及你在意的事。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => updateMemory.mutate(value)}
          disabled={updateMemory.isPending || overLimit}
        >
          {updateMemory.isPending ? '保存中…' : '保存'}
        </Button>
        {updateMemory.isPending && <span className="text-xs text-muted-foreground">正在保存…</span>}
      </div>
    </div>
  )
}
