import { useEffect } from 'react'
import { SessionSidebar } from '@/features/ai/components/session-sidebar'
import { ChatArea } from '@/features/ai/components/chat-area'
import { useAiStore } from '@/features/ai/store/ai-store'

// 宁序 AI 助手页：左侧会话栏 + 右侧聊天主区。
// 挂载即建立 WS 连接（幂等：store 内非 offline 状态不会重复建连）。
export default function AiPage() {
  useEffect(() => {
    useAiStore.getState().connect()
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <SessionSidebar />
      <ChatArea />
    </div>
  )
}
