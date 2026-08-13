import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useMoments } from '@/features/moment/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { MomentItem } from './moment-item'

const PAGE_SIZE = 10

interface MomentSearchInputProps {
  keyword: string
  onKeywordChange: (value: string) => void
  searching: boolean
  isFetching: boolean
}

// 列表顶部搜索框：Search 图标（绝对定位）+ 有内容时清除按钮；搜索请求期间显示 spinner。
function MomentSearchInput({
  keyword,
  onKeywordChange,
  searching,
  isFetching,
}: MomentSearchInputProps) {
  const showSpinner = searching && isFetching
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-8 pr-8"
        placeholder="搜索闪记"
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        aria-label="搜索闪记"
      />
      {showSpinner ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : keyword ? (
        <button
          type="button"
          aria-label="清除搜索"
          onClick={() => onKeywordChange('')}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

// 闪记列表：居中列、顶部搜索框（300ms 防抖，服务端过滤）、滚动自动加载、加载/空/错误态。
export function MomentList() {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const searchKeyword = debouncedKeyword.trim()

  const {
    isPending,
    isError,
    isFetching,
    refetch,
    data,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMoments(PAGE_SIZE, searchKeyword)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        // 加 isFetching 兜底：关键词切换时 keepPreviousData 占位会让旧数据的
        // hasNextPage 残留为 true，避免此时误触发下一页请求（新关键词应从第 1 页重建）。
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetching) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isFetching, fetchNextPage])

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
  const searching = searchKeyword.length > 0

  const searchBox = (
    <div className="w-full max-w-[600px] px-3 pt-4 pb-4">
      <MomentSearchInput
        keyword={keyword}
        onKeywordChange={setKeyword}
        searching={searching}
        isFetching={isFetching}
      />
    </div>
  )

  if (isEmpty) {
    return (
      <div className="flex h-full w-full flex-col items-center">
        {searchBox}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          {searching ? (
            <>
              <p className="text-4xl">🔍</p>
              <h3 className="text-lg font-medium">未找到匹配的闪记</h3>
              <p className="max-w-sm text-muted-foreground">换个关键词试试，支持中文、拼音或英文。</p>
            </>
          ) : (
            <>
              <p className="text-4xl">🌱</p>
              <h3 className="text-lg font-medium">还没有闪记</h3>
              <p className="max-w-sm text-muted-foreground">点击右上角「新建闪记」，记录此刻的心情。</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center">
      {searchBox}
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
