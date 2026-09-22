import { createAppearanceRandom } from '../seed';
import type { PatternMark, ResolvedMorphology } from '../types';

/** 生成稳定的身体纹理标记；渲染器负责用身体轮廓裁切。 */
export const generatePatternMarks = (morphology: ResolvedMorphology, count = 24): readonly PatternMark[] => {
  const random = createAppearanceRandom((morphology.seed ^ 0x9e3779b9) >>> 0);
  const marks: PatternMark[] = [];
  const { minX, maxX, minY, maxY } = morphology.geometry.bounds;
  const palette = morphology.material.patternId === 'STARRY_CLOWN'
    ? ['#ffe9aa', '#b6f7ff', '#ffffff']
    : [morphology.material.secondaryColor, '#0f172a'];
  const safeCount = Math.max(0, Math.min(96, count));
  const pairCount = Math.floor(safeCount / 2);
  for (let index = 0; index < pairCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * 0.78;
    const mark = {
      x: (minX + maxX) * 0.5 + Math.cos(angle) * (maxX - minX) * 0.48 * distance,
      y: Math.abs(Math.sin(angle) * (maxY - minY) * 0.48 * distance),
      radius: 0.009 + random() * 0.022,
      color: palette[Math.floor(random() * palette.length)],
      alpha: 0.62 + random() * 0.34,
    };
    marks.push(mark, { ...mark, y: -mark.y });
  }
  if (safeCount % 2 === 1) {
    marks.push({
      x: minX + (maxX - minX) * (0.2 + random() * 0.55), y: 0,
      radius: 0.009 + random() * 0.022,
      color: palette[Math.floor(random() * palette.length)], alpha: 0.62 + random() * 0.34,
    });
  }
  return marks;
};

export const PATTERN_MARK_CACHE_CAPACITY = 128;
const patternCache = new Map<string, readonly PatternMark[]>();

/** 生成材质只在外观变化时计算；全局 LRU 上限防止随机个体撑爆内存。 */
export const getCachedPatternMarks = (morphology: ResolvedMorphology, count = 24): readonly PatternMark[] => {
  const safeCount = Math.max(0, Math.min(96, count));
  const key = `${morphology.signature}|marks:${safeCount}`;
  const hit = patternCache.get(key);
  if (hit) {
    patternCache.delete(key); patternCache.set(key, hit);
    return hit;
  }
  const marks = Object.freeze(generatePatternMarks(morphology, safeCount));
  patternCache.set(key, marks);
  while (patternCache.size > PATTERN_MARK_CACHE_CAPACITY) patternCache.delete(patternCache.keys().next().value!);
  return marks;
};

export const patternMarkCacheSize = (): number => patternCache.size;
export const clearPatternMarkCache = (): void => patternCache.clear();
