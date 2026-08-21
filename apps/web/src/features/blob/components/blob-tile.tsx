import { AudioLines, File, FileText, Play, Trash2, Video } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BlobEntry } from '@/features/blob/api'

// 素材库网格卡片：图片显示缩略图直链（浏览器上传时 canvas 生成 512px WebP；避免
// 滚动时直接拉原图卡顿）；视频显示 ▶ 可播放瓦片（点击进灯箱播放原视频）；音频/其他
// 类型显示图标 + 文件名 + 大小。hover 时浮现「在用」徽标与删除按钮。

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('video/')) return <Video className="h-8 w-8" />
  if (mimeType.startsWith('audio/')) return <AudioLines className="h-8 w-8" />
  if (mimeType.startsWith('text/')) return <FileText className="h-8 w-8" />
  return <File className="h-8 w-8" />
}

interface BlobTileProps {
  blob: BlobEntry
  /** 图片缩略图直链 / 视频音频原图直链；未申请到 / 非可预览类型时为 undefined。 */
  src?: string
  /** 缩略图缺失/失败时的回退原图直链（R2 存量图无缩略图对象时 404 → 回退原图）。 */
  fallbackSrc?: string
  onClick: () => void
  onDelete: () => void
}

export function BlobTile({ blob, src, fallbackSrc, onClick, onDelete }: BlobTileProps) {
  const isImage = blob.mimeType.startsWith('image/')
  const isVideo = blob.mimeType.startsWith('video/')
  // 缩略图加载失败（如 R2 存量图还没有缩略图对象）→ 切换到原图直链，保证瓦片可见。
  const [thumbFailed, setThumbFailed] = useState(false)
  const imageSrc = thumbFailed && fallbackSrc ? fallbackSrc : src

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-muted"
    >
      {isImage ? (
        imageSrc ? (
          <img
            src={imageSrc}
            alt={blob.originalName}
            loading="lazy"
            decoding="async"
            onError={fallbackSrc ? () => setThumbFailed(true) : undefined}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground" />
        )
      ) : isVideo ? (
        // 视频瓦片：无缩略图，居中显示 ▶ 播放标记，点击进灯箱播放原视频。
        <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white shadow-lg">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </div>
          <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate px-1 text-[11px] text-foreground/80 drop-shadow">
            {blob.originalName}
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <FileIcon mimeType={blob.mimeType} />
          <span className="line-clamp-2 break-all px-1 text-[11px] leading-tight text-foreground">
            {blob.originalName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatBytes(blob.size)} · {blob.mimeType.split('/').pop()}
          </span>
        </div>
      )}

      {/* hover 操作区 */}
      <div className="absolute inset-0 flex flex-col justify-between bg-black/0 p-1.5 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
        <div className="flex items-start justify-between">
          {blob.refCount > 0 ? (
            <Badge variant="secondary" className="bg-background/90 text-xs">
              在用 · {blob.refCount}
            </Badge>
          ) : (
            <span />
          )}
          <Button
            variant="destructive"
            size="icon"
            className="h-7 w-7"
            aria-label="删除"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {(isImage || isVideo) && (
          <span className="truncate text-xs text-white drop-shadow">{blob.originalName}</span>
        )}
      </div>
    </div>
  )
}
