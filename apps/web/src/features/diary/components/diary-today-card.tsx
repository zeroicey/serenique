import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { todayUTC } from '@/lib/date'
import { useDiaryByDate } from '@/features/diary/queries'

// 今天卡片：loading（skeleton）→ 有今天 → 全量展示 + 编辑；无 → CTA「写今天的日记」。
// 当天日记不做展开/收起，有多少显示多少。
export function DiaryTodayCard() {
  const navigate = useNavigate()
  const today = todayUTC()
  const { isPending, data } = useDiaryByDate(today)

  if (isPending) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg border p-4">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-lg border p-4">
        <span className="text-lg font-medium">今天</span>
        <p className="text-muted-foreground">今天还没有写日记。</p>
        <Button className="w-fit cursor-pointer" onClick={() => navigate('/diary/write')}>
          写今天的日记
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-medium">今天</span>
        <Button
          variant="outline"
          className="cursor-pointer"
          onClick={() => navigate(`/diary/write?date=${today}`)}
        >
          编辑
        </Button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{data.content}</p>
    </div>
  )
}
