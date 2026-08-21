import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBlobAccessUrls } from '@/features/blob/access'
import type { BlobEntry } from '@/features/blob/api'
import { BlobTile } from '@/features/blob/components/blob-tile'
import { DeleteBlobDialog } from '@/features/blob/components/delete-blob-dialog'
import { useBlobLibrary } from '@/features/blob/queries'
import type { MediaFile } from '@/types/media'

const PAGE_SIZE = 48

type BlobFilter = 'all' | 'image' | 'video' | 'audio'

// 类型筛选 → 后端 mimeType 前缀过滤。非音视频文件归入「全部」。
const FILTER_MIME: Record<BlobFilter, string | undefined> = {
  all: undefined,
  image: 'image/',
  video: 'video/',
  audio: 'audio/',
}

const FILTER_TABS: { key: BlobFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
]

// 素材库：查看对象存储中所有文件；图片可预览，其余显示元数据卡片；可删除（被引用时后端拒绝）。
export default function BlobLibraryPage() {
  const [filter, setFilter] = useState<BlobFilter>('all')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BlobEntry | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError } =
    useBlobLibrary({ pageSize: PAGE_SIZE, mimeType: FILTER_MIME[filter] })

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])

  // 图片/视频/音频都可预览（视频无缩略图，点击后进灯箱播放原视频）：全部申请签名直链。
  const previewItems = useMemo(
    () =>
      items.filter(
        (b) =>
          b.mimeType.startsWith('image/') ||
          b.mimeType.startsWith('video/') ||
          b.mimeType.startsWith('audio/'),
      ),
    [items],
  )
  // 原图直链（灯箱用）
  const { data: accessUrls } = useBlobAccessUrls(previewItems.map((b) => b.id))
  // 缩略图直链（网格瓦片用，仅图片；解决大图加载卡顿）
  const imageItems = useMemo(() => items.filter((b) => b.mimeType.startsWith('image/')), [items])
  const { data: thumbUrls } = useBlobAccessUrls(
    imageItems.map((b) => b.id),
    'thumb',
  )

  const mediaFiles: MediaFile[] = useMemo(
    () =>
      previewItems.map((b) => ({
        id: b.id,
        name: b.originalName,
        type: b.mimeType,
        url: accessUrls?.[b.id] ?? '',
      })),
    [previewItems, accessUrls],
  )

  const previewTargetIndex = (blob: BlobEntry) => previewItems.findIndex((b) => b.id === blob.id)

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-5xl flex-col gap-3 px-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">素材库</h1>
          <div className="flex items-center gap-1">
            {FILTER_TABS.map(({ key, label }) => (
              <Button
                key={key}
                variant={filter === key ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {isPending ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            素材加载失败，请刷新重试
          </p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            暂无文件。文件由闪记等模块上传产生，素材库仅用于查看与管理。
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((blob) => (
                <BlobTile
                  key={blob.id}
                  blob={blob}
                  src={
                    blob.mimeType.startsWith('image/')
                      ? thumbUrls?.[blob.id]
                      : accessUrls?.[blob.id]
                  }
                  onClick={() => {
                    // 签名直链未就绪时不打开灯箱（避免空 <img src> 抖动）
                    if (!previewItems.some((b) => b.id === blob.id)) return
                    const url =
                      accessUrls?.[blob.id] ||
                      (blob.mimeType.startsWith('image/') ? thumbUrls?.[blob.id] : undefined)
                    if (!url) return
                    const idx = previewTargetIndex(blob)
                    if (idx >= 0) setPreviewIndex(idx)
                  }}
                  onDelete={() => setDeleteTarget(blob)}
                />
              ))}
            </div>

            {hasNextPage && (
              <div className="flex justify-center pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                  加载更多
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <MediaPreviewDialog
        open={previewIndex !== null}
        mediaFiles={mediaFiles}
        currentIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />
      <DeleteBlobDialog blob={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
