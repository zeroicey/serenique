import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/common/app-sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { PageLoading } from './page-loading'

// 全局布局：仅侧边栏 + 内容区。顶部导航栏已移除（2026-08-20 重构）——
// 各页面不再注册 handle.nav / handle.headerRight，页面自行组织内部操作与布局。
//
// 移动端（<768px）侧边栏本身以抽屉（Sheet）呈现，需入口打开：原顶栏的 SidebarTrigger
// 随导航栏一并移除后，此处仅对移动端在内容区顶部渲染一个汉堡按钮（桌面端侧边栏常驻
// 展开且可有 SidebarRail 折叠，无需 trigger，故完全无顶部条）。
export default function AppLayout() {
  const isMobile = useIsMobile()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          {isMobile && (
            <div className="flex shrink-0 items-center px-2 py-2">
              <SidebarTrigger aria-label="打开侧边栏" />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}