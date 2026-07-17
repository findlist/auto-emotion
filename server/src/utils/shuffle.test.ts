// server/src/utils/shuffle.test.ts
// shuffle 单元测试：覆盖空数组、单元素、多元素、原数组不变、mock 交换行为

import { describe, it, expect, vi } from 'vitest';
import { shuffle } from './shuffle.js';

describe('shuffle Fisher-Yates 洗牌', () => {
  it('空数组返回新空数组', () => {
    const result = shuffle([]);
    expect(result).toEqual([]);
    expect(result).not.toBe([]); // 返回新数组引用
  });

  it('单元素数组返回包含该元素的新数组', () => {
    const result = shuffle([42]);
    expect(result).toEqual([42]);
  });

  it('多元素数组返回包含全部相同元素的新数组（顺序可能不同）', () => {
    const source = [1, 2, 3, 4, 5];
    const result = shuffle(source);
    expect(result).toHaveLength(5);
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('不修改原数组（入参 readonly 约束的运行时验证）', () => {
    const source = [1, 2, 3, 4, 5];
    const snapshot = [...source];
    shuffle(source);
    expect(source).toEqual(snapshot);
  });

  it('mock Math.random=0 时数组完全反转（验证交换逻辑）', () => {
    // Math.random()=0 → j=Math.floor(0*(i+1))=0，每次都与首位交换
    // i=4: 交换 [4]↔[0] → [5,2,3,4,1]
    // i=3: 交换 [3]↔[0] → [4,2,3,5,1]
    // i=2: 交换 [2]↔[0] → [3,2,4,5,1]
    // i=1: 交换 [1]↔[0] → [2,3,4,5,1]
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = shuffle([1, 2, 3, 4, 5]);
    expect(result).toEqual([2, 3, 4, 5, 1]);
    randomSpy.mockRestore();
  });

  it('mock Math.random=0.5 时交换位置可预测', () => {
    // Math.random()=0.5 → j=Math.floor(0.5*(i+1))
    // i=4: j=2 → 交换 [4]↔[2] → [1,2,5,4,3]
    // i=3: j=2 → 交换 [3]↔[2] → [1,2,4,5,3]
    // i=2: j=1 → 交换 [2]↔[1] → [1,4,2,5,3]
    // i=1: j=1 → 交换 [1]↔[1] → [1,4,2,5,3]（不变）
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = shuffle([1, 2, 3, 4, 5]);
    expect(result).toEqual([1, 4, 2, 5, 3]);
    randomSpy.mockRestore();
  });
});
