import { type ComponentType, lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'
import { ModuleTitleNav } from '@/app/pages/module-title-nav'
import { AiNav } from '@/features/ai/components/ai-nav'
import { AuditNav } from '@/features/audit/components/audit-nav'
import { AuthGuard } from '@/features/auth/components/auth-guard'
import { EventNav } from '@/features/event/components/event-nav'
import { HabitDateNav } from '@/features/habit/components/habit-date-nav'
import { HabitNav } from '@/features/habit/components/habit-nav'
import { MomentCreateNav } from '@/features/moment/components/moment-create-nav'
import { MomentNav } from '@/features/moment/components/moment-nav'
import { TagNav } from '@/features/tag/components/tag-nav'
import { TaskGroupSwitcher } from '@/features/task/components/task-group-switcher'
import { TaskNav } from '@/features/task/components/task-nav'

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
  // 隐藏的部署引导页：不挂任何导航入口，仅 ?setupToken= 链接可达（决策⑨）。
  { path: '/setup', element: lazyPage(() => import('@/features/auth/pages/setup-page')) },
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
            path: 'tags',
            element: lazyPage(() => import('@/features/tag/pages/tag-page')),
            handle: { nav: <TagNav /> },
          },
          {
            path: 'task',
            element: lazyPage(() => import('@/features/task/pages/task-page')),
            handle: {
              nav: <TaskNav />,
              headerRight: <TaskGroupSwitcher />,
            },
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
          // 宁序（AI 助手）已接入真实页面；习惯 / 素材库仍为占位模块（开发中）。
          // header：左侧标题+在线点（AiNav）。单一对话流无会话切换 UI。
          {
            path: 'ai',
            element: lazyPage(() => import('@/features/ai/pages/ai-page')),
            handle: {
              nav: <AiNav />,
            },
          },
          {
            path: 'habit',
            element: lazyPage(() => import('@/features/habit/pages/habit-page')),
            handle: {
              nav: <HabitNav />,
              headerRight: <HabitDateNav />,
            },
          },
          {
            path: 'habit/overview',
            element: lazyPage(() => import('@/features/habit/pages/habit-overview-page')),
            handle: { nav: <HabitNav /> },
          },
          {
            path: 'files',
            element: lazyPage(() => import('@/app/pages/placeholder-module-page')),
            handle: { nav: <ModuleTitleNav title="素材库" /> },
          },
          {
            path: 'settings',
            element: lazyPage(() => import('@/features/settings/pages/settings-page')),
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
