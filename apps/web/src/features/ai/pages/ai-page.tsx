import { useEffect } from 'react'
import { ChatArea } from '@/features/ai/components/chat-area'
import { useAiStore } from '@/features/ai/store/ai-store'

// 宁序 AI 助手页：全宽聊天主区。在线状态由 AiNav 呈现（router handle：nav = AiNav）；
// 单一对话流无会话切换 / headerRight。挂载即建立 WS 连接（幂等）。
export default function AiPage() {
  useEffect(() => {
    useAiStore.getState().connect()
  }, [])

  return <ChatArea />
}
