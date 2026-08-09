import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import type { TurnState } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'

export function TurnView({ turn }: { turn: TurnState }) {
  return (
    <div className="flex flex-col gap-1">
      <ThinkingBlock text={turn.thinking} />
      <div className="max-w-[78%] break-words rounded-lg border border-border bg-card px-3.5 py-2.5">
        {/* activeTurn 存在即流式中：增量动画渲染 */}
        <Streamdown animated isAnimating>{turn.text}</Streamdown>
      </div>
      {[...turn.toolCards.values()].map((card) => <ToolCard key={card.id} card={card} />)}
    </div>
  )
}
