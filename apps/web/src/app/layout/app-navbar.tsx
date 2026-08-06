import { type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useMatches } from 'react-router'
import { LogoutButton } from '@/features/auth/components/logout-button'

// 顶栏：折叠按钮 + 动态导航槽。动态导航内容由路由 handle.nav 提供（feature 自行注册）。
export function AppNavbar() {
  const matches = useMatches()
  const nav = [...matches]
    .reverse()
    .map((m) => (m.handle as { nav?: ReactNode } | undefined)?.nav)
    .find(Boolean)

  return (
    <header className="flex h-16 items-center gap-2 border-b px-4 py-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2" />
      <div className="flex-1">{nav}</div>
      <LogoutButton />
    </header>
  )
}
