import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ProfileForm } from '../components/profile-form'
import { CredentialsSection } from '../components/credentials-section'
import { TokensSection } from '../components/tokens-section'
import { GeneralSection } from '../components/general-section'

// 设置页：个人信息 / 登录凭证 / API 令牌 / 通用 四个 tab（均需登录，由 AuthGuard 保证）。

const TABS = [
  { id: 'profile', label: '个人信息' },
  { id: 'credentials', label: '登录凭证' },
  { id: 'tokens', label: 'API 令牌' },
  { id: 'general', label: '通用' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profile')

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <div className="flex w-full max-w-[560px] flex-col gap-4 px-2 pb-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                tab === t.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {TABS.find((t) => t.id === tab)?.label}
            </CardTitle>
            <CardDescription>
              {tab === 'profile' && '修改你的个人资料，保存后立即生效。'}
              {tab === 'credentials' && '管理可以登录本服务的通行密钥设备。'}
              {tab === 'tokens' && '管理 CLI / 脚本 / 移动端使用的访问令牌。'}
              {tab === 'general' && '界面外观与账号操作。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tab === 'profile' && <ProfileForm />}
            {tab === 'credentials' && <CredentialsSection />}
            {tab === 'tokens' && <TokensSection />}
            {tab === 'general' && <GeneralSection />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
