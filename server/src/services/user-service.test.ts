// server/src/services/user-service.test.ts
// 用户服务层单元测试：覆盖注册事务、登录鉴权、资料更新、登出黑名单、刷新令牌、压力画像
// 设计原因：用户服务涉及密码哈希、JWT 签发、事务写入、黑名单等安全敏感逻辑，
// 必须通过 mock 验证事务边界、错误分支与字段透传，防止鉴权与资金字段被篡改

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 在模块加载前注入 JWT_SECRET，避免 const JWT_SECRET = process.env.JWT_SECRET! 读到 undefined
// 设计原因：被测模块在顶层读取环境变量，vi.stubEnv 在 hoist 阶段尚未生效，需直接写 process.env
process.env.JWT_SECRET = 'test-secret-for-jwt';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：登录/资料/刷新查询入口
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/INSERT/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接
  releaseMock: vi.fn(),
  // pool.connect：获取事务客户端
  connectMock: vi.fn(),
  // redis.setex：登出黑名单写入
  redisSetexMock: vi.fn(),
  // redis.get：refreshToken 黑名单查询
  redisGetMock: vi.fn(),
  // bcrypt.hash / compare
  bcryptHashMock: vi.fn(),
  bcryptCompareMock: vi.fn(),
  // jwt.sign / verify
  jwtSignMock: vi.fn(),
  jwtVerifyMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mocks.queryMock,
    connect: mocks.connectMock,
  },
}));

vi.mock('../config/redis.js', () => ({
  default: {
    setex: mocks.redisSetexMock,
    get: mocks.redisGetMock,
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: mocks.bcryptHashMock,
    compare: mocks.bcryptCompareMock,
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: mocks.jwtSignMock,
    verify: mocks.jwtVerifyMock,
  },
}));

import { register, login, getProfile, updateProfile, logout, refreshToken, getPressureStats } from './user-service.js';

// 构造标准注册输入，便于多用例复用
function buildRegisterInput() {
  return { phone: '13800000000', password: 'pw123', nickname: '小明' };
}

