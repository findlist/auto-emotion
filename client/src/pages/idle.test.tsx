import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// - userState:用例间切换登录态(已登录 / null),验证"请先登录"兜底
// - 各 API mock:控制挂机数据加载成功 / 失败,覆盖并发加载与单点失败兜底
const idleMock = vi.hoisted(() => ({
  getStatus: vi.fn(), listAreas: vi.fn(), claim: vi.fn(),
  switchArea: vi.fn(), upgrade: vi.fn(), settle: vi.fn(),
}));
const weaponMock = vi.hoisted(() => ({
  list: vi.fn(), upgrade: vi.fn(), equip: vi.fn(), buy: vi.fn(),
}));
const skillMock = vi.hoisted(() => ({
  list: vi.fn(), unlock: vi.fn(), upgrade: vi.fn(), activate: vi.fn(),
}));
const petMock = vi.hoisted(() => ({
  list: vi.fn(), equip: vi.fn(), buy: vi.fn(),
}));
const userState = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const confirmMock = vi.hoisted(() => ({ showConfirm: vi.fn() }));

vi.mock('@/api/idle', () => ({ idleApi: idleMock }));
vi.mock('@/api/weapons', () => ({ weaponApi: weaponMock }));
vi.mock('@/api/skills', () => ({ skillApi: skillMock }));
vi.mock('@/api/pets', () => ({ petApi: petMock }));
// mock useUserStore:支持 selector 写法,idle.tsx 仅用 (s) => s.user 取 id
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: { user: unknown }) => unknown) => selector({ user: userState.user }),
}));
// mock 弹窗/Toast/错误处理工具,避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));
vi.mock('@/utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import IdlePage from '@/pages/idle';
import type { User } from '@/types/user';
import type { CharacterStatus, IdleArea, OfflineResult } from '@/api/idle';
import type { Weapon } from '@/api/weapons';
import type { Skill } from '@/api/skills';
import type { Pet } from '@/api/pets';

// 已登录用户样本:id='1' 用于 userId 派生
const mockUser: User = {
  id: '1', phone: '13800000000', nickname: '测试玩家', avatarUrl: '', signature: '',
  coins: 0, gems: 0, level: 5, exp: 1200, power: 100, pvp_points: 50,
  battleScore: 300, status: 0, lastLoginAt: '', createdAt: '',
};

// 角色状态:覆盖 level/gold/attack/defense/hp/efficiency 等首页展示字段
const mockStatus: CharacterStatus = {
  character_id: 'c1', user_id: '1', nickname: '测试玩家', level: 5, exp: 1200,
  gold: 999, pvp_points: 50, area_id: 1, area_name: '职场焦虑区',
  exp_rate: 1.2, gold_rate: 1.1, weapon_id: 1, hp: 500, attack: 100, defense: 50,
  crit_rate: 0.2, crit_damage: 1.5, efficiency: 1.5, idle_since: '', offline_exp: 0,
};

const mockAreas: IdleArea[] = [
  { id: 1, name: '职场焦虑区', description: '加班压力', required_level: 1,
    exp_rate: 1, gold_rate: 1, drop_rate: 0.1, stress_reduction: 0.2, bg_color: '#fff' },
];

const mockOffline: OfflineResult = {
  offlineSeconds: 3600, exp: 100, gold: 50, cappedHours: 1,
};

const mockWeapons: Weapon[] = [
  { id: 1, name: '测试武器', description: '测试描述', base_attack: 50,
    base_crit_rate: 0.1, base_crit_damage: 1.5, unlock_cost_gold: 100,
    icon_key: 'sword', level: 2, is_equipped: true },
];

const mockSkills: Skill[] = [
  { id: 1, name: '测试技能', description: '测试描述', type: 'active',
    effect: {}, unlock_condition: {}, level: 1, is_active: true },
];

const mockPets: Pet[] = [
  { id: 1, name: '测试宠物', emoji: '🐱', description: '测试描述',
    stat_bonus: {}, unlock_cost_gold: 200, is_equipped: true },
];

describe('IdlePage 挂机空间页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState.user = mockUser;
    // 默认所有 API 成功返回,失败用例单独覆盖
    idleMock.getStatus.mockResolvedValue(mockStatus);
    idleMock.listAreas.mockResolvedValue(mockAreas);
    idleMock.claim.mockResolvedValue(mockOffline);
    weaponMock.list.mockResolvedValue(mockWeapons);
    skillMock.list.mockResolvedValue(mockSkills);
    petMock.list.mockResolvedValue(mockPets);
    confirmMock.showConfirm.mockResolvedValue(true);
  });

  it('user 为 null 时显示"请先登录"', () => {
    userState.user = null;
    render(<IdlePage onBack={() => {}} />);

    expect(screen.getByText('请先登录')).toBeInTheDocument();
  });

  it('挂载后并发调用 6 个 API 加载挂机数据', async () => {
    render(<IdlePage onBack={() => {}} />);

    // userId 不再由前端传递（后端从 JWT 解析），getStatus/claim 应无参调用
    await waitFor(() => {
      expect(idleMock.getStatus).toHaveBeenCalledWith();
      expect(idleMock.listAreas).toHaveBeenCalledTimes(1);
      expect(idleMock.claim).toHaveBeenCalledWith();
      expect(weaponMock.list).toHaveBeenCalledTimes(1);
      expect(skillMock.list).toHaveBeenCalledTimes(1);
      expect(petMock.list).toHaveBeenCalledTimes(1);
    });
  });

  it('已登录渲染昵称、等级与金币', async () => {
    render(<IdlePage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('测试玩家')).toBeInTheDocument();
    });
    // 战力区等级与经验 "Lv.5 · 1200 EXP",正则匹配等级部分
    expect(screen.getByText(/Lv\.5/)).toBeInTheDocument();
    // 顶部 header 金币展示(status.gold = 999)
    expect(screen.getByText('999')).toBeInTheDocument();
  });

  it('离线收益 exp > 0 时显示离线时长与"领取"按钮', async () => {
    render(<IdlePage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });
    // 离线时长文案为独立 p 节点,稳定匹配
    expect(screen.getByText('离线 1 小时')).toBeInTheDocument();
  });

  it('点击"武器"tab 显示武器列表', async () => {
    render(<IdlePage onBack={() => {}} />);

    await waitFor(() => {
      expect(weaponMock.list).toHaveBeenCalled();
    });

    // 默认 tab 为"升级",切换到"武器"tab 后渲染武器列表
    fireEvent.click(screen.getByRole('tab', { name: '武器' }));
    expect(screen.getByText('测试武器')).toBeInTheDocument();
  });

  it('getStatus 失败时战力用默认值渲染且页面不崩溃', async () => {
    // getStatus reject 被 loadData 的 .catch(() => null) 兜底,status 为 null
    // 战力区 efficiency 默认 1 → 100%,其他字段默认 0,页面仍正常渲染
    idleMock.getStatus.mockRejectedValue(new Error('网络错误'));

    render(<IdlePage onBack={() => {}} />);

    await waitFor(() => {
      // 战力区效率默认 100%(status?.efficiency ?? 1 → 1 → 100%)
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
    // 昵称来自 user 而非 status,仍正常展示
    expect(screen.getByText('测试玩家')).toBeInTheDocument();
  });
});
