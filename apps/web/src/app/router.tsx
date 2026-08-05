import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'

// 懒加载 + Suspense 包装；handle.nav 注册该路由的动态导航内容。
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(loader)
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}

// 欢迎页 / 404 属于壳层；Moment 路由在 Task 6 接线。
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyPage(() => import('@/app/pages/welcome-page')) },
      { path: '*', element: lazyPage(() => import('@/app/pages/not-found-page')) },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
