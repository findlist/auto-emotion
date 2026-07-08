import { useCallback, useEffect, useRef, useState } from 'react';
import { shopApi, type ShopItem, type InventoryItem } from '@/api/shop';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

interface ShopPageProps {
  onBack: () => void;
}

type Tab = 'items' | 'inventory';
type ItemType = 'all' | 'item' | 'weapon_skin' | 'pet';

const TYPE_LABELS: Record<string, string> = {
  item: '道具',
  weapon_skin: '武器皮肤',
  pet: '宠物',
};

export default function ShopPage({ onBack }: ShopPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [activeType, setActiveType] = useState<ItemType>('all');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  // 请求序号守卫：loadItems 与 loadInventory 各自独立递增，await 后比对序号丢弃过期请求
  // 设计原因：用户快速切换 type 筛选时，旧请求可能后返回覆盖新数据；
  // 两个 ref 独立避免 handleBuy 内 loadItems+loadInventory 顺序调用时互相取消
  const itemsRequestIdRef = useRef(0);
  const inventoryRequestIdRef = useRef(0);

  // 加载商品列表：useCallback 保证引用稳定，依赖 activeType 变化时重建
  // 设计原因：原函数声明在 useEffect 内引用触发 react-hooks/exhaustive-deps 警告，
  // useCallback 让函数引用显式纳入依赖数组，符合 React 19 严格模式要求
  const loadItems = useCallback(async () => {
    const requestId = ++itemsRequestIdRef.current;
    try {
      setLoading(true);
      const type = activeType === 'all' ? undefined : activeType;
      const data = await shopApi.getItems(type);
      // 旧请求后返回则丢弃，避免覆盖最新 type 筛选数据
      if (requestId !== itemsRequestIdRef.current) return;
      setItems(data);
    } catch (err) {
      logger.error('加载商品失败', err);
    } finally {
      // 仅最新请求可重置 loading，避免旧请求错误清除新请求的 loading 状态
      if (requestId === itemsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [activeType]);

  // 加载背包：useCallback 保证引用稳定，无外部依赖
  const loadInventory = useCallback(async () => {
    const requestId = ++inventoryRequestIdRef.current;
    try {
      setLoading(true);
      const data = await shopApi.getInventory();
      if (requestId !== inventoryRequestIdRef.current) return;
      setInventory(data);
    } catch (err) {
      logger.error('加载背包失败', err);
    } finally {
      if (requestId === inventoryRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'items') {
      loadItems();
    } else {
      loadInventory();
    }
    // activeType 通过 loadItems 引用变化间接触发重载，无需显式声明
  }, [activeTab, loadItems, loadInventory]);

  async function handleBuy(item: ShopItem) {
    // 关键操作：先弹确认弹窗，避免误触
    const ok = await showConfirm({
      type: 'warning',
      title: '确认购买',
      message: `将花费 ${item.price} 金币购买「${item.name}」，确认吗？`,
      confirmText: '购买',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await shopApi.buy(item.id);
      showToast('success', `购买成功！获得 ${item.name}`);
      await loadItems();
      await loadInventory();
    } catch (err) {
      showApiError(err, '购买失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 返回按钮仅含箭头符号，aria-label 提供语义避免屏幕阅读器朗读"左箭头" */}
        <button onClick={onBack} aria-label="返回" className="text-cream hover:text-yellow transition-colors">
          ←
        </button>
        <h1 className="font-cn text-lg font-bold">商城</h1>
      </header>

      {/* Tab 切换：WAI-ARIA tab 语义让屏幕阅读器正确识别为标签页界面
          设计原因：role=tablist/tab/tabpanel + aria-selected/controls/labelled
          构成完整 tab 语义。保留所有 tab 的默认 button 可聚焦性，不引入 roving
          tabindex 避免箭头键导航复杂度，是安全增量改进 */}
      <div role="tablist" aria-label="商城视图" className="flex border-b-2 border-ink">
        <button
          role="tab"
          aria-selected={activeTab === 'items'}
          aria-controls="shop-panel"
          id="shop-tab-items"
          onClick={() => setActiveTab('items')}
          className={`flex-1 py-3 font-cn font-bold transition-colors ${
            activeTab === 'items' ? 'bg-mint text-ink' : 'bg-cream text-ink/70'
          }`}
        >
          商品
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'inventory'}
          aria-controls="shop-panel"
          id="shop-tab-inventory"
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 py-3 font-cn font-bold transition-colors ${
            activeTab === 'inventory' ? 'bg-mint text-ink' : 'bg-cream text-ink/70'
          }`}
        >
          背包 ({inventory.reduce((sum, item) => sum + item.quantity, 0)})
        </button>
      </div>

      {/* 类型筛选：嵌套子 tablist，仅商品 tab 激活时显示
          设计原因：商品类型筛选是 items tabpanel 内的二级标签页，需独立 tablist
          语义。子 tab 的 aria-controls 指向 items 列表的 tabpanel id */}
      {activeTab === 'items' && (
        <div role="tablist" aria-label="商品类型筛选" className="flex gap-2 p-3 border-b-2 border-ink/20 overflow-x-auto">
          {(['all', 'item', 'weapon_skin', 'pet'] as ItemType[]).map((type) => (
            <button
              key={type}
              role="tab"
              aria-selected={activeType === type}
              aria-controls="shop-items-panel"
              id={`shop-type-${type}`}
              onClick={() => setActiveType(type)}
              className={`px-3 py-1 font-cn text-sm whitespace-nowrap transition-colors ${
                activeType === type
                  ? 'bg-ink text-cream'
                  : 'bg-ink/10 text-ink/70 hover:bg-ink/20'
              }`}
            >
              {type === 'all' ? '全部' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {/* 内容区域：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区 */}
      <main role="tabpanel" id="shop-panel" aria-labelledby={`shop-tab-${activeTab}`} className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="text-center py-8">
            <p className="font-cn text-ink/70">加载中...</p>
          </div>
        ) : activeTab === 'items' ? (
          /* items 列表：子 tabpanel 关联当前激活的类型 tab
             设计原因：子 tabpanel 嵌套在主 tabpanel 内，让屏幕阅读器在类型筛选
             切换时自动定位到商品列表区 */
          <div role="tabpanel" id="shop-items-panel" aria-labelledby={`shop-type-${activeType}`}>
            {items.length === 0 ? (
              <div className="text-center py-8">
                {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
                <p className="text-4xl mb-4"><span aria-hidden="true">🛒</span></p>
                <p className="font-cn text-ink/70">暂无商品</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-cream border-2 border-ink p-3 shadow-[3px_3px_0_#1a1a1a]"
                  >
                    <div className="text-center mb-2">
                      {/* 商品 emoji 与后跟商品名语义重复，aria-hidden 屏蔽装饰图标 */}
                      <span className="text-4xl" aria-hidden="true">{item.emoji}</span>
                    </div>
                    <p className="font-cn text-ink font-bold text-center mb-1">{item.name}</p>
                    <p className="font-mono text-xs text-ink/60 text-center mb-2">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-center gap-1 mb-3">
                      {/* 💰 与后跟价格数字语义重复，aria-hidden 屏蔽装饰图标 */}
                      <span className="text-yellow" aria-hidden="true">💰</span>
                      <span className="font-mono text-ink font-bold">{item.price}</span>
                    </div>
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={loading}
                      className="w-full bg-ink text-cream py-2 font-cn font-bold hover:bg-pink transition-colors disabled:opacity-50"
                    >
                      购买
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-8">
            {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
            <p className="text-4xl mb-4"><span aria-hidden="true">🎒</span></p>
            <p className="font-cn text-ink/70">背包空空如也</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="bg-cream border-2 border-ink p-4 shadow-[3px_3px_0_#1a1a1a]"
              >
                <div className="flex items-center gap-3">
                  {/* 背包道具 emoji 与后跟道具名语义重复，aria-hidden 屏蔽装饰图标 */}
                  <span className="text-3xl" aria-hidden="true">{item.emoji}</span>
                  <div className="flex-1">
                    <p className="font-cn text-ink font-bold">{item.name}</p>
                    <p className="font-mono text-xs text-ink/60">
                      {TYPE_LABELS[item.item_type] || item.item_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-ink font-bold">x{item.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}