import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'

// 路由表：feature 页面在此注册，并用 React.lazy 懒加载。
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // 例：features/diary/pages/diary-list-page.tsx 注册为
      // { index: true, element: <DiaryListPage /> }
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
