import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'
import { ModuleTitleNav } from '@/app/pages/module-title-nav'
import { MomentNav } from '@/features/moment/components/moment-nav'
import { MomentCreateNav } from '@/features/moment/components/moment-create-nav'
import { DiaryNav } from '@/features/diary/components/diary-nav'
import { DiaryCreateNav } from '@/features/diary/components/diary-create-nav'
import { TaskNav } from '@/features/task/components/task-nav'
import { EventNav } from '@/features/event/components/event-nav'
import { AuditNav } from '@/features/audit/components/audit-nav'
import { AuthGuard } from '@/features/auth/components/auth-guard'

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
  { path: '/login', element: lazyPage(() => import('@/features/auth/pages/login-page')) },
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
          {
            path: 'task',
            element: lazyPage(() => import('@/features/task/pages/task-page')),
            handle: { nav: <TaskNav /> },
          },
          {
            path: 'event',
            element: lazyPage(() => import('@/features/event/pages/event-page')),
            handle: { nav: <EventNav /> },
          },
          {
            path: 'audit',
            element: lazyPage(() => import('@/features/audit/pages/audit-page')),
            handle: { nav: <AuditNav /> },
          },
          // 占位模块（开发中）：宁序 / 习惯 / 素材库 / 设置。
          {
            path: 'ai',
            element: lazyPage(() => import('@/app/pages/placeholder-module-page')),
            handle: { nav: <ModuleTitleNav title="宁序" /> },
          },
          {
            path: 'habit',
            element: lazyPage(() => import('@/app/pages/placeholder-module-page')),
            handle: { nav: <ModuleTitleNav title="习惯" /> },
          },
          {
            path: 'files',
            element: lazyPage(() => import('@/app/pages/placeholder-module-page')),
            handle: { nav: <ModuleTitleNav title="素材库" /> },
          },
          {
            path: 'settings',
            element: lazyPage(() => import('@/app/pages/placeholder-module-page')),
            handle: { nav: <ModuleTitleNav title="设置" /> },
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
