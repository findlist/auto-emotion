// server/src/services/friend-service.test.ts
// 好友服务单元测试：覆盖好友请求发送、双向自动接受、事务化接受/删除、各类校验分支
// 设计原因：好友关系涉及双向数据一致性，acceptFriendRequest 与 removeFriend 使用事务保护，
// 是核心质量风险点；sendFriendRequest 含 5 层校验与双向自动接受逻辑，分支密集需逐项覆盖。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：非事务查询入口（好友列表、请求查询、发送请求、拒绝请求）
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

import {
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from './friend-service.js';

describe('friend-service 好友服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务客户端默认返回空行，单测可按需覆盖
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    // pool.query 默认返回空行，用例用 mockResolvedValueOnce 覆盖关键查询
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getFriends 好友列表', () => {
    it('透传查询结果', async () => {
      const rows = [{ id: 2, nickname: '好友A', online: true }];
      mocks.queryMock.mockResolvedValueOnce({ rows });

      const result = await getFriends('u1');

      expect(result).toEqual(rows);
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('FROM friendships f'),
        ['u1']
      );
    });
  });

  describe('getPendingRequests 收到的好友请求', () => {
    it('透传查询结果', async () => {
      const rows = [{ id: 1, from_user_id: 2, nickname: '请求人' }];
      mocks.queryMock.mockResolvedValueOnce({ rows });

      const result = await getPendingRequests('u1');

      expect(result).toEqual(rows);
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('f.friend_id = $1 AND f.status = 0'),
        ['u1']
      );
    });
  });

  describe('sendFriendRequest 发送好友请求', () => {
    it('添加自己为好友抛 BAD_REQUEST', async () => {
      await expect(sendFriendRequest('1', 1)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '不能添加自己为好友',
      });
      // 校验失败不应查询数据库
      expect(mocks.queryMock).not.toHaveBeenCalled();
    });

    it('目标用户不存在抛 NOT_FOUND', async () => {
      // SELECT id FROM users WHERE id → 空行
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(sendFriendRequest('1', 2)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    });

    it('已是好友抛 CONFLICT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // 用户存在
        .mockResolvedValueOnce({ rows: [{ id: 9 }] }); // 已是好友（status=1）

      await expect(sendFriendRequest('1', 2)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已是好友',
      });
    });

    it('已发送过好友请求抛 CONFLICT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // 用户存在
        .mockResolvedValueOnce({ rows: [] }) // 不是好友
        .mockResolvedValueOnce({ rows: [{ id: 8 }] }); // 已发送过（status=0）

      await expect(sendFriendRequest('1', 2)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已发送过好友请求',
      });
    });

    it('收到过对方请求时双向自动接受，事务内 UPDATE+INSERT 并 COMMIT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // 用户存在
        .mockResolvedValueOnce({ rows: [] }) // 不是好友
        .mockResolvedValueOnce({ rows: [] }) // 未发送过请求
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // 反向检查命中（对方发过请求）

      const result = await sendFriendRequest('1', 2);

      expect(result).toEqual({ success: true, autoAccepted: true });
      // 验证双向建立走事务保护：BEGIN → UPDATE 对方请求 → INSERT 自己侧 → COMMIT
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('BEGIN');
      // userId 为 string、targetUserId 为 number，参数透传保持原类型
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE friendships SET status = 1'),
        [2, '1']
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO friendships'),
        ['1', 2]
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('双向自动接受事务失败时 ROLLBACK 并 release 并透传错误', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // 用户存在
        .mockResolvedValueOnce({ rows: [] }) // 不是好友
        .mockResolvedValueOnce({ rows: [] }) // 未发送过请求
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // 反向检查命中
      const error = new Error('INSERT 失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockRejectedValueOnce(error); // INSERT 抛错

      await expect(sendFriendRequest('1', 2)).rejects.toThrow('INSERT 失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('正常发送请求返回 requestId', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // 用户存在
        .mockResolvedValueOnce({ rows: [] }) // 不是好友
        .mockResolvedValueOnce({ rows: [] }) // 未发送过请求
        .mockResolvedValueOnce({ rows: [] }) // 反向检查未命中
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }); // INSERT RETURNING id

      const result = await sendFriendRequest('1', 2);

      expect(result).toEqual({ success: true, requestId: 10 });
      // 验证 INSERT status=0（待处理）
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('VALUES ($1, $2, 0)'),
        ['1', 2]
      );
    });
  });

  describe('acceptFriendRequest 接受好友请求', () => {
    it('请求不存在或已处理抛 NOT_FOUND', async () => {
      // BEGIN 后 SELECT 返回空
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }); // SELECT 请求不存在

      await expect(acceptFriendRequest('1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '请求不存在或已处理',
      });
      // 抛错后走 catch：ROLLBACK + release
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径执行 BEGIN→SELECT→UPDATE→INSERT→COMMIT 并 release', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ user_id: 2, friend_id: 1 }], // SELECT 请求存在
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // INSERT

      const result = await acceptFriendRequest('1', 5);

      expect(result).toEqual({ success: true });
      // 验证事务序列
      expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mocks.clientQueryMock).toHaveBeenNthCalledWith(5, 'COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK 并 release 并透传错误', async () => {
      const error = new Error('数据库连接中断');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(error); // SELECT 抛错

      await expect(acceptFriendRequest('1', 5)).rejects.toThrow('数据库连接中断');

      // 验证 ROLLBACK 与 release 均被调用，防止连接泄漏
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('rejectFriendRequest 拒绝好友请求', () => {
    it('请求不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] }); // DELETE RETURNING 空

      await expect(rejectFriendRequest('1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '请求不存在或已处理',
      });
    });

    it('成功删除返回 success', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // DELETE RETURNING

      const result = await rejectFriendRequest('1', 5);

      expect(result).toEqual({ success: true });
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM friendships'),
        [5, '1']
      );
    });
  });

  describe('removeFriend 删除好友', () => {
    it('成功路径执行 BEGIN→DELETE×2→COMMIT 并 release', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE 正向
        .mockResolvedValueOnce({ rows: [] }); // DELETE 反向

      const result = await removeFriend('1', 2);

      expect(result).toEqual({ success: true });
      // 验证双向删除：userId 为 string、friendId 为 number，参数透传保持原类型
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM friendships'),
        ['1', 2]
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM friendships'),
        [2, '1']
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK 并 release 并透传错误', async () => {
      const error = new Error('写入失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE 正向
        .mockRejectedValueOnce(error); // DELETE 反向抛错

      await expect(removeFriend('1', 2)).rejects.toThrow('写入失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
