import { useQuery } from '@tanstack/react-query'
import { listMoments } from '@/features/moment/api'

// 侧边栏 badge 计数：闪记走真实总数（拉一页 pageSize=1 读 total，轻量不全量获取）。
// 任务/日历/习惯是写死占位（对齐移动端 app_shell.dart badgeFor），日志未读数单独走 audit 查询。
export interface SidebarCounts {
  moments: number
}

export function useSidebarCounts() {
  return useQuery({
    queryKey: ['sidebar-counts'],
    queryFn: async (): Promise<SidebarCounts> => {
      const moments = await listMoments({ page: 1, pageSize: 1 })
      return { moments: moments.total }
    },
    // 常驻侧栏，轮询保持计数新鲜（接口 404 时查询失败，调用方不展示角标即可）。
    refetchInterval: 60_000,
  })
}
