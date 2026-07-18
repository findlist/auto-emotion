import { useId, useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { getErrorMessage } from '@/utils/error';

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
      // err 实际是 axios 拦截器 reject 的 ErrorResponse 对象，由 getErrorMessage 内部读取 message 字段
      setError(getErrorMessage(err, '登录失败'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-ink bg-glow-pink relative overflow-hidden">
      {/* 装饰几何元素：四角小色块 + 缓慢旋转的圆环，增加游戏氛围 */}
      <div className="absolute top-8 left-8 w-6 h-6 bg-pink rotate-45 animate-pulse-slow" aria-hidden="true" />
      <div className="absolute top-12 right-12 w-4 h-4 bg-mint rounded-full animate-bounce-slow" aria-hidden="true" />
      <div className="absolute bottom-12 left-16 w-5 h-5 bg-yellow rounded-full animate-pulse-slow" aria-hidden="true" />
      <div className="absolute bottom-8 right-8 w-6 h-6 border-3 border-cream/30 rounded-full animate-spin-slow" aria-hidden="true" />

      <div className="w-full max-w-md relative z-10">
        {/* 标题 */}
        <div className="text-center mb-8 animate-stagger">
          <span className="inline-block bg-pink text-cream px-3 py-1 text-xs font-bold tracking-widest mb-4 shadow-[3px_3px_0_#1a1a1a]">
            情绪爆破局
          </span>
          <h1 className="font-cn text-4xl text-cream mb-2 drop-shadow-[3px_3px_0_rgba(255,61,127,0.4)]">
            欢迎回来
          </h1>
          <p className="text-cream/60 font-mono text-sm">登录以继续游戏</p>
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-pink focus:outline-none input-focus-pink transition-all"
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
                className="w-full px-4 py-3 border-2 border-ink font-mono text-sm focus:border-pink focus:outline-none input-focus-pink transition-all"
                required
                minLength={6}
                maxLength={50}
              />
            </div>

            {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保登录失败时视障用户即时感知 */}
            {error && (
              <div id={errorId} role="alert" className="bg-pink/10 border-2 border-pink text-pink px-4 py-2 font-mono text-sm animate-shake">
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1a1a1a]"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {/* 注册链接：上方加虚线分隔，区分"主操作（登录）"与"次要切换（去注册）"
              设计原因：原链接直接跟在提交按钮下方，视觉上与主操作混在一起；
              虚线分隔比实线轻量，不喧宾夺主，让用户先聚焦主操作再考虑切换 */}
          <div className="mt-6 pt-4 divider-dashed text-center">
            <span className="text-ink/60 font-mono text-sm">还没有账号？</span>
            <button
              onClick={onNavigateToRegister}
              className="text-pink font-mono text-sm font-bold ml-2 hover:underline decoration-2 underline-offset-2"
            >
              立即注册
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
