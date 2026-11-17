import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COSMETICS } from '../types';
import { AI_COSMETICS_PRESETS } from '../data/cosmeticsOptions';
import { DEFAULT_BOOST_EFFECT } from '../data/boostEffects';
import { loadPlayerCosmetics, PLAYER_COSMETICS_STORAGE_KEY, savePlayerCosmetics } from '../core/cosmeticsStorage';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.spyOn(localStorage, 'getItem').mockImplementation(key => store.get(key) ?? null);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { store.set(key, value); });
});
afterEach(() => vi.restoreAllMocks());

describe('玩家装扮的本地保存', () => {
  it('首次访问使用默认装扮，每次读取返回独立的对象', () => {
    expect(loadPlayerCosmetics()).toEqual(DEFAULT_COSMETICS);
    expect(loadPlayerCosmetics()).not.toBe(loadPlayerCosmetics());
  });

  it('完整恢复所有预设（包括未单独上架的花纹）、稀有外观和自定义加速效果', () => {
    for (const preset of AI_COSMETICS_PRESETS) {
      const outfit = { ...preset.cosmetics, rareVariant: 'STARRY_CLOWN' as const,
        boostEffect: { style: 'FLAME' as const, color: '#abcdef', length: 1.4, width: 1.2, bubbles: false } };
      savePlayerCosmetics(outfit);
      expect(loadPlayerCosmetics()).toEqual(outfit);
    }
  });

  it('旧配置补齐缺失项，损坏项回退默认值且不丢失正常选项', () => {
    store.set(PLAYER_COSMETICS_STORAGE_KEY, JSON.stringify({
      eyeType: 'CAT', pattern: 'UNKNOWN', skinColor: null, rareVariant: 'UNKNOWN',
      boostEffect: { style: 'UNKNOWN', color: 'bad', length: 999, width: -2, bubbles: 'false' },
    }));
    expect(loadPlayerCosmetics()).toEqual({ ...DEFAULT_COSMETICS, eyeType: 'CAT',
      boostEffect: { ...DEFAULT_BOOST_EFFECT, length: 1.6, width: 0.6 } });
    store.set(PLAYER_COSMETICS_STORAGE_KEY, JSON.stringify({ eyeType: 'LOVE' }));
    expect(loadPlayerCosmetics()).toEqual({ ...DEFAULT_COSMETICS, eyeType: 'LOVE' });
  });

  it('JSON 损坏或根值不是对象时仍能进入游戏', () => {
    for (const raw of ['{broken', 'null', '[]', 'true', '42']) {
      store.set(PLAYER_COSMETICS_STORAGE_KEY, raw);
      expect(loadPlayerCosmetics()).toEqual(DEFAULT_COSMETICS);
    }
  });

  it('浏览器拒绝存储读写时不打断换装', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('Blocked'); });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect(loadPlayerCosmetics()).toEqual(DEFAULT_COSMETICS);
    expect(() => savePlayerCosmetics(DEFAULT_COSMETICS)).not.toThrow();
  });

  it('重置覆盖原搭配，下次打开不恢复旧装扮或加速效果', () => {
    savePlayerCosmetics({ ...AI_COSMETICS_PRESETS[2].cosmetics, boostEffect: { ...DEFAULT_BOOST_EFFECT, style: 'NONE' } });
    savePlayerCosmetics({ ...DEFAULT_COSMETICS });
    expect(loadPlayerCosmetics()).toEqual(DEFAULT_COSMETICS);
  });
});
