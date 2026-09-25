import { describe, expect, it } from 'vitest';
import { summarizeLabPerformance } from '../morphology/labPerformance';

const scenario = (name: string, p95 = 16.9) => ({
  name, durationMs: 60_000, scene: { entities: 300 }, frameMs: { p95 },
  longFrames: { ratio: 0.02 }, renderMs: { p95: 14 },
  resources: {
    textures: { min: 30, max: 30 }, cacheBytes: { min: 1_400_000, max: 1_400_000 },
    displayObjects: { min: 2100, max: 2110 },
    final: { lod2AnimatedUpdates: 0, cacheSize: 30, tickerStarted: false },
  },
});

describe('实验室性能预算摘要', () => {
  it('两场 300 实体、60 秒稳定报告可放行', () => {
    const summary = summarizeLabPerformance({ measuredAt: '2026-09-23T00:00:00Z', errors: [], scenarios: [scenario('natural-calm'), scenario('three-team-contest')] });
    expect(summary.passed).toBe(true);
    expect(summary.lines.join('\n')).toContain('纹理 30–30');
    expect(summary.lines.join('\n')).toContain('LOD2 动画更新 0');
  });

  it('场景不完整或资源增长必须标出未放行', () => {
    expect(summarizeLabPerformance({ errors: [], scenarios: [scenario('natural-calm')] }).passed).toBe(false);
    const bad = scenario('three-team-contest', 20);
    bad.resources.textures.max = 99;
    expect(summarizeLabPerformance({ errors: [], scenarios: [scenario('natural-calm'), bad] }).passed).toBe(false);
  });
});
