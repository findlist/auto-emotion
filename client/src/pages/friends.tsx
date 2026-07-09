import { useEffect, useState } from 'react';
import { friendApi, type Friend, type FriendRequest } from '@/api/friends';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';
import { handleTabKeyDown } from '@/utils/a11y';

interface FriendsPageProps {
  onBack: () => void;
}

type Tab = 'friends' | 'requests';

export default function FriendsPage({ onBack }: FriendsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [addUserId, setAddUserId] = useState('');

  // 加载数据
  async function loadData() {
    try {
      setLoading(true);
      const [friendsData, requestsData] = await Promise.all([
        friendApi.getFriends().catch(() => []),
        friendApi.getRequests().catch(() => []),
      ]);
      setFriends(friendsData);
      setRequests(requestsData);
    } catch (err) {
      logger.error('加载好友数据失败', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // 添加好友
  async function handleAddFriend() {
    const userId = parseInt(addUserId, 10);
    if (isNaN(userId)) {
      showToast('warning', '请输入有效的用户ID');
      return;
    }

    try {
      setLoading(true);
      const result = await friendApi.sendRequest(userId);
      if (result.autoAccepted) {
        showToast('success', '已成为好友！');
      } else {
        showToast('success', '好友请求已发送');
      }
      setAddUserId('');
      await loadData();
    } catch (err) {
      showApiError(err, '添加好友失败');
    } finally {
      setLoading(false);
    }
  }

  // 接受请求
  async function handleAccept(requestId: number) {
    try {
      setLoading(true);
      await friendApi.accept(requestId);
      showToast('success', '已接受好友请求');
      await loadData();
    } catch (err) {
      showApiError(err, '接受失败');
    } finally {
      setLoading(false);
    }
  }

  // 拒绝请求
  async function handleReject(requestId: number) {
    try {
      setLoading(true);
      await friendApi.reject(requestId);
      await loadData();
    } catch (err) {
      showApiError(err, '拒绝失败');
    } finally {
      setLoading(false);
    }
  }

  // 删除好友
  async function handleRemove(friendId: number) {
    // 删除好友为不可逆操作，需二次确认
    const ok = await showConfirm({
      type: 'danger',
      title: '删除好友',
      message: '确定要删除该好友吗？删除后需重新添加。',
      confirmText: '删除',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await friendApi.remove(friendId);
      showToast('success', '已删除好友');
      await loadData();
    } catch (err) {
      showApiError(err, '删除失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 返回按钮仅含箭头符号，aria-label 提供语义避免屏幕阅读器朗读"左箭头" */}
        <button onClick={onBack} aria-label="返回" className="text-cream hover:text-yellow transition-colors">
          ←
        </button>
        <h1 className="font-cn text-lg font-bold">好友</h1>
      </header>

      {/* Tab 切换：WAI-ARIA tab 语义让屏幕阅读器正确识别为标签页界面
          设计原因：role=tablist/tab/tabpanel + aria-selected/controls/labelled
          构成完整 tab 语义。保留所有 tab 的默认 button 可聚焦性，不引入 roving
          tabindex 避免箭头键导航复杂度，是安全增量改进 */}
      <div role="tablist" aria-label="好友视图" className="flex border-b-2 border-ink"
        onKeyDown={(e) => handleTabKeyDown(e, ['friends', 'requests'], activeTab, (k) => setActiveTab(k as Tab))}>
        <button
          role="tab"
          aria-selected={activeTab === 'friends'}
          aria-controls="friends-panel"
          id="friends-tab-friends"
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-3 font-cn font-bold transition-colors ${
            activeTab === 'friends' ? 'bg-mint text-ink' : 'bg-cream text-ink/70'
          }`}
        >
          好友列表 ({friends.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'requests'}
          aria-controls="friends-panel"
          id="friends-tab-requests"
          onClick={() => setActiveTab('requests')}
          className={`flex-1 py-3 font-cn font-bold transition-colors relative ${
            activeTab === 'requests' ? 'bg-mint text-ink' : 'bg-cream text-ink/70'
          }`}
        >
          好友请求 ({requests.length})
          {requests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-pink text-cream text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {/* 内容区域：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区 */}
      <main role="tabpanel" id="friends-panel" aria-labelledby={`friends-tab-${activeTab}`} className="flex-1 p-4 overflow-auto">
        {activeTab === 'friends' && (
          <div className="space-y-4">
            {/* 添加好友 */}
            <div className="bg-cream border-2 border-ink p-4 shadow-[3px_3px_0_#1a1a1a]">
              <p className="font-cn text-sm text-ink/70 mb-2">添加好友</p>
              <div className="flex gap-2">
                {/* input 仅 placeholder 无语义标签，aria-label 让屏幕阅读器识别字段用途 */}
                <input
                  type="number"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  placeholder="输入用户ID"
                  aria-label="用户ID"
                  className="flex-1 bg-white border-2 border-ink px-3 py-2 font-mono text-sm focus:border-pink"
                />
                <button
                  onClick={handleAddFriend}
                  disabled={loading || !addUserId}
                  className="bg-ink text-cream px-4 py-2 font-cn font-bold hover:bg-pink transition-colors disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 好友列表 */}
            {friends.length === 0 ? (
              <div className="text-center py-8">
                {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
                <p className="text-4xl mb-4"><span aria-hidden="true">👥</span></p>
                <p className="font-cn text-ink/70">还没有好友，快去添加吧</p>
              </div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="bg-cream border-2 border-ink p-4 shadow-[3px_3px_0_#1a1a1a]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-ink rounded-full flex items-center justify-center text-2xl">
                      {friend.avatar_url || '👤'}
                    </div>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{friend.nickname}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {/* 在线/离线 emoji 与文字语义重复，aria-hidden 屏蔽装饰 emoji */}
                        {friend.online ? <><span aria-hidden="true">🟢</span> 在线</> : <><span aria-hidden="true">⚫</span> 离线</>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemove(friend.id)}
                      disabled={loading}
                      className="bg-red-500 text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-4">
            {requests.length === 0 ? (
              <div className="text-center py-8">
                {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
                <p className="text-4xl mb-4"><span aria-hidden="true">📬</span></p>
                <p className="font-cn text-ink/70">暂无好友请求</p>
              </div>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="bg-cream border-2 border-ink p-4 shadow-[3px_3px_0_#1a1a1a]"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-ink rounded-full flex items-center justify-center text-2xl">
                      {request.avatar_url || '👤'}
                    </div>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{request.nickname}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(request.id)}
                      disabled={loading}
                      className="flex-1 bg-mint text-ink px-3 py-2 font-cn font-bold hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
                    >
                      接受
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={loading}
                      className="flex-1 bg-ink text-cream px-3 py-2 font-cn font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}