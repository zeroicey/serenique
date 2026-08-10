---
name: memory-consolidate
description: 整理 .ai/inbox/ 的原始捕获片段。Use when 用户说「整理记忆」「整理 inbox」「消化 inbox」，或会话开始时有大量未消化 inbox 片段时。
---

# memory-consolidate

把 `.ai/inbox/` 中 hooks 自动捕获的原始片段，整理进正式记忆位置。**手动触发**（不在自动捕获清单）。

## 流程

1. 读 `.ai/inbox/` 下所有文件，按日期分组。
2. 对每个片段：判断归属 → worklog（工作流水）/ requirements（需求）/ decisions（决策）/ runbooks（流程）。
3. 用对应 remember-* skill 的模板写入正式位置（先去重：同主题已存在则更新）。
4. 已消化的片段从 inbox 删除；inbox 为空则删除当日文件。
5. 更新 `.ai/README.md` 索引 + `requirements/README.md` 状态总表（若涉及）。
