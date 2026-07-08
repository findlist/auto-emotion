# 情绪爆破局 - 任务清单（tasks.md）

> 任务编号规则：`阶段.模块.序号`
> 阶段对应原计划四阶段：P1 原型验证 / P2 可玩 Demo / P3 Alpha 测试 / P4 Beta 上线
> 依赖关系：`依赖 T1.x.x` 表示必须先完成对应任务
> 并行标记：`[可并行]` 表示与同阶段其他可并行任务无依赖

---

## 第一阶段：概念原型验证期（P1，4 周）

**核心目标**：验证核心玩法手感与核心循环可行性，确定美术风格与技术路线

### T1.1 玩法设计输出

#### T1.1.1 完整 GDD 文档
- 编写 `docs/gdd.md` 游戏设计文档
- 明确所有系统规则、数值框架、成长曲线
- 覆盖挂机/对战/AI/社交/任务/商业化全系统
- 依赖：无
- 验证：文档评审通过

#### T1.1.2 基础内容规则细节
- 敲定 3 个基础解压武器（泡泡枪、西瓜锤、PPT 粉碎炮）
- 敲定 2 类基础怪兽（职场焦虑类、生活烦躁类）
- 敲定 1 个核心对战模式（自由乱斗）规则细节
- 依赖：T1.1.1
- 验证：规则可执行、数值平衡

### T1.2 原型开发

#### T1.2.1 前端脚手架
- 初始化 `client/`：Vite + React 18 + TypeScript 5 + TailwindCSS 4
- 安装核心依赖：`pixi.js`、`zustand`、`axios`、`socket.io-client`
- 配置路径别名 `@/`
- 依赖：无
- 验证：`npm run dev` 启动成功

#### T1.2.2 后端脚手架
- 初始化 `server/`：Node.js 20 + Express 4 + TypeScript 5
- 配置 `tsconfig.json` 严格模式
- 配置 `nodemon` + `ts-node` 热重载
- 安装核心依赖：`pg`、`ioredis`、`socket.io`、`bcrypt`、`jsonwebtoken`、`zod`
- 依赖：无
- 验证：`npm run dev` 启动成功，`/health` 返回 200

#### T1.2.3 Docker Compose
- 编写 `docker-compose.yml`：postgres、redis、server、client
- 编写 `server/Dockerfile`、`client/Dockerfile`
- 编写 `.env.example`
- 依赖：T1.2.1、T1.2.2
- 验证：`docker compose up -d` 全部服务健康

#### T1.2.4 单机核心操作手感
- 实现 PixiJS 引擎核心：`client/src/game/core/`
- 实现点击射击、物品破坏、基础技能释放
- 实现破碎特效、粒子效果、屏幕震动
- 依赖：T1.2.1
- 验证：可单机点击破坏物品，反馈手感达标

#### T1.2.5 挂机系统最小原型
- 实现 `server/src/idle/idle-engine.ts`
- 实现自动刷怪、资源掉落、等级提升闭环
- 依赖：T1.2.2
- 验证：角色可自动战斗并升级

#### T1.2.6 AI 怪兽生成 Demo
- 实现 `server/src/ai/monster-generator.ts`
- 关键词 → 属性/技能映射的规则化 Demo
- 依赖：T1.2.2
- 验证：输入"加班"生成合理怪兽配置

### T1.3 美术与风格定调

#### T1.3.1 美术风格定稿
- 确定卡通明亮、低压力的美术风格
- 输出主角、怪兽、场景概念图各 3 版
- 依赖：无
- 验证：风格评审通过

#### T1.3.2 解压反馈视觉风格
- 敲定破碎特效、粒子效果、屏幕震动强度
- 依赖：T1.3.1
- 验证：反馈强度档位定义清晰

### T1.4 阶段交付
- 可运行单机原型
- 完整 GDD 文档
- 美术风格定稿图
- 技术选型方案

---

## 第二阶段：可玩 Demo 研发期（P2，8 周）

**核心目标**：完成完整单局对战体验、基础多人联网、挂机系统全流程

### T2.1 数据库与基础设施

