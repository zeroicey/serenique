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
    // 内容列限宽居中（与闪记一致 max-w-[600px]）：大屏两侧留白，小屏自动全宽。
    // pb-24 为浮动输入框（absolute bottom 约 64px）留出滚动空间：滚到底时
    // 最后一条消息停在输入条上方，不被遮挡。
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-3 pb-24">
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
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