// 构造标准用户行，模拟数据库返回
function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    phone: '13800000000',
    password_hash: 'hashed',
    nickname: '小明',
    experience: 0,
    gold: 0,
    pvp_points: 0,
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('user-service 用户服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    // jwt.sign 默认返回占位 token，单测可按需覆盖
    mocks.jwtSignMock.mockReturnValue('signed-token');
  });

  describe('register 注册', () => {
    it('手机号已注册时抛 CONFLICT "手机号已注册"，不开启事务', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [{ id: 'existing' }] });

      await expect(register(buildRegisterInput())).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '手机号已注册',
      });
      expect(mocks.connectMock).not.toHaveBeenCalled();
      // 已注册不应再哈希密码，避免无意义计算
      expect(mocks.bcryptHashMock).not.toHaveBeenCalled();
    });

    it('注册成功：哈希密码 → 事务插入用户与角色 → COMMIT → 签发 access/refresh token', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      mocks.bcryptHashMock.mockResolvedValue('hashed-pw');
      const userRow = buildUserRow({ id: 'u1' });
      // INSERT users RETURNING 返回新用户行
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO users')) {
          return Promise.resolve({ rows: [userRow] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await register(buildRegisterInput());

      // 密码需哈希后存储，禁止明文落库
      expect(mocks.bcryptHashMock).toHaveBeenCalledWith('pw123', 10);
      // 校验事务执行序列
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 签发双 token：access + refresh
      expect(mocks.jwtSignMock).toHaveBeenCalledTimes(2);
      expect(result.user).toEqual(userRow);
      expect(result.token).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });

    it('事务中途抛错时执行 ROLLBACK 并释放连接，错误透传', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      mocks.bcryptHashMock.mockResolvedValue('hashed-pw');
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO characters')) {
          return Promise.reject(new Error('角色写入失败'));
        }
        return Promise.resolve({ rows: [buildUserRow()] });
      });

      await expect(register(buildRegisterInput())).rejects.toThrow('角色写入失败');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });
  });

  describe('login 登录', () => {
    it('用户不存在时抛 UNAUTHORIZED "手机号或密码错误"', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });

      await expect(login({ phone: '138', password: 'pw' })).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '手机号或密码错误',
      });
      // 用户不存在不应再比较密码，避免无意义计算
      expect(mocks.bcryptCompareMock).not.toHaveBeenCalled();
    });

    it('密码错误时抛 UNAUTHORIZED "手机号或密码错误"', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [buildUserRow()] });
      mocks.bcryptCompareMock.mockResolvedValue(false);

      await expect(login({ phone: '138', password: 'wrong' })).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '手机号或密码错误',
      });
      // 密码错误不应签发 token
      expect(mocks.jwtSignMock).not.toHaveBeenCalled();
    });

    it('登录成功：更新最后登录时间 → 签发双 token，返回结果不含 password_hash', async () => {
      mocks.queryMock
        // 第一次：查用户
        .mockResolvedValueOnce({ rows: [buildUserRow()] });
      mocks.bcryptCompareMock.mockResolvedValue(true);

      const result = await login({ phone: '138', password: 'pw123' });

      // 第二次调用：UPDATE last_login_at
      const updateCall = mocks.queryMock.mock.calls[1];
      expect((updateCall[0] as string)).toContain('UPDATE users SET last_login_at');
      // 签发 access + refresh 双 token
      expect(mocks.jwtSignMock).toHaveBeenCalledTimes(2);
      // 返回对象不应包含 password_hash，防止敏感字段泄露
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.token).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });
  });

  describe('getProfile 获取资料', () => {
    it('用户不存在时抛 NOT_FOUND "用户不存在"', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });

      await expect(getProfile('u1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    });

    it('用户存在时返回联表查询结果（含角色字段）', async () => {
      const profile = { id: 'u1', nickname: '小明', level: 5, attack: 10 };
      mocks.queryMock.mockResolvedValue({ rows: [profile] });

      const result = await getProfile('u1');

      expect(result).toEqual(profile);
      // 校验联表查询包含 characters JOIN
      const sql = mocks.queryMock.mock.calls[0][0] as string;
      expect(sql).toContain('JOIN characters');
    });
  });

  describe('updateProfile 更新资料', () => {
    it('未传任何字段时回退到 getProfile 查询', async () => {
      const profile = { id: 'u1', nickname: '小明' };
      mocks.queryMock.mockResolvedValue({ rows: [profile] });

      const result = await updateProfile('u1', {});

      // 无字段时应直接查资料，不应触发 UPDATE
      const sqls = mocks.queryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls.some((s) => s.includes('UPDATE users SET'))).toBe(false);
      expect(result).toEqual(profile);
    });

    it('传 nickname 与 avatar_url 时动态拼接 UPDATE 并 RETURNING', async () => {
      const updated = { id: 'u1', nickname: '新名', avatar_url: 'http://x.png' };
      mocks.queryMock.mockResolvedValue({ rows: [updated] });

      const result = await updateProfile('u1', { nickname: '新名', avatar_url: 'http://x.png' });

      const sql = mocks.queryMock.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE users SET');
      expect(sql).toContain('nickname = $1');
      expect(sql).toContain('avatar_url = $2');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('RETURNING *');
      // 参数顺序：[nickname, avatar_url, userId]
      const params = mocks.queryMock.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('新名');
      expect(params[1]).toBe('http://x.png');
      expect(params[2]).toBe('u1');
      expect(result).toEqual(updated);
    });

    it('仅传 nickname 时只拼接一个字段', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [{ id: 'u1', nickname: '新名' }] });

      await updateProfile('u1', { nickname: '新名' });

      const sql = mocks.queryMock.mock.calls[0][0] as string;
      expect(sql).toContain('nickname = $1');
      expect(sql).not.toContain('avatar_url');
      // userId 在 $2（nickname 占 $1，updated_at 不占位）
      const params = mocks.queryMock.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('新名');
      expect(params[1]).toBe('u1');
    });
  });

  describe('logout 登出', () => {
    it('仅传 access token 时写入黑名单，TTL 与 access token 有效期一致（7天）', async () => {
      mocks.redisSetexMock.mockResolvedValue('OK');

      await logout('some-token');

      // TTL = 7 * 24 * 60 * 60 = 604800 秒，与 access token 有效期一致
      expect(mocks.redisSetexMock).toHaveBeenCalledOnce();
      expect(mocks.redisSetexMock).toHaveBeenCalledWith('blacklist:some-token', 604800, '1');
    });

    it('同时传 refreshToken 时两个 token 都写入黑名单（不同 TTL）', async () => {
      mocks.redisSetexMock.mockResolvedValue('OK');

      await logout('access-token', 'refresh-token');

      // access token TTL = 7 天 = 604800 秒
      // refreshToken TTL = 30 天 = 2592000 秒，与 refreshToken 有效期一致
      expect(mocks.redisSetexMock).toHaveBeenCalledTimes(2);
      expect(mocks.redisSetexMock).toHaveBeenNthCalledWith(1, 'blacklist:access-token', 604800, '1');
      expect(mocks.redisSetexMock).toHaveBeenNthCalledWith(2, 'blacklist:refresh-token', 2592000, '1');
    });
  });

  describe('refreshToken 刷新令牌', () => {
    it('token type 非 refresh 时抛 UNAUTHORIZED "无效的刷新令牌"', async () => {
      mocks.jwtVerifyMock.mockReturnValue({ userId: 'u1', type: 'access' });

      await expect(refreshToken('some-token')).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的刷新令牌',
      });
      // 校验失败不应查库
      expect(mocks.queryMock).not.toHaveBeenCalled();
    });

    it('token 已在黑名单时抛 UNAUTHORIZED "刷新令牌已失效"', async () => {
      mocks.jwtVerifyMock.mockReturnValue({ userId: 'u1', type: 'refresh' });
      // redis.get 返回非空值表示 token 已黑名单
      mocks.redisGetMock.mockResolvedValue('1');

      await expect(refreshToken('some-token')).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '刷新令牌已失效',
      });
      // 黑名单拦截不应查库
      expect(mocks.queryMock).not.toHaveBeenCalled();
      // 不应签发新 token
      expect(mocks.jwtSignMock).not.toHaveBeenCalled();
    });

    it('redis 异常时降级放行，不阻塞用户刷新 token', async () => {
      mocks.jwtVerifyMock.mockReturnValue({ userId: 'u1', type: 'refresh' });
      // redis.get 抛非 AppError 异常模拟 redis 连接故障
      mocks.redisGetMock.mockRejectedValue(new Error('Redis 不可用'));
      mocks.queryMock.mockResolvedValue({ rows: [{ id: 'u1', phone: '138' }] });

      const result = await refreshToken('some-token');

      // redis 异常不应阻塞 token 刷新
      expect(mocks.jwtSignMock).toHaveBeenCalledOnce();
      expect(result.token).toBe('signed-token');
    });

    it('用户不存在时抛 NOT_FOUND "用户不存在"', async () => {
      mocks.jwtVerifyMock.mockReturnValue({ userId: 'u1', type: 'refresh' });
      mocks.redisGetMock.mockResolvedValue(null);
      mocks.queryMock.mockResolvedValue({ rows: [] });

      await expect(refreshToken('some-token')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
      // 用户不存在不应签发新 token
      expect(mocks.jwtSignMock).not.toHaveBeenCalled();
    });

    it('刷新成功：签发新的 access token', async () => {
      mocks.jwtVerifyMock.mockReturnValue({ userId: 'u1', type: 'refresh' });
      mocks.redisGetMock.mockResolvedValue(null);
      mocks.queryMock.mockResolvedValue({ rows: [{ id: 'u1', phone: '138' }] });

      const result = await refreshToken('some-token');

      expect(mocks.jwtSignMock).toHaveBeenCalledOnce();
      expect(result.token).toBe('signed-token');
    });
  });

  describe('getPressureStats 压力画像', () => {
    it('无对战记录时返回默认值 50 且 hasData=false', async () => {
      mocks.queryMock
        // countResult
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        // keywordResult
        .mockResolvedValueOnce({ rows: [] });

      const result = await getPressureStats('u1');

      expect(result).toEqual({
        work: 50,
        life: 50,
        social: 50,
        finance: 50,
        health: 50,
        totalGames: 0,
        hasData: false,
      });
    });

    it('有关键词命中时按维度统计，单维度占比 = 维度次数 / 总局数 * 100，上限 100', async () => {
      // 总局数 4
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ total: '4' }] });
      // 关键词命中：加班(work) 2 次，催婚(social) 1 次，堵车(life) 1 次
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { kw: '加班', cnt: '2' },
          { kw: '催婚', cnt: '1' },
          { kw: '堵车', cnt: '1' },
        ],
      });

      const result = await getPressureStats('u1');

      expect(result.totalGames).toBe(4);
      expect(result.hasData).toBe(true);
      // work: 2/4*100 = 50
      expect(result.work).toBe(50);
      // social: 1/4*100 = 25
      expect(result.social).toBe(25);
      // life: 1/4*100 = 25
      expect(result.life).toBe(25);
      // finance/health 无命中 = 0
      expect(result.finance).toBe(0);
      expect(result.health).toBe(0);
    });

    it('未知关键词不参与任何维度统计', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      // 未定义维度的关键词应被忽略
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ kw: '外星语', cnt: '2' }] });

      const result = await getPressureStats('u1');

      expect(result.totalGames).toBe(2);
      expect(result.hasData).toBe(true);
      // 所有关键词均为未知维度，各维度统计为 0
      expect(result.work).toBe(0);
      expect(result.health).toBe(0);
    });
  });
});
