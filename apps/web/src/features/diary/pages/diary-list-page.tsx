import { DiaryTodayCard } from '@/features/diary/components/diary-today-card'
import { DiaryTimeline } from '@/features/diary/components/diary-timeline'

// 日记列表页：今天卡片 + 倒序时间线（居中 max-w-[600px]，对齐 moment）。
export default function DiaryListPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-6 px-2">
        <DiaryTodayCard />
        <DiaryTimeline />
      </div>
    </div>
  )
}
