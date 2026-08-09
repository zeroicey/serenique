import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfile, useUpdateProfile } from '@/features/auth/queries'

// 个人信息表单（/users/me）：name / email / birthday。
// 空字段提交 ''，服务端归一化为 null（清除）；保存成功 Toast 提示。

const profileSchema = z.object({
  name: z.string().trim().max(100),
  email: z.string().trim().max(200),
  birthday: z.string(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export function ProfileForm() {
  const { data: profile, isPending, isError, refetch } = useProfile()
  const updateProfile = useUpdateProfile()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', email: '', birthday: '' },
  })

  // 资料加载完成后回填表单（保存成功后 profile 失效也会触发回填）。
  useEffect(() => {
    if (!profile) return
    reset({
      name: profile.name ?? '',
      email: profile.email ?? '',
      birthday: profile.birthday ?? '',
    })
  }, [profile, reset])

  if (isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">加载个人信息中…</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-sm text-muted-foreground">加载个人信息失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const onSubmit = handleSubmit((values) => {
    updateProfile.mutate({
      name: values.name,
      email: values.email,
      birthday: values.birthday,
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">姓名</Label>
        <Input id="profile-name" placeholder="你的称呼" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">邮箱</Label>
        <Input
          id="profile-email"
          type="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-birthday">生日</Label>
        <Input id="profile-birthday" type="date" {...register('birthday')} />
      </div>
      <Button type="submit" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? '保存中…' : '保存'}
      </Button>
    </form>
  )
}
