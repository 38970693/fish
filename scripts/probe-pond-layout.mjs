/**
 * LAYOUT-D：程序化塘景性能对照 + 20 次重开/模式切换资源稳定性。
 *
 * 默认跑短版（每组 4 秒）；正式记录可用 POND_LAYOUT_DURATION_MS=10000 放大采样窗口。
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const durationMs = Number(process.env.POND_LAYOUT_DURATION_MS ?? 4_000);
const output = process.env.POND_LAYOUT_OUTPUT ?? 'scripts/perf-pond-layout.json';
const seed = 20260925;
const viewport = { width: 1280, height: 800 };

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

const sampleFrames = duration => new Promise(resolve => {
  const intervals = [];
  const renders = [];
  const started = performance.now();
  let previous = started;
  const tick = now => {
    intervals.push(now - previous);
    previous = now;
    const metrics = window.__PIXI_PROBE__ ?? window.__FISH_RENDER_METRICS__?.();
    if (metrics?.lastRenderMs !== undefined) renders.push(metrics.lastRenderMs);
    if (now - started >= duration) resolve({ intervals, renders });
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const openScenario = async (browser, baseUrl, renderer, layoutMode) => {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(value => {
    let state = value >>> 0;
    Math.random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  }, seed);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto(`${baseUrl}/?renderer=${renderer}&mode=rivals&pondLayout=${layoutMode}&pondSeed=${seed}`);
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.waitForFunction(() => !!window.__FISH_DEBUG__?.state);
  const fixture = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__.state();
    const result = window.__FISH_DEBUG__.pixiLodStressScene(false);
    state.obstacles = [];
    state.buildings = [];
    state.portals = [];
    state.currents = [];
    state.fountains = [];
    state.treasures = [];
    state.powerUps = [];
    state.hazards = [];
    state.particles = [];
    state.labels = [];
    if (state.feedingEvent) {
      state.feedingEvent.phase = 'WAITING';
      state.feedingEvent.timer = 1_000_000;
      state.feedingEvent.drops = [];
    }
    return {
      ...result,
      pondId: state.pondId,
      pondLayoutMode: state.pondLayoutMode,
      layoutSeed: state.layoutSeed ?? null,
      layoutVersion: state.layoutVersion ?? null,
    };
  });
  await page.waitForTimeout(1_500);
  const beforeMetrics = await page.evaluate(() => window.__PIXI_PROBE__ ?? window.__FISH_RENDER_METRICS__?.());
  const frames = await page.evaluate(sampleFrames, durationMs);
  const afterMetrics = await page.evaluate(() => window.__PIXI_PROBE__ ?? window.__FISH_RENDER_METRICS__?.());
  await page.close();
  return {
    renderer,
    layoutMode,
    fixture,
    errors,
    frameCount: frames.intervals.length,
    frameMs: {
      p50: percentile(frames.intervals, 0.5),
      p95: percentile(frames.intervals, 0.95),
      p99: percentile(frames.intervals, 0.99),
    },
    renderMs: {
      p50: percentile(frames.renders, 0.5),
      p95: percentile(frames.renders, 0.95),
    },
    beforeMetrics,
    afterMetrics,
    renderErrorDelta: renderer === 'pixi'
      ? (afterMetrics?.renderErrorCount ?? 0) - (beforeMetrics?.renderErrorCount ?? 0)
      : 0,
  };
};

const resourceSnapshot = () => {
  const metrics = window.__PIXI_PROBE__;
  const state = window.__FISH_DEBUG__.state();
  return {
    mode: state.pondLayoutMode,
    seed: state.layoutSeed ?? null,
    backgroundKey: state.pondLayout ? `${state.pondId}:${state.pondLayout.version}:${state.pondLayout.seed}` : state.pondId,
    displayObjects: metrics?.displayObjects ?? 0,
    creaturePoolSize: metrics?.creaturePoolSize ?? 0,
    appearanceCacheSize: metrics?.appearanceCacheSize ?? 0,
    lodTextureCacheSize: metrics?.lodTextureCacheSize ?? 0,
    lodTextureCacheBytes: metrics?.lodTextureCacheBytes ?? 0,
    renderErrors: metrics?.renderErrorCount ?? 0,
  };
};

const runRestartProbe = async (browser, baseUrl) => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseUrl}/?renderer=pixi&mode=rivals&pondLayout=procedural&pondSeed=${seed}`);
  const snapshots = [];
  for (let i = 0; i < 20; i += 1) {
    const procedural = i % 2 === 0;
    const nextSeed = seed + i;
    await page.evaluate(({ procedural, nextSeed }) => {
      const url = new URL(window.location.href);
      url.searchParams.set('pondLayout', procedural ? 'procedural' : 'classic');
      url.searchParams.set('pondSeed', String(nextSeed));
      history.replaceState({}, '', url);
    }, { procedural, nextSeed });
    await page.getByRole('button', { name: /驶入/ }).click();
    await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.status === 'PLAYING');
    await page.evaluate(() => window.__FISH_DEBUG__.pixiLodStressScene(false));
    // 等对象池的复用冷却与延迟销毁窗口跑完，再取稳定快照；120ms 会正好卡在
    // CREATURE_REUSE_COOLDOWN_FRAMES 附近，只能量到过渡态而不是资源稳态。
    await page.waitForTimeout(700);
    snapshots.push(await page.evaluate(resourceSnapshot));
    await page.getByRole('button', { name: /返回主界面/ }).click();
    await page.getByRole('heading', { name: '欢乐鱼塘' }).waitFor();
    await page.waitForTimeout(250);
  }
  await page.close();

  const warm = snapshots.slice(5);
  const range = key => {
    const values = warm.map(item => item[key]);
    return { min: Math.min(...values), max: Math.max(...values), delta: Math.max(...values) - Math.min(...values) };
  };
  const trend = mode => {
    const values = warm.filter(item => item.mode === mode).map(item => item.displayObjects);
    const width = Math.min(3, Math.floor(values.length / 2));
    const mean = slice => slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
    const firstMean = mean(values.slice(0, width));
    const lastMean = mean(values.slice(-width));
    return { samples: values.length, firstMean, lastMean, delta: lastMean - firstMean };
  };
  return {
    snapshots,
    steadyRanges: {
      displayObjects: range('displayObjects'),
      creaturePoolSize: range('creaturePoolSize'),
      appearanceCacheSize: range('appearanceCacheSize'),
      lodTextureCacheSize: range('lodTextureCacheSize'),
      lodTextureCacheBytes: range('lodTextureCacheBytes'),
    },
    displayObjectTrend: {
      classic: trend('CLASSIC'),
      procedural: trend('PROCEDURAL'),
    },
    renderErrors: {
      min: Math.min(...warm.map(item => item.renderErrors)),
      max: Math.max(...warm.map(item => item.renderErrors)),
      delta: Math.max(...warm.map(item => item.renderErrors)) - Math.min(...warm.map(item => item.renderErrors)),
    },
  };
};

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('Pond layout probe server did not start');
const baseUrl = `http://127.0.0.1:${address.port}`;

let browser;
const scenarios = [];
let restartProbe;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const renderer of ['canvas', 'pixi']) {
    for (const layoutMode of ['classic', 'procedural']) {
      const scenario = await openScenario(browser, baseUrl, renderer, layoutMode);
      scenarios.push(scenario);
      console.log(`${renderer}/${layoutMode}: frame p95 ${scenario.frameMs.p95.toFixed(2)}ms, render p95 ${scenario.renderMs.p95.toFixed(2)}ms`);
    }
  }
  restartProbe = await runRestartProbe(browser, baseUrl);
} finally {
  await browser?.close();
  await server.close();
}

const comparisons = ['canvas', 'pixi'].map(renderer => {
  const classic = scenarios.find(item => item.renderer === renderer && item.layoutMode === 'classic');
  const procedural = scenarios.find(item => item.renderer === renderer && item.layoutMode === 'procedural');
  const ratio = procedural.frameMs.p95 / Math.max(0.001, classic.frameMs.p95);
  return { renderer, classicP95: classic.frameMs.p95, proceduralP95: procedural.frameMs.p95, ratio, pass: ratio <= 1.1 };
});

const report = {
  measuredAt: new Date().toISOString(),
  seed,
  viewport,
  durationMs,
  scenarios,
  comparisons,
  restartProbe,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

const resourceStable = restartProbe.renderErrors.delta === 0
  && Math.abs(restartProbe.displayObjectTrend.classic.delta) <= 10
  && Math.abs(restartProbe.displayObjectTrend.procedural.delta) <= 10
  && restartProbe.steadyRanges.creaturePoolSize.delta <= 4
  && restartProbe.steadyRanges.appearanceCacheSize.max <= 128
  && restartProbe.steadyRanges.lodTextureCacheSize.max <= 64
  && restartProbe.steadyRanges.lodTextureCacheBytes.max <= 32 * 1024 * 1024;
if (scenarios.some(item => item.errors.length > 0 || item.frameCount < 1 || item.renderErrorDelta > 0)
  || comparisons.some(item => !item.pass)
  || !resourceStable) process.exitCode = 1;
