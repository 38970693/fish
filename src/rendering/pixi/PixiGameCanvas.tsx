import React, { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../types';
import { createViewport } from '../types';
import { PixiGameRenderer } from './PixiGameRenderer';

interface PixiGameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: (event: { button: number }) => void;
  onMouseUp: (event: { button: number }) => void;
}

export interface PixiDebugMetrics {
  renderer: string;
  tickerStarted: boolean;
  width: number;
  height: number;
  renderCount: number;
  lastRenderMs: number;
  textures: number;
  contextLostCount: number;
  contextRestoredCount: number;
  renderErrorCount: number;
  layerCount: number;
  visibleStaticObjects: number;
  obstacleStaticBuilds: number;
  obstacleStaticCacheHits: number;
  obstacleAnimatedBuilds: number;
  displayObjects: number;
  creatureObjects: number;
  visibleCreatures: number;
  standardFish: number;
  creaturePoolSize: number;
  creaturePoolCapacity: number;
  creatureDisplaysCreated: number;
  creatureDisplaysReused: number;
  creatureDisplaysEvicted: number;
  appearanceCacheSize: number;
  appearanceCacheCapacity: number;
  appearanceCacheHits: number;
  appearanceCacheMisses: number;
  appearanceCacheEvictions: number;
  visibleWorldItems: number;
  visibleCombatTelegraphs: number;
  visibleRivalMarkers: number;
  visibleParticles: number;
  visibleWorldLabels: number;
  visibleSpeechBubbles: number;
  visibleSquadMarkers: number;
  visibleHazards: number;
  riggedAppendageCreatures: number;
  segmentedBodyCreatures: number;
  lod0Creatures: number;
  lod1Creatures: number;
  lod2Creatures: number;
  lod2AnimatedUpdates: number;
  lodTextureCacheSize: number;
  lodTextureCacheBytes: number;
  lodTextureCacheCapacity: number;
  lodTextureCacheBudgetBytes: number;
  lodTextureCacheHits: number;
  lodTextureCacheMisses: number;
  lodTextureCacheEvictions: number;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  forceContextLoss: () => void;
}

declare global {
  interface Window {
    __PIXI_PROBE__?: PixiDebugMetrics;
  }
}

