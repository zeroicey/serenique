import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAiStore } from '@/features/ai/store/ai-store'
import { MessageList } from './message-list'
import { Composer } from './composer'

// 聊天主区：消息流 + 输入框。错误（error 事件/连接失败）走 sonner toast，
// 与项目 mutation 失败统一 toast.error 的惯例一致（Toaster 已在 providers 挂载）。
export function ChatArea() {
  const lastError = useAiStore((s) => s.lastError)

  useEffect(() => {
    if (lastError) toast.error(lastError)
  }, [lastError])

  return (
    // 上下两区：上方消息流滚动（flex-1 + min-h-0 + overflow-y-auto），下方输入区固定。
    // 根元素 h-full 撑满 AppLayout 的 main（flex-1 定高），整页不滚动。
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <MessageList />
      <Composer />
    </div>
  )
}
