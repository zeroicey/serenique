import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/common/app-sidebar'
import { AppNavbar } from './app-navbar'
import { PageLoading } from './page-loading'

// 全局布局：侧边栏 +（顶栏 + 内容区）。路由页面在此经 Suspense 懒加载。
export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppNavbar />
          <main className="flex-1 overflow-auto px-1 py-4">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
