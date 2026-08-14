import type { MomentCommentEntry } from '@/features/moment/api'
import { formatDate } from '@/lib/format'

interface MomentCommentListProps {
  comments: MomentCommentEntry[]
}

// 评论列表：DiceBear 像素头像（seed=评论id，与移动端一致）放在首行左侧，文字环绕它——
// 首行让位给头像，换行后的行顶到最左边（float 布局），不会在左侧空一列。
// 评论删除入口暂不提供（Web 暂不做详情页，方案待定），只读展示。
export function MomentCommentList({ comments }: MomentCommentListProps) {
  if (comments.length === 0) return null

  return (
    <div className="space-y-2">
      {comments.map((comment) => (
        <div key={comment.id} className="flow-root">
          <CommentAvatar seed={comment.id} />
          <div className="min-w-0">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">
              {comment.content}
            </p>
            <p className="clear-left mt-0.5 text-xs text-muted-foreground">
              {formatDate(comment.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// DiceBear 像素头像，seed=评论id。float-left 让正文首行让位、换行顶格环绕。
function CommentAvatar({ seed }: { seed: string }) {
  return (
    <span className="float-left mr-2 flex h-6 w-6 select-none items-center justify-center overflow-hidden rounded-full bg-muted">
      <img
        src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`}
        alt="头像"
        className="h-full w-full object-cover"
        onError={(e) => {
          // 加载失败隐藏图片，露出底色圆形占位。
          e.currentTarget.style.display = 'none'
        }}
      />
    </span>
  )
}
