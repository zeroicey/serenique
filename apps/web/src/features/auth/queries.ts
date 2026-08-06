import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchAuthStatus, login, logout } from './api'

// Auth 状态：应用加载时探一次；登录/退出后 invalidate 触发重新探测。

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-status'] }),
    onError: (error) => toast.error(error.message || '登录失败'),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-status'] }),
    onError: (error) => toast.error(error.message || '退出登录失败'),
  })
}
