import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLogout } from '../queries'

// 退出登录：清 Cookie（logout 接口），随后 auth-status 失效 → AuthGuard 跳登录页。
export function LogoutButton() {
  const logout = useLogout()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => logout.mutate()}
      title="退出登录"
      aria-label="退出登录"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  )
}
