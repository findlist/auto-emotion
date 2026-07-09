import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// 各 get 方法在不同用例中动态调整返回值或可控 Promise，用于模拟异步竞态顺序。
const leaderboardApiMock = vi.hoisted(() => ({
  getPower: vi.fn(),
  getBattle: vi.fn(),
  getSpeed: vi.fn(),
  getFriends: vi.fn(),
  getUserRank: vi.fn(),
}));

vi.mock('@/api/leaderboard', () => ({
  leaderboardApi: leaderboardApiMock,
}));

// mock user-store：组件通过 useUserStore 读取 user.id 用于高亮当前用户行，
// 测试场景固定返回 user.id=1，与 mockRanking 中的 userId 区分避免误判高亮
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: { user: { id: number } | null }) => unknown) =>
    selector({ user: { id: 1 } }),
}));

import LeaderboardPage from '@/pages/leaderboard';

// 战力榜与对战榜的模拟数据，nickname 区分以便断言哪份数据被渲染
const powerRanking = [{ rank: 1, userId: 10, nickname: '战力王者', score: 9999 }];
const battleRanking = [{ rank: 1, userId: 20, nickname: '对战王者', score: 8888 }];

describe('LeaderboardPage 排行榜页与竞态守卫', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始加载战力榜数据后渲染排名条目与个人排名', async () => {
    leaderboardApiMock.getPower.mockResolvedValue({ ranking: powerRanking, total: 1 });
    leaderboardApiMock.getUserRank.mockResolvedValue({ rank: 3, score: 100 });

    render(<LeaderboardPage onBack={() => {}} />);

    // 等待异步加载完成，验证排行榜条目渲染
    await waitFor(() => {
      expect(screen.getByText('战力王者')).toBeInTheDocument();
    });
    // 个人排名区块渲染（"第 3 名"）
    // 样式精修将数字用 <span> 包裹加色，getByText 无法匹配跨子元素文本，改用 body.textContent 检查
    expect(document.body.textContent).toContain('第 3 名');
  });

  it('快速切换 tab 时旧请求后返回不覆盖新数据（竞态守卫）', async () => {
    // 用可控 Promise 模拟请求，手动控制 resolve 顺序制造竞态：
    // 先 resolve 新请求（battle），后 resolve 旧请求（power），
    // 验证最终显示 battle 数据，旧 power 请求被丢弃
    let resolvePower!: (v: { ranking: typeof powerRanking; total: number }) => void;
    let resolveBattle!: (v: { ranking: typeof battleRanking; total: number }) => void;

    leaderboardApiMock.getPower.mockReturnValue(
      new Promise<{ ranking: typeof powerRanking; total: number }>((r) => {
        resolvePower = r;
      }),
    );
    leaderboardApiMock.getBattle.mockReturnValue(
      new Promise<{ ranking: typeof battleRanking; total: number }>((r) => {
        resolveBattle = r;
      }),
    );
    // getUserRank 按 type 区分返回：battle=rank5 / power=rank3
    // 因 power 的 loadData 在 getPower resolve 后 requestId 守卫提前 return，
    // getUserRank('power') 不会被调用，userRank 保持 battle 的 rank=5
    leaderboardApiMock.getUserRank.mockImplementation((type: string) => {
      if (type === 'battle') return Promise.resolve({ rank: 5, score: 200 });
      return Promise.resolve({ rank: 3, score: 100 });
    });

    render(<LeaderboardPage onBack={() => {}} />);

    // 初始 power 请求已发出，未 resolve
    expect(leaderboardApiMock.getPower).toHaveBeenCalledTimes(1);

    // 切换到 battle tab，触发新请求（loadData 重建 → useEffect 重触发）
    fireEvent.click(screen.getByText('对战榜'));
    expect(leaderboardApiMock.getBattle).toHaveBeenCalledTimes(1);

    // 先 resolve battle 请求（新请求），battle 的 loadData 继续 → getUserRank('battle') 返回 rank=5
    await act(async () => {
      resolveBattle({ ranking: battleRanking, total: 1 });
    });

    // 后 resolve power 请求（旧请求），power 的 loadData 在 setRanking 前 return
    await act(async () => {
      resolvePower({ ranking: powerRanking, total: 1 });
    });

    // 验证显示 battle 数据，旧 power 数据未覆盖
    await waitFor(() => {
      expect(screen.getByText('对战王者')).toBeInTheDocument();
    });
    expect(screen.queryByText('战力王者')).not.toBeInTheDocument();
    // 个人排名应为 battle 的 rank=5
    // 样式精修将数字用 <span> 包裹加色，getByText 无法匹配跨子元素文本，改用 body.textContent 检查
    expect(document.body.textContent).toContain('第 5 名');
    // power 的 getUserRank 未被调用（守卫在 getUserRank 调用前已 return）
    expect(leaderboardApiMock.getUserRank).toHaveBeenCalledTimes(1);
    expect(leaderboardApiMock.getUserRank).toHaveBeenCalledWith('battle');
  });

  it('当前用户在排行榜中时高亮显示(我)标记（userId 类型不一致也能匹配）', async () => {
    // userId 用 string 模拟后端 bigint 序列化为字符串，user.id 为 number
    // 验证 String() 比较兼容类型差异，高亮与(我)标记正常渲染
    const rankingWithMe = [
      { rank: 1, userId: '1' as unknown as number, nickname: '我自己', score: 9999 },
      { rank: 2, userId: 20, nickname: '其他人', score: 8888 },
    ];
    leaderboardApiMock.getPower.mockResolvedValue({ ranking: rankingWithMe, total: 2 });
    leaderboardApiMock.getUserRank.mockResolvedValue({ rank: 1, score: 9999 });

    render(<LeaderboardPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('我自己')).toBeInTheDocument();
    });
    // 验证 (我) 标记渲染（userId 为 string、user.id 为 number，String() 比较兼容）
    expect(screen.getByText('(我)')).toBeInTheDocument();
    // 其他人不应有 (我) 标记
    expect(screen.queryByText('其他人(我)')).not.toBeInTheDocument();
  });
});
