<div align="center">

# 情绪爆破局 · Emotion Burst

*把压力源怪兽化，把解压游戏化 — H5 放置挂机 × 零挫败乱斗解压网游*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

[English](./docs/README.en.md) · 中文 ·
[GDD](./docs/gdd.md) ·
[创意设计展示](./docs/创意展示.html)

</div>

---

给 **TRAE AI 创造力大赛**「生活娱乐 + 社会公益」赛道（主题：「世界很大，放手去造」）。

**现代都市常被压力包围**：加班、KPI、堵车、催婚……我们把它们交出来 — 通过 AI 动态生成专属「情绪 Boss」供你击碎破坏；同时「后台挂机养成 + 上线 3–5 分钟多人乱斗」双节奏设计，让挂机党有长线目标、对战党拥有即时的解压体验。

> **在线即玩，免注册，免安装，主打情绪释放，零挫败竞技，外观付费（无数值付费）。**

---

## 🤖 Agent 自动维护

本项目由 **TRAE AI Agent 自驱迭代** 自动维护，遵循专属定时任务规范进行无人值守的持续开发、健康校验与进度沉淀。

- **规范文件**：[`docs/auto-iteration-spec.md`](./docs/auto-iteration-spec.md)（v1.1）
- **项目路径**：`e:\work/auto-emotion`（Monorepo 架构，所有操作仅限该目录）
- **进度记忆**：`e:\work/auto-emotion\memory\` 目录，按日期存放 `topics.md` 跨轮次延续进度
- **调度模式**：定时触发，单次调度上限 4 小时（3.5 小时强制收尾），单轮完成 2–3 个最小单元（单个 ≤8 分钟）
- **六步闭环**：健康度预检 → 动态规划 → 小步编码 → 全量验收 → 计划复盘 → 进度沉淀
- **健康校验**：后端 `cd server && npx tsc --noEmit && npx vitest run`，前端 `cd client && npm run build`，校验不通过禁止新功能开发
- **全局优先级**：收尾补全 → 项目健康故障修复 → 技术债清理 → 样式精修 → 测试补全
- **阶段锁定**：品质优化收尾未全部验收通过前，禁止启动后续阶段的完整功能开发
- **当前 P0 收尾**：关键操作确认弹窗、WebSocket 断线重连、对战画布响应式
- **Git 规范**：每个最小修改单元通过后立即 `git add`（仅本次文件）→ `git commit` → `git push origin HEAD`，提交信息使用中文，禁止 force push、reset --hard 等破坏性命令
- **资源白名单**：仅可使用 `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image` 生成装饰/占位图，核心游戏资源优先 SVG / CSS / PixiJS 原生绘制
- **降级规则**：大模型 API Key 缺失时先完成业务框架 + 本地 mock；Redis 异常时核心逻辑走内存兜底；Socket.IO 异常时先完成前端 UI 与单机逻辑，预留事件接入点
- **运行风格**：默默干活，不主动通知用户；需用户介入的阻塞问题统一放在摘要「遗留问题」中

> 定时任务指令优先级 > 规范默认值 > 项目规格说明（project-spec.md）。

---

## 特性

- 🎯 **AI 情绪怪兽生成** — 50+ 压力关键词识别（≤3s 响应，失败降级），情绪匹配度 >90%，把真实压力具象化为可击碎的 Boss
- 🕹️ **双节奏体验** — 挂机自动成长，上线即开 3–5 分钟乱斗；离线 24h 累积收益
- 😮‍💨 **零挫败竞技** — 无死亡惩罚、无段位压力，主打破坏得分与趣味互动
- 🧩 **养成体系** — 5 大情绪区域、5 把解压武器、5 个宠物、5 个技能、成长曲线与等级解锁
- 🤝 **多人乱斗** — Socket.IO 实时房间，可开黑，多种对战模式
- 🎨 **新粗野主义 UI** — Neo-brutalism 硬阴影粗边框 + 多字体 Google Fonts（Bungee / ZCOOL KuaiLe / DM Mono / Noto Sans SC）
- 🎮 **PixiJS 8 引擎** — 纯自研 game engine / scene manager / battle scene，粒子/屏幕震动/可破坏物/玩家/投射物实体
- 📊 **赛事化运营** — 赛季通行证、每日任务、成就、好友、排行榜、战绩记录
- 🧼 **开箱即用** — Docker Compose 一键编排 PostgreSQL + Redis + Server + Client
- 📡 **在线即玩** — H5 网页，PC 优先，移动端自适应
- 🤖 **自动迭代** — 内置 TRAE AI 自动迭代规范（`docs/auto-iteration-spec.md`）

---

## 技术栈

| 层级 | 技术方案 | 说明 |
| --- | --- | --- |
| 前端框架 | React 19 · TypeScript · Vite 8 | 极速开发与构建 |
| 游戏引擎 | **PixiJS 8** | 自研 game engine / entity / scene / effects |
| 状态管理 | Zustand 5 | user-store / room-store（含单测） |
| 实时通讯 | Socket.IO Client 4 | 房间、对战、聊天 |
| UI / 样式 | TailwindCSS 4 · Google Fonts | Neo-brutalism 风格 |
| 后端框架 | Node.js 20 · Express 5 · TypeScript | ESM 模块 |
| 数据库 | PostgreSQL 16 | 关系型业务存储 |
| 缓存 | Redis 7 (ioredis) | 高频缓存、临时状态、排行榜 |
| 实时服务端 | Socket.IO 4 | 房间管理、事件调度 |
| 认证与安全 | JWT · bcrypt · Zod 校验 · 限权 · 限流 · 幂等 | 多层防护 |
| AI 子系统 | monster / level / emotion adapter / event generator · prompt 模板 | AI 驱动的关卡与 Boss 生成 |
| API 文档 | Swagger (swagger-jsdoc + /api/docs) | 交互式文档 |
| 健康检查 | `/health` | 容器编排就绪探测 |
| 测试 | Vitest 4 · jsdom · @testing-library/react | 前后端均含伴侣 .test 文件 |
| 部署 | Docker Compose · nginx 反代 | 前后端一键容器化 |

---

## 快速开始

### 环境要求

- Node.js ≥ 20
- PostgreSQL ≥ 14
- Redis ≥ 6
- （可选）Docker ≥ 24 · Docker Compose ≥ 2

### 一键启动（Docker Compose，推荐）

```bash
git clone <repo-url> && cd auto-emotion
cp .env.example .env            # 编辑 .env，填写 JWT_SECRET / DB_PASSWORD / AI_API_KEY / AI_API_URL
docker compose up -d
# 前端 http://localhost  ·  API http://localhost:3000/api  ·  API 文档 http://localhost:3000/api/docs
```

### 本地开发

```bash
# 终端 1：后端热重载（http://localhost:3000）
cd server && npm install && npm run dev

