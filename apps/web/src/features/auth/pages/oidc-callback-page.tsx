import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageLoading } from '@/app/layout/page-loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOidcCallback } from '../queries'

// OIDC 回调页：认证中心带 code 回跳后，把 code/state POST 给服务端换会话
// cookie。成功 → invalidate auth-status 并进主界面；失败 → 展示错误 + 返回
// 登录页按钮。useRef 防止 React StrictMode 双挂载重复提交 code（一次性消费，
// 重放必 401）。
export default function OidcCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const callback = useOidcCallback()
  const submitted = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const code = params.get('code')
  const state = params.get('state')

  useEffect(() => {
    if (!code || !state || submitted.current) return
    submitted.current = true
    callback.mutate(
      { code, state },
      {
        onSuccess: () => navigate('/', { replace: true }),
        onError: () => setError('登录验证未通过，请返回重新登录'),
      },
    )
  }, [code, state, callback, navigate])

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>登录失败</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              返回登录页
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!code || !state) {
    // 缺参：不是合法的回跳，回登录页。
    return (
      <div className="flex h-screen w-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>链接无效</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              返回登录页
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <PageLoading />
}