#### T2.1.1 数据库迁移 001_init.sql
- 创建全部表：users、characters、idle_areas、weapons、user_weapons、skills、user_skills、pets、user_pets、game_records、game_record_players、shop_items、user_items、friendships、daily_tasks、user_daily_tasks、achievements、user_achievements、season_passes、user_season_passes
- 所有 DDL 幂等：`CREATE TABLE IF NOT EXISTS`
- 创建必要索引
- 依赖：T1.2.3
- 验证：迁移执行无报错

#### T2.1.2 后端配置层
- `server/src/config/index.ts`：环境变量读取 + 启动校验
- `server/src/config/database.ts`：PostgreSQL 连接池
- `server/src/config/redis.ts`：Redis 客户端
- 依赖：T1.2.2
- 验证：启动时校验必填环境变量

#### T2.1.3 后端工具层
- `server/src/utils/response.ts`：统一响应封装
- `server/src/utils/error.ts`：错误类 + 错误码
- `server/src/utils/idempotency.ts`：幂等控制（Redis 5 秒窗口）
- `server/src/utils/logger.ts`：结构化日志
- 依赖：T2.1.2
- 验证：单元测试覆盖

#### T2.1.4 后端中间件层
- `server/src/middleware/auth.ts`：JWT 认证
- `server/src/middleware/error-handler.ts`：全局错误捕获
- `server/src/middleware/rate-limit.ts`：限流（滑动窗口）
- `server/src/middleware/validate.ts`：参数校验（zod）
- 依赖：T2.1.3
- 验证：单元测试覆盖

### T2.2 用户体系

#### T2.2.1 用户服务层
- `server/src/services/user-service.ts`
- 方法：`register`、`login`、`getProfile`、`updateProfile`、`logout`
- 密码 bcrypt 哈希、JWT 签发 + refreshToken
- 依赖：T2.1.1、T2.1.4
- 验证：单元测试覆盖

#### T2.2.2 用户路由层
- `server/src/routes/auth.ts`、`server/src/routes/user.ts`
- 应用限流、参数校验、认证中间件
- 依赖：T2.2.1
- 验证：接口测试通过

#### T2.2.3 前端用户 API + Store
- `client/src/api/auth.ts`、`client/src/api/user.ts`
- `client/src/stores/user-store.ts`（Zustand）
- 登录态持久化（localStorage）
- 依赖：T1.2.1、T2.2.2
- 验证：前端可调用接口完成注册登录

#### T2.2.4 前端登录/注册/个人资料页
- `client/src/pages/login.tsx`、`register.tsx`、`profile.tsx`
- 表单校验、错误提示
- 依赖：T2.2.3
- 验证：UI 走查通过

### T2.3 挂机养成系统

#### T2.3.1 挂机引擎
- `server/src/idle/idle-engine.ts`
- 自动战斗逻辑、资源掉落、经验累计
- 依赖：T2.1.2
- 验证：挂机可自动产出

#### T2.3.2 离线收益计算
- `server/src/idle/offline-calculator.ts`
- 离线时长 × 挂机效率，上限 12 小时
- 依赖：T2.3.1
- 验证：离线收益计算正确

#### T2.3.3 成长曲线
- `server/src/idle/growth-curve.ts`
- 等级经验曲线、武器升级消耗、技能解锁条件
- 依赖：T2.3.1
- 验证：曲线平衡

#### T2.3.4 挂机区域配置
- 初始化 5 个情绪区域数据
- 依赖：T2.1.1
- 验证：区域解锁逻辑正确

#### T2.3.5 挂机服务层 + 路由
- `server/src/services/idle-service.ts`
- 接口：状态查询、切换区域、领取离线收益、挂机日志
- 依赖：T2.3.2、T2.3.4
- 验证：接口测试通过

#### T2.3.6 武器/技能/宠物服务
- `server/src/services/weapon-service.ts`、`skill-service.ts`、`pet-service.ts`
- 列表、升级、装备、解锁
- 依赖：T2.1.1
- 验证：升级装备影响战力

