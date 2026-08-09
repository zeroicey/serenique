import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { createToken, listTokens, revokeToken, type TokenCreateResult, type TokenEntry } from './api'

// API 令牌数据 hooks。创建成功不弹 Toast——明文弹窗本身就是反馈；
// 撤销与失败走统一 Toast。

export const tokenKeys = {
  list: ['tokens'] as const,
}

export function useTokens(): UseQueryResult<TokenEntry[]> {
  return useQuery({
    queryKey: tokenKeys.list,
    queryFn: listTokens,
  })
}

export function useCreateToken(): UseMutationResult<TokenCreateResult, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createToken,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tokenKeys.list }),
    onError: (error) => toast.error(error.message || '创建令牌失败'),
  })
}

export function useRevokeToken(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeToken,
    onSuccess: () => {
      toast.success('令牌已撤销')
      queryClient.invalidateQueries({ queryKey: tokenKeys.list })
    },
    onError: (error) => toast.error(error.message || '撤销令牌失败'),
  })
}
