import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/common/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PageLoading } from './page-loading'

// 全局布局：仅侧边栏 + 内容区。顶部导航栏已移除（2026-08-20 重构）——
// 各页面不再注册 handle.nav / handle.headerRight，页面自行组织内部操作与布局。
//
// 之前为照顾移动端（<768px 侧边栏是隐藏抽屉）曾保留一行顶部汉堡按钮；现在整行连同
// 按钮一并移除，页面正上方不再有任何留白/入口。侧边栏的开关入口改为按页面/模块逐个
// 定制摆放（本轮不做，仅移除顶部条）。
export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
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
