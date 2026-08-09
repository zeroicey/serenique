import { useAiStore } from '@/features/ai/store/ai-store'

export function SessionSidebar() {
  const sessions = useAiStore((s) => s.sessions)
  const currentSessionId = useAiStore((s) => s.currentSessionId)
  const status = useAiStore((s) => s.status)
  const newSession = useAiStore((s) => s.newSession)
  const switchSession = useAiStore((s) => s.switchSession)
  const deleteSession = useAiStore((s) => s.deleteSession)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">会话</h2>
        <button type="button" className="rounded border border-border px-2 text-sm" onClick={newSession} title="新建会话">＋</button>
      </header>
      <div className="flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">暂无会话</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-sm ${s.id === currentSessionId ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => s.id !== currentSessionId && switchSession(s.id)}
            title={`${s.name} · ${s.messageCount} 条消息`}
          >
            <span className="flex-1 truncate">{s.name}</span>
            <button
              type="button"
              title="删除"
              className="invisible text-xs text-destructive group-hover:visible"
              onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除会话「${s.name}」？此操作不可恢复。`)) deleteSession(s.id) }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className={`size-2 rounded-full ${status === 'online' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {status === 'online' ? '在线' : status === 'connecting' ? '连接中…' : '已断开'}
      </footer>
    </aside>
  )
}
