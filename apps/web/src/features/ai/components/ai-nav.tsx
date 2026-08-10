import { useAiStore } from '@/features/ai/store/ai-store'

// 宁序 header 左侧：标题 + 在线状态点（连接中/在线/已断开）。
export function AiNav() {
  const status = useAiStore((s) => s.status)
  const dot =
    status === 'online'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-yellow-500'
        : 'bg-red-500'
  const label =
    status === 'online' ? '在线' : status === 'connecting' ? '连接中…' : '已断开'

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl">宁序</span>
        <span
          className={`size-2 rounded-full ${dot}`}
          title={`AI ${label}`}
          aria-label={`AI ${label}`}
        />
      </div>
    </div>
  )
}
