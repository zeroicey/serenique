# Serenique CLI

Serenique 命令行工具，用于与 [Serenique API](../services/api/) 交互。支持日记管理、闪念笔记、文件上传下载等全部功能。

设计灵感来自 GitHub 的 `gh` CLI 工具，既适合开发者手动使用，也适合 AI Agent 通过命令行调用。

## 安装

### 从源码编译

```sh
cd apps/cli
make build
```

编译产物在 `bin/serenique`，可以将其复制到 `$PATH` 中：

```sh
make install  # 复制到 /usr/local/bin
```

### 交叉编译

```sh
make build-all
```

生成多平台二进制文件：

| 文件 | 平台 |
|------|------|
| `bin/serenique-darwin-arm64` | macOS (Apple Silicon) |
| `bin/serenique-darwin-amd64` | macOS (Intel) |
| `bin/serenique-linux-amd64` | Linux x86_64 |
| `bin/serenique-linux-arm64` | Linux ARM64 |
| `bin/serenique-windows-amd64.exe` | Windows x86_64 |

## 快速开始

### 1. 初始化配置

```sh
serenique init
```

交互式提示输入 API 地址和认证令牌（当前后端暂无认证，token 可留空）：

```
API 服务地址 [http://localhost:3000]:
认证令牌 (可选，直接回车跳过) []:

✓ 配置已保存到 ~/.serenique/config.yaml
```

也可以通过环境变量配置：

```sh
export SERENIQUE_BASEURL=http://localhost:3000
export SERENIQUE_TOKEN=your-token-here
```

### 2. 查看帮助

```sh
serenique --help          # 根命令帮助
serenique diary --help    # 日记模块帮助
serenique diary create --help  # 具体命令帮助（含使用示例）
```

### 3. 开始使用

```sh
# 创建今天的日记
serenique diary create -m "今天完成了项目的第一阶段开发..."

# 查看日记列表
serenique diary list

# 创建一条闪念笔记
serenique moment create -m "突然想到一个好主意"

# 上传文件
serenique blob upload photo.jpg

# 下载文件
serenique blob download <文件ID>
```

## 命令参考

### 全局选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--baseurl` | `-b` | API 服务地址（覆盖配置文件） |
| `--token` | `-t` | 认证令牌（覆盖配置文件） |
| `--json` | `-j` | JSON 格式输出（适合 AI 和脚本消费） |
| `--config` | `-c` | 配置文件路径（默认 `~/.serenique/config.yaml`） |

### 配置管理

```sh
serenique init              # 交互式初始化配置
serenique config            # 查看当前配置
serenique config set <key> <value>  # 修改配置项
serenique config path       # 显示配置文件路径
```

### 日记管理

```sh
# 列出日记
serenique diary list
serenique diary list --page 1 --page-size 10
serenique diary list --json  # JSON 输出

# 创建日记
serenique diary create -m "日记内容"
serenique diary create -m "补昨天的日记" --date 2026-08-03

# 查看详情
serenique diary get <日记ID>

# 更新日记
serenique diary update <日记ID> -m "新的内容"

# 删除日记（需要确认）
serenique diary delete <日记ID>
serenique diary delete <日记ID> --force  # 跳过确认
```

### 闪念管理

```sh
# 列出闪念
serenique moment list
serenique moment list --page 1 --page-size 20

# 创建闪念（最长 500 字）
serenique moment create -m "记录一个灵感..."

# 删除闪念
serenique moment delete <闪念ID>
serenique moment delete <闪念ID> --force
```

### 文件管理

```sh
# 上传文件（支持多文件）
serenique blob upload photo.jpg
serenique blob upload *.jpg *.png
serenique blob upload doc.pdf image.png

# 文件列表
serenique blob list
serenique blob list --mime-type image/  # 按类型过滤
serenique blob list --page 1 --page-size 20

# 查看文件详情
serenique blob info <文件ID>

# 下载文件
serenique blob download <文件ID>
serenique blob download <文件ID> --output ./saved.jpg
serenique blob download <文件ID> --download  # 强制作为附件下载

# 创建临时访问链接
serenique blob link <文件ID>
serenique blob link <文件ID> --expires-in 3600  # 1小时后过期

# 删除文件
serenique blob delete <文件ID>
serenique blob delete <文件ID> --force

# 将文件关联到业务实体
serenique blob attach <文件ID> \
  --owner-type diary \
  --owner-id <日记ID> \
  --role cover \
  --display-name "封面图"

# 查看文件的业务关联
serenique blob attachments <文件ID>

# 删除业务关联（仅删除引用，不删文件）
serenique blob detach <关联ID>
serenique blob detach <关联ID> --force

# 清理孤儿文件（磁盘上未被数据库引用的文件）
serenique blob cleanup
serenique blob cleanup --force
```

## AI Agent 使用指南

CLI 工具同样为 AI Agent 设计，建议 AI 采用以下模式调用：

### 首次使用

```sh
# 1. 了解可用命令
serenique --help

# 2. 了解特定模块
serenique diary --help
serenique diary create --help

# 3. 配置连接（如果尚未配置）
serenique init --baseurl http://localhost:3000
```

### JSON 模式

使用 `--json` / `-j` 标志获取结构化输出，便于程序解析：

```sh
# 查询日记列表
serenique diary list --json

# 上传文件并获取 ID
serenique blob upload image.png --json
```

### 批量操作

```sh
# 批量上传文件
serenique blob upload ./images/*.jpg

# 查看帮助自行学习新命令
serenique --help
```

## 配置文件

默认位置：`~/.serenique/config.yaml`

```yaml
# Serenique CLI configuration
baseurl: http://localhost:3000
token: ""
```

配置优先级（从高到低）：

1. 命令行选项 `--baseurl` / `--token`
2. 环境变量 `SERENIQUE_BASEURL` / `SERENIQUE_TOKEN`
3. 配置文件 `~/.serenique/config.yaml`
4. 默认值（baseurl: `http://localhost:3000`, token: `""`）

## 项目结构

```
apps/cli/
├── main.go                  # 入口
├── go.mod                   # Go 模块定义
├── Makefile                 # 构建脚本
├── README.md
├── cmd/                     # Cobra 命令定义
│   ├── root.go              # 根命令 + 全局选项
│   ├── init.go              # serenique init
│   ├── config.go            # serenique config
│   ├── diary.go             # serenique diary
│   ├── moment.go            # serenique moment
│   └── blob.go              # serenique blob
└── internal/
    ├── config/              # 配置文件读写
    ├── client/              # HTTP 客户端
    └── output/              # 输出格式化（表格 + JSON）
```

## 技术栈

- **语言**: Go 1.22+
- **CLI 框架**: [cobra](https://github.com/spf13/cobra) — Kubernetes、GitHub CLI 同款
- **配置解析**: [yaml.v3](https://gopkg.in/yaml.v3)
- **依赖数量**: 极少（4 个依赖），编译快、二进制小
