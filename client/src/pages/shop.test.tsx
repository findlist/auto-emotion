import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// getItems 在竞态测试中返回可控 Promise，手动控制 resolve 顺序模拟异步竞态。
const shopApiMock = vi.hoisted(() => ({
  getItems: vi.fn(),
  getInventory: vi.fn(),
  buy: vi.fn(),
}));

vi.mock('@/api/shop', () => ({
  shopApi: shopApiMock,
}));

// mock 弹窗/Toast/错误处理工具，避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: vi.fn() }));
vi.mock('@/utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));

import ShopPage from '@/pages/shop';

// 全部类型与武器皮肤类型的模拟商品，name 区分以便断言哪份数据被渲染
const allItems = [
  { id: 1, name: '全部商品A', description: '描述A', type: 'item', price: 100, price_type: 'gold', emoji: '📦' },
];
const weaponSkinItems = [
  { id: 2, name: '武器皮肤B', description: '描述B', type: 'weapon_skin', price: 200, price_type: 'gold', emoji: '⚔️' },
];

describe('ShopPage 商城页与竞态守卫', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始加载商品列表后渲染商品名', async () => {
    shopApiMock.getItems.mockResolvedValue(allItems);
    shopApiMock.getInventory.mockResolvedValue([]);

    render(<ShopPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('全部商品A')).toBeInTheDocument();
    });
  });

  it('快速切换 type 筛选时旧请求后返回不覆盖新数据（竞态守卫）', async () => {
    // 用可控 Promise 模拟请求，手动控制 resolve 顺序制造竞态：
    // 先 resolve 新请求（weapon_skin），后 resolve 旧请求（all），
    // 验证最终显示 weapon_skin 数据，旧 all 请求被丢弃
    let resolveAll!: (v: typeof allItems) => void;
    let resolveWeaponSkin!: (v: typeof weaponSkinItems) => void;

    // getItems 调用参数：activeType==='all' 时传 undefined，否则传 type 字符串
    shopApiMock.getItems.mockImplementation((type?: string) => {
      if (type === undefined) {
        return new Promise<typeof allItems>((r) => { resolveAll = r; });
      }
      return new Promise<typeof weaponSkinItems>((r) => { resolveWeaponSkin = r; });
    });
    shopApiMock.getInventory.mockResolvedValue([]);

    render(<ShopPage onBack={() => {}} />);

    // 初始 all 请求已发出，未 resolve
    expect(shopApiMock.getItems).toHaveBeenCalledWith(undefined);

    // 切换到武器皮肤 type，触发新请求
    // （type 筛选按钮在 main 外部，loading 时仍可点击，是真实竞态入口）
    fireEvent.click(screen.getByText('武器皮肤'));
    expect(shopApiMock.getItems).toHaveBeenCalledWith('weapon_skin');

    // 先 resolve weapon_skin 请求（新请求）
    await act(async () => {
      resolveWeaponSkin(weaponSkinItems);
    });

    // 后 resolve all 请求（旧请求，应被 itemsRequestIdRef 守卫丢弃）
    await act(async () => {
      resolveAll(allItems);
    });

    // 验证显示 weapon_skin 数据，旧 all 数据未覆盖
    await waitFor(() => {
      expect(screen.getByText('武器皮肤B')).toBeInTheDocument();
    });
    expect(screen.queryByText('全部商品A')).not.toBeInTheDocument();
  });
});
