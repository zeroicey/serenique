import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  deleteCredential,
  fetchAuthStatus,
  getProfile,
  listCredentials,
  logout,
  registerStart,
  updateProfile,
  type AuthStatus,
  type CredentialEntry,
  type RegisterUserInfo,
  type UpdateProfileInput,
  type UserEntry,
} from './api'
import { loginWithPasskey, registerWithPasskey } from './webauthn'

// Auth 状态与数据 hooks。
// 会话状态：应用加载时探一次；登录/注册/退出后 invalidate 触发重新探测。
// 注册 mutation 不弹 Toast——表单内联展示错误（SETUP_TOKEN 错误等需要指向字段）。

export const authKeys = {
  status: ['auth-status'] as const,
  credentials: ['auth', 'credentials'] as const,
  profile: ['auth', 'profile'] as const,
  registerGate: ['auth', 'register-gate'] as const,
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

export interface RegisterMutationInput {
  setupToken?: string
  userInfo?: RegisterUserInfo
}

export function useRegister(): UseMutationResult<AuthStatus, Error, RegisterMutationInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ setupToken, userInfo }) => registerWithPasskey({ setupToken, userInfo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.status }),
    // 错误由调用方（注册表单）内联展示，不弹 Toast。
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

/**
 * 注册门禁探测（登录页用）：调 register/start（不带 setupToken）推断当前状态——
 * 403 = users 表为空（首次引导注册）；401 = 已有用户（只能登录）；其余 = 无法判断。
 * 该探测只读不消费任何状态（start 生成的 challenge 5 分钟自动过期）。
 */
export type RegisterGateState =
  | { state: 'first-time' }
  | { state: 'registered' }
  | { state: 'unavailable'; message: string }

export function useRegisterGate(): UseQueryResult<RegisterGateState> {
  return useQuery({
    queryKey: authKeys.registerGate,
    queryFn: async () => {
      try {
        await registerStart({})
        return { state: 'registered' as const }
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 403) return { state: 'first-time' as const }
          if (e.status === 401 || e.status === 200) return { state: 'registered' as const }
          return { state: 'unavailable' as const, message: e.message }
        }
        return { state: 'unavailable' as const, message: '无法连接服务器，请检查网络' }
      }
    },
    retry: false,
  })
}

// ---- 凭证管理（设置页用）----------------------------------------------------

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