#### T2.3.7 前端挂机 UI
- `client/src/pages/idle.tsx`
- 挂机空间、离线收益领取、武器/技能/宠物面板
- 依赖：T2.3.5、T2.3.6、T2.2.4
- 验证：UI 走查通过

### T2.4 WebSocket + 房间系统

#### T2.4.1 WebSocket 通道
- `server/src/websocket/index.ts`：Socket.IO 初始化
- `server/src/websocket/events.ts`：事件常量
- JWT 鉴权握手
- 断线重连 + 离线消息补齐（Redis 缓存最后 10 条）
- 依赖：T2.2.1
- 验证：客户端可建立连接，断线重连生效

#### T2.4.2 房间管理器
- `server/src/websocket/room-manager.ts`
- 房间状态机：waiting → ready → generating → playing → settling → closed
- Redis 存储房间状态
- 房间号生成、加入、退出、房主转移、空房销毁
- 依赖：T2.4.1
- 验证：单元测试覆盖状态流转

#### T2.4.3 房间事件处理
- `room:join`、`room:ready`、`room:leave`、`room:set-mode`、`room:submit-stress`、`room:start`
- 广播 `room:state`
- 依赖：T2.4.2
- 验证：多人客户端可同房间交互

#### T2.4.4 匹配服务
- `server/src/services/match-service.ts`
- 快速匹配队列（Redis List）
- 30 秒超时
- 依赖：T2.4.2
- 验证：多人匹配测试

#### T2.4.5 前端大厅 + 房间 UI
- `client/src/pages/lobby.tsx`、`room.tsx`
- `client/src/stores/room-store.ts`
- 房间状态实时同步、模式选择
- 依赖：T2.4.3、T2.2.4
- 验证：UI 走查通过

### T2.5 AI 能力系统

#### T2.5.1 AI 服务封装
- `server/src/ai/client.ts`：大模型 API 客户端
- 超时控制（10 秒）、错误兜底
- 依赖：T2.1.2
- 验证：可调用大模型 API

#### T2.5.2 情绪怪兽生成
- `server/src/ai/monster-generator.ts`
- Prompt：`server/src/ai/prompts/monster-generation.md`
- 输入压力源关键词 → 输出 `MonsterConfig`
- Schema 校验 + 兜底怪兽
- 支持 10+ 常见压力关键词
- 依赖：T2.5.1
- 验证：生成结果符合 Schema，差异化明显

#### T2.5.3 动态关卡生成
- `server/src/ai/level-generator.ts`
- 输入怪兽配置 + 模式 → 输出 `LevelLayout`
- 可破坏物、障碍物随机布局
- 兜底布局
- 依赖：T2.5.1
- 验证：布局合理

#### T2.5.4 随机事件生成
- `server/src/ai/event-generator.ts`
- 输入模式 + 时长 → 输出 `GameEvent[]`
- 每局 2-4 个事件
- 兜底事件库
- 依赖：T2.5.1
- 验证：事件触发合理

#### T2.5.5 情绪自适应反馈
- `server/src/ai/emotion-adapter.ts`
- 分析玩家操作节奏 → 输出特效烈度（1-5 档）
- 每 5 秒分析一次
- 依赖：T2.5.1
- 验证：反馈强度动态调整

#### T2.5.6 AI 集成到房间
- 房间收到全员压力源后触发 AI 生成
- 广播 `game:level-ready`
- 依赖：T2.4.3、T2.5.2、T2.5.3、T2.5.4
- 验证：房间内可触发 AI 生成并下发

### T2.6 对战核心

#### T2.6.1 游戏引擎核心
- `client/src/game/core/engine.ts`：PixiJS 应用封装
- `client/src/game/core/scene-manager.ts`：场景管理
- `client/src/game/core/asset-loader.ts`：资源加载
- 依赖：T1.2.4
- 验证：可加载并渲染基础场景

#### T2.6.2 特效系统
- `client/src/game/effects/`
- 破碎特效、粒子效果、屏幕震动
- 支持特效烈度档位（1-5）
- 依赖：T2.6.1
- 验证：特效可按烈度调整