const PixiGameCanvas: React.FC<PixiGameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let animationFrameId = 0;
    let canvas: HTMLCanvasElement | null = null;
    const renderer = new PixiGameRenderer();
    const debug: PixiDebugMetrics = {
      renderer: 'initializing', tickerStarted: false, width: 0, height: 0, renderCount: 0, lastRenderMs: 0, textures: 0,
      contextLostCount: 0, contextRestoredCount: 0, renderErrorCount: 0, layerCount: 0, visibleStaticObjects: 0,
      obstacleStaticBuilds: 0, obstacleStaticCacheHits: 0, obstacleAnimatedBuilds: 0,
      displayObjects: 0, cameraX: 0, cameraY: 0, cameraZoom: 1,
      creatureObjects: 0, visibleCreatures: 0, standardFish: 0,
      creaturePoolSize: 0, creaturePoolCapacity: 0,
      creatureDisplaysCreated: 0, creatureDisplaysReused: 0, creatureDisplaysEvicted: 0,
      appearanceCacheSize: 0, appearanceCacheCapacity: 0,
      appearanceCacheHits: 0, appearanceCacheMisses: 0, appearanceCacheEvictions: 0,
      visibleWorldItems: 0, visibleCombatTelegraphs: 0, visibleRivalMarkers: 0,
      visibleParticles: 0, visibleWorldLabels: 0, visibleSpeechBubbles: 0,
      visibleSquadMarkers: 0, visibleHazards: 0,
      riggedAppendageCreatures: 0, segmentedBodyCreatures: 0,
      lod0Creatures: 0, lod1Creatures: 0, lod2Creatures: 0, lod2AnimatedUpdates: 0,
      lodTextureCacheSize: 0, lodTextureCacheBytes: 0,
      lodTextureCacheCapacity: 0, lodTextureCacheBudgetBytes: 0,
      lodTextureCacheHits: 0, lodTextureCacheMisses: 0, lodTextureCacheEvictions: 0,
      forceContextLoss: () => renderer.forceContextLoss(),
    };

    const syncDebug = () => {
      const metrics = renderer.metrics();
      debug.renderer = metrics.rendererName;
      debug.tickerStarted = metrics.tickerStarted;
      debug.renderCount = metrics.renderCount;
      debug.lastRenderMs = metrics.lastRenderMs;
      debug.textures = metrics.textures;
      debug.layerCount = metrics.layerCount;
      debug.visibleStaticObjects = metrics.visibleStaticObjects;
      debug.obstacleStaticBuilds = metrics.obstacleStaticBuilds;
      debug.obstacleStaticCacheHits = metrics.obstacleStaticCacheHits;
      debug.obstacleAnimatedBuilds = metrics.obstacleAnimatedBuilds;
      debug.displayObjects = metrics.displayObjects;
      debug.creatureObjects = metrics.creatureObjects;
      debug.visibleCreatures = metrics.visibleCreatures;
      debug.standardFish = metrics.standardFish;
      debug.creaturePoolSize = metrics.creaturePoolSize;
      debug.creaturePoolCapacity = metrics.creaturePoolCapacity;
      debug.creatureDisplaysCreated = metrics.creatureDisplaysCreated;
      debug.creatureDisplaysReused = metrics.creatureDisplaysReused;
      debug.creatureDisplaysEvicted = metrics.creatureDisplaysEvicted;
      debug.appearanceCacheSize = metrics.appearanceCacheSize;
      debug.appearanceCacheCapacity = metrics.appearanceCacheCapacity;
      debug.appearanceCacheHits = metrics.appearanceCacheHits;
      debug.appearanceCacheMisses = metrics.appearanceCacheMisses;
      debug.appearanceCacheEvictions = metrics.appearanceCacheEvictions;
      debug.visibleWorldItems = metrics.visibleWorldItems;
      debug.visibleCombatTelegraphs = metrics.visibleCombatTelegraphs;
      debug.visibleRivalMarkers = metrics.visibleRivalMarkers;
      debug.visibleParticles = metrics.visibleParticles;
      debug.visibleWorldLabels = metrics.visibleWorldLabels;
      debug.visibleSpeechBubbles = metrics.visibleSpeechBubbles;
      debug.visibleSquadMarkers = metrics.visibleSquadMarkers;
      debug.visibleHazards = metrics.visibleHazards;
      debug.riggedAppendageCreatures = metrics.riggedAppendageCreatures;
      debug.segmentedBodyCreatures = metrics.segmentedBodyCreatures;
      debug.lod0Creatures = metrics.lod0Creatures;
      debug.lod1Creatures = metrics.lod1Creatures;
      debug.lod2Creatures = metrics.lod2Creatures;
      debug.lod2AnimatedUpdates = metrics.lod2AnimatedUpdates;
      debug.lodTextureCacheSize = metrics.lodTextureCacheSize;
      debug.lodTextureCacheBytes = metrics.lodTextureCacheBytes;
      debug.lodTextureCacheCapacity = metrics.lodTextureCacheCapacity;
      debug.lodTextureCacheBudgetBytes = metrics.lodTextureCacheBudgetBytes;
      debug.lodTextureCacheHits = metrics.lodTextureCacheHits;
      debug.lodTextureCacheMisses = metrics.lodTextureCacheMisses;
      debug.lodTextureCacheEvictions = metrics.lodTextureCacheEvictions;
      debug.cameraX = metrics.cameraX;
      debug.cameraY = metrics.cameraY;
      debug.cameraZoom = metrics.cameraZoom;
    };
    const render = (now: number) => {
      if (disposed) return;
      try {
        renderer.render(stateRef.current, now);
        syncDebug();
      } catch {
        // Pixi v8/WebGL 偶发在首批指令构建时拿到已释放 batcher；跳过单帧即可重建。
        debug.renderErrorCount += 1;
      } finally {
        animationFrameId = requestAnimationFrame(render);
      }
    };
    const resize = () => {
      const viewport = createViewport(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
      renderer.resize(viewport);
      debug.width = viewport.width;
      debug.height = viewport.height;
    };
    const onContextLost = () => { debug.contextLostCount += 1; };
    const onContextRestored = () => { debug.contextRestoredCount += 1; };

    const init = async () => {
      try {
        const viewport = createViewport(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
        await renderer.init(host, viewport);
        if (disposed) {
          renderer.destroy();
          return;
        }
        canvas = renderer.canvas();
        canvas?.addEventListener('webglcontextlost', onContextLost);
        canvas?.addEventListener('webglcontextrestored', onContextRestored);
        debug.width = viewport.width;
        debug.height = viewport.height;
        window.__PIXI_PROBE__ = debug;
        window.addEventListener('resize', resize);
        render(performance.now());
      } catch (reason) {
        renderer.destroy();
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      canvas?.removeEventListener('webglcontextrestored', onContextRestored);
      if (window.__PIXI_PROBE__ === debug) delete window.__PIXI_PROBE__;
      renderer.destroy();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      data-testid="pixi-game-host"
      onMouseMove={(event) => onMouseMove(event.clientX, event.clientY)}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {error && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-red-950/90 px-4 py-3 text-red-100">
          PixiJS 初始化失败：{error}
        </div>
      )}
    </div>
  );
};

export default PixiGameCanvas;
