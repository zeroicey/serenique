import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSidebar } from '@/components/ui/sidebar'

// 侧边栏底部主题切换：浅色 / 深色 / 跟随系统。
// trigger 直接传 className（base-ui 不支持 asChild）；图标用 CSS dark: 变体切换 Sun/Moon，
// 不用 state/effect（规避 react-hooks/set-state-in-effect）。
export function ThemeToggle() {
  const { setTheme } = useTheme()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground">
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <Sun className="absolute h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </span>
        {!collapsed && <span>主题</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4}>
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
  )
}
