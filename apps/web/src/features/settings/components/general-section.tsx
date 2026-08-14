import { LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useLogout } from '@/features/auth/queries'

// 通用设置：外观主题 + 退出登录（原顶栏退出按钮 / 侧边栏主题切换，收敛到设置页）。
// 退出后 auth-status 失效 → AuthGuard 跳登录页（useLogout 内建）。
export function GeneralSection() {
  const { setTheme } = useTheme()
  const logout = useLogout()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">主题</p>
          <p className="text-xs text-muted-foreground">切换界面外观，可跟随系统。</p>
        </div>
        <DropdownMenu>
          {/* base-ui 不支持 asChild：trigger 直接套用 outline 按钮样式 */}
          <DropdownMenuTrigger
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })} cursor-pointer`}
          >
            <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              <Sun className="absolute h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </span>
            主题
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('light')}>
              浅色
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('dark')}>
              深色
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('system')}>
              跟随系统
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">退出登录</p>
          <p className="text-xs text-muted-foreground">清除本设备的登录会话。</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut />
          {logout.isPending ? '退出中…' : '退出登录'}
        </Button>
      </div>
    </div>
  )
}
