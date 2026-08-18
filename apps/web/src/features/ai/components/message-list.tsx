import { useEffect, useLayoutEffect, useRef } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import { useAiStore } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'
import { TurnView } from './turn-view'

export function MessageList() {
  const messages = useAiStore((s) => s.messages)
  const activeTurn = useAiStore((s) => s.activeTurn)
  const hasMoreMessages = useAiStore((s) => s.hasMoreMessages)
  const loadingMore = useAiStore((s) => s.loadingMore)
  const loadMore = useAiStore((s) => s.loadMore)

  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 顶部哨兵：IntersectionObserver 触发懒加载
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = topSentinelRef.current
    if (!root || !sentinel) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { root, threshold: 0 },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [loadMore])

  // 滚动锚定（prepend 补偿 + 新消息滚底，单 useLayoutEffect 避免抖动）：
  //  - 头部插入更早历史（prepend）：保持视觉位置，按 scrollHeight 差值下移
  //  - 尾部追加新消息/活跃轮：滚到底部
  //  - 初始加载（首次或切会话）：滚到底部
  const prevMetaRef = useRef<{ len: number; first: unknown; height: number }>({
    len: 0,
    first: undefined,
    height: 0,
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: 意图性依赖——prepend 补偿、新消息、流式文本增长均需重新计算滚动锚点
  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const prev = prevMetaRef.current
    const isPrepend =
      messages.length > prev.len && prev.first !== undefined && messages[0] !== prev.first
    if (isPrepend) {
      // prepend：补偿 scrollHeight 增量，视觉无跳动
      const delta = root.scrollHeight - prev.height
      root.scrollTop = root.scrollTop + delta
    } else {
      // 非 prepend（新消息/初始/切会话）：滚到底部
      // jsdom 未实现 scrollIntoView，避免测试环境抛错
      bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
    }
    prevMetaRef.current = {
      len: messages.length,
      first: messages[0],
      height: root.scrollHeight,
    }
  }, [messages, activeTurn?.text])

  return (
    // 内容列限宽居中（与闪记一致 max-w-[600px]）：大屏两侧留白，小屏自动全宽。
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-3">
        {/* 顶部哨兵：进入视口触发懒加载更早的消息 */}
        {hasMoreMessages && (
          <div ref={topSentinelRef} className="py-2 text-center text-xs text-muted-foreground">
            {loadingMore ? '加载更早消息…' : '向上滚动加载更多'}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="self-end max-w-[85%] break-words whitespace-pre-wrap text-right"
            >
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-1">
              <ThinkingBlock text={m.thinking} />
              <div className="break-words">
                {/* 历史消息已完整：静态渲染，不动画 */}
                <Streamdown isAnimating={false}>{m.text}</Streamdown>
              </div>
              {m.toolCalls.map((tc) => (
                <ToolCard key={tc.id} card={{ ...tc, running: false }} />
              ))}
            </div>
          ),
        )}
        {activeTurn && <TurnView turn={activeTurn} />}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
