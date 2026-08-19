import { Loader2, Search, Tag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useMoments } from '@/features/moment/queries'
import type { TagEntry } from '@/features/tag/api'
import { useTags } from '@/features/tag/queries'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { MomentItem } from './moment-item'
import { MomentQuickCreate } from './moment-quick-create'

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

// 标签筛选按钮：下拉单选标签（「全部标签」= 不筛选）。单值过滤，对齐后端 ?tag= 契约。
interface TagFilterProps {
  tags: TagEntry[]
  selectedTagId: string
  onSelect: (tagId: string) => void
}

function TagFilter({ tags, selectedTagId, onSelect }: TagFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="按标签筛选">
            <Tag className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-80 w-60">
        <DropdownMenuItem
          onClick={() => onSelect('')}
          className={selectedTagId ? '' : 'bg-primary/10'}
        >
          <span className="flex-1">全部标签</span>
        </DropdownMenuItem>
        {tags.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">还没有标签</div>
        )}
        {tags.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={t.id === selectedTagId ? 'bg-primary/10' : ''}
          >
            <span className="flex-1 truncate">#{t.name}</span>
            <span className="text-xs text-muted-foreground">{t.momentCount}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 闪记列表：外层固定置顶区（搜索行 + 标签筛选 + 内嵌快速新建）不参与滚动，
// 下方 flex-1 min-h-0 overflow-y-auto 独立滚动容器承载列表（局部滚动，替代 sticky）。
// 滚动自动加载、加载/空/错误态。
export function MomentList() {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const searchKeyword = debouncedKeyword.trim()

  const [searchParams, setSearchParams] = useSearchParams()
  const tagId = searchParams.get('tag') ?? ''
  const { data: tags } = useTags()
  const selectedTag = tags?.find((t) => t.id === tagId) ?? null

  const {
    isPending,
    isError,
    isFetching,
    refetch,
    data,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMoments(PAGE_SIZE, searchKeyword, tagId)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)

  const setTag = (id: string) => setSearchParams(id ? { tag: id } : {})

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        // 加 isFetching 兜底：关键词/标签切换时 keepPreviousData 占位会让旧数据的
        // hasNextPage 残留为 true，避免此时误触发下一页请求（新查询应从第 1 页重建）。
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetching) {
          void fetchNextPage()
        }
      },
      // root 绑定列表自身滚动容器（局部滚动，默认 viewport 不适用）；
      // listScrollRef 为 useRef，首渲染即稳定，无需进依赖数组。
      { root: listScrollRef.current, rootMargin: '200px' },
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
    <div className="w-full shrink-0">
      <div className="mx-auto w-full max-w-[600px] px-3 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <TagFilter tags={tags ?? []} selectedTagId={tagId} onSelect={setTag} />
          <div className="flex-1">
            <MomentSearchInput
              keyword={keyword}
              onKeywordChange={setKeyword}
              searching={searching}
              isFetching={isFetching}
            />
          </div>
        </div>
        {selectedTag && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs">
              #{selectedTag.name}
              <button
                type="button"
                aria-label="清除标签筛选"
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setTag('')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
            <span className="text-xs text-muted-foreground">仅显示该标签下的闪记</span>
          </div>
        )}
        <div className="mt-3">
          <MomentQuickCreate />
        </div>
      </div>
    </div>
  )

  if (isEmpty) {
    return (
      <div className="flex h-full w-full flex-col">
        {searchBox}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto text-center">
          {searching ? (
            <>
              <p className="text-4xl">🔍</p>
              <h3 className="text-lg font-medium">未找到匹配的闪记</h3>
              <p className="max-w-sm text-muted-foreground">
                换个关键词试试，支持中文、拼音或英文。
              </p>
            </>
          ) : tagId ? (
            <>
              <p className="text-4xl">🏷️</p>
              <h3 className="text-lg font-medium">该标签下暂无闪记</h3>
              <p className="max-w-sm text-muted-foreground">
                换个标签，或清除标签筛选看看全部闪记。
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl">🌱</p>
              <h3 className="text-lg font-medium">还没有闪记</h3>
              <p className="max-w-sm text-muted-foreground">在上方输入框记录此刻的心情。</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      {searchBox}
      <div
        ref={listScrollRef}
        className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto"
      >
        {moments.map((moment) => (
          <div key={moment.id} className="flex w-full max-w-[600px] flex-col items-center py-3">
            <MomentItem moment={moment} />
          </div>
        ))}
        {/* 滚动哨兵：必须保持非零尺寸 + shrink-0 —— 列表滚动容器内 flex 列溢出时
            flex-shrink 会把空哨兵压成 0×0（min-height:auto→0），零面积元素
            永远不会触发 IntersectionObserver（规格如此），导致滚动加载失效。 */}
        <div ref={sentinelRef} className="h-4 w-4 shrink-0" />
        {isFetchingNextPage && (
          <Loader2 className="my-4 h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
