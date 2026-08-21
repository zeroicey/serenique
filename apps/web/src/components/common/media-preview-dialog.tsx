import { AudioLines, FileText } from 'lucide-react'
import { useMemo } from 'react'
import Lightbox, { type Slide } from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import type { MediaFile } from '@/types/media'

// 声明自定义 slide 类型（音频/其他文件）：随包 module augmentation 进 Slide 联合类型。
declare module 'yet-another-react-lightbox' {
  interface SlideTypes {
    sereniqueFile: SereniqueFileSlide
  }
  interface SereniqueFileSlide {
    type: 'sereniqueFile'
    url: string
    name: string
    fileType: string
  }
}

interface MediaPreviewDialogProps {
  open: boolean
  mediaFiles: MediaFile[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

// 通用媒体全屏预览（灯箱）：图片 / 视频 / 音频 / 其他文件，支持前后切换。
// 基于成熟组件库 yet-another-react-lightbox（React 19 兼容，天然全屏无外框、
// 支持缩放/触屏滑动），图片与视频原生渲染，音频/其他文件走自定义 slide。
// 无业务逻辑，供各 feature 复用。
export function MediaPreviewDialog({
  open,
  mediaFiles,
  currentIndex,
  onClose,
  onNavigate,
}: MediaPreviewDialogProps) {
  const slides = useMemo<Slide[]>(
    () =>
      mediaFiles.map((f) => {
        if (f.type.startsWith('video/')) {
          return {
            type: 'video',
            sources: [{ src: f.url, type: f.type }],
            // 不自动播放：jsdom 下 HTMLMediaElement.play() 是同步 stub（无 Promise），
            // 库会直接 .catch 崩溃；真实浏览器中带声音自动播放也会被拦，交给用户点播放。
            autoPlay: false,
            controls: true,
            playsInline: true,
          }
        }
        if (f.type.startsWith('image/')) {
          return { type: 'image', src: f.url, alt: f.name }
        }
        return { type: 'sereniqueFile', url: f.url, name: f.name, fileType: f.type }
      }),
    [mediaFiles],
  )

  return (
    <Lightbox
      open={open}
      slides={slides}
      index={Math.max(0, Math.min(currentIndex, slides.length - 1))}
      close={onClose}
      plugins={[Counter, Video, Zoom]}
      // 视图切换（滚轮/滑动/点箭头）时同步父级索引，重开时停留在原位置。
      // finite: 不循环——首张时上一张禁用、末张时下一张禁用（循环会让边界按钮恒可点）。
      carousel={{ finite: true }}
      on={{ view: ({ index }) => onNavigate(index) }}
      labels={{ Previous: '上一张', Next: '下一张', Close: '关闭' }}
      counter={{ separator: ' / ' }}
      render={{
        // 自定义 slide：音频 / 其他文件（图片与视频由库原生渲染，此处返回 undefined）。
        slide: ({ slide }) => {
          if (slide.type === 'sereniqueFile') {
            return slide.fileType.startsWith('audio/') ? (
              <div className="flex flex-col items-center gap-4">
                <AudioLines className="h-14 w-14 text-white" />
                <audio src={slide.url} controls autoPlay className="w-full max-w-md" />
                <span className="max-w-full truncate text-sm text-white">{slide.name}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-14 w-14 text-white" />
                <span className="max-w-full truncate text-sm text-white">{slide.name}</span>
              </div>
            )
          }
          return undefined
        },
      }}
    />
  )
}
