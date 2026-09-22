import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const DURATION_MS = Number(process.env.PIXI_STRESS_MS ?? 60_000);
const OUTPUT_PATH = process.env.PIXI_STRESS_OUTPUT ?? 'scripts/perf-pxr05b-pixi.json';
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const errors = [];
let page;
let startupRetries = 0;
for (let attempt = 0; attempt < 3; attempt += 1) {
  const candidate = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const attemptErrors = [];
  candidate.on('pageerror', error => attemptErrors.push(error.stack ?? error.message));
  await candidate.goto('http://127.0.0.1:3000/?renderer=pixi');
  await candidate.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
  await candidate.getByRole('button', { name: /驶入/ }).click();
  try {
    await candidate.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8, null, { timeout: 10_000 });
    page = candidate;
    errors.push(...attemptErrors);
    break;
  } catch {
    startupRetries += 1;
    await candidate.close();
  }
}
if (!page) throw new Error('Pixi renderer failed to reach 8 frames after three fresh-page attempts');

const scenarios = [];
for (const [name, contest] of [['natural-calm', false], ['three-team-contest', true]]) {
  const scene = await page.evaluate(value => window.__FISH_DEBUG__?.pixiLodStressScene(value), contest);
  await page.waitForTimeout(1_500);
  const sample = await page.evaluate(duration => new Promise(resolve => {
    const frameMs = [];
    const renderMs = [];
    const snapshots = [];
    const startedAt = performance.now();
    let previous = startedAt;
    let nextSnapshotAt = startedAt;
    const tick = now => {
      frameMs.push(now - previous);
      previous = now;
      const probe = window.__PIXI_PROBE__;
      if (probe) renderMs.push(probe.lastRenderMs);
      if (probe && now >= nextSnapshotAt) {
        snapshots.push({
          at: now - startedAt,
          renderCount: probe.renderCount,
          displayObjects: probe.displayObjects,
          textures: probe.textures,
          cacheSize: probe.lodTextureCacheSize,
          cacheBytes: probe.lodTextureCacheBytes,
          lod2AnimatedUpdates: probe.lod2AnimatedUpdates,
          visibleCreatures: probe.visibleCreatures,
          tickerStarted: probe.tickerStarted,
        });
        nextSnapshotAt += 1_000;
      }
      if (now - startedAt >= duration) resolve({ frameMs, renderMs, snapshots });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), DURATION_MS);
  const stable = sample.snapshots.slice(Math.min(5, sample.snapshots.length));
  scenarios.push({
    name,
    scene,
    durationMs: DURATION_MS,
    frameMs: { p50: percentile(sample.frameMs, 0.5), p95: percentile(sample.frameMs, 0.95), p99: percentile(sample.frameMs, 0.99), max: Math.max(...sample.frameMs) },
    renderMs: { p50: percentile(sample.renderMs, 0.5), p95: percentile(sample.renderMs, 0.95), p99: percentile(sample.renderMs, 0.99), max: Math.max(...sample.renderMs) },
    resources: {
      displayObjects: { min: Math.min(...stable.map(x => x.displayObjects)), max: Math.max(...stable.map(x => x.displayObjects)) },
      textures: { min: Math.min(...stable.map(x => x.textures)), max: Math.max(...stable.map(x => x.textures)) },
      cacheBytes: { min: Math.min(...stable.map(x => x.cacheBytes)), max: Math.max(...stable.map(x => x.cacheBytes)) },
      final: stable.at(-1),
    },
  });
}

const report = { measuredAt: new Date().toISOString(), viewport: { width: 1280, height: 800 }, startupRetries, errors, scenarios };
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (errors.length || scenarios.some(item => item.resources.final.tickerStarted || item.resources.final.cacheSize > 64 || item.resources.final.cacheBytes > 32 * 1024 * 1024 || item.resources.displayObjects.max - item.resources.displayObjects.min > 64 || item.frameMs.p95 > 18.7)) process.exitCode = 1;
await browser.close();
