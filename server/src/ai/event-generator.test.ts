import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEvents, type GameEvent } from './event-generator.js';

describe('event-generator 随机事件生成', () => {
  beforeEach(() => {
    // 固定 Date.now 让 id 可预测，固定 Math.random 让洗牌顺序确定
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    // Math.random 始终返回 0.5，sort 比较为 0.5-0.5=0，数组保持原顺序
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('默认参数：生成 3 个事件，triggerTime 从 30 开始间隔 20 递增', () => {
    const events = generateEvents();
    expect(events).toHaveLength(3);
    expect(events[0].triggerTime).toBe(30);
    expect(events[1].triggerTime).toBe(50);
    expect(events[2].triggerTime).toBe(70);
  });

  it('自定义参数：count=5 / startTime=10 / interval=5', () => {
    const events = generateEvents(5, 10, 5);
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.triggerTime)).toEqual([10, 15, 20, 25, 30]);
  });

  it('id 格式：event_{timestamp}_{index}，索引按生成顺序递增', () => {
    const events = generateEvents(2);
    expect(events[0].id).toBe('event_1000_0');
    expect(events[1].id).toBe('event_1000_1');
  });

  it('每个事件包含 type/name/effect/duration/payload 完整字段', () => {
    const events = generateEvents(1);
    const e = events[0];
    expect(['popup', 'debuff', 'buff', 'spawn']).toContain(e.type);
    expect(typeof e.name).toBe('string');
    expect(typeof e.effect).toBe('string');
    expect(typeof e.duration).toBe('number');
    expect(e.payload).toBeInstanceOf(Object);
  });

  it('count 超过预设池 10 时仍最多返回 10 个（slice 兜底）', () => {
    const events = generateEvents(20);
    expect(events).toHaveLength(10);
  });

  it('count=0 返回空数组', () => {
    const events = generateEvents(0);
    expect(events).toEqual([]);
  });

  it('洗牌后选中的事件互不相同（id 唯一）', () => {
    const events = generateEvents(5);
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // name 也应互不相同（预设池内 name 唯一）
    const names = events.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('两次调用生成不同 id（Date.now 不同时）', () => {
    const events1 = generateEvents(1);
    // 模拟时间推进
    vi.mocked(Date.now).mockReturnValue(2000);
    const events2 = generateEvents(1);
    expect(events1[0].id).not.toBe(events2[0].id);
  });

  it('返回的事件结构满足 GameEvent 接口类型', () => {
    const events: GameEvent[] = generateEvents(2);
    // 仅验证可赋值给 GameEvent[]，编译期已保证，运行期断言长度
    expect(events.length).toBe(2);
  });
});
