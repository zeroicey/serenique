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
    <main className="flex min-w-0 flex-1 flex-col">
      <MessageList />
      <Composer />
    </main>
  )
}
