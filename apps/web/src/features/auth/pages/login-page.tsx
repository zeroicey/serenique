import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '../queries'

// 登录页：输入部署时配置的认证密钥（AUTH_TOKEN），换取 HttpOnly 会话 Cookie。
export default function LoginPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const login = useLogin()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    try {
      await login.mutateAsync(token.trim())
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
          <CardDescription>输入部署时配置的认证密钥</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">认证密钥</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="AUTH_TOKEN"
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
