import { Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
import type { MediaFile } from '@/types/media'

interface MomentCreateAttachmentGridProps {
  mediaFiles: MediaFile[]
  onChange: (files: MediaFile[]) => void
}

const ACCEPT = 'image/*,video/*,audio/*'

// 新建页附件选择：多选 + 本地预览 + 移除 + 预览切换。
export function MomentCreateAttachmentGrid({
  mediaFiles,
  onChange,
}: MomentCreateAttachmentGridProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const next = [...mediaFiles]
    Array.from(files).forEach((file) => {
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        file,
      })
    })
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleRemove = (index: number) => {
    URL.revokeObjectURL(mediaFiles[index].url)
    onChange(mediaFiles.filter((_, i) => i !== index))
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <div className="grid grid-cols-3 gap-1">
        {mediaFiles.map((file, i) => (
          <div
            key={file.id}
            className="group relative aspect-square cursor-pointer overflow-hidden border"
            onClick={() => setPreviewIndex(i)}
          >
            <Thumb file={file} />
            <div
              className="absolute right-1 top-1 rounded-full bg-red-500 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(i)
              }}
            >
              <X className="h-3 w-3 text-white" />
            </div>
          </div>
        ))}
        <div
          className="flex aspect-square cursor-pointer flex-col items-center justify-center border-2 border-dashed text-muted-foreground hover:border-gray-400"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mb-1 h-6 w-6" />
          <span className="text-xs">添加媒体</span>
        </div>
      </div>

      <MediaPreviewDialog
        open={previewIndex !== null}
        mediaFiles={mediaFiles}
        currentIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />
    </div>
  )
}

function Thumb({ file }: { file: MediaFile }) {
  if (file.type.startsWith('image/')) {
    return <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
  }
  if (file.type.startsWith('video/')) {
    return <video src={file.url} className="h-full w-full object-cover" muted />
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-muted p-2 text-muted-foreground">
      <span className="text-2xl">🎵</span>
      <span className="w-full truncate text-xs">{file.name}</span>
    </div>
  )
}