#### T2.6.3 Boss 组队战模式
- `client/src/game/games/boss-game.ts`
- 共同攻击 Boss、破坏物品积攒大招、角色自动走位
- 依赖：T2.6.1、T2.6.2
- 验证：可 3-4 人组队击败 Boss

#### T2.6.4 自由乱斗模式
- `client/src/game/games/brawl-game.ts`
- 攻击玩家、破坏物品、被击中击飞/粘滞无死亡
- 依赖：T2.6.1、T2.6.2
- 验证：可 6-8 人乱斗

#### T2.6.5 手速竞速模式
- `client/src/game/games/speed-game.ts`
- 捏泡泡、撕胶带、砸西瓜微动作连击
- 90 秒倒计时
- 依赖：T2.6.1、T2.6.2
- 验证：可单人/多人竞速

#### T2.6.6 对战状态同步
- `server/src/websocket/game-server.ts`
- 轮次调度：`game:start` → `game:action-broadcast` → `game:score-update` → `game:event` → `game:finish`
- 分数汇总、MVP 计算
- 依赖：T2.4.3
- 验证：3 种模式流程闭环

#### T2.6.7 前端对战场景
- `client/src/game/scenes/battle-scene.ts`
- 接收关卡配置 → 渲染场景 → 加载模式 → 上报分数
- 依赖：T2.6.3 ~ T2.6.5、T2.6.6
- 验证：可完整进行一局对战

### T2.7 结算系统

#### T2.7.1 结算服务
- `server/src/services/settle-service.ts`
- 收益规则：经验/金币/掉落/对战积分
- 事务：写 `game_records` + `game_record_players` + 更新 `users`
- 幂等：相同对局 ID 不重复结算
- 依赖：T2.1.1、T2.1.3
- 验证：并发结算测试，数据一致

#### T2.7.2 战绩查询服务
- `server/src/services/record-service.ts`
- 列表 + 详情
- 水平权限校验
- 依赖：T2.7.1
- 验证：只能查自己的战绩

#### T2.7.3 战绩路由 + 前端
- `server/src/routes/game-record.ts`
- `client/src/api/record.ts`、`client/src/pages/records.tsx`
- 依赖：T2.7.2
- 验证：UI 走查通过

### T2.8 内容填充

#### T2.8.1 基础内容数据
- 5 款基础解压武器
- 8 种普通小怪
- 4 个经典情绪 Boss
- 3 套基础场景
- 20+ 种可破坏物品（玻璃、泡泡纸、西瓜、积木等）
- 依赖：T2.1.1
- 验证：内容配置完整

#### T2.8.2 基础 UI 界面
- 主界面、挂机界面、匹配界面、结算界面
- 依赖：T2.2.4、T2.3.7、T2.4.5
- 验证：UI 走查通过

#### T2.8.3 音频制作
- 核心音效：点击、破碎、爆炸、技能释放
- 3 套场景 BGM（轻松、轻快、无压迫感）
- 依赖：无
- 验证：音效不刺耳

### T2.9 阶段交付
- 可联网对战 Demo
- 完整核心系统
- 首批美术/音频资源
- AI 生成模块初版

---

## 第三阶段：Alpha 封闭测试期（P3，4 周）

**核心目标**：补全内容、调优数值与手感、验证留存与趣味性

### T3.1 内容扩充

#### T3.1.1 手速竞速模式完善
- 上线 10+ 款解压微动作小游戏
- 依赖：T2.6.5
- 验证：小游戏可玩

#### T3.1.2 武器皮肤 + 角色装饰
- 武器皮肤系统、角色装饰系统
- 依赖：T2.8.1
- 验证：个性化内容丰富

#### T3.1.3 情绪 Boss 库扩充
- 扩充至 10+ 个 Boss
- 支持 30+ 压力关键词生成
- 依赖：T2.5.2
- 验证：Boss 多样性

### T3.2 体验调优

#### T3.2.1 操作手感优化
- 根据测试反馈优化点击、破坏反馈、特效烈度
- 依赖：T2.6.7
- 验证：手感达标

#### T3.2.2 数值平衡
- 调优挂机成长曲线与对战数值平衡
- 避免数值碾压
- 依赖：T2.3.3、T2.7.1
- 验证：数值平衡

