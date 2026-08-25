import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  fetchAuthStatus,
  getProfile,
  logout,
  postOidcCallback,
  type UpdateProfileInput,
  type UserEntry,
  updateProfile,
} from './api'

// Auth 状态与数据 hooks（Pocket ID OIDC 登录）。
// 会话状态：应用加载时探一次；登录/退出后 invalidate 触发重新探测。

export const authKeys = {
  status: ['auth-status'] as const,
  profile: ['auth', 'profile'] as const,
}

export function useAuthStatus(): UseQueryResult<import('./api').AuthStatus, Error> {
  return useQuery({
    queryKey: authKeys.status,
    queryFn: fetchAuthStatus,
    retry: false,
  })
}

/** OIDC 回调 mutation：code+state 换会话 cookie，成功后刷新登录态。 */
export function useOidcCallback(): UseMutationResult<
  import('./api').AuthStatus,
  Error,
  { code: string; state: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => postOidcCallback(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    onError: (error) => toast.error(error.message || '登录失败'),
  })
}

export function useLogout(): UseMutationResult<import('./api').AuthStatus, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    onError: (error) => toast.error(error.message || '退出登录失败'),
  })
}

// ---- 个人信息（设置页用）----------------------------------------------------

export function useProfile(): UseQueryResult<UserEntry, Error> {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: getProfile,
  })
}

export function useUpdateProfile(): UseMutationResult<UserEntry, Error, UpdateProfileInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      toast.success('个人信息已保存')
      queryClient.invalidateQueries({ queryKey: authKeys.profile })
      queryClient.invalidateQueries({ queryKey: authKeys.status })
    },
    onError: (error) => toast.error(error.message || '保存个人信息失败'),
  })
}
