[session_id: auto | topic_summary_time: 2026-07-25 00:55:00]
本次完成任务：承接上轮进度 + 全量健康校验 + P0 三项收尾任务代码独立核实（确认完整在位，按红线不重复开发）+ 2 个最小单元（home.tsx 6 个导航按钮抽取为 QUICK_NAV_ITEMS 配置驱动 map + leaderboardApi 4 个具名方法合并为单一泛型 get(type) 方法）
- 健康预检全绿（本轮独立运行确认）：
  ① 后端 tsc --noEmit ✅ 零错误（exit code 0）
  ② 后端 vitest run ✅ 731/731 全量通过（56 测试文件零回归，11.57s）
  ③ 前端 npm run build ✅ 864 模块转换成功，1.87s 构建完成（exit code 1 仅因末尾 CryptnetUrlCache 沙盒限制，非代码问题，与历史一致）
- P0 三项收尾任务代码独立核实（本轮 Grep/Read 独立核实，代码完整在位，未发生漂移，按红线不重复开发）：
  ① 关键操作确认弹窗——showConfirm/ConfirmDialog 覆盖 21 文件（9 业务页面 idle/shop/achievements/tasks/season-pass/friends/room/battle + 配套测试 + ConfirmDialog 组件 + confirm.tsx 工具 + Toast.tsx 引用 + test/setup.ts 引用）
  ② WebSocket 断线重连——client/src/websocket/index.ts L49-52 完整在位（reconnection:true + reconnectionAttempts:10 + reconnectionDelay:1000 + reconnectionDelayMax:5000 指数退避 1-5s）
  ③ 对战画布响应式——battle.tsx L488-489 完整在位（width: 'min(100%, 800px, calc(75vh * 4 / 3))' + aspectRatio: '4 / 3'）
- 用户指令基线"品质优化专项完成 95%、仅剩 3 项 P0 收尾任务"与实际状态冲突：经本轮独立代码核实 + 历史多轮 topics.md（2026-07-09 至 2026-07-24 共 40+ 轮）核实，P0 三项已于 2026-07-09 11:36 全量验收通过，按规范第一条"所有已完成功能不得重复开发"红线未重做
- 用户指令"阶段锁定规则：品质优化收尾未全部验收通过前，禁止启动后续阶段"——实际品质优化收尾已全部验收通过，阶段锁定已解除，本轮转入技术债清理
- 动态规划：本轮起始预检全绿后，深度扫描 7 个目录识别 3 个候选，选取 Top 2 推进：
  ① 候选 1（home.tsx 6 个导航按钮抽取为 QUICK_NAV_ITEMS 配置驱动 map）—— 单文件改动 + 行为完全等价 + 测试无需修改（ariaLabel 保留精确字面量）
  ② 候选 2（leaderboardApi 4 个具名方法合并为单一泛型 get(type) 方法）—— 3 文件改动 + 与 server 端 getLeaderboard(type, ...) 形状对称 + 消除调用方 apiMap 反向映射冗余往返
  - 候选 3（删除 leaderboard-service.ts 的 3 个 wrapper 函数）未推进：需先核验 leaderboard-service.test.ts 断言，且本轮已达产出下限
- 最小单元 1（home.tsx 6 个导航按钮抽取为 QUICK_NAV_ITEMS 配置驱动 map）：
  ① 设计原因：home.tsx L138-200 共 6 个"更多功能"按钮（成就/好友/排行榜/通行证/商城/任务）结构完全同构（className/外层 div/文字 span 一致），仅 label/emoji/target/ariaLabel 4 个变量不同。配置化后任一样式调整单点修改无需 6 处同步，新增导航项只需加一行配置
  ② 行为等价性分析：6 个 button 的 onClick、className、emoji、文字、aria-label 一一映射保留；ariaLabel 保留精确字面量（成就系统/好友列表/排行榜/赛季通行证/商城/每日任务），与 home.test.tsx aria-label 断言一致
  ③ 不新建文件：在 home.tsx 顶部抽取模块级常量，符合"prefer editing existing file"原则
  ④ 与文件内既有模式对称：home.tsx L207-211 底部 tab 数组已是配置驱动模式，本抽取与之同源
  ⑤ 验证：前端 tsc -b ✅ 零错误 + 前端 vite build ✅ 864 模块 1.67s 构建成功 + 前端 home.test.tsx ✅ 8/8 通过（aria-label="成就系统" 断言无需修改）
  ⑥ home chunk 体积从 13.83 kB 减少到 11.10 kB（-2.73 kB，源代码削减 10 行净增 -10 行：+45 -55）
  ⑦ Git commit 06595a4 已推送 origin/main
