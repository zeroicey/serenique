# 需求状态总表

| 文件 | 主题 | 状态 |
| ------ | ------ | ------ |
| `2026-08-05-diary-content-forms.md` | 日记内容形态 | 🪦已否决（日记模块 2026-08-09 全端移除） |
| `2026-08-05-event-module.md` | 事件模块 | ✅已实施 |
| `2026-08-05-moment-comments.md` | Moment 评论 | ✅已实施 |
| `2026-08-05-moment-tags.md` | Moment 标签 | ✅已实施 |
| `2026-08-05-task-module.md` | 任务模块 | ✅已实施 |
| `2026-08-06-auth.md` | 认证（共享密钥，旧方案） | 🪦已否决（被 Passkey 方案替换，见 08-09） |
| `2026-08-08-diary-merge-into-moment.md` | 日记并入闪念 | ✅已实施（2026-08-09 日记并入闪念，模块移除） |
| `2026-08-09-passkey-auth.md` | Passkey 认证重构 + 个人信息 + API Token | ✅已实施（v0.5.0 全栈部署完成 2026-08-09；待用户端到端验收） |
| `2026-08-26-pocket-id-auth-migration.md` | 认证中心迁移：接入 Pocket ID（auth.zeroicey.me） | ⏳待实施（Phase 1 API + Web 代码完成 2026-08-26；待部署验收，Mobile/CLI 后置） |
| `2026-08-08-audit-module.md` | 审计模块 | ✅已实施 |
| `2026-08-08-push-module.md` | 推送模块 | 🔶设计中 |
| `2026-08-08-mobile-moment-attachments.md` | Moment 移动端附件 | ✅已实施（显示/预览 MVP；上传下阶段） |
| `2026-08-08-moment-location.md` | Moment 位置信息 | ✅已实施（API + CLI + Web + Flutter 2026-08-10） |
| `2026-08-09-ai-agent-module.md` | AI 助手模块（宁序，PI SDK 内嵌） | ✅已实施（后端 + Web 前端 2026-08-09；待部署验收） |
| `2026-08-13-moment-global-search.md` | Moment 全局搜索（中文/拼音/英文） | ✅已实施（API + Web + Flutter + CLI 四端 2026-08-13；待 db:migrate + 回填后部署验收） |
| `2026-08-15-face-verification-auth.md` | 人脸核身 / 生物识别登录增强 | 🪦已否决（2026-08-15：Passkey 平台生物识别已覆盖，无需自建） |
| `2026-08-16-moment-draft-cache.md` | Moment 新建闪记本地草稿缓存 | ✅已实施 |
| `2026-08-16-habit-module.md` | 习惯模块 | ✅已实施（API+Web+CLI+AI 四端 + 生产/Cloudflare 部署 2026-08-16） |
| `2026-08-18-ai-auto-session-management.md` | AI 对话自动会话管理（自动切换/压缩 + /new /compact） | ✅已实施（后端+Web+Flutter 三端 2026-08-18） |
| `2026-08-18-ai-message-lazy-load.md` | AI 对话消息懒加载（前端 anchor 游标分页） | ✅已实施（2026-08-18 落地，含评审修复） |
| `2026-08-20-object-storage-r2.md` | 文件存储迁移到 Cloudflare R2 对象存储 | ✅已实施（2026-08-21 生产切换完成，端到端验证通过） |
| `2026-08-20-moment-inline-create.md` | Moment 列表页内嵌快速新建 | ✅已实施（Web 端 MomentQuickCreate；移动端未实现） |
| `2026-08-21-asset-library-module.md` | 素材库模块（Web + 移动端） | ✅已实施（2026-08-21：Web 素材库页 + 后端 refCount；上传入口/取用池等边界项留待后续） |

## 约定

- 新需求文件头部必须带状态行：`- 状态：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决`（可附说明）。
- 状态变化时同步更新本表（remember-requirement skill 收尾动作）。
