import { describe, expect, it } from 'vitest';
import { AppearanceLru } from '../rendering/pixi/CreatureResourceBudget';

describe('Pixi 生物资源预算', () => {
  it('命中时刷新 LRU 顺序', () => {
    const cache = new AppearanceLru(2);
    expect(cache.touch('a')).toEqual({ hit: false });
    expect(cache.touch('b')).toEqual({ hit: false });
    expect(cache.touch('a')).toEqual({ hit: true });
    expect(cache.touch('c')).toEqual({ hit: false, evicted: 'b' });
    expect(cache.keys()).toEqual(['a', 'c']);
  });

  it('容量始终受限并可主动清空', () => {
    const cache = new AppearanceLru(3);
    for (let index = 0; index < 50; index += 1) cache.touch(`appearance-${index}`);
    expect(cache.size).toBe(3);
    expect(cache.keys()).toEqual(['appearance-47', 'appearance-48', 'appearance-49']);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('拒绝无效容量', () => {
    expect(() => new AppearanceLru(0)).toThrow(/positive integer/);
    expect(() => new AppearanceLru(1.5)).toThrow(/positive integer/);
  });
});