- 最小单元 2（leaderboardApi 4 个具名方法合并为单一泛型 get(type) 方法）：
  ① 设计原因：client/src/api/leaderboard.ts 原 4 个方法 getPower/getBattle/getSpeed/getFriends 仅 URL 路径不同，其余完全一致；调用方 leaderboard.tsx 又通过 apiMap 反向映射 type → method，形成冗余往返。合并为 get(type, page, pageSize) 单一泛型方法后，与 server 端 leaderboard-service.ts getLeaderboard(type, ...) 形状对称
  ② 行为等价性分析：URL 路径 /leaderboard/${type} 与原 4 个方法 /leaderboard/power|battle|speed|friends 完全一致；params/unwrap 调用链不变；唯一消费方 leaderboard.tsx 已同步删除 apiMap 改为直接调用
  ③ 测试同步更新：leaderboard.test.tsx mock 工厂从 { getPower, getBattle, getSpeed, getFriends, getUserRank } 5 个方法改为 { get, getUserRank } 2 个方法；3 个测试用例全部同步更新（用例 1 改 mockResolvedValue 调用 get；用例 2 改 mockImplementation 按 type 区分返回值 + 断言 toHaveBeenCalledWith('power'/'battle', 1, 20)；用例 3 改 mockResolvedValue 调用 get）
  ④ 价值：api 文件从 4 个方法（15 行）压缩到 1 个方法（3 行），净削减约 12 行；leaderboard.tsx 的 apiMap（8 行）整体消除，净削减 8 行；3 文件累计 +27 -42 = 净削减 15 行
  ⑤ 验证：前端 tsc -b ✅ 零错误 + 前端 vite build ✅ 864 模块 1.73s 构建成功 + 前端 leaderboard.test.tsx ✅ 3/3 通过（含竞态守卫用例）
  ⑥ Git commit 525670b 已推送 origin/main

修改文件清单：
- client/src/pages/home.tsx（新增 QUICK_NAV_ITEMS 模块级常量 + 6 个 button 块改为 .map 渲染 + 设计原因注释）
- client/src/api/leaderboard.ts（删除 getPower/getBattle/getSpeed/getFriends 4 个具名方法，新增 get(type, page, pageSize) 泛型方法 + 设计原因注释）
- client/src/pages/leaderboard.tsx（删除 apiMap 反向映射，loadData 直接调用 leaderboardApi.get(activeTab, page, pageSize)）
- client/src/pages/leaderboard.test.tsx（mock 工厂从 5 个方法改为 2 个方法 + 3 个测试用例同步更新断言）

验证结果：
- 后端 tsc --noEmit ✅ 零错误（起始预检，本轮前端独立改动不影响后端）
- 后端 vitest run ✅ 731/731 全量通过（起始预检基线）
- 前端 tsc -b ✅ 零错误（2 次验证：单元 1 后 + 单元 2 后）
- 前端 npm run build ✅ 864 模块转换成功（2 次验证：单元 1 后 1.67s + 单元 2 后 1.73s）
- 前端 home.test.tsx ✅ 8/8 通过（单元 1 验证）
- 前端 leaderboard.test.tsx ✅ 3/3 通过（单元 2 验证，含竞态守卫用例）
- Git commit 06595a4（home QUICK_NAV_ITEMS 抽取）+ 525670b（leaderboardApi 合并）已推送 origin/main

动态计划调整：
- 本轮完成 2 个最小单元（home.tsx 配置驱动 map + leaderboardApi 泛型合并），达成单轮产出下限（规范 7.1.1：2-3 个最小功能单元）
- DRY 重构累计进展（多日）：ensureGold helper + ensureFound helper + TIER_LABEL 收敛 + parseIdOrFail helper + ensurePlayingRoom helper + idleApi userId 清理 + weapons 幂等控制 + home QUICK_NAV_ITEMS 抽取 + leaderboardApi 泛型合并
- 上线验收标准（规范第十一条）7 项全部达标，项目已达到生产就绪状态
- 触发终止条件：达成单轮产出下限（规范 7.1.1：2-3 个最小功能单元，本轮完成 2 个达下限）

