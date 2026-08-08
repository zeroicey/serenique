# 2026-08-09 — Task 模块（移动端 + dueDate）生产部署 + iOS 真机装机（hcyj 后端）

背景：今天完成了 Task 模块移动端（4-tab 底部导航：任务组/今日/本周/本月）与 dueDate 字段全栈扩展（API/MCP/CLI/Flutter，SDD plan `docs/superpowers/plans/2026-08-09-task-module-mobile.md`，实现记录见 `.ai/worklog/2026-08-09-task-module-mobile-dueDate.md` 与 `-task10.md`）。用户要求装到手机（iPhone 15 Pro hpcell）并用 hcyj 后端（`https://api.hcyj.xyz/serenique`）。

## 改动（commit 1cc0bfb..0b496da，推送 main 触发 CI）

- **API**：task `due_date` text 列 + `idx_tasks_due_date_status` 索引 + CHECK 格式约束（迁移 `0013_milky_crystal.sql`）；`GET /api/tasks` 支持 `dueDateFrom/dueDateTo` 范围过滤 + 日期排序；Create/Update 支持 dueDate（update 传空串/null 清除）
- **MCP**：create_task / list_tasks / update_task 增加 dueDate 参数（`safeExtend`——zod v4 对 refine 过的 schema `.extend()` 会抛）
- **CLI**：`task create/update --due-date`、`task list --due-from/--due-to`、表格加「截止日期」列
- **Flutter**：任务模块完整页面（TaskPage 4-tab + 组详情 + 编辑弹窗 + 抽屉真实计数），装机前修复冒烟测试发现的勾选竞态 bug（`0b496da`：onToggle 先 await PUT 再 invalidate 家族 provider）

## 部署与装机（流程见 `.ai/runbooks/hpcore-deploy.md` 与 `ios-device-install.md`）

1. push main → docker-publish CI run 31279541851（digest `sha256:1f502440…`）
2. hpcore：`docker pull :main` → digest 核对一致 → tag `:latest` → `docker compose up -d --force-recreate api` → healthy
3. 生产库迁移 0013：stdin 直灌 3 条 SQL（ADD COLUMN / CREATE INDEX / ADD CONSTRAINT）+ `__drizzle_migrations` INSERT（hash `6cc90f3a…`，when 1786218989834）→ 现 14 条记录，`tasks.due_date` 存在
4. 服务器业务验证：建组 → 建 dueDate 任务 → 范围查询命中 → 清理（204）
5. hcyj 公网入口：`/serenique/health` 200（0.1s），`/api/task-groups` 未认证正确返回 UNAUTHORIZED（反代 + auth 链路正常）
6. 装机：`flutter build ios --release --dart-define=API_BASE_URL=https://api.hcyj.xyz/serenique` → `xcrun devicectl device install app --device C11AB076-C53F-5679-AE4E-FD16821ABCCC` ✅

## 验证

- 各端全量测试：API 135 pass / CLI 4 包 ok / MCP 7 pass / Flutter analyze clean + 137 pass
- iOS 模拟器冒烟全过（登录→4 tab→组 CRUD→今日/过期分组→周/月→badge==真实计数→CLI due-date 往返）
- 生产 API dueDate 业务验证通过；hcyj 入口通

## 坑 / 对下一次会话的提示

1. **hpcore 远程 shell 是 zsh：`GID` 是只读特殊变量**，用作变量名报 `bad math expression`——用 `GRP` 之类的名字。
2. **生产 postgres 容器名是 `postgres`**（不是 serenique-postgres），`docker exec -i postgres psql`。
3. `xcrun devicectl install` 首次偶发 `Connection reset by peer`——设备列表可见时直接重试即可。
4. 手机上的 app 登录要用生产 `AUTH_TOKEN`（登录页输入密钥）；免费签名 7 天过期需重签重装。
5. 本地 `localhost:3000` 的 docker 镜像是旧的（无 auth 模块），模拟器/调试链路要用 `bun run dev` 起本地 API 或重建镜像。
6. 冒烟测试的价值被验证：勾选竞态 bug 是真实且可确定性复现的（GET 先于 PUT 完成），修复 = onToggle 里先 await 写操作再 invalidate。

## 追加：任务条目勾选图标对齐修复（commit 5148a11、ab3e879）

用户真机反馈任务条目里勾选按钮与内容不在一条线上，两轮修复：

1. **5148a11**（错误方向）：ListTile 有副标题时 leading 与「标题+副标题」整体居中，图标比标题低 8px（实测 icon 36 vs title 28）。改用 Row 顶部对齐、图标对齐标题首行——结果今日/周/月视图反而图标偏上，组详情对齐。
2. **ab3e879**（最终正确）：用户澄清要的是**图标中心 = 内容块竖直中心**。改用 `IntrinsicHeight + Row(stretch)`：图标区宽度 40、高度自适应内容、`Center` 图标；副标题条件渲染（空组名不渲染空行）。带组名时图标对「标题+组名」整体居中，组详情无组名时对标题行居中——两种场景严格一条线。

**坑**：ListTile 的 leading 对齐（titleHeight 模式）既不等于内容块中心也不等于标题行中心，且会随副标题有无而变；自绘 Row + IntrinsicHeight 是确定解。对齐用 widget 测试锁定（`test/features/task/task_tile_align_test.dart`：图标中心与 tile 竖直中心差 <1px，覆盖有/无副标题/done 三态）。

修复后已重建 release 包并装机（hcyj 后端），用户确认「这下好了」。
