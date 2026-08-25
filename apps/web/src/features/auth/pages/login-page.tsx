import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchOidcAuthorizeUrl } from '../api'

// 登录页：一键跳转认证中心（Pocket ID，授权码 + PKCE）。
// state/nonce/PKCE 登录态由 API 服务端生成保存；浏览器只负责整页跳转，
// 回调落在 /auth/callback（路由见 router.tsx）。
export default function LoginPage() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setPending(true)
    setError(null)
    try {
      const { authorizationUrl } = await fetchOidcAuthorizeUrl()
      // 赋值点二次校验（与 api 层纵深防御）：只允许 http(s) 绝对地址，
      // 拒绝 javascript:/data: 等伪协议，杜绝开放重定向面。
      let target: URL
      try {
        target = new URL(authorizationUrl)
      } catch {
        throw new Error('认证中心返回了无效的跳转地址')
      }
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        throw new Error('认证中心返回了不受支持的跳转协议')
      }
      window.location.assign(target.href)
    } catch (e) {
      // 网络失败 / 服务端 5xx：留在登录页给出中文提示，可重试。
      setPending(false)
      setError(e instanceof Error && e.message ? e.message : '无法连接服务器，请检查网络后重试')
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 Serenique</CardTitle>
          <CardDescription>将通过统一认证中心（Passkey）完成登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={handleLogin} disabled={pending}>
            {pending ? '正在跳转认证中心…' : '前往登录'}
          </Button>
          {error && <p className="text-center text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
