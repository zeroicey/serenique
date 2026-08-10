import { useEffect } from 'react'
import { ChatArea } from '@/features/ai/components/chat-area'
import { useAiStore } from '@/features/ai/store/ai-store'

// 宁序 AI 助手页：全宽聊天主区。会话切换 / 在线状态已上移到全局 header
// （router handle：nav = AiNav，headerRight = SessionSwitcher）。
// 挂载即建立 WS 连接（幂等：store 内非 offline 状态不会重复建连）。
export default function AiPage() {
  useEffect(() => {
    useAiStore.getState().connect()
  }, [])

  return <ChatArea />
}
