// client/src/api/idle.ts
// 挂机相关 API

import http from './http';
import { unwrap } from './unwrap';

/**
 * 角色状态
 */
export interface CharacterStatus {
  character_id: string;
  user_id: string;
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  pvp_points: number;
  area_id: number;
  area_name: string;
  exp_rate: number;
  gold_rate: number;
  weapon_id: number;
  hp: number;
  attack: number;
  defense: number;
  crit_rate: number;
  crit_damage: number;
  efficiency: number;
  idle_since: string;
  offline_exp: number;
}

/**
 * 结算结果
 */
export interface SettleResult {
  gainedExp: number;
  gainedCoins: number;
  gainedFragments: number;
  leveledUp: boolean;
  newLevel: number;
}

/**
 * 离线收益结果
 */
export interface OfflineResult {
  offlineSeconds: number;
  exp: number;
  gold: number;
  cappedHours: number;
}

/**
 * 挂机区域信息
 */
export interface IdleArea {
  id: number;
  name: string;
  description: string;
  required_level: number;
  exp_rate: number;
  gold_rate: number;
  drop_rate: number;
  stress_reduction: number;
  bg_color: string;
}

/**
 * 挂机 API
 */
export const idleApi = {
  /** 获取角色状态 */
  getStatus(userId: string): Promise<CharacterStatus> {
    return unwrap(http.get('/idle/status', { params: { userId } }));
  },

  /** 在线结算 */
  settle(userId: string, durationSeconds: number): Promise<SettleResult> {
    return unwrap(http.post('/idle/settle', { userId, durationSeconds }));
  },

  /** 领取离线收益 */
  claim(userId: string): Promise<OfflineResult> {
    return unwrap(http.post('/idle/claim', { userId }));
  },

  /** 切换挂机区域 */
  switchArea(userId: string, areaId: number): Promise<{ success: boolean }> {
    return unwrap(http.post('/idle/switch-area', { userId, areaId }));
  },

  /** 升级角色属性 */
  upgrade(
    userId: string,
    field: 'hp' | 'attack' | 'defense' | 'crit_rate' | 'crit_damage' | 'efficiency',
    itemType?: string
  ): Promise<{ success: boolean; newValue: number }> {
    return unwrap(http.post('/idle/upgrade', { userId, field, itemType }));
  },

  /** 获取所有挂机区域 */
  listAreas(): Promise<IdleArea[]> {
    return unwrap(http.get('/idle/areas'));
  },
};
