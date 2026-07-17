// server/src/utils/shuffle.ts
// Fisher-Yates 洗牌工具：统一 3 处数组打乱逻辑，消除分布偏差反模式

/**
 * Fisher-Yates 洗牌算法
 *
 * 设计原因：
 * 1. event-generator.ts 与 monster-generator.ts 各有一份内联/本地实现，
 *    task-service.ts 仍使用 `.sort(() => Math.random() - 0.5)` 反模式；
 *    抽取为公共工具消除重复，并统一为正确的均匀分布算法。
 * 2. 入参用 `readonly T[]` 约束，强制返回新数组，防止调用方意外原地修改原数据。
 * 3. 从后往前遍历与随机位置交换，保证每个排列等概率出现（均匀分布）；
 *    `.sort(() => Math.random() - 0.5)` 依赖排序引擎比较结果，分布有偏，
 *    某些元素停留在原位的概率更高，非真正的随机洗牌。
 *
 * @param arr 待打乱的数组（不会修改原数组）
 * @returns 打乱后的新数组
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
