import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  type AuthStatus,
  type CredentialEntry,
  deleteCredential,
  fetchAuthStatus,
  getProfile,
  listCredentials,
  logout,
  renameCredential,
  type UpdateProfileInput,
  type UserEntry,
  updateProfile,
} from './api'
import { loginWithPasskey, registerWithPasskey } from './webauthn'

// Auth 状态与数据 hooks。
// 会话状态：应用加载时探一次；登录/注册/退出后 invalidate 触发重新探测。
// 注册 mutation 不弹 Toast——错误由调用方内联展示（setup 页 403/401 区分、设置页 toast）。

export const authKeys = {
  status: ['auth-status'] as const,
  credentials: ['auth', 'credentials'] as const,
  profile: ['auth', 'profile'] as const,
}

export function useAuthStatus(): UseQueryResult<AuthStatus> {
  return useQuery({
    queryKey: authKeys.status,
    queryFn: fetchAuthStatus,
    retry: false,
  })
}

export function useLogin(): UseMutationResult<AuthStatus, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    onError: (error) => toast.error(error.message || '登录失败'),
  })
}

/** 注册输入：仅 setupToken（决策⑨ 已移除 userInfo）。 */
export interface RegisterMutationInput {
  setupToken?: string
}

/** 注册 mutation：登录态添加新设备（设置页，不带 setupToken）。 */
export function useRegister(): UseMutationResult<AuthStatus, Error, RegisterMutationInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => registerWithPasskey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    // 错误由调用方处理（设置页在 handler 里 toast）。
  })
}

/** 引导期创建首个凭证（隐藏 /setup 页）：setupToken 必填。 */
export function useSetupRegister(): UseMutationResult<AuthStatus, Error, { setupToken: string }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ setupToken }) => registerWithPasskey({ setupToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    // 错误由 setup 页内联展示（403/500 文案、401 跳登录页）。
  })
}

export function useLogout(): UseMutationResult<AuthStatus, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    onError: (error) => toast.error(error.message || '退出登录失败'),
  })
}

export function useCredentials(): UseQueryResult<CredentialEntry[]> {
  return useQuery({
    queryKey: authKeys.credentials,
    queryFn: listCredentials,
  })
}

export function useDeleteCredential(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => {
      toast.success('登录凭证已删除')
      queryClient.invalidateQueries({ queryKey: authKeys.credentials })
    },
    onError: (error) => toast.error(error.message || '删除凭证失败'),
  })
}

export function useRenameCredential(): UseMutationResult<
  CredentialEntry,
  Error,
  { id: string; deviceLabel: string | null }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, deviceLabel }) => renameCredential(id, deviceLabel),
    onSuccess: () => {
      toast.success('凭证已重命名')
      queryClient.invalidateQueries({ queryKey: authKeys.credentials })
    },
    onError: (error) => toast.error(error.message || '重命名凭证失败'),
  })
}

// ---- 个人信息（设置页用）----------------------------------------------------

export function useProfile(): UseQueryResult<UserEntry> {
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
