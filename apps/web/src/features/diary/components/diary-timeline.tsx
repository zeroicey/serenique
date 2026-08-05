import { Loader2 } from 'lucide-react'
import { useDiaries } from '@/features/diary/queries'
import { Button } from '@/components/ui/button'
import { DiaryItem } from './diary-item'

// 日记时间线：倒序条目 + 空态/错态（重试）。
export function DiaryTimeline() {
  const { isPending, isError, refetch, data } = useDiaries()

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 py-12">
        <p className="text-muted-foreground">加载日记失败</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const diaries = data ?? []
  if (diaries.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-4xl">📖</p>
        <h3 className="text-lg font-medium">还没有日记</h3>
        <p className="max-w-sm text-muted-foreground">从今天开始，记录你的每一天。</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center">
      {diaries.map((diary) => (
        <div key={diary.id} className="flex w-full max-w-[600px] flex-col items-center">
          <DiaryItem diary={diary} />
          <div className="my-3 w-full border-b" />
        </div>
      ))}
    </div>
  )
}
