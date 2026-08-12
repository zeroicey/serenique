# Serenique CLI

Serenique 命令行工具，用于与 [Serenique API](../services/api/) 交互。支持闪念笔记、任务、事件、文件上传下载等全部功能。

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

交互式提示输入 API 地址和 API 令牌（令牌可稍后用 `serenique auth login` 配置）：

```
API 服务地址 [http://localhost:3000]:
API 令牌 (可选，直接回车跳过) []:

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
serenique moment --help   # 闪念模块帮助
serenique moment create --help  # 具体命令帮助（含使用示例）
```

### 3. 开始使用

```sh
# 创建一条闪念笔记
serenique moment create -m "今天完成了项目的第一阶段开发..."

# 查看闪念列表
serenique moment list

# 上传文件

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
| `--token` | `-t` | API 令牌（覆盖配置文件） |
| `--json` | `-j` | JSON 格式输出（适合 AI 和脚本消费） |
| `--config` | `-c` | 配置文件路径（默认 `~/.serenique/config.yaml`） |
| `--version` | | 显示版本信息（由 Makefile 构建元数据注入） |

### 配置管理

```sh
serenique init              # 交互式初始化配置
serenique config            # 查看当前配置
serenique config set <key> <value>  # 修改配置项
serenique config path       # 显示配置文件路径
```

### 认证与 API 令牌

API 令牌（GitHub PAT 模式）是 CLI/脚本访问 API 的凭证，由服务端统一管理（只存
SHA-256 哈希，可单独创建/撤销）。**首次使用需先在浏览器登录 Web 后，在设置页
「API Token 管理」创建令牌**，然后：

```sh
# 配置本机令牌（交互式粘贴，或 --token 直传）
serenique auth login
serenique auth login --token serenique_xxx

# 查看认证状态（Token 身份不携带用户资料，完整用户信息需浏览器会话）
serenique auth me

# 清除本机令牌（默认不动服务端；--revoke 按前缀匹配一并撤销）
serenique auth logout
serenique auth logout --revoke

# 令牌管理（需要已有可用令牌）
serenique token list                 # 列表（前缀/名称/时间，含已撤销，无明文）
serenique token create macbook       # 创建（明文仅此一次返回，请立即保存）
serenique token revoke <令牌ID>       # 撤销（撤销后立即失效，不可恢复）
serenique token revoke <令牌ID> --force
```

### 闪念管理

```sh
# 列出闪念
serenique moment list
serenique moment list --all        # 一次返回全部记录（自动翻页）
serenique moment list --query "beijing"  # 按关键词搜索（支持中文/拼音/英文）
serenique moment list --query "北京" --tag <标签ID>  # 关键词 + 标签组合过滤
serenique moment list --page 1 --page-size 50

# 创建闪念（最长 500 字），可一步关联已上传的文件
serenique moment create --text "记录一个灵感..."
serenique moment create -m "记录一个灵感"
serenique moment create -m "好想法" --blob-id <文件ID> --role photo --display-name "配图"
serenique moment create -m "好想法" --blob-id <文件ID1> --blob-id <文件ID2>

# 查看闪念详情（含附件列表）
serenique moment get <闪念ID>

# 删除闪念
serenique moment delete <闪念ID>
serenique moment delete <闪念ID> --force

# 为闪念关联附件
serenique moment attach <闪念ID> --blob-id <文件ID> --role cover --display-name "配图"
serenique moment detach <闪念ID> <附件关联ID>
serenique moment detach <闪念ID> <附件关联ID> --force
```

### 任务管理

```sh
# 任务组
serenique task group create --title "工作"
serenique task group list
serenique task group list --all        # 一次返回全部记录（自动翻页）
serenique task group get <任务组ID>
serenique task group update <任务组ID> --title "新标题"
serenique task group delete <任务组ID>
serenique task group delete <任务组ID> --force  # 级联删除组内任务，跳过确认

# 任务（任务必须归属于某个任务组）
serenique task create --title "写周报" --group-id <任务组ID>
serenique task create --title "写周报" --group-id <任务组ID> --status done
serenique task list                       # 按创建时间倒序
serenique task list --all                 # 一次返回全部记录（自动翻页）
serenique task list --group-id <任务组ID>  # 按任务组过滤
serenique task list --status done         # 按状态过滤 (todo/done/abandon)
serenique task get <任务ID>
serenique task update <任务ID> --title "新标题"
serenique task update <任务ID> --status done      # completedAt 由服务端自动同步
serenique task update <任务ID> --group-id <新任务组ID>
serenique task delete <任务ID>
serenique task delete <任务ID> --force
```

### 文件管理

```sh
# 上传文件（支持多文件）
serenique blob upload photo.jpg
serenique blob upload *.jpg *.png
serenique blob upload doc.pdf image.png

