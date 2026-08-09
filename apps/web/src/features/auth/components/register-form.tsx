import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRegister } from '../queries'

// 首次注册表单：SETUP_TOKEN（必填）+ 可选初始个人信息。
// 提交后走 WebAuthn 注册 ceremony（系统通行密钥弹窗）；错误内联展示（服务端中文文案）。

const registerFormSchema = z.object({
  setupToken: z.string().trim().min(1, '请输入引导注册令牌'),
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).optional(),
  birthday: z.string().optional(),
})

type RegisterFormValues = z.infer<typeof registerFormSchema>

export function RegisterForm() {
  const navigate = useNavigate()
  const register = useRegister()
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { setupToken: '', name: '', email: '', birthday: '' },
  })

  const onSubmit = handleSubmit((values) => {
    register.mutate(
      {
        setupToken: values.setupToken,
        userInfo: {
          name: values.name || undefined,
          email: values.email || undefined,
          birthday: values.birthday || undefined,
        },
      },
      { onSuccess: () => navigate('/', { replace: true }) },
    )
  })

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">注册新账户</p>
        <p className="text-xs text-muted-foreground">
          输入部署时配置的引导令牌（SETUP_TOKEN），并在系统中创建你的通行密钥。
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="register-setup-token">引导令牌</Label>
          <Input
            id="register-setup-token"
            type="password"
            placeholder="SETUP_TOKEN"
            autoComplete="off"
            aria-invalid={!!errors.setupToken}
            {...registerField('setupToken')}
          />
          {errors.setupToken && (
            <p className="text-xs text-destructive">{errors.setupToken.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-name">姓名（可选）</Label>
          <Input id="register-name" placeholder="你的称呼" {...registerField('name')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-email">邮箱（可选）</Label>
          <Input id="register-email" type="email" placeholder="you@example.com" {...registerField('email')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-birthday">生日（可选）</Label>
          <Input id="register-birthday" type="date" {...registerField('birthday')} />
        </div>
        {register.error && (
          <p className="text-xs text-destructive" role="alert">
            {register.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? '正在创建通行密钥…' : '注册'}
        </Button>
      </form>
    </div>
  )
}
