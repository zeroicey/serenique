import { useEffect } from 'react'
import { ChatArea } from '@/features/ai/components/chat-area'
import { useAiStore } from '@/features/ai/store/ai-store'

// 宁序 AI 助手页：全宽聊天主区。在线状态由 ChatArea 右上角小指示呈现（原顶栏 AiNav 已随
// 顶部导航栏一并移除，2026-08-20）。挂载即建立 WS 连接（幂等）。
export default function AiPage() {
  useEffect(() => {
    useAiStore.getState().connect()
  }, [])

  return <ChatArea />
}