# 终端 2：前端 Vite（http://localhost:5173）
cd client && npm install && npm run dev

# 数据库迁移
psql -h localhost -U postgres -d emotion_burst -f database/migrations/001_init.sql
```

### 关键环境变量

复制 `.env.example` 为 `.env` 后配置：

| 变量 | 必填环境 | 用途 |
| --- | --- | --- |
| `PORT` | 全部 | 后端端口（默认 `3000`） |
| `NODE_ENV` | 全部 | `development` / `production` |
| `JWT_SECRET` | 全部 | JWT 签名密钥（生产必须高强度随机串） |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 全部 | PostgreSQL 连接 |
| `REDIS_HOST` / `REDIS_PORT` | 全部 | Redis 连接 |
| `AI_API_KEY` / `AI_API_URL` | 必填 | AI 情绪/Boss 生成服务 |

---

## 游戏概览

**情绪爆破局（Emotion Burst）** 是一款「放置挂机养成 + 鼠标点击式多人乱斗」解压 H5 网游，面向 **18–35 岁都市职场人群与学生群体**。

### 核心循环

```
挂机自动成长  ⇄  上线 3–5 分钟乱斗  ⇄  结算得资源  ⇄  升级武器/技能/宠物  ⇄  解锁新区
```

### 5 大情绪区域（按等级解锁）

| 区域 | 解锁等级 | 主题关键词 | 特色掉落 |
| --- | --- | --- | --- |
| 职场焦虑区 | Lv 1 | 加班 / KPI / PPT / 会议 | 泡泡枪碎片 |
| 生活烦躁区 | Lv 10 | 堵车 / 排队 / 催婚 / 房贷 | 西瓜锤碎片 |
| 学业压力区 | Lv 20 | 考试 / 论文 / 绩点 / 答辩 | PPT 粉碎炮碎片 |
| 社交内耗区 | Lv 30 | 应酬 / 攀比 / 群消息 / 朋友圈 | 技能道具 |
| 存在焦虑区 | Lv 40 | 迷茫 / 意义 / 未来 / 年龄 | 传说宠物蛋 |

### 成长体系

- **角色等级**：每级 +10 战力 +5% 挂机效率；阶段性经验曲线
- **解压武器**：5 款（泡泡枪 / 西瓜锤 / PPT 粉碎炮 / 闹钟飞镖 / …），稀有度递进，带专属技能
- **宠物 / 技能 / 季节通行证 / 每日任务 / 成就 / 好友 / 战绩记录 …**

完整数值框架请参阅 [docs/gdd.md](./docs/gdd.md)。

---

## 目录结构

```
auto-emotion/
├── client/                  # 前端（React 19 + Vite 8）
│   ├── src/
│   │   ├── api/             # Axios 封装
│   │   ├── assets/          # 静态资源
│   │   ├── components/      # 公共 UI 组件
│   │   ├── game/            # 游戏引擎（core/effects/entities/games/scenes）
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── pages/           # 页面：login/register/home/lobby/room/battle/idle/
│   │   │                    #        shop/tasks/achievements/leaderboard/friends/
│   │   │                    #        records/season-pass/demo
│   │   ├── stores/          # Zustand (user/room)
│   │   ├── test/            # 测试
│   │   ├── types/           # TypeScript 类型
│   │   ├── utils/           # 工具函数
│   │   └── websocket/       # Socket.IO 客户端
│   ├── index.html
│   └── nginx.conf
├── server/                  # 后端（Express 5 + TypeScript）
│   ├── src/
│   │   ├── ai/              # AI 子系（adapter / generator / client）
│   │   ├── config/          # 数据库 / Redis 配置
│   │   ├── data/            # 静态数据（areas / bosses / destructibles / weapons）
│   │   ├── idle/            # 挂机引擎（growth curve / idle engine / offline calc）
│   │   ├── middleware/      # auth / validate / rate-limit / error-handler
│   │   ├── routes/          # 33 个路由文件（auth/ai/users/skills/pets/…）
│   │   ├── services/        # 业务服务层（16+ 文件）
│   │   └── app.ts           # 入口
│   └── Dockerfile
├── database/
│   └── migrations/          # 3 个幂等迁移文件（001_init / 002_stress_keywords / 003_indexes）
├── docs/                    # 完整工程文档
│   ├── project-spec.md      # 项目规格
│   ├── spec.md / tasks.md / checklist.md
│   ├── gdd.md               # 游戏设计文档（数值框架）
│   ├── design-system.md     # Neo-brutalism 设计系统
│   ├── deployment-guide.md  # 部署运维
│   ├── competitor-analysis.md
│   ├── cost-analysis.md
│   └── …
├── .env.example
├── docker-compose.yml
├── LICENSE                  # Apache 2.0
└── 比赛说明文档.md          # TRAE AI 创造力大赛参赛背景
```

---

## 部署

### Docker Compose 编排

| 服务 | 容器名 | 端口 | 用途 |
| --- | --- | --- | --- |
| PostgreSQL | `emotion-postgres` | 5432 | 主数据库 |
| Redis | `emotion-redis` | 6379 | 缓存与会话 |
| Server | `emotion-server` | 3000 | REST API + WebSocket |
| Client | `emotion-client` | 80 | 前端（nginx 托管 + 反代） |

依赖链：server → postgres & redis（健康检查通过后）；client → server。

### 手动部署

```bash
cd server && npm ci && npm run build && npm run start   # 后端
cd client && npm ci && npm run build                     # 前端 dist/ 交由 Nginx / CDN
```

详细部署请参阅 [docs/deployment-guide.md](./docs/deployment-guide.md)。

---

## 主要 API

后端提供 RESTful API，基础路径 `/api`，统一响应格式：

```jsonc
// 成功
{ "code": 200, "message": "操作成功", "data": {} }

