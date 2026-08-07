import { BookOpen, CalendarDays, FileText, ListTodo } from 'lucide-react'
import { NavLink } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from './theme-toggle'

// 全局侧边栏：品牌区 + 模块导航 + 底部主题切换。新增模块在此追加导航项。
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-center gap-3 py-4">
        <img src="/logo_header.svg" alt="Serenique" width={180} height={50} />
        <Separator className="w-full" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="space-y-1 px-2">
          <SidebarMenuItem>
            <NavLink to="/moment" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <FileText />
                  <span className="text-lg">闪念</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <NavLink to="/diary" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <BookOpen />
                  <span className="text-lg">日记</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <NavLink to="/event" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <CalendarDays />
                  <span className="text-lg">日程</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <NavLink to="/task" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <ListTodo />
                  <span className="text-lg">任务</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="space-y-1 px-2">
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
