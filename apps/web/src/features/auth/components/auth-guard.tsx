import { Navigate, Outlet } from 'react-router'
import { PageLoading } from '@/app/layout/page-loading'
import { useAuthStatus } from '../queries'

// 认证门：探一次登录态。未登录 → 跳 /login；已登录 → 渲染子路由。
export function AuthGuard() {
  const { data, isLoading } = useAuthStatus()
  if (isLoading) return <PageLoading />
  if (!data?.authenticated) return <Navigate to="/login" replace />
  return <Outlet />
}