// 分页
{ "code": 200, "message": "查询成功", "data": { "list": [], "total": 100, "page": 1, "pageSize": 20 } }

// 错误
{ "code": 400, "message": "参数错误", "errors": [{ "field": "phone", "message": "手机号格式不正确" }] }
```

启动后访问 Swagger：`http://localhost:3000/api/docs`

业务域：认证 · AI 情感匹配 · 用户 · 挂机 · 匹配对战 · 结算 · 技能 · 宠物 · 任务 · 成就 · 好友 · 排行榜 · 商店 · 赛季通行证 · 游戏记录。

---

## 文档

- [项目规格说明](./docs/project-spec.md) — 背景、Monorepo 架构、技术栈、API 规范、P0/P1 质量清单
- [游戏设计文档 GDD](./docs/gdd.md) — 数值框架、挂机/对战/AI/社交/任务/商业化全系统
- [设计系统](./docs/design-system.md) — Neo-brutalism 视觉规范（色板、字体、间距）
- [部署运维手册](./docs/deployment-guide.md) — 环境、架构、变量、应急处理
- [端到端走查](./docs/e2e-walkthrough.md) — 注册→登录→主页→挂机→对战→结算→战绩 全流程
- [竞品分析](./docs/competitor-analysis.md) — 与蛋仔派对 / 旅行青蛙 / 解压神器 对比
- [创新报告](./docs/innovation-report.md) — AI 情绪怪兽 + 双节奏体验的量化指标
- [成本分析](./docs/cost-analysis.md) — Docker 自建月成本估算
- [自动迭代规范](./docs/auto-iteration-spec.md) — TRAE AI 自动迭代规范

---

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 协议开源。

> Copyright © 2026 情绪爆破局 (Emotion Burst) 研发团队。
> TRAE AI 创造力大赛「生活娱乐 + 社会公益」赛道参赛作品。

---

<div align="center"><sub>放下压力，击碎它。— Let it out. Smash it.</sub></div>
