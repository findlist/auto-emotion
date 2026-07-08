import { type FC } from 'react';

interface EmptyProps {
  icon?: string;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const Empty: FC<EmptyProps> = ({
  icon = '📭',
  title = '暂无数据',
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      {/* 装饰性 emoji 与后跟 title 文字语义重复，aria-hidden 屏蔽避免屏幕阅读器冗余朗读 */}
      <span className="text-5xl" aria-hidden="true">{icon}</span>
      <div className="text-center">
        <p className="font-cn text-lg text-cream">{title}</p>
        {description && (
          <p className="font-mono text-sm text-cream/60 mt-1">
            {description}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-pink text-cream px-4 py-2 rounded-lg font-mono text-sm shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default Empty;
