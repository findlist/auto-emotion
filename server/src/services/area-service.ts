// server/src/services/area-service.ts
// 挂机区域服务

import pool from '../config/database.js';

/**
 * 挂机区域表行结构，对应 idle_areas 表完整字段
 * 设计原因：SELECT * 返回 any[] 需断言对接接口契约；DECIMAL 字段在 node-postgres
 * 默认返回字符串（idle-engine.ts L103 用 parseFloat 解析即为佐证），此处用 string
 * 精确匹配实际行为，避免调用方误判为 number 触发运算错误
 */
interface IdleAreaRow {
  id: number;
  name: string;
  description: string | null;
  required_level: number;
  exp_rate: string;
  gold_rate: string;
  drop_rate: string;
  stress_reduction: string;
  bg_color: string | null;
  created_at: Date;
}

/**
 * 获取所有挂机区域列表
 * @returns 区域列表（按 required_level 排序）
 */
export async function listAreas(): Promise<IdleAreaRow[]> {
  const result = await pool.query(
    'SELECT * FROM idle_areas ORDER BY required_level'
  );
  return result.rows as IdleAreaRow[];
}

/**
 * 获取单个挂机区域
 * @param areaId 区域ID
 * @returns 区域信息，不存在时返回 null（由 route 层判定 NOT_FOUND）
 */
export async function getArea(areaId: number): Promise<IdleAreaRow | null> {
  const result = await pool.query(
    'SELECT * FROM idle_areas WHERE id = $1',
    [areaId]
  );
  return (result.rows[0] as IdleAreaRow | undefined) ?? null;
}
