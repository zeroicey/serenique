import { Loader2 } from 'lucide-react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import type { TurnState } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'

// 「AI 正在思考」动画：activeTurn 存在即后端 turn_start 已确认（网络卡住/后端
// 未响应时不会有 turn，不会误显示）；尚未输出任何文字（text === '') 时渲染，
// 收到第一个 text_delta（或工具调用）后自然被正文/工具卡替换。
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span>AI 正在思考…</span>
    </div>
  )
}

export function TurnView({ turn }: { turn: TurnState }) {
  return (
    <div className="flex flex-col gap-1">
      <ThinkingBlock text={turn.thinking} />
      {turn.text ? (
        <div className="break-words">
          {/* activeTurn 存在即流式中：增量动画渲染 */}
          <Streamdown animated isAnimating>
            {turn.text}
          </Streamdown>
        </div>
      ) : (
        <ThinkingIndicator />
      )}
      {[...turn.toolCards.values()].map((card) => (
        <ToolCard key={card.id} card={card} />
      ))}
    </div>
  )
}
