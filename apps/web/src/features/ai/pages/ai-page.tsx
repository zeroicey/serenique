import { SessionSidebar } from '@/features/ai/components/session-sidebar'
import { ChatArea } from '@/features/ai/components/chat-area'

// 宁序 AI 助手页骨架：左侧会话栏 + 右侧聊天主区（Task 3/6 填充真实实现）。
export default function AiPage() {
  return (
    <div className="flex h-full min-h-0">
      <SessionSidebar />
      <ChatArea />
    </div>
  )
}
