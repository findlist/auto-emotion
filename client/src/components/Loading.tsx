import { type FC } from 'react';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const Loading: FC<LoadingProps> = ({ size = 'md', text = '加载中...' }) => {
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    // role=status + aria-live=polite：加载状态出现时屏幕阅读器礼貌朗读加载文案，不打断用户当前操作
    // aria-busy=true：标记当前区域正在异步加载，辅助技术可据此提示用户等待或禁用交互
    <div
      className="flex flex-col items-center justify-center gap-3 py-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={`${sizeMap[size]} border-4 border-cream border-t-pink rounded-full animate-spin`}
        aria-hidden="true"
      />
      {text && (
        <p className="font-mono text-sm text-cream/60">{text}</p>
      )}
    </div>
  );
};

export default Loading;