#### T3.2.3 网络同步优化
- 降低延迟与卡顿
- 依赖：T2.4.1
- 验证：延迟 < 100ms

### T3.3 AI 能力迭代

#### T3.3.1 关卡生成优化
- 优化 AI 关卡生成的合理性与趣味性
- 减少无效布局
- 依赖：T2.5.3
- 验证：布局合理性提升

#### T3.3.2 情绪自适应优化
- 优化根据玩家操作节奏动态调整爽感反馈
- 依赖：T2.5.5
- 验证：反馈强度匹配玩家状态

### T3.4 P0 质量加固

#### T3.4.1 数据安全加固
- 积分/金币/钻石/经验变更接口加事务 + `FOR UPDATE`
- 购买接口加幂等控制
- 依赖：T2.7.1
- 验证：并发测试无脏数据

#### T3.4.2 权限加固
- 全局认证覆盖检查
- 水平权限校验检查
- JWT 黑名单生效
- 依赖：T2.2.2
- 验证：越权访问被拒绝

#### T3.4.3 异常兜底
- 全局错误捕获不暴露堆栈
- WebSocket 断线重连 + 离线消息补齐
- 定时任务：房间清理、对局超时结算、离线收益兜底
- 依赖：T2.4.1
- 验证：异常场景兜底生效

### T3.5 封闭测试

#### T3.5.1 招募测试用户
- 招募 50-100 名目标用户
- 依赖：T3.4
- 验证：测试用户到位

#### T3.5.2 测试执行 + 反馈收集
- 收集玩法反馈、留存数据、bug 问题
- 形成迭代清单
- 依赖：T3.5.1
- 验证：测试报告产出

#### T3.5.3 迭代优化
- 根据测试反馈完成优化
- 依赖：T3.5.2
- 验证：优化项全部完成

### T3.6 阶段交付
- Alpha 测试版本
- 测试报告
- 优化后的完整游戏版本

---

## 第四阶段：Beta 测试与上线筹备期（P4，4 周）

**核心目标**：完成商业化基础、性能优化、合规准备，达到上线标准

### T4.1 性能与兼容性优化

#### T4.1.1 低端设备适配
- 保证稳定帧率
- 依赖：T3.6
- 验证：低端设备流畅运行

#### T4.1.2 包体与加载优化
- 优化包体大小、加载速度、内存占用
- 依赖：T3.6
- 验证：加载时间达标

#### T4.1.3 严重 bug 修复
- 修复所有已知严重 bug
- 依赖：T3.5.2
- 验证：无严重 bug

### T4.2 运营与商业化搭建

#### T4.2.1 通行证系统
- `server/src/services/season-pass-service.ts`
- 赛季制、每日/每周任务体系
- 依赖：T2.1.1
- 验证：通行证流程闭环

#### T4.2.2 商业化系统
- 外观皮肤、装饰道具、挂机加速卡
- 无数值付费
- 依赖：T2.1.1
- 验证：购买流程闭环

#### T4.2.3 客服与反馈渠道
- 客服系统、反馈渠道、违规检测
- 依赖：T4.2.2
- 验证：渠道可用

### T4.3 社交与排行榜

#### T4.3.1 社交系统
- 好友、组队、私聊
- 依赖：T2.4.1
- 验证：社交功能闭环

#### T4.3.2 排行榜
- 战力榜、对战榜、好友榜、速度榜
- Redis ZSET 缓存
- 依赖：T2.7.1
- 验证：榜单数据正确

### T4.4 任务成就系统

#### T4.4.1 每日任务
- 每日刷新、进度更新、领奖
- 依赖：T2.1.1
- 验证：任务流程闭环

#### T4.4.2 成就体系
- 成就列表、进度、完成奖励
- 依赖：T2.1.1
- 验证：成就自动检测

### T4.5 合规与资质准备

#### T4.5.1 法务内容
- 版号申请材料筹备（如需国内上线）
- 隐私合规、用户协议
- 依赖：无
- 验证：材料齐备

#### T4.5.2 防沉迷系统
- 防沉迷系统接入
- 依赖：T4.5.1
- 验证：防沉迷生效

