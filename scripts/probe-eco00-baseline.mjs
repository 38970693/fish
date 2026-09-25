/** ECO-00：同种子、同组成的分散 / 密集近景 / 超广角压力场景。 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const durationMs = Number(process.env.ECO00_DURATION_MS ?? 60_000);
const output = process.env.ECO00_OUTPUT ?? 'scripts/perf-eco00-fixed.json';
const capture = process.env.ECO00_CAPTURE === '1';
const captureTag = process.env.ECO00_CAPTURE_TAG;
const onlyScene = process.env.ECO00_ONLY;
const onlyRenderer = process.env.ECO00_RENDERER;
const naturalRun = process.env.ECO00_NATURAL_RUN === '1';
const cpuProfile = process.env.ECO00_CPU_PROFILE === '1';
const chromeTrace = process.env.ECO00_TRACE === '1';
const captureFramePairs = process.env.ECO00_FRAME_PAIRS === '1';
const traceFrames = chromeTrace && process.env.ECO00_TRACE_FRAMES === '1';
const viewport = { width: 1280, height: 800 };
const seed = 20260923;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

const prepareScene = (scene) => {
  const debug = window.__FISH_DEBUG__;
  const state = debug.state();
  let randomState = 20260923;
  Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 2 ** 32);
  state.player.isGodMode = true;
  state.player.invulnerableTimer = 1_000_000;
  state.player.speed = 0;
  state.player.vx = 0;
  state.player.vy = 0;
  const fixture = debug.pixiLodStressScene(scene === 'dense-contest');
  const cx = state.player.x;
  const cy = state.player.y;
  state.obstacles = Array.from({ length: 36 }, (_, index) => {
    const angle = index * Math.PI * 2 / 36;
    const radius = 1150 + (index % 3) * 180;
    return { id: `eco00-obstacle-${index}`, x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius, radius: 75, type: index % 2 ? 'ROCK' : 'CORAL',
      ecologyInitialized: true };
  });
  state.buildings = [];
  state.portals = [];
  state.fountains = [];
  state.treasures = [];
  state.powerUps = [];
  state.hazards = [];
  state.particles = [];
  state.labels = [];
  if (scene !== 'dense-contest') {
    state.feedingEvent = { id: 'eco00-wait', phase: 'WAITING', timer: 1_000_000,
      x: null, y: null, lastX: null, lastY: null, nextDropIn: 1_000_000,
      totalSpawned: 0, claims: {}, drops: [] };
  }
  if (scene === 'dense-contest') {
    state.camera.zoom = 0.65;
    state.entities.forEach((entity, index) => {
      const angle = index * 2.399963229728653;
      const radius = 90 + Math.sqrt(index / 299) * 760;
      entity.x = cx + Math.cos(angle) * radius;
      entity.y = cy + Math.sin(angle) * radius;
    });
  } else {
    state.camera.zoom = scene === 'ultrawide' ? 0.22 : 1;
    state.entities.forEach((entity, index) => {
      const angle = index * 2.399963229728653;
      const radius = 260 + Math.sqrt(index / 299) * 1350;
      entity.x = cx + Math.cos(angle) * radius;
      entity.y = cy + Math.sin(angle) * radius;
    });
  }
  const fingerprintInput = JSON.stringify({ entities: state.entities.map(entity =>
    [entity.type, entity.x, entity.y, entity.cosmetics]), obstacles: state.obstacles,
    event: state.feedingEvent.phase, zoom: state.camera.zoom });
  let fingerprint = 2166136261;
  for (const char of fingerprintInput) fingerprint = Math.imul(fingerprint ^ char.charCodeAt(0), 16777619);
  return { injected: true, ...fixture, zoom: state.camera.zoom,
    obstacleCount: state.obstacles.length, fingerprint: (fingerprint >>> 0).toString(16) };
};

const prepareNaturalRun = () => {
  const state = window.__FISH_DEBUG__.state();
  state.player.isGodMode = true;
  state.player.invulnerableTimer = 1_000_000;
  state.player.evolutionPoints = -1e9;
  state.player.speed = 0;
  state.player.vx = 0;
  state.player.vy = 0;
  return { injected: false, unattendedPlayer: true, mode: state.run?.mode ?? null };
};

const sampleFrames = ({ duration, capturePairs, markTraceFrames }) => new Promise(resolve => {
  const intervals = [];
  const renders = [];
  const loopTimes = [];
  const loopSteps = [];
  let lastLoopSequence = -1;
  const buckets = [];
  const snapshots = [];
  const framePairs = [];
  const started = performance.now();
  let previous = started;
  const tick = now => {
    if (markTraceFrames) performance.mark(`eco00-frame-${intervals.length}`);
    const delta = now - previous;
    intervals.push(delta);
    previous = now;
    const bucketIndex = Math.floor((now - started) / 10_000);
    (buckets[bucketIndex] ??= []).push(delta);
    if (!snapshots[bucketIndex]) snapshots[bucketIndex] = {
      ...window.__FISH_DEBUG__.counts(),
      run: window.__FISH_DEBUG__.run(),
      feedingPhase: window.__FISH_DEBUG__.state().feedingEvent?.phase ?? null,
    };
    const metrics = window.__PIXI_PROBE__ ?? window.__FISH_RENDER_METRICS__?.();
    if (metrics?.lastRenderMs !== undefined) renders.push(metrics.lastRenderMs);
    const loop = window.__FISH_LOOP_METRICS__;
    if (capturePairs) framePairs.push({ delta, renderMs: metrics?.lastRenderMs ?? null,
      renderCount: metrics?.renderCount ?? null, loopMs: loop?.ms ?? null,
      loopSteps: loop?.steps ?? null, loopSequence: loop?.sequence ?? null });
    if (loop && loop.sequence !== lastLoopSequence) {
      loopTimes.push(loop.ms);
      loopSteps.push(loop.steps);
      lastLoopSequence = loop.sequence;
    }
    if (now - started >= duration) resolve({ intervals, renders, loopTimes, loopSteps, buckets, snapshots, framePairs });
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const openGame = async (browser, baseUrl, renderer, errors) => {
  const page = await browser.newPage({ viewport });
  try {
    await page.addInitScript(value => {
      let state = value >>> 0;
      Math.random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
    }, seed);
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await page.goto(`${baseUrl}/?renderer=${renderer}&mode=rivals`, { timeout: 60_000 });
    await page.getByRole('button', { name: /驶入/ }).click();
    await page.waitForFunction(kind => kind === 'pixi'
      ? (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8
      : (window.__FISH_RENDER_METRICS__?.().renderCount ?? 0) >= 8, renderer);
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
};

// 每次探针启动独立 Vite 实例，避免长驻开发服务器的模块缓存或文件监听失效造成假阴性。
const probeServer = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
await probeServer.listen();
const serverAddress = probeServer.httpServer?.address();
if (!serverAddress || typeof serverAddress === 'string') throw new Error('ECO-00 probe server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${serverAddress.port}`;
let browser;
const scenarios = [];
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const renderer of onlyRenderer ? [onlyRenderer] : ['canvas', 'pixi']) {
    for (const name of naturalRun ? ['natural-unattended'] : onlyScene ? [onlyScene] : ['natural-fixed', 'dense-contest', 'ultrawide']) {
      const errors = [];
      let page;
      let startupRetries = 0;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { page = await openGame(browser, baseUrl, renderer, errors); break; }
        catch (error) {
          startupRetries += 1;
          if (attempt === 2) throw error;
        }
      }
      try {
        const fixture = naturalRun
          ? await page.evaluate(prepareNaturalRun)
          : await page.evaluate(prepareScene, name);
        await page.waitForTimeout(1_500);
        if (capture) await page.screenshot({ path: `scripts/eco00-${renderer}-${name}${captureTag ? `-${captureTag}` : ''}.png` });
        const rendererStart = renderer === 'pixi' ? await page.evaluate(() => ({
          lod0: window.__PIXI_PROBE__?.lod0Creatures,
          lod1: window.__PIXI_PROBE__?.lod1Creatures,
          lod2: window.__PIXI_PROBE__?.lod2Creatures,
          renderCount: window.__PIXI_PROBE__?.renderCount,
          renderErrors: window.__PIXI_PROBE__?.renderErrorCount,
          displayObjects: window.__PIXI_PROBE__?.displayObjects,
          creaturePoolSize: window.__PIXI_PROBE__?.creaturePoolSize,
          lodTextureCacheBytes: window.__PIXI_PROBE__?.lodTextureCacheBytes,
          obstacleStaticBuilds: window.__PIXI_PROBE__?.obstacleStaticBuilds,
          obstacleStaticCacheHits: window.__PIXI_PROBE__?.obstacleStaticCacheHits,
          obstacleAnimatedBuilds: window.__PIXI_PROBE__?.obstacleAnimatedBuilds,
          visible: window.__PIXI_PROBE__?.visibleCreatures,
          standardFish: window.__PIXI_PROBE__?.standardFish,
          riggedAppendages: window.__PIXI_PROBE__?.riggedAppendageCreatures,
          segmentedBodies: window.__PIXI_PROBE__?.segmentedBodyCreatures,
          cacheHits: window.__PIXI_PROBE__?.appearanceCacheHits,
          cacheMisses: window.__PIXI_PROBE__?.appearanceCacheMisses,
          lod2AnimatedUpdates: window.__PIXI_PROBE__?.lod2AnimatedUpdates,
        })) : null;
        const start = await page.evaluate(() => window.__FISH_DEBUG__.counts());
        const cdp = cpuProfile ? await page.context().newCDPSession(page) : null;
        const traceSession = chromeTrace ? await page.context().newCDPSession(page) : null;
        const traceEvents = [];
        let traceComplete;
        if (traceSession) {
          traceSession.on('Tracing.dataCollected', ({ value }) => {
            for (const event of value) traceEvents.push(event);
          });
          traceComplete = new Promise(resolve => traceSession.once('Tracing.tracingComplete', resolve));
          await traceSession.send('Tracing.start', {
            categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,blink.user_timing,cc,v8,gpu,toplevel',
            options: 'record-as-much-as-possible', transferMode: 'ReportEvents',
          });
        }
        if (cdp) {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        const frames = await page.evaluate(sampleFrames, { duration: durationMs,
          capturePairs: captureFramePairs, markTraceFrames: traceFrames });
        if (traceSession) {
          await traceSession.send('Tracing.end');
          await traceComplete;
          const threads = traceEvents.filter(event => event.ph === 'M' && event.name === 'thread_name')
            .map(event => ({ pid: event.pid, tid: event.tid, name: event.args?.name }));
          const totals = new Map();
          for (const event of traceEvents) {
            if (event.ph !== 'X' || !Number.isFinite(event.dur)) continue;
            const entry = totals.get(event.name) ?? { count: 0, totalMs: 0, maxMs: 0 };
            entry.count += 1;
            entry.totalMs += event.dur / 1000;
            entry.maxMs = Math.max(entry.maxMs, event.dur / 1000);
            totals.set(event.name, entry);
          }
          const longest = traceEvents.filter(event => event.ph === 'X' && event.dur >= 20_000)
            .sort((a, b) => b.dur - a.dur).slice(0, 100)
            .map(event => ({ name: event.name, category: event.cat, pid: event.pid, tid: event.tid,
              startUs: event.ts, durationMs: event.dur / 1000 }));
          await writeFile(`scripts/eco00-trace-${renderer}-${name}.json`, JSON.stringify({
            eventCount: traceEvents.length, threads, longest,
            ...(traceFrames ? { frameEvents: traceEvents.filter(event =>
              event.name?.startsWith('eco00-frame-')
              || ['RasterDecoderImpl::DoEndRasterCHROMIUM', 'ProxyMain::BeginMainFrame',
                'FireAnimationFrame', 'Commit'].includes(event.name))
              .map(event => ({ name: event.name, category: event.cat, phase: event.ph,
                pid: event.pid, tid: event.tid, startUs: event.ts,
                ...(Number.isFinite(event.dur) ? { durationMs: event.dur / 1000 } : {}) })) } : {}),
            topEvents: [...totals].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 60)
              .map(([name, values]) => ({ name, ...values })),
          }, null, 2));
          await traceSession.detach();
        }
        if (cdp) {
          const { profile } = await cdp.send('Profiler.stop');
          await writeFile(`scripts/eco00-cpu-${renderer}-${name}.json`, JSON.stringify(profile));
          await cdp.detach();
        }
        const end = await page.evaluate(() => window.__FISH_DEBUG__.counts());
        const rendererEnd = renderer === 'pixi' ? await page.evaluate(() => ({
          lod0: window.__PIXI_PROBE__?.lod0Creatures,
          lod1: window.__PIXI_PROBE__?.lod1Creatures,
          lod2: window.__PIXI_PROBE__?.lod2Creatures,
          renderCount: window.__PIXI_PROBE__?.renderCount,
          renderErrors: window.__PIXI_PROBE__?.renderErrorCount,
          displayObjects: window.__PIXI_PROBE__?.displayObjects,
          creaturePoolSize: window.__PIXI_PROBE__?.creaturePoolSize,
          lodTextureCacheBytes: window.__PIXI_PROBE__?.lodTextureCacheBytes,
          obstacleStaticBuilds: window.__PIXI_PROBE__?.obstacleStaticBuilds,
          obstacleStaticCacheHits: window.__PIXI_PROBE__?.obstacleStaticCacheHits,
          obstacleAnimatedBuilds: window.__PIXI_PROBE__?.obstacleAnimatedBuilds,
          visible: window.__PIXI_PROBE__?.visibleCreatures,
          standardFish: window.__PIXI_PROBE__?.standardFish,
          riggedAppendages: window.__PIXI_PROBE__?.riggedAppendageCreatures,
          segmentedBodies: window.__PIXI_PROBE__?.segmentedBodyCreatures,
          cacheHits: window.__PIXI_PROBE__?.appearanceCacheHits,
          cacheMisses: window.__PIXI_PROBE__?.appearanceCacheMisses,
          lod2AnimatedUpdates: window.__PIXI_PROBE__?.lod2AnimatedUpdates,
        })) : null;
        const logic = await page.evaluate(() => window.__FISH_DEBUG__.profile(120));
        scenarios.push({ renderer, name, fixture, rendererStart, rendererEnd, startupRetries, errors, start, end,
          durationMs, frameCount: frames.intervals.length,
          frameMs: { p50: percentile(frames.intervals, .5), p95: percentile(frames.intervals, .95), p99: percentile(frames.intervals, .99) },
          renderMs: { p50: percentile(frames.renders, .5), p95: percentile(frames.renders, .95) },
          loopMs: { p50: percentile(frames.loopTimes, .5), p95: percentile(frames.loopTimes, .95) },
          loopSteps: Object.fromEntries([...new Set(frames.loopSteps)].sort((a, b) => a - b)
            .map(steps => [steps, frames.loopSteps.filter(value => value === steps).length])),
          segments: frames.buckets.map((values, index) => ({ startSecond: index * 10,
            frameCount: values.length, p95: percentile(values, .95), workload: frames.snapshots[index] })),
          ...(captureFramePairs ? { framePairs: frames.framePairs } : {}),
          logicMsPerFrame: logic.msPerFrame,
          topLogicSystems: logic.systems.slice(0, 5),
        });
        console.log(`${renderer}/${name}: ${frames.intervals.length} frames, p95 ${scenarios.at(-1).frameMs.p95.toFixed(1)} ms`);
      } finally { await page?.close(); }
    }
  }
} finally { await browser?.close(); await probeServer.close(); }

const report = { measuredAt: new Date().toISOString(), seed, viewport, durationMs, naturalRun, scenarios };
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
const paired = (naturalRun ? ['natural-unattended'] : ['natural-fixed', 'dense-contest', 'ultrawide'].filter(name => !onlyScene || onlyScene === name)).every(name => {
  const pair = scenarios.filter(item => item.name === name);
  return naturalRun || onlyRenderer || (pair.length === 2 && pair[0].fixture.fingerprint === pair[1].fixture.fingerprint);
});
const expectedCount = (naturalRun || onlyScene ? 1 : 3) * (onlyRenderer ? 1 : 2);
if (!paired || scenarios.length !== expectedCount || scenarios.some(item => item.errors.length || item.frameCount < 1
  || (naturalRun && (item.fixture.mode !== 'RIVALS' || item.end.status !== 'PLAYING'
    || item.segments.some(segment => segment.workload.status !== 'PLAYING')))
  || (item.renderer === 'pixi' && ((item.rendererEnd?.renderErrors ?? 0) > (item.rendererStart?.renderErrors ?? 0)
    || (item.rendererEnd?.renderCount ?? 0) <= (item.rendererStart?.renderCount ?? 0))))) process.exitCode = 1;
