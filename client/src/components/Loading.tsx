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
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div
        className={`${sizeMap[size]} border-4 border-cream border-t-pink rounded-full animate-spin`}
      />
      {text && (
        <p className="font-mono text-sm text-cream/60">{text}</p>
      )}
    </div>
  );
};

export default Loading;