### T4.6 Beta 测试与预热

#### T4.6.1 千人 Beta 测试
- 不限号 Beta 测试
- 验证服务器承载力
- 依赖：T4.1、T4.2、T4.3、T4.4
- 验证：千人并发稳定

#### T4.6.2 宣发素材
- 制作宣发素材
- 开启预约渠道
- 依赖：T4.6.1
- 验证：素材齐备

### T4.7 部署与提交材料

#### T4.7.1 Docker 部署完善
- 完善 `docker-compose.yml`
- 编写 `README.md` 部署说明
- 依赖：T4.6.1
- 验证：`docker compose up -d` 一键启动

#### T4.7.2 创意展示 HTML
- 用 TRAE Work 生成创意展示页
- 依赖：无
- 验证：HTML 可独立打开

#### T4.7.3 演示视频
- 3-5 分钟功能演示
- 依赖：T4.6.1
- 验证：覆盖核心流程

### T4.8 阶段交付
- 正式上线版本
- 运营后台系统
- 合规资质
- 宣发素材包

---

## 任务依赖关系图

```
P1 原型验证
├─ T1.1 设计输出 ─ T1.1.1 ─ T1.1.2
├─ T1.2 原型开发
│   ├─ T1.2.1 前端 ─┐
│   ├─ T1.2.2 后端 ─┼─ T1.2.3 Docker
│   │               ├─ T1.2.4 单机手感
│   │               ├─ T1.2.5 挂机原型
│   │               └─ T1.2.6 AI Demo
│   └─ T1.3 美术定调 ─ T1.3.1 ─ T1.3.2
        ↓
P2 可玩 Demo
├─ T2.1 基础设施
│   ├─ T2.1.1 迁移（依赖 T1.2.3）
│   ├─ T2.1.2 配置（依赖 T1.2.2）
│   ├─ T2.1.3 工具（依赖 T2.1.2）
│   └─ T2.1.4 中间件（依赖 T2.1.3）
├─ T2.2 用户体系（依赖 T2.1.1、T2.1.4）
├─ T2.3 挂机养成（依赖 T2.1.2）
├─ T2.4 房间系统（依赖 T2.2.1）
├─ T2.5 AI 能力（依赖 T2.1.2、T2.4.3）
├─ T2.6 对战核心（依赖 T1.2.4、T2.4.3）
├─ T2.7 结算系统（依赖 T2.1.1、T2.1.3）
├─ T2.8 内容填充（依赖 T2.1.1）
        ↓
P3 Alpha 测试
├─ T3.1 内容扩充（依赖 T2.6.5、T2.5.2）
├─ T3.2 体验调优（依赖 T2.6.7、T2.3.3）
├─ T3.3 AI 迭代（依赖 T2.5.3、T2.5.5）
├─ T3.4 P0 加固（依赖 T2.7.1、T2.2.2、T2.4.1）
├─ T3.5 封闭测试（依赖 T3.4）
        ↓
P4 Beta 上线
├─ T4.1 性能优化（依赖 T3.6）
├─ T4.2 商业化（依赖 T2.1.1）
├─ T4.3 社交排行（依赖 T2.4.1、T2.7.1）
├─ T4.4 任务成就（依赖 T2.1.1）
├─ T4.5 合规资质
├─ T4.6 Beta 测试（依赖 T4.1~T4.4）
└─ T4.7 部署提交（依赖 T4.6.1）
```

---

## 并行开发建议

| 阶段 | 可并行任务组 | 负责域 |
|------|------------|--------|
| P2 基础设施后 | T2.2 / T2.3 / T2.4 / T2.5 / T2.6 / T2.7 / T2.8 | 用户/挂机/房间/AI/对战/结算/内容 |
| P3 调优期 | T3.1 / T3.2 / T3.3 / T3.4 | 内容/手感/AI/质量 |
| P4 上线期 | T4.2 / T4.3 / T4.4 / T4.5 | 商业化/社交/任务/合规 |
| P4 提交期 | T4.7.1 / T4.7.2 / T4.7.3 | 部署/HTML/视频 |
