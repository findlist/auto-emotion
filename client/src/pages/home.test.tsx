import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// - userState:用例间切换登录态(已登录 / null 游客),验证默认值兜底逻辑
// - pressureMock:控制压力数据加载成功 / 失败
// - loggerMock:断言失败路径错误日志记录,避免真实日志噪音
const pressureMock = vi.hoisted(() => ({ getPressureStats: vi.fn() }));
const userState = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));

vi.mock('@/api/pressure', () => ({ getPressureStats: pressureMock.getPressureStats }));
// mock useUserStore:支持 selector 写法 useUserStore((s) => s.user),返回 selector(state)
// 设计原因:home.tsx 仅用 selector 取 user,无需 mock 完整 store,最小化 mock 表面
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: { user: unknown }) => unknown) => selector({ user: userState.user }),
}));
// mock PressureRadar 避免渲染复杂 SVG,用 data-testid 断言数据已传入即可
vi.mock('@/components/PressureRadar', () => ({
  default: ({ data }: { data: { hasData: boolean } }) => (
    <div data-testid="pressure-radar" data-hasdata={String(data.hasData)} />
  ),
}));
vi.mock('@/utils/logger', () => ({ logger: loggerMock }));

import HomePage from '@/pages/home';
import type { User } from '@/types/user';

// 已登录用户样本:覆盖 nickname/level/exp/coins 四个首页展示字段
const mockUser: User = {
  id: 1, phone: '13800000000', nickname: '测试玩家', avatarUrl: '', signature: '',
  coins: 999, gems: 0, level: 5, exp: 1200, power: 100, pvp_points: 50,
  battleScore: 300, status: 0, lastLoginAt: '', createdAt: '',
};

const pressureData = {
  work: 80, life: 30, social: 60, finance: 40, health: 70, hasData: true,
};

describe('HomePage 首页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState.user = mockUser;
    pressureMock.getPressureStats.mockResolvedValue(pressureData);
  });

  it('渲染已登录用户信息(昵称、等级、经验、金币)', async () => {
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={() => {}} />);

    expect(screen.getByText('测试玩家')).toBeInTheDocument();
    // 等级与经验合并在同一文本节点 "Lv.5 · 1200 EXP",用正则分别匹配
    expect(screen.getByText(/Lv\.5/)).toBeInTheDocument();
    expect(screen.getByText(/1200 EXP/)).toBeInTheDocument();
    expect(screen.getByText('999')).toBeInTheDocument();
  });

  it('user 为 null 时显示默认值(冒险者 / Lv.1)', async () => {
    userState.user = null;
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={() => {}} />);

    // 昵称兜底 "冒险者",等级兜底 1,经验兜底 0
    expect(screen.getByText('冒险者')).toBeInTheDocument();
    expect(screen.getByText(/Lv\.1/)).toBeInTheDocument();
    expect(screen.getByText(/0 EXP/)).toBeInTheDocument();
  });

  it('挂载后调用 getPressureStats 加载压力数据', async () => {
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={() => {}} />);

    await waitFor(() => {
      expect(pressureMock.getPressureStats).toHaveBeenCalledTimes(1);
    });
  });

  it('getPressureStats 失败时记录错误日志且页面不崩溃', async () => {
    pressureMock.getPressureStats.mockRejectedValue(new Error('网络错误'));

    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={() => {}} />);

    await waitFor(() => {
      expect(loggerMock.error).toHaveBeenCalledWith('加载压力数据失败', expect.any(Error));
    });
    // 页面仍正常渲染标题,默认压力数据兜底不阻塞 UI
    expect(screen.getByText('压力分布雷达')).toBeInTheDocument();
  });

  it('点击"挂机空间"按钮触发 onEnterIdle', () => {
    const onEnterIdle = vi.fn();
    render(<HomePage onEnterIdle={onEnterIdle} onEnterBattle={() => {}} onNavigate={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '进入挂机空间' }));
    expect(onEnterIdle).toHaveBeenCalledTimes(1);
  });

  it('点击"对战大厅"按钮触发 onEnterBattle', () => {
    const onEnterBattle = vi.fn();
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={onEnterBattle} onNavigate={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '进入对战大厅' }));
    expect(onEnterBattle).toHaveBeenCalledTimes(1);
  });

  it('底部"对战"tab 触发 onNavigate("lobby")(battle→lobby 映射)', () => {
    const onNavigate = vi.fn();
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '对战' }));
    expect(onNavigate).toHaveBeenCalledWith('lobby');
  });

  it('点击"更多功能"成就按钮触发 onNavigate("achievements")', () => {
    const onNavigate = vi.fn();
    render(<HomePage onEnterIdle={() => {}} onEnterBattle={() => {}} onNavigate={onNavigate} />);

    // aria-label="成就系统" 与底部导航无冲突,唯一匹配
    fireEvent.click(screen.getByRole('button', { name: '成就系统' }));
    expect(onNavigate).toHaveBeenCalledWith('achievements');
  });
});
