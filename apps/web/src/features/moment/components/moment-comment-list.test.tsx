import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MomentCommentEntry } from '@/features/moment/api'
import { MomentCommentList } from './moment-comment-list'

function makeComment(id: string, content: string): MomentCommentEntry {
  return {
    id,
    momentId: 'm1',
    content,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

describe('MomentCommentList', () => {
  it('渲染每条评论，头像 seed 用评论 id', () => {
    render(
      <MomentCommentList comments={[makeComment('c1', '第一条'), makeComment('c2', '第二条')]} />,
    )
    expect(screen.getByText('第一条')).toBeInTheDocument()
    expect(screen.getByText('第二条')).toBeInTheDocument()

    const avatars = screen.getAllByAltText('头像')
    expect(avatars).toHaveLength(2)
    expect(avatars[0]).toHaveAttribute('src', 'https://api.dicebear.com/7.x/pixel-art/svg?seed=c1')
    expect(avatars[1]).toHaveAttribute('src', 'https://api.dicebear.com/7.x/pixel-art/svg?seed=c2')
  })

  it('头像浮左让文字环绕（float 布局），不提供删除按钮', () => {
    render(<MomentCommentList comments={[makeComment('c1', '评论内容')]} />)
    const avatar = screen.getByAltText('头像').closest('span')
    expect(avatar?.className).toContain('float-left')
    expect(avatar?.className).toContain('rounded-full')
    expect(screen.queryByRole('button', { name: '删除评论' })).not.toBeInTheDocument()
  })

  it('空评论返回 null', () => {
    const { container } = render(<MomentCommentList comments={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
