// server/src/services/area-service.ts
// 挂机区域服务

import pool from '../config/database.js';

/**
 * 获取所有挂机区域列表
 * @returns 区域列表（按 required_level 排序）
 */
export async function listAreas() {
  const result = await pool.query(
    'SELECT * FROM idle_areas ORDER BY required_level'
  );
  return result.rows;
}

/**
 * 获取单个挂机区域
 * @param areaId 区域ID
 * @returns 区域信息
 */
export async function getArea(areaId: number) {
  const result = await pool.query(
    'SELECT * FROM idle_areas WHERE id = $1',
    [areaId]
  );
  return result.rows[0] || null;
}
