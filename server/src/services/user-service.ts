import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import redis from '../config/redis.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { logger } from '../utils/logger.js';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '7d';
const REFRESH_EXPIRES_IN = '30d';

export interface RegisterInput {
  phone: string;
  password: string;
  nickname: string;
}

export interface LoginInput {
  phone: string;
  password: string;
}

// 注册返回的用户信息（对应 INSERT RETURNING 字段，不含 password_hash）
export interface UserRow {
  id: string;
  phone: string;
  nickname: string;
  experience: number;
  gold: number;
  pvp_points: number;
  created_at: Date;
}

// 登录返回的用户信息（SELECT 字段子集，已剔除 password_hash）
export interface LoginUserRow {
  id: string;
  phone: string;
  nickname: string;
  experience: number;
  gold: number;
  pvp_points: number;
}

// 用户资料（getProfile 返回，LEFT JOIN users + characters）
// 角色字段设为可选：LEFT JOIN 无角色记录时为 null，updateProfile 走 UPDATE RETURNING * 时不包含角色字段
export interface UserProfile {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
  experience: number;
  gold: number;
  pvp_points: number;
  created_at: Date;
  level?: number | null;
  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  area_id?: string | null;
  weapon_id?: string | null;
}

export async function register(input: RegisterInput): Promise<{ user: UserRow; token: string; refreshToken: string }> {
  const { phone, password, nickname } = input;
  
  // 检查手机号是否已注册
  const exist = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (exist.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '手机号已注册');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  // 事务：创建用户 + 创建角色
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const userResult = await client.query(
      `INSERT INTO users (phone, password_hash, nickname)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO NOTHING
       RETURNING id, phone, nickname, experience, gold, pvp_points, created_at`,
      [phone, passwordHash, nickname]
    );
    // 并发注册竞态兜底：前置检查通过后对方可能已插入，ON CONFLICT 命中返回空行
    if (userResult.rows.length === 0) {
      throw new AppError(ErrorCode.CONFLICT, '手机号已注册');
    }
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO characters (user_id, nickname, level) VALUES ($1, $2, 1)`,
      [user.id, nickname]
    );

    await client.query('COMMIT');

    const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

    return { user, token, refreshToken };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      logger.error('ROLLBACK 失败', { error: (rbErr as Error).message });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function login(input: LoginInput): Promise<{ user: LoginUserRow; token: string; refreshToken: string }> {
  const { phone, password } = input;
  
  const result = await pool.query(
    'SELECT id, phone, password_hash, nickname, experience, gold, pvp_points FROM users WHERE phone = $1',
    [phone]
  );
  
  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '手机号或密码错误');
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '手机号或密码错误');
  }

  // 更新最后登录时间
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

  const { password_hash, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token, refreshToken };
}

export async function getProfile(userId: string): Promise<UserProfile> {
  const result = await pool.query(
    `SELECT u.id, u.phone, u.nickname, u.avatar_url, u.experience, u.gold, u.pvp_points, u.created_at,
            c.level, c.hp, c.attack, c.defense, c.area_id, c.weapon_id
     FROM users u
     LEFT JOIN characters c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }
  
  return result.rows[0];
}

export async function updateProfile(userId: string, input: { nickname?: string; avatar_url?: string }): Promise<UserProfile> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  
  if (input.nickname) {
    fields.push(`nickname = $${idx++}`);
    values.push(input.nickname);
  }
  if (input.avatar_url) {
    fields.push(`avatar_url = $${idx++}`);
    values.push(input.avatar_url);
  }
  
  if (fields.length === 0) return getProfile(userId);
  
  fields.push(`updated_at = NOW()`);
  values.push(userId);
  
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  
  return result.rows[0];
}

export async function logout(token: string, refreshToken?: string): Promise<void> {
  // access token 与 refreshToken 都加入黑名单，防止登出后 refreshToken 仍可换新 token
  // 设计原因：原实现仅黑名单 access token，refreshToken 函数不检查黑名单，
  // 泄露的 refreshToken 在登出后 30 天内仍可换新 token，是真实安全漏洞
  const accessTtl = 7 * 24 * 60 * 60; // 7 天，与 access token 有效期一致
  const refreshTtl = 30 * 24 * 60 * 60; // 30 天，与 refreshToken 有效期一致
  await redis.setex(`blacklist:${token}`, accessTtl, '1');
  if (refreshToken) {
    await redis.setex(`blacklist:${refreshToken}`, refreshTtl, '1');
  }
}

