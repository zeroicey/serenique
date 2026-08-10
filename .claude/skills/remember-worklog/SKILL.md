---
name: remember-worklog
description: 记录工作日志到 .ai/worklog/。Use when 完成实现、修复、部署、评估等实质工作并要收尾时；或会话中解决了新问题、踩了值得记住的坑时；或会话结束时当天尚无 worklog 时。
---

# remember-worklog

把会话的实质工作写入 `.ai/worklog/`。这是 4 类自动捕获场景中的「①遇到新困难并自己解决」和「②完成珍贵流程」。

## 触发条件

- 完成实现 / 修复 / 部署 / 评估，准备收尾
- 会话中解决了新问题、踩了坑、发现了 pitfall
- 会话结束时当天尚无 worklog

## 先做：查重

- 读 `.ai/worklog/` 目录，同日期同主题已存在 → **更新该文件，不新建**。
- 涉及新主题时同步更新 `.ai/README.md` 索引。

## 模板

```markdown
# YYYY-MM-DD — <主题一句话>

<2-4 句背景：为什么做、解决了什么、用户反馈是什么>

## 改动（commit <sha>）

- **子系统**：具体改动（文件 + 行为），一行一条
- （多端同步时按 API / Web / CLI / 移动端分段）

## 验证

- 各端测试命令 + 结果（如 api `bun test` 122 pass）
- 生产/真机验证结果

## 坑 / 对下一次会话的提示

- 具体到命令级别，包含复现要点
- 标准流程类内容**不写这里**，走 remember-runbook 写 `.ai/runbooks/`，本文件留一行指针
```

## 收尾

- 若内容涉及标准流程（部署/上传/装机/构建/发布）→ 调 remember-runbook
- 清空 `.ai/inbox/` 中已消化片段
- 更新 `.ai/README.md` 索引（若涉及）