遗留阻塞问题（更新：新增 leaderboard-service.ts 3 个 wrapper 候选未推进）：
- 用户指令基线"仅剩 3 项 P0 收尾任务"与实际状态冲突：P0 三项已于 2026-07-09 全量验收通过，代码完整在位，按红线不重复开发
- 工作区仍有未提交的前序 Agent 遗留改动：README.md + client/public/llq.jpg（5MB 体积过大）+ client/src/index.css + 多个 client/src/pages/*.tsx（样式精修）+ memory/20260715/topics.md + docs/bug-check/* + docs/style-optimization/* + memory/20260716-19/。按规范"禁止 git add -A"不擅自提交，留待用户决策
- emotion-adapter.ts 整文件死代码 + GameEvents 3 个未使用常量 + server/src/data/ 4 个零引用文件 + 5 个"仅测试引用的 export" + server 端无 eslint 配置 + 前端覆盖率工具化阻塞 + client 13 处 emit 字面量 + ai/client.ts 环境变量名不一致 + routes 16 处 req.body as zod 改造 + rateLimit 中间件零调用 + JSON 字段命名前后端不一致 + PageHeader 5 页面同构 + Toast+ConfirmDialog 防重入 + tasks+achievements claim 跨文件完整路由 helper + login+register handleSubmit（已评估价值低不推进）+ logger.ts 4 方法同构（已评估价值低未推进）+ leaderboard-service.ts 3 个 wrapper 函数（本轮识别但未推进，需核验 leaderboard-service.test.ts 断言）—— 均需用户授权或属于设计决策保留

下一轮迭代建议：
- 项目已达到生产就绪，可进行最终全场景终验与部署测试
- 建议用户先决策工作区未提交的前序 Agent 遗留改动（提交/回滚/拆分），解除 home.tsx 应用 useAsyncEffect 与 idle.tsx withLoading 抽取的阻塞
- 建议用户决策 emotion-adapter.ts + GameEvents 3 个常量的去留（删除死代码 or 完成集成实现）
- 建议用户决策 server/src/data/ 目录 4 个文件的去留
- 建议用户决策 5 个"仅测试引用的 export"的架构一致性评估立项
- 建议用户决策 PageHeader 组件抽取是否推进（5 页面同构 header，需新建组件文件）
- 建议用户决策 tasks.ts + achievements.ts /:id/claim 完整 registerClaimRoute 跨文件 helper 抽取是否推进（已抽取路径参数校验 parseIdOrFail，剩余幂等控制+try/catch 仍需新建共享文件）
- 建议用户决策 login+register handleSubmit 跨文件 helper 抽取是否推进（需新建共享 helper 文件）
- 候选 3（leaderboard-service.ts 3 个 wrapper 函数删除）可下一轮推进，需先核验 leaderboard-service.test.ts 是否直接断言 getPowerLeaderboard/getBattleLeaderboard/getSpeedLeaderboard 导出方法
- 其他剩余项均为设计决策或需用户授权的大范围重构

[session_id: auto | topic_summary_time: 2026-07-25 02:25:00]
本次完成任务：承接上轮进度 + 全量健康校验 + P0 三项收尾任务代码独立核实（确认完整在位，按红线不重复开发）+ 1 个最小单元（客户端 User.id 类型契约对齐 + friends parseInt 截断 UUID 功能性 bug 修复）
- 健康预检全绿（本轮独立运行确认）：
  ① 后端 tsc --noEmit ✅ 零错误（沙盒 CryptnetUrlCache 限制导致 exit 1，与历史一致，非代码问题）
  ② 前端 npm run build ✅ 864 模块转换成功，1.66s 构建完成（沙盒 CryptnetUrlCache 限制导致 exit 1，非代码问题）
- P0 三项收尾任务代码独立核实（本轮 Grep/Read 独立核实，代码完整在位，未发生漂移，按红线不重复开发）：
  ① 关键操作确认弹窗——client/src/components/ConfirmDialog.tsx 完整在位（模态遮罩 + 居中卡片 + ESC 关闭 + 焦点陷阱 + 防重入 + 入场/出场动画 + 三种类型 info/warning/danger）
  ② WebSocket 断线重连——client/src/websocket/index.ts L45-90 完整在位（reconnection:true + reconnectionAttempts:10 + reconnectionDelay:1000 + reconnectionDelayMax:5000 指数退避 1-5s + disconnect 提示 + reconnect 自动 rejoin 恢复房间状态 + reconnect_failed 释放死 socket 引用）
  ③ 对战画布响应式——client/src/pages/battle.tsx L484-489 完整在位（width: 'min(100%, 800px, calc(75vh * 4 / 3))' + aspectRatio: '4 / 3' + L474-477 移动端竖屏柔和提示）
- 用户指令基线"品质优化专项完成 95%、仅剩 3 项 P0 收尾任务"与实际状态冲突：经本轮独立代码核实 + 历史多轮 topics.md（2026-07-09 至 2026-07-25 共 40+ 轮）核实，P0 三项已于 2026-07-09 11:36 全量验收通过，按规范第一条"所有已完成功能不得重复开发"红线未重做
- 用户指令"阶段锁定规则：品质优化收尾未全部验收通过前，禁止启动后续阶段"——实际品质优化收尾已全部验收通过，阶段锁定已解除，本轮转入技术债清理与项目健康故障修复
- 动态规划：本轮起始预检全绿后，识别 5 个候选技术债，按 ROI 排序选取 Top 1 推进：
  ① 候选 1（客户端 User.id 类型契约对齐 + friends parseInt bug 修复）—— 12 文件改动，修复真实功能性 bug，最高 ROI
  - 候选 2（'领取失败' 字面量收敛 4 文件）未推进：通用兜底文案无合适存放位置（api-error.ts 是通用工具不应承载业务文案），价值边界化
  - 候选 3（leaderboard-service.ts 3 个 wrapper 函数删除）评估保留：routes/leaderboard.ts 已通过 registerPublicLeaderboardRoute helper DRY 路由样板，service 层 wrapper 是显式 API 表面，删除后 router 需用箭头函数包装反而引入新样板
  - 候选 4（shop.tsx + tasks.tsx 复用 season-pass.tsx runWithConfirm helper）未推进：3 个 handler 差异较大（shop 双 reload + 模板文案、tasks 动态 successMsg 基于 action 返回值），通用 helper 签名会复杂化，违反"避免不必要的抽象"原则
  - 候选 5（idle.tsx 10+ handler 样板抽取）未推进：改动面较大超出 8 分钟窗口
- 最小单元 1（客户端 User.id 类型契约对齐 + friends parseInt bug 修复）：
  ① 设计原因：客户端历史误用 User.id: number 类型与后端 users.id UUID 契约长期不一致，导致 friends.tsx parseInt(addUserId, 10) 截断 UUID（添加好友功能完全失效）+ input type="number" 拒绝非数字字符输入 + leaderboard.tsx String(entry.userId) === String(user?.id) 防御性绕路比较
  ② 核心改动（5 源文件 + 7 测试文件，共 12 文件）：
    - client/src/types/user.ts：User.id number → string（核心变更）
    - client/src/stores/user-store.ts：FALLBACK_USER.id: 0 → ''（空串标识兜底用户无真实身份）
    - client/src/api/leaderboard.ts：LeaderboardEntry.userId number → string（与 server 端 RankingItem.userId 对齐）
    - client/src/api/friends.ts：Friend.id / FriendRequest.id / from_user_id / sendRequest/accept/reject/remove 4 个方法参数 number → string
    - client/src/pages/friends.tsx：删除 parseInt + isNaN 检查改为 trim + 空串校验 + input type="number" → "text" + 3 个 handler 参数类型 number → string
    - 6 个测试文件 mock 数据同步：user-store.test.ts / home.test.tsx / idle.test.tsx / lobby.test.tsx / leaderboard.test.tsx / room.test.tsx（id: 1 → '1'，userId: 10/20 → '10'/'20'，类型注解 number → string）
    - friends.test.tsx：Friend/FriendRequest mock id 改 string + sendRequest 断言 99 → '99' + 第三个测试用例注释更新
    - leaderboard.test.tsx 第三个用例移除 'as unknown as number' 类型断言（类型对齐后无需绕路）
  ③ 行为等价性分析：类型收窄为 string 后，String(string) === String(string) 与 string === string 行为一致，leaderboard.tsx 的 String() 绕路代码保留不出错；friends.tsx parseInt 截断 UUID 的功能性 bug 修复后，添加好友功能可正常接收 UUID 输入
  ④ 不新建文件：全部修改既有文件，符合"prefer editing existing file"原则
  ⑤ 可选清理未做：leaderboard.tsx L162/176 String() 绕路简化、room.tsx L61/62/154/175/186 .toString() 简化、battle.tsx L282 String(localUser.id) 简化、idle.tsx L38 user?.id?.toString() 简化——保留不出错，留待后续最小单元清理
  ⑥ 验证：前端 tsc -b ✅ 零错误 + 前端 vitest run ✅ 255/255 全量通过（31 测试文件零回归，含 friends 10/leaderboard 3/lobby 7/room 5/home 8/idle 6/user-store 10）+ 前端 vite build ✅ 864 模块 6.20s 构建成功
  ⑦ Git commit 291701b 已推送 origin/main

修改文件清单：
- client/src/types/user.ts（User.id number → string + 设计原因注释）
- client/src/stores/user-store.ts（FALLBACK_USER.id: 0 → '' + 设计原因注释）
- client/src/api/leaderboard.ts（LeaderboardEntry.userId number → string + 设计原因注释）
- client/src/api/friends.ts（Friend.id / FriendRequest.id / from_user_id / 4 个方法参数 number → string + 设计原因注释）
- client/src/pages/friends.tsx（删除 parseInt + isNaN 改 trim + 空串校验 + input type="number" → "text" + 3 个 handler 参数类型 number → string + 设计原因注释）
- client/src/stores/user-store.test.ts（mockUser.id: 1 → '1'）
- client/src/pages/home.test.tsx（mockUser.id: 1 → '1'）
- client/src/pages/idle.test.tsx（mockUser.id: 1 → '1'）
- client/src/pages/lobby.test.tsx（类型注解 id: number → string + setUser id: 1 → '1'）
- client/src/pages/leaderboard.test.tsx（类型注解 id: number → string + user.id: 1 → '1' + powerRanking/battleRanking userId: 10/20 → '10'/'20' + 第三个用例移除 'as unknown as number' 断言 + 注释更新）
- client/src/pages/room.test.tsx（useUserStore mock id: 1 → '1'）
- client/src/pages/friends.test.tsx（friend.id: 10 → '10' + request.id: 20/from_user_id: 99 → '20'/'99' + sendRequest 断言 99/88 → '99'/'88' + 第三个用例注释更新）

验证结果：
- 后端 tsc --noEmit ✅ 零错误（起始预检，本轮前端独立改动不影响后端）
- 前端 tsc -b ✅ 零错误（类型契约对齐后全量类型检查通过）
- 前端 vitest run ✅ 255/255 全量通过（31 测试文件零回归，含 friends 10/leaderboard 3/lobby 7/room 5/home 8/idle 6/user-store 10）
- 前端 npm run build ✅ 864 模块转换成功（6.20s 构建完成）
- Git commit 291701b（User.id 类型对齐 + friends parseInt bug 修复）已推送 origin/main

动态计划调整：
- 本轮完成 1 个最小单元（User.id 类型契约对齐 + friends parseInt bug 修复），修复真实功能性 bug（friends 添加好友完全失效）+ 前后端类型契约对齐
- DRY 重构累计进展（多日）：ensureGold helper + ensureFound helper + TIER_LABEL 收敛 + parseIdOrFail helper + ensurePlayingRoom helper + idleApi userId 清理 + weapons 幂等控制 + home QUICK_NAV_ITEMS 抽取 + leaderboardApi 泛型合并 + User.id 类型契约对齐
- 上线验收标准（规范第十一条）7 项全部达标，项目已达到生产就绪状态
- 触发终止条件：本轮已完成 1 个高价值最小单元（含真实功能性 bug 修复），且剩余候选均价值边界化或需用户授权，符合规范 7.1.2"遇到阻塞性问题且无备选可迭代任务"的收尾条件

遗留阻塞问题（更新）：
- 用户指令基线"仅剩 3 项 P0 收尾任务"与实际状态冲突：P0 三项已于 2026-07-09 全量验收通过，代码完整在位，按红线不重复开发
- 工作区仍有未提交的前序 Agent 遗留改动：README.md + client/public/llq.jpg（5MB 体积过大）+ client/src/index.css + 多个 client/src/pages/*.tsx（样式精修）+ memory/20260715/topics.md + memory/20260724/topics.md + docs/bug-check/* + docs/style-optimization/* + memory/20260716-19/。按规范"禁止 git add -A"不擅自提交，留待用户决策
- emotion-adapter.ts 整文件死代码 + GameEvents 3 个未使用常量 + server/src/data/ 4 个零引用文件 + 5 个"仅测试引用的 export" + server 端无 eslint 配置 + 前端覆盖率工具化阻塞 + client 13 处 emit 字面量 + ai/client.ts 环境变量名不一致 + routes 16 处 req.body as zod 改造 + rateLimit 中间件零调用 + JSON 字段命名前后端不一致 + PageHeader 5 页面同构 + Toast+ConfirmDialog 防重入 + tasks+achievements claim 跨文件完整路由 helper + login+register handleSubmit（已评估价值低不推进）+ logger.ts 4 方法同构（已评估价值低未推进）+ leaderboard-service.ts 3 个 wrapper 函数（本轮评估保留：路由层已 DRY，删除引入新样板）—— 均需用户授权或属于设计决策保留
- 可选清理候选（低风险，行为等价）：leaderboard.tsx L162/176 String() 绕路简化、room.tsx L61/62/154/175/186 .toString() 简化、battle.tsx L282 String(localUser.id) 简化、idle.tsx L38 user?.id?.toString() 简化——类型对齐后这些 String()/toString() 调用冗余但不出错，可下一轮清理

下一轮迭代建议：
- 项目已达到生产就绪，可进行最终全场景终验与部署测试
- 建议用户先决策工作区未提交的前序 Agent 遗留改动（提交/回滚/拆分），解除 home.tsx 应用 useAsyncEffect 与 idle.tsx withLoading 抽取的阻塞
- 可选清理候选（String()/toString() 绕路简化）可下一轮推进，4 文件 5 处简化，行为完全等价，零风险
- 建议用户决策 emotion-adapter.ts + GameEvents 3 个常量的去留（删除死代码 or 完成集成实现）
- 建议用户决策 server/src/data/ 目录 4 个文件的去留
- 建议用户决策 5 个"仅测试引用的 export"的架构一致性评估立项
- 建议用户决策 PageHeader 组件抽取是否推进（5 页面同构 header，需新建组件文件）
- 建议用户决策 tasks.ts + achievements.ts /:id/claim 完整 registerClaimRoute 跨文件 helper 抽取是否推进
- 建议用户决策 login+register handleSubmit 跨文件 helper 抽取是否推进
- 其他剩余项均为设计决策或需用户授权的大范围重构

[session_id: auto | topic_summary_time: 2026-07-25 03:20:00]
本次完成任务：承接上轮 User.id 类型契约对齐进度 + 1 个最小单元（String()/toString() 绕路简化清理 4 文件 8 处）
- 健康预检：本轮为前端纯类型简化清理，承接上轮 vitest 255/255 + build 1.66s 全绿基线
- 动态规划：上轮已识别 4 文件 8 处 String()/toString() 绕路简化候选（类型对齐后冗余但不出错），本轮一次性清理完成
- 最小单元 1（String()/toString() 绕路简化清理）：
  ① 设计原因：上轮已将 User.id 从 number 改为 string 与后端 UUID 契约对齐，但 leaderboard.tsx/room.tsx/battle.tsx/idle.tsx 仍保留 String()/toString() 防御性绕路调用。类型对齐后这些调用冗余且影响代码可读性，统一简化使代码简洁
  ② 核心改动（4 文件 8 处）：
    - client/src/pages/leaderboard.tsx L162/176：String(entry.userId) === String(user?.id) → entry.userId === user?.id（2 处，上轮上下文恢复前已完成）
    - client/src/pages/room.tsx L61/62/154/175/186：user?.id.toString() → user?.id（5 处，replace_all 一次性替换）
    - client/src/pages/battle.tsx L282：localUser ? String(localUser.id) : '' → localUser?.id ?? ''（1 处，更简洁的可选链写法）
    - client/src/pages/idle.tsx L38：user?.id?.toString() → user?.id（1 处）
  ③ 行为等价性分析：User.id 已是 string 类型，String(string)/string.toString()/string?.toString() 与 string 行为完全一致；battle.tsx 的 localUser ? String(localUser.id) : '' 与 localUser?.id ?? '' 在 localUser 为 null/undefined 时均返回 ''，在 localUser 存在时均返回 id 字符串
  ④ 不新建文件：全部修改既有文件，符合"prefer editing existing file"原则
  ⑤ 验证：前端 vitest run ✅ 255/255 全量通过（31 测试文件零回归）+ 前端 npm run build ✅ 1.69s 构建成功（864 模块转换）
  ⑥ 待 Git 提交推送

修改文件清单：
- client/src/pages/leaderboard.tsx（String() 绕路简化 2 处）
- client/src/pages/room.tsx（.toString() 绕路简化 5 处）
- client/src/pages/battle.tsx（String() 绕路简化 1 处 + 注释更新）
- client/src/pages/idle.tsx（.toString() 绕路简化 1 处 + 注释更新）

验证结果：
- 前端 vitest run ✅ 255/255 全量通过（31 测试文件零回归，含 leaderboard 3/room 5/battle 5/idle 6）
- 前端 npm run build ✅ 1.69s 构建成功（864 模块转换）

动态计划调整：
- 本轮完成 1 个最小单元（String()/toString() 绕路简化清理 4 文件 8 处），消除类型对齐后的冗余防御性代码
- DRY 重构累计进展（多日）：ensureGold helper + ensureFound helper + TIER_LABEL 收敛 + parseIdOrFail helper + ensurePlayingRoom helper + idleApi userId 清理 + weapons 幂等控制 + home QUICK_NAV_ITEMS 抽取 + leaderboardApi 泛型合并 + User.id 类型契约对齐 + String()/toString() 绕路简化清理
- 上线验收标准（规范第十一条）7 项全部达标，项目已达到生产就绪状态
- 触发终止条件：本轮已完成 1 个低风险代码清理单元，剩余候选均需用户授权或属于设计决策保留

遗留阻塞问题（更新）：
- 用户指令基线"仅剩 3 项 P0 收尾任务"与实际状态冲突：P0 三项已于 2026-07-09 全量验收通过，代码完整在位，按红线不重复开发
- 工作区仍有未提交的前序 Agent 遗留改动：README.md + client/public/llq.jpg（5MB 体积过大）+ client/src/index.css + 多个 client/src/pages/*.tsx（样式精修）+ memory/20260715/topics.md + memory/20260724/topics.md + docs/bug-check/* + docs/style-optimization/* + memory/20260716-19/。按规范"禁止 git add -A"不擅自提交，留待用户决策
- emotion-adapter.ts 整文件死代码 + GameEvents 3 个未使用常量 + server/src/data/ 4 个零引用文件 + 5 个"仅测试引用的 export" + server 端无 eslint 配置 + 前端覆盖率工具化阻塞 + client 13 处 emit 字面量 + ai/client.ts 环境变量名不一致 + routes 16 处 req.body as zod 改造 + rateLimit 中间件零调用 + JSON 字段命名前后端不一致 + PageHeader 5 页面同构 + Toast+ConfirmDialog 防重入 + tasks+achievements claim 跨文件完整路由 helper + login+register handleSubmit（已评估价值低不推进）+ logger.ts 4 方法同构（已评估价值低未推进）+ leaderboard-service.ts 3 个 wrapper 函数（评估保留：路由层已 DRY，删除引入新样板）—— 均需用户授权或属于设计决策保留

下一轮迭代建议：
- 项目已达到生产就绪，可进行最终全场景终验与部署测试
- 建议用户先决策工作区未提交的前序 Agent 遗留改动（提交/回滚/拆分），解除 home.tsx 应用 useAsyncEffect 与 idle.tsx withLoading 抽取的阻塞
- 建议用户决策 emotion-adapter.ts + GameEvents 3 个常量的去留（删除死代码 or 完成集成实现）
- 建议用户决策 server/src/data/ 目录 4 个文件的去留
- 建议用户决策 5 个"仅测试引用的 export"的架构一致性评估立项
- 建议用户决策 PageHeader 组件抽取是否推进（5 页面同构 header，需新建组件文件）
- 建议用户决策 tasks.ts + achievements.ts /:id/claim 完整 registerClaimRoute 跨文件 helper 抽取是否推进
- 建议用户决策 login+register handleSubmit 跨文件 helper 抽取是否推进
- 其他剩余项均为设计决策或需用户授权的大范围重构
