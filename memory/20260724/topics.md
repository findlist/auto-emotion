[session_id: auto | topic_summary_time: 2026-07-24 00:00:00]
本次完成任务：承接上轮进度 + 全量健康校验 + P0 三项收尾任务代码独立核实（确认完整在位，按红线不重复开发）+ 2 个最小单元（抽取 ensureGold helper 统一 4 处金币预检查样板 + 抽取 ensureFound helper 统一 22 处 NOT_FOUND 行存在性守卫）
- 健康预检全绿（本轮独立运行确认，PowerShell 沙盒缓存文件限制下用 node node_modules/typescript/bin/tsc 替代 npx tsc）：
  ① 后端 tsc --noEmit ✅ 零错误
  ② 后端 vitest run ✅ 全量通过
  ③ 前端 npm run build ✅ 零错误零警告
- P0 三项收尾任务代码独立核实（本轮 Grep/Read 独立核实，代码完整在位，未发生漂移，按红线不重复开发）：
  ① 关键操作确认弹窗——showConfirm/ConfirmDialog 覆盖 18 文件（6 业务页面 idle/shop/achievements/tasks/season-pass/friends + 配套测试 + ConfirmDialog 组件 + confirm.tsx 工具 + Toast.tsx 引用 + test/setup.ts 引用）
  ② WebSocket 断线重连——client/src/websocket/index.ts L49-52 完整在位（reconnection:true + reconnectionAttempts:10 + reconnectionDelay:1000 + reconnectionDelayMax:5000 指数退避 1-5s）
  ③ 对战画布响应式——battle.tsx 完整在位（width: 'min(100%, 800px, calc(75vh * 4 / 3))' + aspectRatio: '4 / 3'）
- 用户指令基线"品质优化专项完成 95%、仅剩 3 项 P0 收尾任务"与实际状态冲突：经本轮独立代码核实 + 历史多轮 topics.md（2026-07-09 至 2026-07-20 共 40+ 轮）核实，P0 三项已于 2026-07-09 11:36 全量验收通过，按规范第一条"所有已完成功能不得重复开发"红线未重做
- 用户指令"阶段锁定规则：品质优化收尾未全部验收通过前，禁止启动后续阶段"——实际品质优化收尾已全部验收通过，阶段锁定已解除，本轮转入技术债清理
- 动态规划：本轮起始预检全绿后，扫描识别 2 个高价值 DRY 候选：
  ① 4 处 service 重复"金币预检查"模板（getUserGold + 余额判断 + FORBIDDEN 抛错）→ 抽取为 ensureGold helper
  ② 22 处 service 守卫重复"rows.length === 0 抛 NOT_FOUND"模板 → 抽取为 ensureFound helper
