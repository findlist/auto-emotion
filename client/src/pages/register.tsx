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
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-ink bg-glow-pink relative overflow-hidden">
      {/* 装饰几何元素：与登录页保持一致风格，使用 mint 主色区分 */}
      <div className="absolute top-8 left-8 w-6 h-6 bg-mint rotate-45 animate-pulse-slow" aria-hidden="true" />
      <div className="absolute top-12 right-12 w-4 h-4 bg-pink rounded-full animate-bounce-slow" aria-hidden="true" />
      <div className="absolute bottom-12 left-16 w-5 h-5 bg-yellow rounded-full animate-pulse-slow" aria-hidden="true" />
      <div className="absolute bottom-8 right-8 w-6 h-6 border-3 border-cream/30 rounded-full animate-spin-slow" aria-hidden="true" />

      <div className="w-full max-w-md relative z-10">
        {/* 标题 */}
        <div className="text-center mb-8 animate-stagger">
          <span className="inline-block bg-mint text-ink px-3 py-1 text-xs font-bold tracking-widest mb-4 shadow-[3px_3px_0_#1a1a1a]">
            新用户注册
          </span>
          <h1 className="font-cn text-4xl text-cream mb-2 drop-shadow-[3px_3px_0_rgba(61,217,181,0.4)]">
            创建账号
          </h1>
          <p className="text-cream/60 font-mono text-sm">开始你的冒险之旅</p>
        </div>

        {/* 表单卡片：border-ink 让 Neo-brutalism 硬边框可见（原 border-cream 与背景同色导致边框隐形） */}
        <div className="bg-cream border-4 border-ink shadow-[8px_8px_0_#1a1a1a] p-6 animate-stagger delay-200">
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint focus:outline-none input-focus-mint transition-all"
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint focus:outline-none input-focus-mint transition-all"
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint focus:outline-none input-focus-mint transition-all"
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-mint focus:outline-none input-focus-mint transition-all"
                required
                minLength={6}
                maxLength={50}
              />
            </div>

            {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保注册失败时视障用户即时感知 */}
            {error && (
              <div id={errorId} role="alert" className="bg-pink/10 border-2 border-pink text-pink px-4 py-2 font-mono text-sm animate-shake">
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="bg-mint text-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-cream transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1a1a1a] disabled:hover:bg-mint disabled:hover:text-ink"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <span className="text-ink/60 font-mono text-sm">已有账号？</span>
            <button
              onClick={onNavigateToLogin}
              className="text-mint font-mono text-sm font-bold ml-2 hover:underline decoration-2 underline-offset-2"
            >
              立即登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
