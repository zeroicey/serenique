import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
import { useBlobAccessUrls } from '@/features/blob/access'
import type { MomentAttachmentEntry } from '@/features/moment/api'
import type { MediaFile } from '@/types/media'

interface MomentAttachmentGridProps {
  attachments: MomentAttachmentEntry[]
}

const PREVIEW_COUNT = 8

// 附件 3 列网格：>9 折叠显示前 8 张 + "更多" 瓦片；点击进入全屏预览。
export function MomentAttachmentGrid({ attachments }: MomentAttachmentGridProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  // 原图签名链接（灯箱全屏预览用）。
  const blobIds = attachments.map((a) => a.blob.id)
  const { data: accessUrls } = useBlobAccessUrls(blobIds)

  // 图片缩略图链接（网格瓦片用，避免网格直接拉原图导致滚动卡顿）；视频/音频无缩略图。
  const imageBlobIds = attachments
    .filter((a) => a.blob.mimeType.startsWith('image/'))
    .map((a) => a.blob.id)
  const { data: thumbUrls } = useBlobAccessUrls(imageBlobIds, 'thumb')

  const sorted = [...attachments].sort((a, b) => a.sortOrder - b.sortOrder)
  const needsExpand = sorted.length > PREVIEW_COUNT + 1
  const display = needsExpand && !expanded ? sorted.slice(0, PREVIEW_COUNT) : sorted

  const mediaFiles: MediaFile[] = sorted.map((a) => ({
    id: a.id,
    name: a.displayName ?? a.blob.originalName,
    type: a.blob.mimeType,
    url: accessUrls?.[a.blob.id] ?? a.blob.fileUrl,
  }))

  if (sorted.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {display.map((a, i) => (
          <div
            key={a.id}
            className="aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted"
            onClick={() => setPreviewIndex(i)}
          >
            <AttachmentTile
              attachment={a}
              src={thumbUrls?.[a.blob.id] ?? accessUrls?.[a.blob.id] ?? a.blob.fileUrl}
              fallbackSrc={accessUrls?.[a.blob.id] ?? a.blob.fileUrl}
            />
          </div>
        ))}
        {needsExpand && !expanded && (
          <div
            className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg bg-muted hover:bg-accent"
            onClick={() => setExpanded(true)}
          >
            <MoreHorizontal className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              +{sorted.length - PREVIEW_COUNT} 更多
            </span>
          </div>
        )}
      </div>

      <MediaPreviewDialog
        open={previewIndex !== null}
        mediaFiles={mediaFiles}
        currentIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />
    </>
  )
}

interface AttachmentTileProps {
  attachment: MomentAttachmentEntry
  /** 图片缩略图直链（可能缺失：R2 存量图无缩略图对象）。 */
  src: string
  /** 缩略图缺失/失败时的回退原图直链。 */
  fallbackSrc: string
}

function AttachmentTile({ attachment, src, fallbackSrc }: AttachmentTileProps) {
  const { blob } = attachment
  const isVideo = blob.mimeType.startsWith('video/')
  if (blob.mimeType.startsWith('image/')) {
    return <ImageTileWithFallback src={src} fallbackSrc={fallbackSrc} alt={blob.originalName} />
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {isVideo ? '▶' : '📎'}
    </div>
  )
}

/** 缩略图加载失败（404/解码错）→ 回退原图直链，保证网格瓦片始终可见。 */
function ImageTileWithFallback({
  src,
  fallbackSrc,
  alt,
}: {
  src: string
  fallbackSrc: string
  alt: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <img
      src={failed ? fallbackSrc : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  )
}
