import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLogin, useRegisterGate } from '../queries'
import { browserSupportsWebAuthn } from '../webauthn'
import { RegisterForm } from '../components/register-form'

// 登录页：Passkey（WebAuthn）登录。首次使用（users 表为空）时引导到注册表单，
// 需要输入部署时配置的 SETUP_TOKEN。登录态判断沿用 /api/auth/me。
export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const gate = useRegisterGate()
  const [showRegister, setShowRegister] = useState(false)

  const webauthnSupported = browserSupportsWebAuthn()
  const gateState = gate.data?.state
  // 首次注册状态（探测 403）或用户手动切换 → 展示注册表单。
  const showRegisterForm = showRegister || gateState === 'first-time'

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
          {showRegisterForm ? (
            <>
              <RegisterForm />
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowRegister(false)}
              >
                已有通行密钥？去登录
              </Button>
            </>
          ) : (
            <>
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
              {gateState === 'unavailable' && gate.data && (
                <p className="text-center text-xs text-muted-foreground">{gate.data.message}</p>
              )}
              {/* 已确认有用户时不再提供注册入口；加载中 / 无法判断时保留 */}
              {gateState !== 'registered' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowRegister(true)}
                >
                  首次使用？注册新账户
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