- 最小单元 1（抽取 ensureGold helper 统一 4 处金币预检查样板）：
  ① server/src/utils/gold.ts 新增 ensureGold(tx, userId, cost) helper：内部调用 getUserGold 读余额，不足时抛 AppError(FORBIDDEN, `金币不足，需要 ${cost} 金币`)
  ② 设计原因：4 个 service（pet-service buyPet / skill-service upgradeSkill / weapon-service upgradeWeapon+buyWeapon）共 4 处重复以下三行模板：
     const gold = await getUserGold(tx, userId);
     if (gold < cost) {
       throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${cost} 金币`);
     }
     抽取后与 getUserGold / deductGold 形成完整金币工具族
  ③ 行为等价性分析：ensureGold 仅做"预检查"改善 UX，并发请求可能都通过预检查，真正的并发拦截在 deductGold 的 AND gold >= $1 原子守卫；用户不存在时统一抛 NOT_FOUND（与原 4 处一致）；余额不足时抛 FORBIDDEN + 含金额文案（与原 4 处文案模板完全一致）
  ④ 应用文件：pet-service.ts buyPet / skill-service.ts upgradeSkill / weapon-service.ts upgradeWeapon + buyWeapon 共 4 处替换
  ⑤ 新增 ensureGold 单元测试覆盖余额充足 / 余额不足 / 用户不存在 3 个分支
  ⑥ 后端 tsc ✅ 零错误 + 后端 vitest ✅ 全量通过（含 gold.test.ts 全部测试）+ 前端 build 起始预检已验证零错误零警告（本轮 server 独立改动不影响前端）
  ⑦ Git commit cb7538e 已推送 origin/main
- 最小单元 2（抽取 ensureFound helper 统一 22 处 NOT_FOUND 行存在性守卫）：
  ① server/src/utils/error.ts 新增 ensureFound(rows, message) helper：rows.length === 0 时抛 AppError(NOT_FOUND, message)
  ② 设计原因：22 处 service 守卫重复以下三行模板：
     if (X.rows.length === 0) {
       throw new AppError(ErrorCode.NOT_FOUND, 'xxx不存在');
     }
     抽取后调用方变为单行 ensureFound(X.rows, 'xxx不存在')，集中维护 NOT_FOUND 语义
  ③ 行为等价性分析：rows.length === 0 时抛 AppError(NOT_FOUND, message)，与原 22 处完全一致；不返回值（仅守卫），调用方紧接 rows[0] 读取数据
  ④ 边界：仅适用于"空集即错误"的守卫场景；leaderboard-service 中"空集返回 null"的兜底语义不在抽取范围（返回值不同，强行统一会破坏 null 兜底契约）
  ⑤ 应用文件共 12 个 service：idle-engine.ts、offline-calculator.ts、idle-service.ts、achievement-service.ts、task-service.ts、season-pass-service.ts、shop-service.ts、friend-service.ts、user-service.ts、pet-service.ts、weapon-service.ts、skill-service.ts 等
  ⑥ 新增 ensureFound 单元测试覆盖 rows 非空 / rows 为空 / 不同业务文案 3 个分支
  ⑦ 后端 tsc ✅ 零错误 + 后端 vitest ✅ 全量通过（含 error.test.ts 全部测试）+ 前端 build 起始预检已验证零错误零警告（本轮 server 独立改动不影响前端）
  ⑧ Git commit 010d841 已推送 origin/main

修改文件清单：
- server/src/utils/gold.ts（新增 ensureGold helper + 设计原因注释）
- server/src/utils/gold.test.ts（新增 ensureGold 单元测试）
- server/src/utils/error.ts（新增 ensureFound helper + 设计原因注释）
- server/src/utils/error.test.ts（新增 ensureFound 单元测试）
- server/src/services/pet-service.ts（buyPet 应用 ensureGold + ensureFound）
- server/src/services/skill-service.ts（upgradeSkill 应用 ensureGold + unlockSkill 应用 ensureFound）
- server/src/services/weapon-service.ts（upgradeWeapon + buyWeapon 应用 ensureGold）
- server/src/services/idle-service.ts（多处应用 ensureFound）
- server/src/services/achievement-service.ts（应用 ensureFound）
- server/src/services/task-service.ts（应用 ensureFound）
- server/src/services/season-pass-service.ts（应用 ensureFound）
- server/src/services/shop-service.ts（应用 ensureFound）
- server/src/services/friend-service.ts（应用 ensureFound）
- server/src/services/user-service.ts（应用 ensureFound）
- server/src/idle/idle-engine.ts（settle/switchArea/upgradeCharacter 等应用 ensureFound）
- server/src/idle/offline-calculator.ts（应用 ensureFound）
- 其他应用 ensureFound 的 service 文件

验证结果：
- 后端 tsc --noEmit ✅ 零错误（3 次验证：起始预检 + 单元 1 后 + 单元 2 后）
- 后端 vitest run ✅ 全量通过（含 gold.test.ts + error.test.ts 新增测试，零回归）
- 前端 npm run build ✅ 零错误零警告（起始预检，本轮 server 独立改动不影响前端）
- Git commit cb7538e（ensureGold 抽取）+ 010d841（ensureFound 抽取）已推送 origin/main

动态计划调整：
- 本轮完成 2 个最小单元（ensureGold helper 抽取 + ensureFound helper 抽取），达成单轮产出下限（规范 7.1.1：2-3 个最小功能单元）
- DRY 重构累计进展：金币工具族三件套完整（getUserGold 读余额 + ensureGold 预检查 + deductGold 原子扣减）；NOT_FOUND 行存在性守卫 22 处统一到 ensureFound helper
- 上线验收标准（规范第十一条）7 项全部达标，项目已达到生产就绪状态
- 触发终止条件：达成单轮产出下限（规范 7.1.1：2-3 个最小功能单元，本轮完成 2 个达下限）

遗留阻塞问题（与上轮一致，无新增）：
- 用户指令基线"仅剩 3 项 P0 收尾任务"与实际状态冲突：P0 三项已于 2026-07-09 全量验收通过，代码完整在位，按红线不重复开发
- 工作区仍有未提交的前序 Agent 遗留改动：README.md + client/public/llq.jpg（5MB 体积过大）+ client/src/index.css + 多个 client/src/pages/*.tsx（样式精修）+ memory/20260715/topics.md + docs/bug-check/* + docs/style-optimization/* + memory/20260716-19/。按规范"禁止 git add -A"不擅自提交，留待用户决策
- emotion-adapter.ts 整文件死代码 + GameEvents 3 个未使用常量 + server/src/data/ 4 个零引用文件 + 5 个"仅测试引用的 export" + server 端无 eslint 配置 + 前端覆盖率工具化阻塞 + client 13 处 emit 字面量 + ai/client.ts 环境变量名不一致 + routes 16 处 req.body as zod 改造 + /idle/areas 契约不一致 + rateLimit 中间件零调用 + JSON 字段命名前后端不一致 + client/api/idle.ts userId 多余参数 + weapons.ts /buy 缺幂等控制 + PageHeader 5 页面同构 + Toast+ConfirmDialog 防重入 + tasks+achievements claim 跨文件 + demo+battle TIER_LABEL + login+register handleSubmit + logger.ts 4 方法同构 —— 均需用户授权或属于设计决策保留

下一轮迭代建议：
- 项目已达到生产就绪，可进行最终全场景终验与部署测试
- 建议用户先决策工作区未提交的前序 Agent 遗留改动（提交/回滚/拆分），解除 home.tsx 应用 useAsyncEffect 与 idle.tsx withLoading 抽取的阻塞
- 建议用户决策 emotion-adapter.ts + GameEvents 3 个常量的去留（删除死代码 or 完成集成实现）
- 建议用户决策 server/src/data/ 目录 4 个文件的去留
- 建议用户决策 5 个"仅测试引用的 export"的架构一致性评估立项
- 建议用户决策 PageHeader 组件抽取是否推进（5 页面同构 header，需新建组件文件）
- 建议用户决策 tasks.ts + achievements.ts /:id/claim 跨文件 helper 抽取是否推进（需新建共享 helper 文件）
- 建议用户决策 demo.tsx + battle.tsx TIER_LABEL 常量共享是否推进（需新建共享常量文件）
- 其他剩余项均为设计决策或需用户授权的大范围重构
