import {
  keepPreviousData,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  type AuditLogEntry,
  type AuditUnreadCount,
  getAuditUnreadCount,
  type ListAuditLogsParams,
  listAuditLogs,
  type MarkAuditReadResult,
  markAuditRead,
} from './api'

// 审计日志数据 hooks。读取走 useQuery（分页 + 筛选），未读数轮询（30s，供侧边栏角标）。
// 写入仅「置已读」，成功后 invalidate 整个 audit 域（列表 + 未读数一起刷新）。

export const auditKeys = {
  all: ['audit'] as const,
  logs: (params: ListAuditLogsParams) => ['audit', 'logs', params] as const,
  unread: ['audit', 'unread-count'] as const,
}

export function useAuditLogs(
  params: ListAuditLogsParams,
): UseQueryResult<{ items: AuditLogEntry[]; total: number }> {
  return useQuery({
    queryKey: auditKeys.logs(params),
    queryFn: () => listAuditLogs(params),
    placeholderData: keepPreviousData,
  })
}

export function useAuditUnreadCount(): UseQueryResult<AuditUnreadCount> {
  return useQuery({
    queryKey: auditKeys.unread,
    queryFn: getAuditUnreadCount,
    // 角标轮询（需求 §11：如 30s）。接口未上线时查询失败，调用方不展示角标即可。
    refetchInterval: 30_000,
  })
}

export function useMarkAuditRead(): UseMutationResult<
  MarkAuditReadResult,
  Error,
  string[] | undefined
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids) => markAuditRead(ids),
    onSuccess: (result) => {
      toast.success(`已将 ${result.updatedCount} 条日志标记为已读`)
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (error) => {
      toast.error(error.message || '标记已读失败')
    },
  })
}
