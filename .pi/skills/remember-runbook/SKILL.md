---
name: remember-runbook
description: 保存标准操作流程到 .ai/runbooks/。Use when 走通了一个可复现的新流程（部署/上传/装机/构建/发布）、踩坑后找到修复流程、或发现 worklog 里重复出现流程描述时。
---

# remember-runbook

把标准流程写入 `.ai/runbooks/`。这是自动捕获场景「②完成珍贵流程」的沉淀去向。**规则：标准流程只在 runbooks/，worklog 不重复收录。**

## 触发条件

- 走通可复现的新流程（部署 / 上传 / 装机 / 构建 / 发布）
- 踩坑后找到修复方法，且该坑可能重演
- 多个 worklog 出现同一流程的重复描述（此时收敛成一个 runbook，worklog 留指针）

## 先做：查重

- 读 `.ai/runbooks/` 目录：同主题已存在 → **更新不新建**（唯一事实源）。
- 从 worklog 抽取时，原 worklog 末尾加一行 `> 标准流程已抽到 .ai/runbooks/<文件>`。

## 模板

```markdown
# <主题>（标准流程）

**适用范围**：<环境/机器/目录/命令前提>

## 前置条件

<账号、环境变量、镜像、依赖>

## 流程

```sh
<可复制粘贴的命令序列，带注释>
```

## 坑

- <踩过的坑 + 绕过方法，具体到命令>
```

## 收尾

- 更新 `.ai/README.md` 索引（runbooks 区）
- 清空 `.ai/inbox/` 中已消化片段
