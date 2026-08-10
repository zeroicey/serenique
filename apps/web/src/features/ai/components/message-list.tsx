import { useEffect, useRef } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import { useAiStore } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'
import { TurnView } from './turn-view'

export function MessageList() {
  const messages = useAiStore((s) => s.messages)
  const activeTurn = useAiStore((s) => s.activeTurn)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 可选调用：jsdom 未实现 scrollIntoView，避免测试环境抛错；浏览器中正常滚动到底部。
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, activeTurn?.text])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="self-end max-w-[85%] break-words whitespace-pre-wrap text-right">{m.text}</div>
        ) : (
          <div key={i} className="flex flex-col gap-1">
            <ThinkingBlock text={m.thinking} />
            <div className="break-words">
              {/* 历史消息已完整：静态渲染，不动画 */}
              <Streamdown isAnimating={false}>{m.text}</Streamdown>
            </div>
            {m.toolCalls.map((tc) => <ToolCard key={tc.id} card={{ ...tc, running: false }} />)}
          </div>
        ),
      )}
      {activeTurn && <TurnView turn={activeTurn} />}
      <div ref={bottomRef} />
    </div>
  )
}
