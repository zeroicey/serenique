# Moment 新建闪记本地草稿缓存

- 日期：2026-08-16
- 状态：✅已实施
- 范围：Web（`apps/web`）+ Flutter（`apps/mobile`）；仅文字草稿，附件/位置不入缓存
- 前置记录：`2026-08-08-mobile-moment-attachments.md`、`2026-08-08-moment-location.md`

---

## 1. 背景与目标

新建闪记时用户输入正文，网络不好/误触返回/误关页/切后台被杀都会导致**已输入的正文丢失**：

- **Web**：`useMomentDraftStore`（zustand）是**纯内存会话态**（注释明写「仅 UI 会话状态」），刷新页面、关 tab、误触取消即丢。
- **Flutter**：`moment_create_page.dart` 的 `_controller` 纯内存，退出页面（`context.pop()`）或 app 被杀即丢；提交失败时正文只在当前页面 state 里，导航离开就没了。

目标：新建页正文**实时持久化到本地**，进入页面自动恢复，发布成功后清除。先做文字，附件/位置不做（附件本来就在失败时保留于内存，且涉及大二进制不适宜进 SharedPreferences/localStorage）。

## 2. 数据模型（设计方向）

无服务端改动。本地存储 key：

| 端 | 存储 | key | 值 |
| --- | --- | --- | --- |
| Web | `localStorage` | `serenique.moment.draft.text` | 字符串（正文） |
| Flutter | `SharedPreferences` | `moment_draft_text` | 字符串（正文） |

单草稿槽位（个人单用户应用，一个未发布草稿足够，不引入多草稿/时间戳管理）。

## 3. 业务规则

1. **保存时机**：正文每次变化即持久化（Web 由 zustand persist 中间件自动写；Flutter 在 controller listener 里写，可轻量防抖 300ms 减少 IO）。
2. **恢复时机**：进入新建页 init 时读取并填入 textarea/TextField。
3. **清除时机**：
   - 发布成功 → 清除草稿
   - 文字删空 → 清除草稿（等价无草稿，避免残留空壳）
   - **取消/返回 → 保留草稿**（核心诉求是防误触丢失，误触取消/返回也应能恢复）
4. **空串**：`trim()` 后为空不写入（避免存空壳）。
5. **无其他入口**：列表页不显示草稿提示（简单优先，不引入横幅/角标）。
6. 提交失败：正文已在草稿里（实时保存的），用户重试或重进页面都在，天然兜底。

## 4. API 路由

无（纯前端本地功能）。

## 5. 已定决策

| # | 决策点 | 结论 |
| --- | -------- | ------ |
| ① | 范围 | 仅文字正文；附件/位置不入缓存（附件失败保留在内存即可） |
| ② | 存储介质 | Web `localStorage`（zustand persist）；Flutter `SharedPreferences`（依赖已有） |
| ③ | 草稿槽位 | 单槽位，不做多草稿管理 |
| ④ | 保存策略 | 实时保存（Flutter 300ms 防抖）；发布成功/文字删空清除，取消/返回保留 |
| ⑤ | 列表页提示 | 不做（简单优先） |
| ⑥ | 服务端 | 无 API/DB 改动 |

## 6. 实施清单（✅ 2026-08-16 全部完成）

**Web（`apps/web`）**

- [x] `stores/moment-draft.ts`：改用 `zustand/middleware` 的 `persist`，`name: 'serenique.moment.draft.text'`，仅持久化 `draftText`；测试覆盖持久化读写/清除
- [x] `moment-create-page.tsx`：发布成功用 `reset({ text: '' })`（修复旧草稿快照回写 bug）；取消保留草稿（误触不丢）

**Flutter（`apps/mobile`）**

- [x] `moment_draft_storage.dart`：`MomentDraftStorage` 抽象 + `SharedPrefsMomentDraftStorage` 实现 + provider（测试注入内存版）
- [x] `moment_create_page.dart`：initState 恢复草稿；listener + 300ms 防抖写回（空串删除）；发布成功清除（`_published` 标志防 dispose 回写）；dispose fire-and-forget 保存防抖窗口内最后输入
- [x] 测试：`moment_create_page_test.dart` 新增 5 个草稿用例（恢复/防抖保存/删空清除/发布清除/返回保留），全模块 90 个测试通过

**收尾**：两端 typecheck + lint + 单测通过（web 9 用例、flutter 13 用例针对本改动）。
