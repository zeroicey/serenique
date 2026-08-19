import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/common/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PageLoading } from './page-loading'

// 全局布局：仅侧边栏 + 内容区。顶部导航栏已移除（2026-08-20 重构）——
// 各页面不再注册 handle.nav / handle.headerRight，页面自行组织内部操作与布局。
export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </SidebarProvider>
  )
}
