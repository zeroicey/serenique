import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useMoments } from '@/features/moment/queries'
import { Button } from '@/components/ui/button'
import { MomentItem } from './moment-item'

// 闪记列表：居中列、滚动自动加载、加载/空/错误态。
export function MomentList() {
  const { isPending, isError, refetch, data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useMoments()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">加载闪记失败</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const moments = data?.pages.flatMap((p) => p.items) ?? []
  const isEmpty = moments.length === 0

  if (isEmpty) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-4xl">🌱</p>
        <h3 className="text-lg font-medium">还没有闪记</h3>
        <p className="max-w-sm text-muted-foreground">点击右上角「新建闪记」，记录此刻的心情。</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center">
      {moments.map((moment) => (
        <div key={moment.id} className="flex w-full max-w-[600px] flex-col items-center">
          <MomentItem moment={moment} />
          <div className="my-3 w-full border-b" />
        </div>
      ))}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <Loader2 className="my-4 h-6 w-6 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
