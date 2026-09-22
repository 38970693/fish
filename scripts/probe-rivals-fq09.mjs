/**
 * FQ-09 自然开局 / 三队争夺性能探针。
 * 前置：npm run dev。输出 scripts/perf-rivals-fq09.json。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'scripts', 'perf-rivals-fq09.json');
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
});

await page.goto('http://localhost:3000/?mode=rivals', { waitUntil: 'load', timeout: 60_000 });
await page.getByRole('button', { name: /开始游戏/ }).click();
await page.waitForFunction(() => window.__FISH_DEBUG__?.state().status === 'PLAYING');
await page.evaluate(() => {
  const state = window.__FISH_DEBUG__.state();
  state.player.isGodMode = true;
  state.player.invulnerableTimer = 999999;
  state.player.evolutionPoints = -1e9;
});

// 自然生成推进 35 秒；平静场景再采 5 秒，仍早于 45 秒的首次预告。
await page.evaluate(() => window.__FISH_DEBUG__.profile(2100));
await page.evaluate(() => {
  const state = window.__FISH_DEBUG__.state();
  state.status = 'PLAYING';
  state.player.x = 3000;
  state.player.y = 3000;
  state.player.speed = 0;
  state.player.vx = 0;
  state.player.vy = 0;
  state.camera.x = 3000;
  state.camera.y = 3000;
});

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

const sample = async (name) => {
  const logic = await page.evaluate(() => window.__FISH_DEBUG__.profile(300));
  const frameTimes = await page.evaluate(async () => {
    const samples = [];
    let last = await new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 180; i += 1) {
      const now = await new Promise((resolve) => requestAnimationFrame(resolve));
      samples.push(now - last);
      last = now;
    }
    return samples;
  });
  const workload = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__.state();
    const counts = window.__FISH_DEBUG__.counts();
    return {
      ...counts,
      rivals: state.entities.filter((entity) => entity.ownerId?.startsWith('rival-')).length,
      feedingPhase: state.feedingEvent?.phase,
      drops: state.feedingEvent?.drops.length ?? 0,
    };
  });
  return {
    name,
    workload,
    logicMsPerFrame: logic.msPerFrame,
    topLogicSystems: logic.systems.slice(0, 5),
    frameMs: {
      p50: percentile(frameTimes, 0.5),
      p95: percentile(frameTimes, 0.95),
      p99: percentile(frameTimes, 0.99),
      max: Math.max(...frameTimes),
    },
  };
};

const calm = await sample('natural-calm');
await page.evaluate(() => {
  const state = window.__FISH_DEBUG__.state();
  state.status = 'PLAYING';
  Object.assign(state.feedingEvent, {
    id: 'perf-contest',
    phase: 'WARNING',
    timer: 480,
    x: state.player.x + 650,
    y: state.player.y,
    drops: [],
    totalSpawned: 0,
  });
  window.__FISH_DEBUG__.profile(2);
});
await page.evaluate(() => {
  const event = window.__FISH_DEBUG__.state().feedingEvent;
  event.phase = 'DROPPING';
  event.timer = 1500;
  event.nextDropIn = 1;
  window.__FISH_DEBUG__.profile(2);
});
const contest = await sample('three-team-contest');

const result = {
  measuredAt: new Date().toISOString(),
  viewport: { width: 1280, height: 800 },
  targetFrameMs: 16.7,
  errors,
  scenarios: [calm, contest],
};
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.table(result.scenarios.map((item) => ({
  scenario: item.name,
  entities: item.workload.entities,
  activeAI: item.workload.activeAI,
  rivals: item.workload.rivals,
  phase: item.workload.feedingPhase,
  logicMs: item.logicMsPerFrame.toFixed(3),
  frameP95: item.frameMs.p95.toFixed(2),
})));
if (errors.length > 0) console.error(errors);
await browser.close();
if (errors.length > 0) process.exitCode = 1;
