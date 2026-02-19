# Modu-Arena - Claude Code 代理排行榜

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker-336791?style=flat-square&logo=postgresql)
![Auth](https://img.shields.io/badge/Auth-Custom_JWT-orange?style=flat-square)
![License](https://img.shields.io/badge/License-Copyleft-green?style=flat-square)

追踪 Claude Code 令牌使用量的竞争型排行榜平台。追踪您的 AI 编码会话，与社区竞争，通过代理编码分析发现您独特的编码风格。

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

> **⚠️ 重要公告 (2025-01-25)**
>
> 由于生产环境迁移，**所有现有账户已被重置**。如果您之前已注册，请在 [arena.modu.ai](https://arena.modu.ai) **重新注册**。给您带来不便，深表歉意。

---

## 📚 大家 AI 代理编码讲座

本项目作为 **展示 Modu-Arena 实际应用的讲座示例**而创建。

### 🎯 项目目的

**体验代理编码的新维度！**

Modu-Arena 的创建目的如下：

- **实战 AI 代理编排**: 通过 20 个专业代理协作构建的完整系统
- **SPEC-First TDD 实现**: 从规格说明到测试的完美质量流程
- **可扩展架构**: 应用缓存、数据保留策略、性能优化的实战代码
- **开源贡献**: 公开所有代码为社区学习做贡献

### ⚠️ 开发环境

**48 小时黑客马拉松项目**

本项目在 48 小时内使用 Modu-Arena 集中开发完成。展示实战环境中快速开发的实证示例。

**开发特征**：

- 使用 Modu-Arena 的 `/modu` 统一自主自动化命令实现核心功能
- 混合使用 GLM 4.7 和 Claude Opus 进行成本效益开发
- Worktree 并行开发同时开发独立功能模块

**测试不足说明**：

- 由于 48 小时开发，可能未进行充分测试
- 如果发现任何错误或改进建议，请在 [GitHub Issues](https://github.com/modu-ai/modu-arena/issues) 留言
- 社区贡献使项目更加稳健

### 🔗 相关项目

- **[Modu-Arena](https://github.com/modulabs/modu-arena)**: AI 开发框架

---

## 🚀 开始之前：安装 Modu-Arena

使用 Modu-Arena 之前，必须先安装 **Modu-Arena**。

### 什么是 Modu-Arena？

Modu-Arena 是一个 **创建高质量代码的 AI 开发框架**。

- **SPEC-First TDD**: 通过明确的规格说明减少 90% 的返工
- **AI 编排**: 20 个专业代理 + 48 个技能
- **多语言支持**: 自动支持韩语/英语/日语/中文
- **Worktree 并行开发**: 在完全隔离的环境中进行无限制的并行工作
- **Modu-Arena**: 通过 vibe coding 排行榜提供动力

### 快速安装

```bash
# 方法 1: 快速安装（推荐）
curl -LsSf https://modu-ai.github.io/modu-arena/install.sh | sh

# 方法 2: 手动安装
# 步骤 1: 安装 uv（macOS/Linux）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 步骤 2: 安装 Modu-Arena
uv tool install modu-arena
```

---

## 🎮 Modu-Arena CLI 命令

安装 Modu-Arena 后，您可以使用 Modu-Arena CLI。

### 命令概述

```bash
modu arena [OPTIONS] COMMAND [ARGS]...

Modu-Arena - Claude Code 令牌使用量排行榜

追踪您的 Claude Code 会话并在排行榜上竞争。
网页仪表板: https://arena.modu.ai

选项:
  --help    显示帮助信息

命令:
  login      通过 GitHub OAuth 登录 Modu-Arena (别名: register)
  status     显示当前排名和统计信息
  exclude    将项目从会话追踪中排除
  include    重新包含之前排除的项目
  logout     删除存储的 Modu-Arena 凭证信息
```

### 命令详细说明

#### 1. login - GitHub OAuth 登录

```bash
modu arena login
```

> **注意**: `modu arena register` 作为别名继续支持,以保持向后兼容性。

**工作原理**:

1. 打开浏览器进行 GitHub OAuth 认证
2. 认证成功后自动生成并存储 API 密钥
3. 安装全局挂钩开始自动会话追踪
4. 将 API 密钥安全存储在 `~/.modu/rank/credentials.json`

**执行示例**:

```bash
❯ modu arena login

╭──────────────────────────────── Login ───────────────────────────────╮
│ Modu-Arena Login                                                      │
│                                                                      │
│ This will open your browser to authorize with GitHub.                │
│ After authorization, your API key will be stored securely.           │
╰──────────────────────────────────────────────────────────────────────╯

Opening browser for GitHub authorization...
Waiting for authorization (timeout: 5 minutes)...

╭─────────────────────────── Login Complete ───────────────────────────╮
│ Successfully logged in as your-github-id                             │
│                                                                      │
│ API Key: modu_arena_a9011fac_c...                                     │
│ Stored in: ~/.modu/rank/credentials.json                             │
╰──────────────────────────────────────────────────────────────────────╯

╭───────────────────────── Global Hook Installed ──────────────────────╮
│ Session tracking hook installed globally.                            │
│                                                                      │
│ Your Claude Code sessions will be automatically tracked.             │
│ Hook location: ~/.claude/hooks/modu/session_end__rank_submit.py      │
│                                                                      │
│ To exclude specific projects:                                        │
│   modu arena exclude /path/to/project                                 │
╰──────────────────────────────────────────────────────────────────────╯
```

#### 2. sync - 同步会话数据

```bash
modu arena sync
```

将本地 Claude Code 会话数据同步到 Modu-Arena 服务器。

**输出示例:**

```bash
❯ modu arena sync

Syncing 2577 session(s) to Modu-Arena
Phase 1: Parsing transcripts (parallel: 20 workers)

Parsing transcripts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% (2577/2577)

Phase 2: Submitting 1873 session(s) (batch mode)
Batch size: 100 | Batches: 19

Submitting batches ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% (19/19)

Sync Complete
✓ Submitted: 0
○ Skipped:   704 (no usage or duplicate)
✗ Failed:    500
```

#### 3. status - 查看我的排名

```bash
modu arena status
```

**工作原理**:

- 使用存储的 API 密钥调用 `/api/v1/rank` 端点
- 从服务器检索用户特定的排名数据
- 显示日次/周次/月次/全期间排名和统计信息

**执行示例**:

```bash
❯ modu arena status

╭────────────────────────────── Modu-Arena ─────────────────────────────╮
│ your-github-id                                                       │
│                                                                      │
│ 🏆 Global Rank: #42                                                  │
╰──────────────────────────────────────────────────────────────────────╯
╭───── Daily ──────╮  ╭───── Weekly ─────╮  ╭──── Monthly ─────╮  ╭──── All Time ────╮
│ #12              │  │ #28              │  │ #42              │  │ #156             │
╰──────────────────╯  ╰──────────────────╯  ╰──────────────────╯  ╰──────────────────╯
╭─────────────────────────── Token Usage ──────────────────────────────╮
│ 1,247,832 total tokens                                               │
│                                                                      │
│ Input  ██████████████░░░░░░ 847,291 (68%)                            │
│ Output ██████░░░░░░░░░░░░░░ 400,541 (32%)                            │
│                                                                      │
│ Sessions: 47                                                         │
╰──────────────────────────────────────────────────────────────────────╯

● Hook: Installed  |  https://arena.modu.ai
```

#### 4. exclude/include - 项目管理

```bash
# 排除当前项目
modu arena exclude

# 排除特定路径
modu arena exclude /path/to/private

# 通配符模式
modu arena exclude "*/confidential/*"

# 列出排除的项目
modu arena list-excluded

# 重新包含
modu arena include /path/to/project
```

**隐私保护**:

- 可以从追踪中排除敏感项目
- 排除的项目数据不会发送到服务器

#### 5. logout - 登出

```bash
modu arena logout
```

- 删除存储的 API 密钥
- 删除全局挂钩
- 停止所有追踪

---

## 📊 收集的指标

| 指标           | 说明                      | 是否收集 |
| -------------- | ------------------------- | -------- |
| **令牌使用量** | 输入/输出令牌、缓存令牌   | O        |
| **工具使用**   | Read、Edit、Bash 使用次数 | O        |
| **模型使用**   | Opus、Sonnet、Haiku 详细  | O        |
| **代码指标**   | 添加/删除行、修改文件     | O        |
| **会话信息**   | 持续时间、回合数、时间戳  | O        |
| **代码内容**   | 实际代码内容              | X        |
| **文件路径**   | 项目内的文件路径          | X        |
| **提示**       | 与 Claude 的对话内容      | X        |

**保证**: 收集的数据**仅包含数值指标**，从不传输代码内容或对话详细信息。

---

## 目录

- [功能](#功能)
- [架构](#架构)
- [技术栈](#技术栈)
- [开始使用](#开始使用)
- [环境变量](#环境变量)
- [数据库架构](#数据库架构)
- [API 参考](#api-参考)
- [开发](#开发)
- [部署](#部署)
- [安全](#安全)
- [性能和可扩展性](#性能和可扩展性)

## 功能

### 排名系统

- **多期间排名**: 日次、周次、月次和全期间排行榜
- **综合评分计算**: 考虑多个因素的加权算法
  - 令牌使用量 (40%): 总输入 + 输出令牌
  - 效率 (25%): 输出/输入比优化
  - 会话数 (20%): 编码会话数
  - 连续记录 (15%): 连续活跃天数

### Vibe 编码分析

通过 AI 分析发现您独特的编码风格：

- **探索者**: 专注于代码探索和系统理解
- **创造者**: 专注于创建新功能和代码
- **重构者**: 擅长改进现有代码
- **自动化者**: 任务自动化和工作流程协调

### 仪表板功能

- 实时令牌使用量追踪
- 活动热力图（GitHub 风格）
- 模型使用量分析
- 每小时活动模式
- 每周编码模式
- 工具使用统计
- 匿名参与的隐私模式

### 多语言支持

完全支持 4 种语言：

- 英语 (en)
- 韩语 (ko)
- 日语 (ja)
- 中文 (zh)

## 架构

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/         # 多语言路由 (next-intl)
│   │   │   ├── api/          # API 路由
│   │   │   │   ├── v1/       # 公开 CLI API (v1)
│   │   │   │   │   ├── sessions/ # 会话记录
│   │   │   │   │   ├── rank/     # 用户排名
│   │   │   │   │   ├── status/   # API 状态检查
│   │   │   │   │   └── verify/   # API 密钥验证
│   │   │   │   ├── me/       # 用户仪表板 API
│   │   │   │   ├── leaderboard/ # 公开排行榜
│   │   │   │   ├── cron/     # 定时任务
│   │   │   │   │   ├── calculate-rankings/ # 排名计算
│   │   │   │   │   └── cleanup-data/       # 数据清理
│   │   │   │   └── auth/     # CLI 认证
│   │   │   ├── dashboard/    # 用户仪表板页面
│   │   │   └── users/        # 公开用户资料
│   │   ├── layout.tsx        # 根布局
│   │   └── globals.css       # 全局样式
│   ├── cache/                 # 缓存层
│   │   ├── config.ts         # 缓存 TTL 设置
│   │   └── keys.ts           # 缓存密钥生成器
│   ├── components/            # React 组件
│   │   ├── ui/               # 基础 UI 组件
│   │   ├── layout/           # 布局组件
│   │   ├── leaderboard/      # 排行榜组件
│   │   ├── dashboard/        # 仪表板组件
│   │   └── profile/          # 资料组件
│   ├── db/                    # 数据库层
│   │   ├── schema.ts         # Drizzle ORM 架构
│   │   ├── index.ts          # 数据库连接
│   │   ├── rls.ts            # 行级安全
│   │   └── seed.ts           # 种子数据脚本
│   ├── lib/                   # 工具函数
│   │   ├── auth.ts           # API 密钥和 HMAC 认证
│   │   ├── audit.ts          # 安全审计日志
│   │   ├── cache.ts          # Redis 缓存工具
│   │   ├── rate-limiter.ts   # 速率限制
│   │   ├── score.ts          # 评分计算
│   │   └── api-response.ts   # 响应助手
│   └── i18n/                  # 国际化
├── messages/                   # 翻译文件
└── drizzle/                   # 数据库迁移
```

### 系统架构

![系统架构](docs/system-architecture.png)

## 技术栈

| 类别   | 技术              | 目的                       |
| ------ | ----------------- | -------------------------- |
| 框架   | Next.js 16        | 全栈 React 框架            |
| 语言   | TypeScript 5      | 类型安全开发               |
| 数据库 | PostgreSQL        | Docker 容器数据库          |
| ORM    | Drizzle ORM       | 类型安全数据库查询         |
| 认证   | Custom JWT        | 邮箱 OTP 注册 + 密码登录   |
| 代理   | Caddy             | HTTPS 反向代理             |
| 进程   | PM2               | Node.js 进程管理器         |
| 邮件   | Gmail REST API    | OTP 验证邮件               |
| UI     | Tailwind CSS 4    | 样式                       |
| 组件   | Radix UI          | 无障碍 UI 原语             |
| 图表   | Recharts          | 数据可视化                 |
| i18n   | next-intl         | 国际化               |
| 验证   | Zod               | 运行时类型验证       |

## 开始使用

### 前提条件

- **Node.js** 20.x 或更高版本
- **Bun** 1.x（推荐）或 npm/yarn
- **PostgreSQL**（Docker 容器或独立安装）
- 生产环境用 **Caddy** HTTPS 反向代理
- 生产环境用 **PM2** Node.js 进程管理器

### 安装

1. **克隆仓库**

```bash
git clone https://github.com/your-org/modu-arena.git
cd modu-arena/apps/web
```

2. **安装依赖**

```bash
bun install
```

3. **设置环境变量**

```bash
cp .env.example .env.local
# 打开 .env.local 并输入您的凭证
```

4. **设置数据库**

```bash
# 生成迁移
bun run db:generate

# 将架构推送到数据库
bun run db:push

# （可选）种子示例数据
bun run db:seed
```

5. **启动开发服务器**

```bash
bun run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用程序。

## 环境变量

### 必需变量

| 变量                                | 说明                 | 示例                                             |
| ----------------------------------- | -------------------- | ------------------------------------------------ |
| `DATABASE_URL`                      | PostgreSQL 连接字符串 | `postgresql://user:pass@localhost:5432/dbname`    |
| `JWT_SECRET`                        | JWT 签名密钥          | `your-secure-random-string`                       |

### 可选变量

| 变量                | 说明                               | 默认值       |
| ------------------- | ---------------------------------- | ------------ |
| `GMAIL_CLIENT_ID`      | Gmail OAuth2 客户端 ID     | OTP 邮件发送必需 |
| `GMAIL_CLIENT_SECRET`  | Gmail OAuth2 客户端密钥    | OTP 邮件发送必需 |
| `GMAIL_REFRESH_TOKEN`  | Gmail OAuth2 刷新令牌      | OTP 邮件发送必需 |
| `GMAIL_USER`           | Gmail 发件人邮箱地址       | OTP 邮件发送必需 |
| `CRON_SECRET`          | Cron 作业认证密钥          | 生产环境必需     |

### .env.local 示例

```env
# 数据库（必需）
DATABASE_URL="postgresql://modu:password@localhost:5432/modu_rank"

# JWT 认证（必需）
JWT_SECRET="your-secure-random-string"

# Gmail OAuth2（邮箱 OTP 必需）
GMAIL_CLIENT_ID="your-client-id"
GMAIL_CLIENT_SECRET="your-client-secret"
GMAIL_REFRESH_TOKEN="your-refresh-token"
GMAIL_USER="your-email@gmail.com"

# Cron 认证（生产环境必需）
CRON_SECRET="your-secure-random-string"
```

## 数据库架构

### 实体关系图

```mermaid
erDiagram
    users ||--o{ sessions : has
    users ||--o{ token_usage : has
    users ||--o{ daily_user_stats : has
    users ||--o{ rankings : has
    users ||--o{ project_evaluations : has
    users ||--o| user_stats : has
    users ||--o{ security_audit_log : logs
    users ||--o{ email_verifications : verifies
    tool_types ||--o{ sessions : identifies
    tool_types ||--o{ token_usage : identifies
    sessions ||--o{ token_usage : has

    users {
        uuid id PK
        varchar username UK
        varchar password_hash
        varchar github_id UK
        varchar github_username
        text github_avatar_url
        varchar display_name
        varchar email
        varchar api_key_hash
        varchar api_key_prefix
        varchar user_salt
        boolean privacy_mode
        integer successful_projects_count
        timestamp created_at
        timestamp updated_at
    }

    email_verifications {
        uuid id PK
        varchar email
        varchar code
        timestamp expires_at
        boolean used
        timestamp created_at
    }

    tool_types {
        varchar id PK
        varchar name
        varchar display_name
        text icon_url
        varchar color
        boolean is_active
        integer sort_order
        timestamp created_at
    }

    sessions {
        uuid id PK
        uuid user_id FK
        varchar tool_type_id FK
        varchar session_hash UK
        varchar anonymous_project_id
        timestamp started_at
        timestamp ended_at
        integer duration_seconds
        varchar model_name
        integer turn_count
        jsonb tool_usage
        jsonb code_metrics
        timestamp created_at
    }

    token_usage {
        uuid id PK
        uuid session_id FK
        uuid user_id FK
        varchar tool_type_id FK
        bigint input_tokens
        bigint output_tokens
        bigint cache_creation_tokens
        bigint cache_read_tokens
        timestamp recorded_at
    }

    project_evaluations {
        uuid id PK
        uuid user_id FK
        varchar project_path_hash
        varchar project_name
        integer local_score
        integer backend_score
        integer penalty_score
        integer final_score
        integer cumulative_score_after
        varchar llm_model
        varchar llm_provider
        boolean passed
        text feedback
        timestamp evaluated_at
    }

    user_stats {
        uuid user_id PK_FK
        bigint total_input_tokens
        bigint total_output_tokens
        bigint total_cache_tokens
        bigint total_all_tokens
        jsonb tokens_by_tool
        integer total_sessions
        jsonb sessions_by_tool
        integer successful_projects_count
        integer total_evaluations
        timestamp last_activity_at
        timestamp updated_at
    }

    daily_user_stats {
        uuid id PK
        uuid user_id FK
        date stat_date
        bigint input_tokens
        bigint output_tokens
        bigint cache_tokens
        bigint total_tokens
        integer session_count
        jsonb by_tool
        timestamp created_at
    }

    rankings {
        uuid id PK
        uuid user_id FK
        varchar period_type
        date period_start
        integer rank_position
        bigint total_tokens
        decimal composite_score
        integer session_count
        decimal efficiency_score
        timestamp updated_at
    }

    security_audit_log {
        uuid id PK
        uuid user_id FK
        varchar event_type
        varchar ip_address
        text user_agent
        jsonb details
        timestamp created_at
    }
```

### 表概述

| 表                    | 说明                           |
| --------------------- | ------------------------------ |
| `users`               | 基于邮箱/密码认证的用户账户   |
| `email_verifications` | 注册时邮箱验证用OTP验证码     |
| `tool_types`          | 支持的AI编程工具注册表        |
| `sessions`            | 包含元数据的AI编程工具会话记录 |
| `token_usage`         | 每个会话的详细令牌消耗量      |
| `project_evaluations` | 基于LLM的项目评估结果         |
| `user_stats`          | 仪表板用汇总用户统计          |
| `daily_user_stats`    | 历史图表用每日汇总            |
| `rankings`            | 每个期间的计算排名            |
| `security_audit_log`  | 安全事件审计跟踪              |

## API 参考

### API v1 (CLI 集成)

基础 URL: `/api/v1`

#### API 状态检查

```http
GET /api/v1/status
```

响应:

```json
{
  "status": "operational",
  "version": "1.0.0",
  "timestamp": "2025-01-11T00:00:00.000Z",
  "endpoints": {
    "sessions": "/api/v1/sessions",
    "rank": "/api/v1/rank",
    "status": "/api/v1/status"
  }
}
```

#### API 密钥验证

```http
GET /api/v1/verify
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

响应:

```json
{
  "valid": true,
  "username": "developer",
  "apiKeyPrefix": "modu_arena_xxxxxxxx",
  "privacyMode": false,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

#### 会话记录

```http
POST /api/v1/sessions
Content-Type: application/json
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
X-Timestamp: 1704067200
X-Signature: <HMAC-SHA256 签名>
```

请求体:

```json
{
  "sessionHash": "<64位哈希>",
  "endedAt": "2025-01-11T12:00:00.000Z",
  "inputTokens": 50000,
  "outputTokens": 10000,
  "cacheCreationTokens": 5000,
  "cacheReadTokens": 20000,
  "modelName": "claude-sonnet-4-20250514",
  "anonymousProjectId": "proj_abc123"
}
```

响应:

```json
{
  "success": true,
  "sessionId": "uuid",
  "message": "Session recorded successfully"
}
```

#### 用户排名查询

```http
GET /api/v1/rank
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

响应:

```json
{
  "username": "developer",
  "rankings": {
    "daily": {
      "position": 5,
      "compositeScore": 450.25,
      "totalParticipants": 100
    },
    "weekly": {
      "position": 12,
      "compositeScore": 380.5,
      "totalParticipants": 250
    },
    "monthly": null,
    "allTime": {
      "position": 8,
      "compositeScore": 520.75,
      "totalParticipants": 500
    }
  },
  "stats": {
    "totalTokens": 1500000,
    "totalSessions": 45,
    "inputTokens": 1200000,
    "outputTokens": 300000
  },
  "lastUpdated": "2025-01-11T00:00:00.000Z"
}
```

### 公开 API

#### 排行榜查询

```http
GET /api/leaderboard?period=weekly&limit=50&offset=0
```

查询参数:
| 参数 | 类型 | 默认值 | 说明 |
| -------- | ------- | -------- | ----------------------------------------- |
| `period` | string | `weekly` | `daily`, `weekly`, `monthly`, `all_time` |
| `limit` | number | `50` | 每页结果数 (1-100) |
| `offset` | number | `0` | 分页偏移 |

响应:

```json
{
  "data": [
    {
      "rank": 1,
      "userId": "uuid",
      "username": "top_coder",
      "avatarUrl": "https://...",
      "totalTokens": 5000000,
      "compositeScore": 850.5,
      "sessionCount": 120,
      "efficiencyScore": 0.85,
      "isPrivate": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 500,
    "totalPages": 10,
    "hasMore": true
  }
}
```

### 认证头

| 头部          | 说明                | 必需 |
| ------------- | ------------------- | ---- |
| `X-API-Key`   | 用于认证的 API 密钥 | 是   |
| `X-Timestamp` | Unix 时间戳（秒）   | POST |
| `X-Signature` | HMAC-SHA256 签名    | POST |

### HMAC 签名计算

```
message = timestamp + ":" + request_body
signature = HMAC-SHA256(api_key, message)
```

签名验证条件:

- 最大时间戳有效期：5 分钟
- 定时时间比较以防止定时攻击

## 开发

### 可用脚本

```bash
# 开发
bun run dev          # 使用 Turbopack 启动开发服务器

# 构建
bun run build        # 生产构建
bun run start        # 启动生产服务器

# 数据库
bun run db:generate  # 生成 Drizzle 迁移
bun run db:migrate   # 运行迁移
bun run db:push      # 直接推送架构
bun run db:studio    # 打开 Drizzle Studio GUI
bun run db:seed      # 种子示例数据

# 质量
bun run lint         # 运行 Biome linter
bun run lint:fix     # 修复 linter 问题
bun run format       # 代码格式化
bun run type-check   # TypeScript 类型检查
```

### 代码风格

本项目使用 **Biome** 进行 linter 和格式化：

```bash
# 检查问题
bun run lint

# 自动修复
bun run lint:fix

# 格式化代码
bun run format
```

### 本地测试

1. **使用 curl 进行 API 测试**

```bash
# API 状态检查
curl http://localhost:3000/api/v1/status

# API 密钥验证
curl -H "X-API-Key: your_api_key" http://localhost:3000/api/v1/verify
```

2. **数据库 Studio**

```bash
bun run db:studio
```

Drizzle Studio 在 [https://local.drizzle.studio](https://local.drizzle.studio) 打开。

## 部署

### 生产部署

1. **服务器设置**
   - Docker 容器中运行 PostgreSQL
   - Caddy 配置为 HTTPS 反向代理
   - PM2 管理 Node.js 进程

2. **通过 SCP 部署**

   ```bash
   # 将文件复制到服务器
   scp -r apps/web/ user@server:/path/to/modu-arena/apps/web/

   # 在服务器上: 构建并重启
   cd /path/to/modu-arena/apps/web
   npx next build
   pm2 restart modu-arena-web
   ```

3. **定时任务**

   通过 crontab 或 PM2 cron 配置自动化任务：

   - **排名计算**: 每天 UTC 午夜 — `GET /api/cron/calculate-rankings`
   - **数据清理**: 每天 UTC 凌晨 2 点 — `GET /api/cron/cleanup-data`

## 安全

### 认证

- **网页仪表板**: Custom JWT（邮箱 OTP 注册 + 密码登录）
- **CLI API**: API 密钥 + HMAC-SHA256 签名

### API 安全功能

| 功能         | 实现                               |
| ------------ | ---------------------------------- |
| API 密钥哈希 | SHA-256（仅存储哈希）              |
| 请求签名     | 带时间戳的 HMAC-SHA256             |
| 速率限制     | 100 req/min（基于 Redis 的分布式） |
| 定时攻击防止 | 定时时间比较                       |
| 重放攻击防止 | 5 分钟时间戳有效期窗口             |
| 会话完整性   | 服务器端哈希验证                   |
| 异常检测     | 10 倍令牌阈值标记                  |
| 审计日志     | 记录所有安全事件                   |

### 速率限制

| 端点类型 | 限制    | 窗口   |
| -------- | ------- | ------ |
| 一般 API | 100 req | 1 分钟 |
| 认证     | 10 req  | 1 分钟 |
| 敏感操作 | 30 req  | 1 分钟 |
| 公开读取 | 200 req | 1 分钟 |

### 安全事件类型

审计日志跟踪的事件：

- `api_key_generated` / `api_key_regenerated` / `api_key_revoked`
- `api_key_validated` / `api_key_invalid`
- `hmac_signature_invalid` / `hmac_timestamp_expired`
- `rate_limit_exceeded`
- `session_created` / `session_duplicate`
- `suspicious_activity`
- `privacy_mode_changed`

## 性能和可扩展性

### 缓存策略

使用服务器端缓存优化 API 响应时间。

#### 缓存 TTL 设置

| 数据类型     | TTL          | 说明               |
| ------------ | ------------ | ------------------ |
| 日次排行榜   | 23 小时      | 下次排名计算前有效 |
| 周次排行榜   | 6 天 23 小时 | 下次排名计算前有效 |
| 月次排行榜   | 29 天        | 下次排名计算前有效 |
| 全期间排行榜 | 6 天 23 小时 | 与周次排行榜同步   |
| 用户排名     | 1 小时       | 个别用户数据       |
| 用户统计     | 30 分钟      | 仪表板详细统计     |
| 全局统计     | 15 分钟      | 全局聚合数据       |

#### 缓存失效

排名计算 Cron 任务完成后自动使相关缓存失效：

```typescript
// 排名计算后执行
await delPattern(`modu-arena:leaderboard:daily:*`);
await delPattern(`modu-arena:leaderboard:weekly:*`);
await delPattern(`modu-arena:leaderboard:monthly:*`);
await delPattern(`modu-arena:leaderboard:all_time:*`);
```

#### 优雅降级

当 Redis 连接失败时，绕过缓存并直接从数据库查询数据以防止服务中断。

### 数据保留策略

用于管理数据库大小并维护性能的自动数据清理策略。

#### 保留期限

| 表                 | 保留期限 | 清理目标            |
| ------------------ | -------- | ------------------- |
| `token_usage`      | 90 天    | 90 天以前的记录     |
| `daily_aggregates` | 90 天    | 90 天以前的聚合数据 |
| `rankings` (日次)  | 30 天    | 30 天以前的日次排名 |
| `sessions`         | 90 天    | 90 天以前的会话记录 |

#### 清理时间表

- **执行时间**: 每天凌晨 2 点 UTC
- **批处理**: 以 100 为单位处理以分散数据库负载
- **日志记录**: 记录删除的记录数和执行时间

#### 清理逻辑示例

```typescript
// 清理 90 天以前的 token_usage
while (true) {
  const idsToDelete = await pooledDb
    .select({ id: tokenUsage.id })
    .from(tokenUsage)
    .where(lt(tokenUsage.recordedAt, cutoffDate))
    .limit(100);

  if (idsToDelete.length === 0) break;

  for (const row of idsToDelete) {
    await pooledDb.delete(tokenUsage).where(eq(tokenUsage.id, row.id));
  }
}
```

### 数据库优化

#### 批处理

使用批处理优化大量数据插入/更新的性能：

- **批大小**: 100 条记录
- **应用于**: 排名更新、日次聚合更新
- **ORM 优化**: 利用 PostgreSQL `INSERT ... ON CONFLICT`

#### 连接池

使用 Drizzle ORM 实现 PostgreSQL 连接池：

```typescript
// Database connection with Drizzle ORM
export const db = drizzle(pool, { schema });
```

### 性能监控

#### 关键指标

- API 响应时间（缓存 Hit vs Miss）
- 数据库查询执行时间
- Cron 任务执行时间和处理的记录数
- Redis 缓存命中率

#### 优化机会

- 识别缓存命中率低的端点
- 优化慢查询
- 审查索引添加
- 考虑分区策略（高流量时）

## 综合评分算法

```
Score = (Token * 0.40) + (Efficiency * 0.25) + (Session * 0.20) + (Streak * 0.15)

计算公式:
- Token = min(1, log10(totalTokens + 1) / 10)
- Efficiency = min(outputTokens / inputTokens, 2) / 2
- Session = min(1, log10(sessions + 1) / 3)
- Streak = min(streak, 30) / 30

最终评分 = 加权和 * 1000
```

### 评分等级

| 等级 | 评分范围 |
| ---- | -------- |
| 钻石 | 800+     |
| 铂金 | 600-799  |
| 黄金 | 400-599  |
| 白银 | 200-399  |
| 青铜 | 0-199    |

## 贡献

1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 进行更改
4. 运行 linter: `bun run lint:fix`
5. 提交: `git commit -m 'feat: add amazing feature'`
6. 推送: `git push origin feature/amazing-feature`
7. 打开 Pull Request

## 许可证

本项目采用 **Copyleft License (COPYLEFT-3.0)** 许可 - 详见 [LICENSE](../../LICENSE) 文件。

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=modu-ai/modu-arena&type=date&legend=top-left)](https://www.star-history.com/#modu-ai/modu-arena&type=date&legend=top-left)

---

## 🙏 Made with ❤️ by Modu-Arena Team

**Last Updated:** 2026-01-12
**Modu**: Modu 代表"大家的 AI (Modu-ui AI)"。

> **"无限可能主义 - 大家的 AI"**
