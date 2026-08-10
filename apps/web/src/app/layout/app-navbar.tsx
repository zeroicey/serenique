import { type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useMatches } from 'react-router'

// 顶栏：折叠按钮 + 动态导航槽 + 右侧槽。动态内容由路由 handle.nav /
// handle.headerRight 提供（feature 自行注册）。退出登录与主题切换已收敛到
// 设置页（通用 tab）。
export function AppNavbar() {
  const matches = useMatches()
  const nav = [...matches]
    .reverse()
    .map((m) => (m.handle as { nav?: ReactNode } | undefined)?.nav)
    .find(Boolean)
  const headerRight = [...matches]
    .reverse()
    .map((m) => (m.handle as { headerRight?: ReactNode } | undefined)?.headerRight)
    .find(Boolean)

  return (
    <header className="flex h-16 items-center gap-2 border-b px-4 py-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2" />
      <div className="flex-1">{nav}</div>
      <div className="flex items-center gap-2">{headerRight}</div>
    </header>
  )
}
