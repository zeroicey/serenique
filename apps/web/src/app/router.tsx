import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'
import { MomentNav } from '@/features/moment/components/moment-nav'
import { MomentCreateNav } from '@/features/moment/components/moment-create-nav'
import { DiaryNav } from '@/features/diary/components/diary-nav'
import { DiaryCreateNav } from '@/features/diary/components/diary-create-nav'

// 懒加载 + Suspense 包装；handle.nav 注册该路由的动态导航内容。
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(loader)
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyPage(() => import('@/app/pages/welcome-page')) },
      {
        path: 'moment',
        element: lazyPage(() => import('@/features/moment/pages/moment-list-page')),
        handle: { nav: <MomentNav /> },
      },
      {
        path: 'moment/create',
        element: lazyPage(() => import('@/features/moment/pages/moment-create-page')),
        handle: { nav: <MomentCreateNav /> },
      },
      {
        path: 'diary',
        element: lazyPage(() => import('@/features/diary/pages/diary-list-page')),
        handle: { nav: <DiaryNav /> },
      },
      {
        path: 'diary/write',
        element: lazyPage(() => import('@/features/diary/pages/diary-create-page')),
        handle: { nav: <DiaryCreateNav /> },
      },
      { path: '*', element: lazyPage(() => import('@/app/pages/not-found-page')) },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