export async function refreshToken(token: string) {
  // jwt.verify 对过期/篡改令牌抛 JsonWebTokenError/TokenExpiredError，需捕获转为 AppError，
  // 否则 errorHandler 会按未知错误返回 500 而非 401，与 API 声明不符
  let payload: { userId: string; type: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: string; type: string };
  } catch {
    throw new AppError(ErrorCode.UNAUTHORIZED, '无效的刷新令牌');
  }
  if (payload.type !== 'refresh') {
    throw new AppError(ErrorCode.UNAUTHORIZED, '无效的刷新令牌');
  }

  // 检查 refreshToken 是否已加入黑名单（用户登出后该 token 应失效）
  // 设计原因：与 logout 配合形成完整闭环，防止登出后 refreshToken 仍可换新 token
  // redis 异常时降级放行，避免 redis 故障阻塞用户刷新 token
  try {
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '刷新令牌已失效');
    }
  } catch (err) {
    // AppError 直接抛出，仅降级非业务异常（如 redis 连接故障）
    if (err instanceof AppError) throw err;
  }

  const userResult = await pool.query('SELECT id, phone FROM users WHERE id = $1', [payload.userId]);
  if (userResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const user = userResult.rows[0];
  const newToken = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token: newToken };
}

export type PressureDimension = 'work' | 'life' | 'social' | 'finance' | 'health';

export interface PressureStats {
  work: number;
  life: number;
  social: number;
  finance: number;
  health: number;
  totalGames: number;
  hasData: boolean;
}

const DIMENSION_KEYWORDS: Record<PressureDimension, string[]> = {
  work: ['加班', '996', 'KPI', '开会', '汇报', '绩效', '催进度', 'deadline', '考试', '论文'],
  life: ['堵车', '通勤', '房贷', '房租', '家务', '装修', '搬家'],
  social: ['催婚', '催育', '相亲', '社交', '聚会', '应酬', '人情', '攀比'],
  finance: ['工资', '奖金', '理财', '股票', '基金', '花呗', '信用卡'],
  health: ['失眠', '熬夜', '头疼', '腰痛', '焦虑', '抑郁', '感冒', '迷茫'],
};

const KEYWORD_TO_DIMENSION = new Map<string, PressureDimension>();
for (const [dimension, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
  for (const kw of keywords) {
    KEYWORD_TO_DIMENSION.set(kw, dimension as PressureDimension);
  }
}

const DEFAULT_PRESSURE = 50;

export async function getPressureStats(userId: string): Promise<PressureStats> {
  const [countResult, keywordResult] = await Promise.all([
    pool.query(
      'SELECT COUNT(*) AS total FROM game_record_players WHERE user_id = $1',
      [userId]
    ),
    pool.query(
      `SELECT kw, COUNT(*) AS cnt
       FROM game_record_players,
            unnest(stress_keywords) AS kw
       WHERE user_id = $1
         AND stress_keywords IS NOT NULL
         AND array_length(stress_keywords, 1) > 0
       GROUP BY kw`,
      [userId]
    ),
  ]);

  const totalGames = parseInt(countResult.rows[0]?.total ?? '0', 10);
  if (totalGames === 0) {
    return {
      work: DEFAULT_PRESSURE,
      life: DEFAULT_PRESSURE,
      social: DEFAULT_PRESSURE,
      finance: DEFAULT_PRESSURE,
      health: DEFAULT_PRESSURE,
      totalGames: 0,
      hasData: false,
    };
  }

  const dimensionCounts: Record<PressureDimension, number> = {
    work: 0, life: 0, social: 0, finance: 0, health: 0,
  };

  for (const row of keywordResult.rows) {
    const dimension = KEYWORD_TO_DIMENSION.get(row.kw);
    if (dimension) {
      dimensionCounts[dimension] += parseInt(row.cnt, 10);
    }
  }

  const stats: PressureStats = {
    work: Math.min(100, Math.round((dimensionCounts.work / totalGames) * 100)),
    life: Math.min(100, Math.round((dimensionCounts.life / totalGames) * 100)),
    social: Math.min(100, Math.round((dimensionCounts.social / totalGames) * 100)),
    finance: Math.min(100, Math.round((dimensionCounts.finance / totalGames) * 100)),
    health: Math.min(100, Math.round((dimensionCounts.health / totalGames) * 100)),
    totalGames,
    hasData: true,
  };

  return stats;
}
