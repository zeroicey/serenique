import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLogin } from '../queries'
import { browserSupportsWebAuthn } from '../webauthn'

// 登录页：仅通行密钥（Passkey）登录。
// 公开注册已移除（决策⑨）：首个凭证只能通过隐藏的 /setup?setupToken=... 创建；
// 登录失败（网络/服务端/浏览器）统一 Toast 中文文案，不做任何注册引导。
export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const webauthnSupported = browserSupportsWebAuthn()

  async function handleLogin() {
    try {
      await login.mutateAsync()
      navigate('/', { replace: true })
    } catch {
      // 错误已由 useLogin 的 onError toast 呈现
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 Serenique</CardTitle>
          <CardDescription>使用你的通行密钥（Passkey）登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={handleLogin}
            disabled={login.isPending || !webauthnSupported}
          >
            {login.isPending ? '正在唤起通行密钥…' : '使用通行密钥登录'}
          </Button>
          {!webauthnSupported && (
            <p className="text-center text-xs text-destructive">
              当前环境不支持通行密钥（需 HTTPS 或 localhost）
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
