// server/src/services/task-service.test.ts
// 每日任务服务单元测试：覆盖任务列表合并、进度更新分支、领取奖励事务边界
// 设计原因：claimTaskReward 涉及奖励发放（经验/金币），需事务保护防双发；
// ensureDailyTasksExist 含 count=0 时随机抽样初始化逻辑，需控制随机性验证幂等；
// updateTaskProgress 存在 UPDATE/INSERT 双分支（已有记录 vs 首次进度），是核心质量风险点。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：任务查询、进度查询、COUNT 检查
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/UPDATE/INSERT/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接，泄漏会导致连接池耗尽
  releaseMock: vi.fn(),
  // pool.connect：获取事务客户端
  connectMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mocks.queryMock,
    connect: mocks.connectMock,
  },
}));

import { getDailyTasks, updateTaskProgress, claimTaskReward } from './task-service.js';

describe('task-service 每日任务服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    // pool.query 默认返回空行，用例用 mockResolvedValueOnce 覆盖关键查询
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getDailyTasks 获取每日任务列表', () => {
    it('今日任务已生成时跳过初始化，合并用户进度返回', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT 已生成
        .mockResolvedValueOnce({
          rows: [
            { id: 1, code: 'daily_battle_2', name: '完成2局对战', type: 0, target: 2, reward_exp: 50, reward_gold: 100 },
          ],
        }) // daily_tasks 查询
        .mockResolvedValueOnce({
          rows: [{ id: 10, task_id: 1, progress: 2, claimed: false }], // user_daily_tasks 查询
        });

      const result = await getDailyTasks('u1');

      // 验证合并：有 user 记录则取 progress/claimed，无则默认 0/false
      expect(result).toEqual([
        {
          id: 1, code: 'daily_battle_2', name: '完成2局对战', type: 0, target: 2,
          progress: 2, claimed: false, reward_exp: 50, reward_gold: 100,
        },
      ]);
      // count > 0 时不应触发 INSERT 初始化
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO daily_tasks')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('用户无进度记录时 progress/claimed 取默认值', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 2, code: 'daily_idle_30', name: '挂机30分钟', type: 1, target: 30, reward_exp: 50, reward_gold: 100 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // 用户无任何任务记录

      const result = await getDailyTasks('u2');

      expect(result[0].progress).toBe(0);
      expect(result[0].claimed).toBe(false);
    });

    it('count=0 时触发初始化插入 3 个任务模板', async () => {
      // 固定 Math.random 保证 sort 顺序可预测
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT=0 触发初始化
        .mockResolvedValueOnce({ rows: [] }) // 第 1 个 INSERT
        .mockResolvedValueOnce({ rows: [] }) // 第 2 个 INSERT
        .mockResolvedValueOnce({ rows: [] }) // 第 3 个 INSERT
        .mockResolvedValueOnce({ rows: [] }) // daily_tasks 查询（初始化后为空，简化）
        .mockResolvedValueOnce({ rows: [] }); // user_daily_tasks 查询

      await getDailyTasks('u3');

      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO daily_tasks')
      );
      expect(insertCalls).toHaveLength(3);
      randomSpy.mockRestore();
    });
  });

  describe('updateTaskProgress 更新任务进度', () => {
    it('已有 user_daily_tasks 记录时执行 UPDATE 原子自增', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, target: 2, progress: 1, user_task_id: 10 }, // 已有记录
        ],
      });

      await updateTaskProgress('u1', 0, 1);

      // 验证 UPDATE 调用，参数为 delta=1 原子自增（progress = progress + $1），而非计算值 newProgress=2
      // 原子自增避免并发 read-then-write 丢失更新
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_daily_tasks SET progress = progress +'),
        [1, 10]
      );
      // 不应触发 INSERT
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_daily_tasks')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('无 user_daily_tasks 记录时执行 INSERT（progress=delta）', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 2, target: 30, progress: null, user_task_id: null }, // 首次进度
        ],
      });

      await updateTaskProgress('u1', 1, 30);

      // 用 filter 精准定位 INSERT 调用，避免与 SELECT 查询混淆
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_daily_tasks')
      );
      expect(insertCalls).toHaveLength(1);
      // ON CONFLICT 兜底并发：两个并发请求同时首次插入时，第二个命中 UNIQUE 约束转为累加更新，避免 unique violation 报错
      expect(String(insertCalls[0][0])).toContain('ON CONFLICT');
      // 参数：user_id, task_id, progress=delta（首次插入 delta 即正确进度）, today
      expect(insertCalls[0][1]).toEqual(['u1', 2, 30, expect.any(String)]);
    });

    it('多条同类型任务时循环处理', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, target: 2, progress: 1, user_task_id: 10 },
          { id: 2, target: 5, progress: null, user_task_id: null },
        ],
      });

      await updateTaskProgress('u1', 0, 1);

      // 验证 UPDATE + INSERT 各调用 1 次
      const updateCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('UPDATE user_daily_tasks SET progress')
      );
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_daily_tasks')
      );
      expect(updateCalls).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
    });
  });

  describe('claimTaskReward 领取任务奖励', () => {
    it('任务不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] }); // LEFT JOIN 查询为空

      await expect(claimTaskReward('u1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '任务不存在',
      });
      // 未进入事务
      expect(mocks.connectMock).not.toHaveBeenCalled();
    });

    it('已领取抛 CONFLICT', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 2, reward_exp: 50, reward_gold: 100, progress: 2, claimed: true, user_task_id: 10 }],
      });

      await expect(claimTaskReward('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已领取奖励',
      });
    });

    it('进度不足抛 BAD_REQUEST', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 5, reward_exp: 100, reward_gold: 200, progress: 2, claimed: false, user_task_id: 10 }],
      });

      await expect(claimTaskReward('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '任务未完成',
      });
    });

    it('有 user_task_id 时执行 UPDATE claimed + 发放奖励 + COMMIT', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, target: 2, reward_exp: 50, reward_gold: 100,
          progress: 2, claimed: false, user_task_id: 10,
        }],
      });
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
        // 事务内权威检查：返回用户已有 user_daily_tasks 记录（user_task_id=10, claimed=false）
        .mockResolvedValueOnce({ rows: [{ claimed: false, user_task_id: 10, progress: 2 }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE claimed
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users 经验金币

      const result = await claimTaskReward('u1', 1);

      expect(result).toEqual({ success: true, reward_exp: 50, reward_gold: 100 });
      // 验证更新领取状态（事务内用 recheck.rows[0].user_task_id 而非预检查的 task.user_task_id）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_daily_tasks SET claimed = true'),
        [10]
      );
      // 验证发放奖励（经验 + 金币）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET experience = experience +'),
        [50, 100, 'u1']
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('无 user_task_id 时执行 INSERT claimed=true + 发放奖励', async () => {
      // 预检查返回 user_task_id=null（首次领取），事务内 recheck 也返回空（advisory lock 串行化后仍无记录）
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, target: 2, reward_exp: 50, reward_gold: 100,
          progress: 2, claimed: false, user_task_id: null,
        }],
      });
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [] }) // 事务内 recheck 返回空（首次领取）
        .mockResolvedValueOnce({ rows: [] }) // INSERT user_daily_tasks
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users 经验金币

      const result = await claimTaskReward('u1', 1);

      expect(result).toEqual({ success: true, reward_exp: 50, reward_gold: 100 });
      // 验证走 INSERT 分支
      const insertCalls = mocks.clientQueryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_daily_tasks')
      );
      expect(insertCalls).toHaveLength(1);
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('事务内权威检查发现已领取时抛 CONFLICT（并发场景）', async () => {
      // 预检查返回 claimed=false（并发请求都通过预检查）
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, target: 2, reward_exp: 50, reward_gold: 100,
          progress: 2, claimed: false, user_task_id: 10,
        }],
      });
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
        // 事务内权威检查返回 claimed=true（前一个并发请求已 COMMIT）
        .mockResolvedValueOnce({ rows: [{ claimed: true, user_task_id: 10, progress: 2 }] });

      await expect(claimTaskReward('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已领取奖励',
      });
      // 验证 ROLLBACK 与 release 均被调用
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK + release + 透传错误', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, target: 2, reward_exp: 50, reward_gold: 100,
          progress: 2, claimed: false, user_task_id: 10,
        }],
      });
      const error = new Error('奖励发放失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ claimed: false, user_task_id: 10, progress: 2 }] }) // recheck
        .mockImplementationOnce(() => Promise.reject(error)); // UPDATE claimed 抛错

      await expect(claimTaskReward('u1', 1)).rejects.toThrow('奖励发放失败');

      // 验证 ROLLBACK 与 release 均被调用，防止连接泄漏
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
