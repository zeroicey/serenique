import { Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/format'
import type { MomentCommentEntry } from '@/features/moment/api'
import { Button } from '@/components/ui/button'

interface MomentCommentListProps {
  comments: MomentCommentEntry[]
  onDelete?: (commentId: string) => void
}

// 评论列表：每条评论 + 时间 + 删除（删除直删，无二次确认）。
export function MomentCommentList({ comments, onDelete }: MomentCommentListProps) {
  if (comments.length === 0) return null

  return (
    <div className="space-y-2">
      {comments.map((comment) => (
        <div key={comment.id} className="group flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-foreground">{comment.content}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(comment.createdAt)}</p>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="删除评论"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
