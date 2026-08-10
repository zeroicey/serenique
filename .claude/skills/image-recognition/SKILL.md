---
name: image-recognition
description: 识别图片内容（千问 VL 视觉模型）。当用户发来图片、消息带 "Saved attachments"、需要识别/描述截图或图片文件、验证码 OCR、分析图片附件时使用。当前底层模型无原生识图，遇到图片不要用 Read 工具直接读图，改用本 skill 的 vision.js 脚本。
---

# 图片识别（vision.js）

底层模型无原生识图能力。需要理解图片内容时，用本目录的 `vision.js` 调用千问 VL 视觉模型（DashScope API，按量付费）。

## 用法

```sh
node .claude/skills/image-recognition/vision.js "<图片路径>" "<问题>"
# 或图片 URL：
node .claude/skills/image-recognition/vision.js --url "<图片链接>" "<问题>"
```

- 不传问题时默认："请详细描述这张图片的内容。"
- 支持本地路径（jpg/png/gif/webp/bmp）或 `--url` 图片链接
- 配置在同目录 `.env`（DASHSCOPE_API_KEY / VISION_MODEL / DASHSCOPE_BASE_URL），该文件已 gitignore，不要提交；参考 `.env.example`

## 触发时机

- 用户发图片 / 消息带 "Saved attachments" / 要求识别图片
- 需要识别截图内容（验证码 OCR、UI 截图、报错截图）
- 需要分析图片附件（照片、扫描件、测试图片等）

## 规则

- **不要用 Read 工具直接读图片文件**（当前模型拿不到像素，只会浪费上下文），一律走 vision.js
- 问题用中文；需要具体信息时给明确问题（如"图片里写了什么？""这是什么类型的图片？"）
