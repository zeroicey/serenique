import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { MediaFile } from '@/types/media'

interface MediaPreviewDialogProps {
  open: boolean
  mediaFiles: MediaFile[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

// 通用媒体全屏预览：图片/视频/音频/其他，支持前后切换。无业务逻辑，供各 feature 复用。
export function MediaPreviewDialog({
  open,
  mediaFiles,
  currentIndex,
  onClose,
  onNavigate,
}: MediaPreviewDialogProps) {
  const file = mediaFiles[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < mediaFiles.length - 1

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl border-none bg-black/90">
        <div className="flex min-h-[50vh] w-full items-center justify-center">
          {file?.type.startsWith('image/') ? (
            <img
              src={file.url}
              alt={file.name}
              className="max-h-[70vh] max-w-full object-contain"
            />
          ) : file?.type.startsWith('video/') ? (
            <video src={file.url} controls autoPlay className="max-h-[70vh] max-w-full" />
          ) : file?.type.startsWith('audio/') ? (
            <audio src={file.url} controls autoPlay className="w-full max-w-md" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white">
              <FileText className="h-12 w-12" />
              <span className="text-sm">{file?.name ?? ''}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label="上一张"
            disabled={!hasPrev}
            onClick={() => onNavigate(currentIndex - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {mediaFiles.length > 0 ? `${currentIndex + 1} / ${mediaFiles.length}` : ''}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="下一张"
            disabled={!hasNext}
            onClick={() => onNavigate(currentIndex + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
