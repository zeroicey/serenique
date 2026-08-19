import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAiStore } from '@/features/ai/store/ai-store'
import { Composer } from './composer'
import { MessageList } from './message-list'

// 聊天主区：消息流 + 输入框。错误（error 事件/连接失败）走 sonner toast，
// 与项目 mutation 失败统一 toast.error 的惯例一致（Toaster 已在 providers 挂载）。
// 顶部导航栏已移除（2026-08-20）：原 AiNav 的在线状态点下沉到本组件右上角。
export function ChatArea() {
  const status = useAiStore((s) => s.status)
  const lastError = useAiStore((s) => s.lastError)

  useEffect(() => {
    if (lastError) toast.error(lastError)
  }, [lastError])

  const dot =
    status === 'online' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
  const label = status === 'online' ? '在线' : status === 'connecting' ? '连接中…' : '已断开'

  return (
    // 上下两区：上方消息流滚动（flex-1 + min-h-0 + overflow-y-auto），下方输入区固定。
    // 根元素 h-full 撑满 AppLayout 的 main（flex-1 定高），整页不滚动。
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
        <span aria-label={`AI ${label}`}>{label}</span>
      </div>
      <MessageList />
      <Composer />
    </div>
  )
}
