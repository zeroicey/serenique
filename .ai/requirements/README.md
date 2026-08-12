# 需求状态总表

| 文件 | 主题 | 状态 |
|------|------|------|
| `2026-08-05-diary-content-forms.md` | 日记内容形态 | ⏳待实施（暂缓） |
| `2026-08-05-event-module.md` | 事件模块 | ✅已实施 |
| `2026-08-05-moment-comments.md` | Moment 评论 | ✅已实施 |
| `2026-08-05-moment-tags.md` | Moment 标签 | ✅已实施 |
| `2026-08-05-task-module.md` | 任务模块 | ✅已实施 |
| `2026-08-06-auth.md` | 认证（共享密钥，旧方案） | 🪦已否决（被 Passkey 方案替换，见 08-09） |
| `2026-08-08-diary-merge-into-moment.md` | 日记并入闪念 | ⏳待实施（暂缓） |
| `2026-08-09-passkey-auth.md` | Passkey 认证重构 + 个人信息 + API Token | ✅已实施（v0.5.0 全栈部署完成 2026-08-09；待用户端到端验收） |
| `2026-08-08-audit-module.md` | 审计模块 | ✅已实施 |
| `2026-08-08-push-module.md` | 推送模块 | 🔶设计中 |
| `2026-08-08-mobile-moment-attachments.md` | Moment 移动端附件 | ✅已实施（显示/预览 MVP；上传下阶段） |
| `2026-08-08-moment-location.md` | Moment 位置信息 | ✅已实施（API + CLI + Web + Flutter 2026-08-10） |
| `2026-08-09-ai-agent-module.md` | AI 助手模块（宁序，PI SDK 内嵌） | ✅已实施（后端 + Web 前端 2026-08-09；待部署验收） |
| `2026-08-13-moment-global-search.md` | Moment 全局搜索（中文/拼音/英文） | ✅已实施（API + Web + Flutter + CLI 四端 2026-08-13；待 db:migrate + 回填后部署验收） |

## 约定

- 新需求文件头部必须带状态行：`- 状态：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决`（可附说明）。
- 状态变化时同步更新本表（remember-requirement skill 收尾动作）。
