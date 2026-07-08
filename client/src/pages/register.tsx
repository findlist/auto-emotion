import { useId, useState } from 'react';
import { useUserStore } from '@/stores/user-store';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
  onRegisterSuccess: () => void;
}

export default function RegisterPage({ onNavigateToLogin, onRegisterSuccess }: RegisterPageProps) {
  const register = useUserStore((s) => s.register);
  const loading = useUserStore((s) => s.loading);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  // useId 生成稳定唯一 id，保证多实例渲染与 SSR 一致性，供 label.htmlFor 与 input.id 关联
  const phoneId = useId();
  const nicknameId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  // 错误提示元素 id，用于 aria-describedby 关联，使屏幕阅读器朗读输入框时同步播报错误
  const errorId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    try {
      await register(phone, password, nickname);
      onRegisterSuccess();
    } catch (err) {
      setError((err as Error).message || '注册失败');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-ink">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <span className="inline-block bg-mint text-ink px-3 py-1 text-xs font-bold tracking-widest mb-4">
            新用户注册
          </span>
          <h1 className="font-cn text-4xl text-cream mb-2">创建账号</h1>
          <p className="text-cream/60 font-mono text-sm">开始你的冒险之旅</p>
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint"
                required
                minLength={11}
                maxLength={20}
              />
            </div>

            {/* 昵称 */}
            <div>
              <label htmlFor={nicknameId} className="block font-mono text-sm text-ink mb-1">昵称</label>
              <input
                id={nicknameId}
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="请输入昵称（2-10字符）"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint"
                required
                minLength={2}
                maxLength={10}
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
                placeholder="请输入密码（至少6位）"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint"
                required
                minLength={6}
                maxLength={50}
              />
            </div>

            {/* 确认密码 */}
            <div>
              <label htmlFor={confirmPasswordId} className="block font-mono text-sm text-ink mb-1">确认密码</label>
              <input
                id={confirmPasswordId}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint"
                required
                minLength={6}
                maxLength={50}
              />
            </div>

            {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保注册失败时视障用户即时感知 */}
            {error && (
              <div id={errorId} role="alert" className="bg-pink/10 border border-pink text-pink px-4 py-2 font-mono text-sm">
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="bg-mint text-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-cream transition-colors shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <span className="text-ink/60 font-mono text-sm">已有账号？</span>
            <button
              onClick={onNavigateToLogin}
              className="text-mint font-mono text-sm font-bold ml-2 hover:underline"
            >
              立即登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
