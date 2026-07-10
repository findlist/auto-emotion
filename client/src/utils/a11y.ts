// client/src/utils/a11y.ts
// 无障碍辅助工具集合

/**
 * tablist 方向键导航：ArrowLeft/Right 切换 tab，Home/End 跳首末
 * 设计原因：WAI-ARIA tablist 规范要求水平 tablist 支持方向键导航，
 * 4 个页面（friends/idle/leaderboard/shop）tablist 结构一致（button[role=tab]），
 * 提取通用逻辑避免重复，切换后聚焦新 tab 保证连续方向键操作流畅
 */
export function handleTabKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  tabKeys: string[],
  activeKey: string,
  onSelect: (key: string) => void,
): void {
  const currentIndex = tabKeys.indexOf(activeKey);
  if (currentIndex === -1) return;

  let nextIndex: number;
  switch (e.key) {
    case 'ArrowRight':
      nextIndex = (currentIndex + 1) % tabKeys.length;
      break;
    case 'ArrowLeft':
      nextIndex = (currentIndex - 1 + tabKeys.length) % tabKeys.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabKeys.length - 1;
      break;
    default:
      return;
  }

  // 阻止默认行为（如水平滚动），切换 tab 并聚焦
  e.preventDefault();
  onSelect(tabKeys[nextIndex]);
  // 当前 target 为 tablist 容器，查询其内所有 role=tab 按钮并聚焦目标
  const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
  buttons[nextIndex]?.focus();
}
