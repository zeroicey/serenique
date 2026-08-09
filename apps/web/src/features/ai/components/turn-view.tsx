import type { TurnState } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'

export function TurnView({ turn }: { turn: TurnState }) {
  return (
    <div className="flex flex-col gap-1">
      <ThinkingBlock text={turn.thinking} />
      <div className="max-w-[78%] rounded-lg border border-border bg-card px-3.5 py-2.5 whitespace-pre-wrap break-words">{turn.text}</div>
      {[...turn.toolCards.values()].map((card) => <ToolCard key={card.id} card={card} />)}
    </div>
  )
}
