import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
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

  const sorted = [...attachments].sort((a, b) => a.sortOrder - b.sortOrder)
  const needsExpand = sorted.length > PREVIEW_COUNT + 1
  const display = needsExpand && !expanded ? sorted.slice(0, PREVIEW_COUNT) : sorted

  const mediaFiles: MediaFile[] = sorted.map((a) => ({
    id: a.id,
    name: a.displayName ?? a.blob.originalName,
    type: a.blob.mimeType,
    url: a.blob.fileUrl,
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
            <AttachmentTile attachment={a} />
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

function AttachmentTile({ attachment }: { attachment: MomentAttachmentEntry }) {
  const { blob } = attachment
  const isVideo = blob.mimeType.startsWith('video/')
  if (blob.mimeType.startsWith('image/')) {
    return (
      <img
        src={blob.fileUrl}
        alt={blob.originalName}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {isVideo ? '▶' : '📎'}
    </div>
  )
}
