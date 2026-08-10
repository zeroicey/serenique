import {
  CalendarDays,
  CheckCircle2,
  Images,
  Repeat,
  ScrollText,
  Settings,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useSidebarCounts } from '@/app/layout/use-sidebar-counts'
import { useAuditUnreadCount } from '@/features/audit/queries'

// 全局侧边栏：品牌区 + 模块导航 + 底部设置入口。新增模块在 NAV_ITEMS 追加一项。
// 顺序与移动端 app_shell.dart 对齐：宁序 → 闪记 → 习惯 → 任务 → 日历 → 素材库 → 日志。
// 主题切换与退出登录已收敛到设置页（通用 tab）。
const NAV_ITEMS: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: Sparkles, label: '宁序', path: '/ai' },
  { icon: Zap, label: '闪记', path: '/moment' },
  { icon: Repeat, label: '习惯', path: '/habit' },
  { icon: CheckCircle2, label: '任务', path: '/task' },
  { icon: CalendarDays, label: '日历', path: '/event' },
  { icon: Images, label: '素材库', path: '/files' },
  { icon: ScrollText, label: '日志', path: '/audit' },
]

export function AppSidebar() {
  const counts = useSidebarCounts()
  const audit = useAuditUnreadCount()

  // 右侧计数 badge（对齐移动端 app_shell.dart badgeFor）：闪记真实计数，
  // 任务/日历/习惯写死占位，日志用未读数（0 时不显示）。
  const badgeFor = (path: string): string | null => {
    switch (path) {
      case '/moment':
        return counts.data ? String(counts.data.moments) : null
      case '/task':
        return '3'
      case '/event':
        return '2'
      case '/habit':
        return '5'
      case '/audit':
        return audit.data && audit.data.unreadCount > 0 ? String(audit.data.unreadCount) : null
      default:
        return null
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-center gap-3 py-4">
        <img src="/logo_header.svg" alt="Serenique" width={180} height={50} />
        <Separator className="w-full" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const badge = badgeFor(item.path)
            return (
              <SidebarMenuItem key={item.path}>
                <NavLink to={item.path} className="flex items-center gap-2">
                  {({ isActive }) => (
                    <>
                      <SidebarMenuButton isActive={isActive}>
                        <item.icon />
                        <span className="text-lg">{item.label}</span>
                      </SidebarMenuButton>
                      {/* badge 需与 SidebarMenuButton 相邻（peer）才能用其 top-1.5 定位 */}
                      {badge && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </>
                  )}
                </NavLink>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="space-y-1 px-2">
          <SidebarMenuItem>
            <NavLink to="/settings" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <Settings />
                  <span className="text-lg">设置</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
