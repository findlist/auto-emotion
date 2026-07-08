import { useId, useState } from 'react';
import { useUserStore } from '@/stores/user-store';

interface LoginPageProps {
  onNavigateToRegister: () => void;
  onLoginSuccess: () => void;
}

export default function LoginPage({ onNavigateToRegister, onLoginSuccess }: LoginPageProps) {
  const login = useUserStore((s) => s.login);
  const loading = useUserStore((s) => s.loading);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // useId 生成稳定唯一 id，保证多实例渲染与 SSR 一致性，供 label.htmlFor 与 input.id 关联
  const phoneId = useId();
  const passwordId = useId();
  // 错误提示元素 id，用于 aria-describedby 关联，使屏幕阅读器朗读输入框时同步播报错误
  const errorId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(phone, password);
      onLoginSuccess();
    } catch (err) {
      setError((err as Error).message || '登录失败');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-ink">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <span className="inline-block bg-pink text-cream px-3 py-1 text-xs font-bold tracking-widest mb-4">
            情绪爆破局
          </span>
          <h1 className="font-cn text-4xl text-cream mb-2">欢迎回来</h1>
          <p className="text-cream/60 font-mono text-sm">登录以继续游戏</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-cream border-4 border-cream shadow-[8px_8px_0_#1a1a1a] p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* 手机号 */}
            <div>
              <label htmlFor={phoneId} className="block font-mono text-sm text-ink mb-1">手机号</label>
              <input
                id={phoneId}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-pink"
                required
                minLength={11}
                maxLength={20}
              />
            </div>

            {/* 密码 */}
            <div>
              <label htmlFor={passwordId} className="block font-mono text-sm text-ink mb-1">密码</label>
              <input
                id={passwordId}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-pink"
                required
                minLength={6}
                maxLength={50}
              />
            </div>

            {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保登录失败时视障用户即时感知 */}
            {error && (
              <div id={errorId} role="alert" className="bg-pink/10 border border-pink text-pink px-4 py-2 font-mono text-sm">
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-colors shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {/* 注册链接 */}
          <div className="mt-6 text-center">
            <span className="text-ink/60 font-mono text-sm">还没有账号？</span>
            <button
              onClick={onNavigateToRegister}
              className="text-pink font-mono text-sm font-bold ml-2 hover:underline"
            >
              立即注册
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
