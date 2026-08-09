import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ApiError, toDisplayError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSetupRegister } from '../queries'

// 隐藏的部署引导页：不挂任何导航入口，仅当 URL 携带 ?setupToken=... 时可用，
// 用于引导期创建首个通行密钥（决策⑨：公开注册已移除）。
// 401（已有凭证，引导期已过）→ 跳登录页；403（token 错）/ 500（未建用户）/
// 浏览器 / 网络错误 → 内联展示中文文案。
export default function SetupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setupToken = searchParams.get('setupToken') ?? ''
  const register = useSetupRegister()
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    try {
      setError(null)
      await register.mutateAsync({ setupToken })
      navigate('/', { replace: true })
    } catch (e) {
      // 已有凭证（引导期已过）：直接去登录页，无需展示错误。
      if (e instanceof ApiError && e.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      setError(toDisplayError(e).message)
    }
  }

  if (!setupToken) {
    return (
      <div className="flex h-screen w-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-10">
            <p className="text-center text-sm text-muted-foreground">设置链接无效</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>创建通行密钥</CardTitle>
          <CardDescription>
            为你的账户创建第一个通行密钥（Passkey），创建完成后即可用它登录
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={handleCreate} disabled={register.isPending}>
            {register.isPending ? '正在创建通行密钥…' : '创建通行密钥'}
          </Button>
          {error && (
            <p className="text-center text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
