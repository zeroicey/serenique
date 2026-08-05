import { FileText } from 'lucide-react'
import { NavLink } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

// 全局侧边栏：品牌区 + 模块导航。当前仅 Moment 一个模块，后续新增模块在此追加导航项。
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-center gap-3 py-4">
        <span className="text-xl font-semibold">Serenique</span>
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
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
