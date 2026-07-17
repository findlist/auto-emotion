/**
 * 情绪爆破局测试数据种子脚本
 *
 * 用法（在 server/ 目录下执行）：
 *   npx tsx scripts/seed.ts
 *
 * 功能：
 *   1. 插入 4 个测试用户 + 对应角色（characters 表）
 *   2. 为每个用户发放初始武器、技能、宠物
 *   3. 给一个用户发放示例好友关系
 *
 * 幂等：按 phone 去重，重复执行不会报错也不会创建重复用户
 *
 * 注意：本项目手机号明文存储（与 user-service.ts login 实现一致），
 *      密码使用 bcrypt 哈希（与 user-service.ts register 一致，SALT_ROUNDS=10）
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';
// 复用 src 端统一错误消息提取工具，避免 scripts 内重复实现 as Error 模式
// 设计原因：error.ts 为纯函数无副作用，scripts 引入 src 工具与项目错误处理范式保持一致
import { getErrorMessage } from '../src/utils/error.js';

const { Pool } = pg;

// 测试用户定义
interface TestUser {
  phone: string;
  password: string;
  nickname: string;
  // 初始资源
  experience: number;
  gold: number;
  gems: number;
  // 角色属性
  level: number;
  weaponId: number; // 默认装备武器 ID（对应 weapons 表数据）
  areaId: number;   // 挂机区域 ID
}

const testUsers: TestUser[] = [
  { phone: '13900139000', password: '123456', nickname: '解压大师', experience: 5000,  gold: 8000,  gems: 50,  level: 25, weaponId: 3, areaId: 3 },
  { phone: '13900139001', password: '123456', nickname: '情绪猎人', experience: 3000,  gold: 5000,  gems: 30,  level: 18, weaponId: 2, areaId: 2 },
  { phone: '13900139002', password: '123456', nickname: '崩溃战士', experience: 1500,  gold: 2000,  gems: 10,  level: 10, weaponId: 1, areaId: 1 },
  { phone: '13900139003', password: '123456', nickname: '新手玩家', experience: 200,   gold: 500,   gems: 0,   level: 3,  weaponId: 1, areaId: 1 },
];

// 武器发放清单（对应 001_init.sql 中的 weapons 数据，id 1-5）
// 仅发放 id 1-4，留 5（崩溃火箭 10000 金币）给玩家自行解锁
const grantWeaponIds = [1, 2, 3, 4];

// 技能发放清单（对应 001_init.sql 中的 skills 数据，id 1-5）
// 仅发放 id 1-3，留 4-5 给玩家随等级解锁
const grantSkillIds = [1, 2, 3];

// 宠物发放清单（对应 001_init.sql 中的 pets 数据，id 1-5）
// 仅发放 id 1-2（小喵免费 + 小柴 500 金币），其他需要玩家自行购买
const grantPetIds = [1, 2];

const SALT_ROUNDS = 10;

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'emotion_burst',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  const client = await pool.connect();
  let createdCount = 0;
  let skippedCount = 0;
  const userIds: string[] = [];

  try {
    await client.query('BEGIN');

    // ==================== 1. 插入测试用户 + 角色 ====================
    for (const u of testUsers) {
      // 按 phone 去重检查（与 user-service.register 一致）
      const existing = await client.query('SELECT id FROM users WHERE phone = $1', [u.phone]);
      if (existing.rows.length > 0) {
        userIds.push(existing.rows[0].id);
        skippedCount++;
        console.log(`[跳过] 用户 ${u.nickname} (${u.phone}) 已存在`);
        continue;
      }

      const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);

      // 创建用户（与 user-service.register 字段一致）
      const userResult = await client.query(
        `INSERT INTO users (phone, password_hash, nickname, experience, gold, gems, battle_score, season_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [u.phone, passwordHash, u.nickname, u.experience, u.gold, u.gems, u.experience, u.level]
      );
      const userId = userResult.rows[0].id;
      userIds.push(userId);
      createdCount++;

      // 创建角色（与 user-service.register 配套，1:1 关联）
      await client.query(
        `INSERT INTO characters (user_id, nickname, level, area_id, weapon_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, u.nickname, u.level, u.areaId, u.weaponId]
      );

      console.log(`[创建] 用户 ${u.nickname} (${u.phone}) / 密码: ${u.password} / 等级: ${u.level}`);
    }

    // ==================== 2. 为每个用户发放初始武器、技能、宠物 ====================
    for (const userId of userIds) {
      // 武器：ON CONFLICT (user_id, weapon_id) DO NOTHING 保证幂等
      for (const weaponId of grantWeaponIds) {
        await client.query(
          `INSERT INTO user_weapons (user_id, weapon_id, level, is_equipped)
           VALUES ($1, $2, 1, FALSE)
           ON CONFLICT (user_id, weapon_id) DO NOTHING`,
          [userId, weaponId]
        );
      }

      // 技能：ON CONFLICT (user_id, skill_id) DO NOTHING 保证幂等
      for (const skillId of grantSkillIds) {
        await client.query(
          `INSERT INTO user_skills (user_id, skill_id, level, is_active)
           VALUES ($1, $2, 1, FALSE)
           ON CONFLICT (user_id, skill_id) DO NOTHING`,
          [userId, skillId]
        );
      }

      // 宠物：ON CONFLICT (user_id, pet_id) DO NOTHING 保证幂等
      for (const petId of grantPetIds) {
        await client.query(
          `INSERT INTO user_pets (user_id, pet_id, is_equipped)
           VALUES ($1, $2, FALSE)
           ON CONFLICT (user_id, pet_id) DO NOTHING`,
          [userId, petId]
        );
      }
    }
    console.log(`[创建] 每个用户发放 ${grantWeaponIds.length} 武器 / ${grantSkillIds.length} 技能 / ${grantPetIds.length} 宠物`);

    // ==================== 3. 示例好友关系（前两个用户互为好友）====================
    if (userIds[0] && userIds[1]) {
      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status)
         VALUES ($1, $2, 'accepted')
         ON CONFLICT (user_id, friend_id) DO NOTHING`,
        [userIds[0], userIds[1]]
      );
      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status)
         VALUES ($1, $2, 'accepted')
         ON CONFLICT (user_id, friend_id) DO NOTHING`,
        [userIds[1], userIds[0]]
      );
      console.log(`[创建] ${testUsers[0].nickname} ↔ ${testUsers[1].nickname} 好友关系`);
    }

    await client.query('COMMIT');

    console.log('\n========== 种子数据创建完成 ==========');
    console.log(`新建用户: ${createdCount}  已存在跳过: ${skippedCount}`);
    console.log('测试账号列表:');
    testUsers.forEach(u => {
      console.log(`  ${u.nickname.padEnd(8)} ${u.phone} / ${u.password} (Lv.${u.level})`);
    });
    console.log('======================================');

  } catch (err) {
    // ROLLBACK 加 try/catch 保护，避免 ROLLBACK 抛错掩盖原始业务错误
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      // 复用 getErrorMessage 统一 unknown→string 兜底，rbErr 非 Error 实例时返回有意义文案而非 undefined
      console.error('ROLLBACK 失败:', getErrorMessage(rbErr, '未知错误'));
    }
    console.error('[错误] 种子数据创建失败:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('未捕获异常:', err);
  process.exit(1);
});
