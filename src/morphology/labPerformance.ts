interface Range { min: number; max: number }
interface Scenario {
  name: string; durationMs: number; scene: { entities: number };
  frameMs: { p95: number }; renderMs: { p95: number }; longFrames: { ratio: number };
  resources: { textures: Range; cacheBytes: Range; displayObjects: Range;
    final: { lod2AnimatedUpdates: number; cacheSize: number; tickerStarted: boolean } };
}

export interface LabPerformanceSummary { passed: boolean; lines: string[] }

const isScenario = (value: unknown): value is Scenario => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Scenario;
  return typeof item.name === 'string' && Number.isFinite(item.durationMs)
    && Number.isFinite(item.scene?.entities) && Number.isFinite(item.frameMs?.p95)
    && Number.isFinite(item.renderMs?.p95) && Number.isFinite(item.longFrames?.ratio)
    && Number.isFinite(item.resources?.textures?.min) && Number.isFinite(item.resources?.textures?.max)
    && Number.isFinite(item.resources?.cacheBytes?.min) && Number.isFinite(item.resources?.cacheBytes?.max)
    && Number.isFinite(item.resources?.displayObjects?.min) && Number.isFinite(item.resources?.displayObjects?.max)
    && Number.isFinite(item.resources?.final?.lod2AnimatedUpdates)
    && Number.isFinite(item.resources?.final?.cacheSize)
    && typeof item.resources?.final?.tickerStarted === 'boolean';
};

/** 与 300 实体正式探针相同的资源预算；长帧比例单独展示，不掩盖回归。 */
export const summarizeLabPerformance = (report: unknown): LabPerformanceSummary => {
  if (!report || typeof report !== 'object') return { passed: false, lines: ['性能报告格式无效'] };
  const value = report as { measuredAt?: string; errors?: unknown; scenarios?: unknown };
  if (!Array.isArray(value.scenarios) || !value.scenarios.every(isScenario)) {
    return { passed: false, lines: ['性能报告缺少有效场景数据'] };
  }
  const scenarios = value.scenarios as Scenario[];
  const required = ['natural-calm', 'three-team-contest'];
  const complete = required.every(name => scenarios.some(item => item.name === name)) && scenarios.length === 2;
  const clean = Array.isArray(value.errors) && value.errors.length === 0;
  const lines = [`采样: ${value.measuredAt ?? '未知'} · ${complete ? '双场齐全' : '场景不完整'}`];
  let passed = complete && clean;
  for (const item of scenarios) {
    const { textures, cacheBytes, displayObjects, final } = item.resources;
    const stable = item.scene.entities === 300 && item.durationMs >= 60_000
      && item.frameMs.p95 <= 18.7 && textures.max === textures.min
      && cacheBytes.max <= 32 * 1024 * 1024 && cacheBytes.max === cacheBytes.min
      && displayObjects.max - displayObjects.min <= 64 && final.cacheSize <= 64
      && final.lod2AnimatedUpdates === 0 && !final.tickerStarted;
    passed &&= stable;
    lines.push(`${item.name}: ${stable ? '通过' : '未放行'} · 300 实体 ${Math.round(item.durationMs / 1000)}s · frame p95 ${item.frameMs.p95.toFixed(1)}ms · render p95 ${item.renderMs.p95.toFixed(1)}ms`);
    lines.push(`  >25ms ${(item.longFrames.ratio * 100).toFixed(2)}% · 纹理 ${textures.min}–${textures.max} · 缓存 ${(cacheBytes.max / 1024 / 1024).toFixed(2)}MiB · 对象 ${displayObjects.min}–${displayObjects.max} · LOD2 动画更新 ${final.lod2AnimatedUpdates}`);
  }
  if (!clean) lines.push('浏览器异常: ' + (Array.isArray(value.errors) ? value.errors.length : '未知'));
  return { passed, lines };
};