# 文件列表
serenique blob list
serenique blob list --all                 # 一次返回全部记录（自动翻页）
serenique blob list --mime-type image/    # 按类型过滤
serenique blob list --page 1 --page-size 50

# 查看文件详情
serenique blob info <文件ID>

# 下载文件
serenique blob download <文件ID>
serenique blob download <文件ID> --output ./saved.jpg
serenique blob download <文件ID> --download  # 强制作为附件下载
serenique blob download <文件ID> --force     # 覆盖已存在的本地文件

# 创建临时访问链接
serenique blob link <文件ID>
serenique blob link <文件ID> --expires-in 3600  # 1小时后过期

# 删除文件
serenique blob delete <文件ID>
serenique blob delete <文件ID> --force

# 将文件关联到业务实体
serenique blob attach <文件ID> \
  --owner-type event \
  --owner-id <事件ID> \
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

### 服务端审计日志

```sh
# 列出审计日志（按时间倒序）
serenique logs list
serenique logs list --all                 # 一次返回全部记录（自动翻页）
serenique logs list --level warn          # 按级别过滤 (info/warn/error)
serenique logs list --event auth.login    # 按事件类型过滤
serenique logs list --unread-only         # 仅显示未读日志
serenique logs list --page 1 --page-size 50

# 查看未读日志数
serenique logs unread

# 标记日志为已读（默认全部；--ids 精准标记）
serenique logs read
serenique logs read --ids <日志ID1>,<日志ID2>
```

## AI Agent 使用指南

CLI 工具同样为 AI Agent 设计，建议 AI 采用以下模式调用：

### 首次使用

```sh
# 1. 了解可用命令
serenique --help

# 2. 了解特定模块
serenique moment --help
serenique moment create --help

# 3. 配置连接（如果尚未配置）
serenique init --baseurl http://localhost:3000
```

### JSON 模式

使用 `--json` / `-j` 标志获取结构化输出，便于程序解析：

```sh
# 查询闪念列表
serenique moment list --json

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

可通过 `--config` / `-c` 全局选项指定其他配置文件路径，也可以通过
`SERENIQUE_CONFIG_DIR` 环境变量指定配置目录（该目录下的 `config.yaml` 会被使用）：

```sh
serenique --config /path/to/myconfig.yaml moment list
export SERENIQUE_CONFIG_DIR=/path/to/config-dir
serenique moment list
```

配置优先级（从高到低）：

1. 命令行选项 `--baseurl` / `--token`
2. 环境变量 `SERENIQUE_BASEURL` / `SERENIQUE_TOKEN`
3. 配置文件 `~/.serenique/config.yaml`（或用 `--config` / `SERENIQUE_CONFIG_DIR` 指定）
4. 默认值（baseurl: `http://localhost:3000`, token: `""`）

配置文件以 `0600` 权限写入（含 token 时不会对同机其他用户可见）。

## 脚本与 AI 使用

- `--json` / `-j` 模式下，stdout 只会输出一段可解析的 JSON，进度与错误信息写入 stderr。
- 所有命令在 API 或参数出错时都以非零退出码结束（成功为 0），可在脚本中通过
  `$?` 或 `&&` 判断成败。

## 临时访问链接（blob link）

`serenique blob link` 依赖后端 `BLOB_SIGNING_SECRET` 环境变量（至少 32 个字符）。
未配置时该命令会报错。请确保部署的 API 已配置该变量（`.env.example` 中有示例值）。

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
│   ├── moment.go            # serenique moment
│   ├── blob.go              # serenique blob
│   └── task.go              # serenique task
└── internal/
    ├── config/              # 配置文件读写
    ├── client/              # HTTP 客户端（含 task 类型化方法）
    └── output/              # 输出格式化（表格 + JSON）
```

## 技术栈

- **语言**: Go 1.26.3+（见 `go.mod`）
- **CLI 框架**: [cobra](https://github.com/spf13/cobra) — Kubernetes、GitHub CLI 同款
- **配置解析**: [yaml.v3](https://gopkg.in/yaml.v3)
- **依赖数量**: 极少（4 个依赖），编译快、二进制小
