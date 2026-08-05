import { Outlet } from 'react-router'

// 全局布局骨架：顶栏 + 内容区。后续在此加入侧边栏导航。
export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-3 font-medium">Serenique</div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
