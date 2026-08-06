import { Navigate, Outlet } from 'react-router'
import { PageLoading } from '@/app/layout/page-loading'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from '../queries'

// 认证门：探一次登录态。未登录 → 跳 /login；已登录 → 渲染子路由。
// 网络/5xx 等错误只显示重试态，绝不把已登录用户踢回登录页。
export function AuthGuard() {
  const { data, isLoading, isError, refetch } = useAuthStatus()
  if (isLoading) return <PageLoading />
  if (isError)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">无法连接服务器，请检查网络</p>
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      </div>
    )
  if (!data?.authenticated) return <Navigate to="/login" replace />
  return <Outlet />
}
