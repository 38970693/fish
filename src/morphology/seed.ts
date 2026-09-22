/** FNV-1a：把实体身份变成独立、可复现的外观种子。 */
export const appearanceSeedFromString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Mulberry32。状态只存在闭包内，不读取或改写玩法的 Math.random。 */
export const createAppearanceRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
};

const stableObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableObject(item)]));
  }
  return value;
};

/** 属性插入顺序不应制造不同缓存键。 */
export const stableAppearanceJson = (value: unknown): string => JSON.stringify(stableObject(value));
