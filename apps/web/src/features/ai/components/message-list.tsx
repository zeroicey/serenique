import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import { useAiStore } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'
import { TurnView } from './turn-view'

// 会话边界分隔条：派生「已开启新会话」marker（kind='system'，评审 S4）。
function SystemMarker({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-center text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>{text}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// 压缩摘要项：真实压缩摘要（kind='compaction'），默认折叠，点击展开 detail（summary）。
// 独立组件承载自身展开态（避免在 map 内使用 hook）。
function CompactionItem({ text, detail }: { text: string; detail?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <button
        type="button"
        className="flex w-full items-center gap-1"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{text}</span>
        {detail ? <span className="ml-auto">{open ? '收起摘要' : '展开摘要'}</span> : null}
      </button>
      {open && detail ? <div className="mt-2 whitespace-pre-wrap">{detail}</div> : null}
    </div>
  )
}

export function MessageList() {
  const messages = useAiStore((s) => s.messages)
  const activeTurn = useAiStore((s) => s.activeTurn)
  const hasMoreMessages = useAiStore((s) => s.hasMoreMessages)
  const loadingMore = useAiStore((s) => s.loadingMore)
  const oldestHeldIndex = useAiStore((s) => s.oldestHeldIndex)
  const compactionSummary = useAiStore((s) => s.compactionSummary)
  const compactionTailStart = useAiStore((s) => s.compactionTailStart)
  const loadMore = useAiStore((s) => s.loadMore)

  // 单条消息渲染（历史已完整：静态渲染，不动画）。kind 分支优先：
  // 派生边界 marker / 压缩摘要独立渲染，其余按 role 二分支。
  const renderMessage = (m: (typeof messages)[number]) => {
    if (m.kind === 'system') return <SystemMarker text={m.text} />
    if (m.kind === 'compaction') return <CompactionItem text={m.text} detail={m.detail} />
    if (m.role === 'user') {
      return (
        <div className="self-end max-w-[85%] break-words whitespace-pre-wrap text-right">
          {m.text}
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        <ThinkingBlock text={m.thinking} />
        <div className="break-words">
          <Streamdown isAnimating={false}>{m.text}</Streamdown>
        </div>
        {m.toolCalls.map((tc) => (
          <ToolCard key={tc.id} card={{ ...tc, running: false }} />
        ))}
      </div>
    )
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 顶部哨兵：IntersectionObserver 触发懒加载。哨兵仅在 hasMoreMessages 为真时渲染
  // （首次挂载前 session_ready 未到、hasMoreMessages 为 false，哨兵不存在）；因此
  // 依赖里必须包含 hasMoreMessages，才能在哨兵真正出现时重建 observer，否则首次
  // 加载后 observer 永远不会创建，懒加载在 web 端形同虚设。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 意图性依赖——哨兵出现时需重建 observer
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
  }, [loadMore, hasMoreMessages])

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
        {/* 消息 key = oldestHeldIndex + i：prepend 历史后已持有消息的 key 不变，
        避免按索引 key={i} 重挂载导致 ThinkingBlock/ToolCard 的展开态被重置。
        压缩摘要卡片（评审 B2）：渲染在可见窗口的尾页起始处（compactionTailStart），
        向上滚动 prepend 更早批次后卡片仍保持位于更早批次之后。 */}
        {compactionSummary
          ? (() => {
              const start = Math.min(compactionTailStart, messages.length)
              const renderBefore = (m: (typeof messages)[number], j: number) => (
                <div key={oldestHeldIndex + j}>{renderMessage(m)}</div>
              )
              const renderTail = (m: (typeof messages)[number], j: number) => (
                <div key={oldestHeldIndex + start + j}>{renderMessage(m)}</div>
              )
              return (
                <>
                  {messages.slice(0, start).map(renderBefore)}
                  <CompactionItem
                    key="compaction-snapshot"
                    text="已压缩早期对话"
                    detail={compactionSummary}
                  />
                  {messages.slice(start).map(renderTail)}
                </>
              )
            })()
          : messages.map((m, i) => <div key={oldestHeldIndex + i}>{renderMessage(m)}</div>)}
        {activeTurn && <TurnView turn={activeTurn} />}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
