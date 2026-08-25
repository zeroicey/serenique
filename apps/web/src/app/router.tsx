import { type ComponentType, lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'
import { AuthGuard } from '@/features/auth/components/auth-guard'

// 懒加载 + Suspense 包装。顶部导航栏已移除，路由不再注册 handle.nav / handle.headerRight，
// 页面操作与子导航一律在页面内部自行组织。
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(loader)
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}

const router = createBrowserRouter([
  { path: '/login', element: lazyPage(() => import('@/features/auth/pages/login-page')) },
  // OIDC 回调：认证中心（auth.zeroicey.me）带 code 回跳的落地页。
  {
    path: '/auth/callback',
    element: lazyPage(() => import('@/features/auth/pages/oidc-callback-page')),
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: lazyPage(() => import('@/app/pages/welcome-page')) },
          {
            path: 'moment',
            element: lazyPage(() => import('@/features/moment/pages/moment-list-page')),
          },
          {
            path: 'moment/create',
            element: lazyPage(() => import('@/features/moment/pages/moment-create-page')),
          },
          { path: 'tags', element: lazyPage(() => import('@/features/tag/pages/tag-page')) },
          { path: 'task', element: lazyPage(() => import('@/features/task/pages/task-page')) },
          { path: 'event', element: lazyPage(() => import('@/features/event/pages/event-page')) },
          { path: 'audit', element: lazyPage(() => import('@/features/audit/pages/audit-page')) },
          // 宁序（AI 助手）与素材库已接入真实页面；习惯仍为占位模块（开发中）。
          { path: 'ai', element: lazyPage(() => import('@/features/ai/pages/ai-page')) },
          { path: 'habit', element: lazyPage(() => import('@/features/habit/pages/habit-page')) },
          {
            path: 'habit/overview',
            element: lazyPage(() => import('@/features/habit/pages/habit-overview-page')),
          },
          {
            path: 'files',
            element: lazyPage(() => import('@/features/blob/pages/blob-library-page')),
          },
          {
            path: 'settings',
            element: lazyPage(() => import('@/features/settings/pages/settings-page')),
          },
          { path: '*', element: lazyPage(() => import('@/app/pages/not-found-page')) },
        ],
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
