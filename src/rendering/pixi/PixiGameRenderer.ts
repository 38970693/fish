import { Application, Container, FillGradient, Graphics, Text, type Texture, type WebGLRenderer } from 'pixi.js';
import { BUILDING_CONFIGS, COMBAT_CONFIG, FEEDING_EVENT_CONFIG, MAP_SHAPE_CONFIG, TREASURE_COLORS, getPond } from '../../constants';
import { getMapBoundaryRadius } from '../../gameEngine';
import type { Building, Entity, GameState, Obstacle, Portal, PowerUp, Treasure } from '../../types';
import type { WaterCurrentZone } from '../../data/habitats';
import { CameraAdapter } from '../camera';
import type { GameRenderer, RenderMetrics, Viewport } from '../types';
import { CreatureDisplay, type LodTextureAsset } from './CreatureDisplay';
import { getMood } from '../../data/moods';
import {
  APPEARANCE_CACHE_CAPACITY,
  AppearanceLru,
  CREATURE_DISPOSE_DELAY_FRAMES,
  CREATURE_POOL_CAPACITY,
  CREATURE_REUSE_COOLDOWN_FRAMES,
} from './CreatureResourceBudget';
import {
  LOD_TEXTURE_BUDGET_BYTES,
  LOD_TEXTURE_CAPACITY,
  pickTextureEvictions,
  selectCreatureLod,
  lod2TextureSignature,
} from './CreatureLod';
import { drawObstaclePixi } from './ObstaclePixiRenderer';
import { OBSTACLE_ECOLOGY } from '../../data/obstacleEcology';
import { getOceanScenery } from '../../data/pondScenery';
import { drawCutePondScenery } from '../obstacles/cuteOceanDecor';
import { CosmeticGraphicsContext } from './CosmeticGraphicsContext';
import { drawBoostTrailPixi, isBoostTrail } from '../boostTrail';

export const PIXI_LAYER_NAMES = [
  'background', 'terrain', 'underEffects', 'creatures', 'worldItems', 'overEffects', 'worldLabels',
] as const;
export type PixiLayerName = typeof PIXI_LAYER_NAMES[number];

export interface PixiWorldMetrics extends RenderMetrics {
  rendererName: string;
  tickerStarted: boolean;
  layerCount: number;
  visibleStaticObjects: number;
  obstacleStaticBuilds: number;
  obstacleStaticCacheHits: number;
  obstacleAnimatedBuilds: number;
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
}

const BUILDING_GLYPHS: Record<string, string> = {
  HOSPITAL: '医', ARMORY: '军', SHRINE: '庙', SHOP: '商',
  WISHING_WELL: '愿', PEARL_FARM: '珠', SHIPWRECK: '船', WARM_SHELTER: '暖',
};
const WORLD_LABEL_CAPACITY = 128;

const obstacleIsAnimated = (obstacle: Obstacle): boolean => obstacle.featureState !== 'BROKEN'
  && (obstacle.type === 'SEAWEED'
    || (obstacle.feature === 'VENT' && (obstacle.featureState === 'WARNING' || obstacle.featureState === 'ACTIVE')));

const obstacleVisualKey = (obstacle: Obstacle): string =>
  `${obstacle.id}|${obstacle.type}|${obstacle.x}|${obstacle.y}|${obstacle.radius}|${obstacle.feature ?? ''}|${obstacle.featureState ?? ''}|${obstacle.reef ? JSON.stringify(obstacle.reef) : ''}`;

const portalColors = (portal: Portal): [string, string] => {
  if (portal.kind === 'POND') return [getPond(portal.targetPond).color, '#fcd34d'];
  if (portal.name?.includes('浅滩')) return ['#22d3ee', '#67e8f9'];
  if (portal.name?.includes('珊瑚')) return ['#f0abfc', '#fda4af'];
  if (portal.name?.includes('沼泽')) return ['#86efac', '#4ade80'];
  if (portal.name?.includes('深渊')) return ['#a855f7', '#c084fc'];
  return ['#d8b4fe', '#22d3ee'];
};

export class PixiGameRenderer implements GameRenderer {
  readonly kind = 'pixi' as const;
  private app: Application | null = null;
  private worldRoot = new Container();
  private layers = new Map<PixiLayerName, Container>();
  private screenBackground = new Graphics();
  private screenGradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#071c3d' },
      { offset: 0.55, color: '#0c2f63' },
      { offset: 1, color: '#155da5' },
    ],
    textureSpace: 'local',
  });
  private worldBackground = new Graphics();
  private sceneryLayer = new Container();
  private sceneryDisplays = new Map<string, { graphics: Graphics; visualKey: string }>();
  private backgroundPondId: string | null = null;
  private currentGraphics = new Graphics();
  private obstacleLayer = new Container();
  private obstacleDisplays = new Map<string, { graphics: Graphics; visualKey: string }>();
  private obstacleOrderKey = '';
  private terrainGraphics = new Graphics();
  private underEffectsGraphics = new Graphics();
  private worldItemsGraphics = new Graphics();
  private overEffectsGraphics = new Graphics();
  private screenFlashGraphics = new Graphics();
  private creatures = new Map<string, CreatureDisplay>();
  private creaturePool: Array<{ display: CreatureDisplay; availableAfter: number }> = [];
  private pendingCreatureDisposals: Array<{ display: CreatureDisplay; destroyAfter: number }> = [];
  private appearanceCache = new AppearanceLru();
  private lodTextureCache = new Map<string, { asset: LodTextureAsset; lastUsed: number }>();
  private labels = new Map<string, Text>();
  private viewport: Viewport = { width: 1, height: 1, resolution: 1 };
  private camera = new CameraAdapter({ x: 0, y: 0, zoom: 1 }, this.viewport);
  private currentMetrics: PixiWorldMetrics = {
    renderer: 'pixi', renderCount: 0, lastRenderMs: 0, displayObjects: 0, textures: 0,
    rendererName: 'initializing', tickerStarted: false, layerCount: 0, visibleStaticObjects: 0,
    obstacleStaticBuilds: 0, obstacleStaticCacheHits: 0, obstacleAnimatedBuilds: 0,
    creatureObjects: 0, visibleCreatures: 0, standardFish: 0,
    creaturePoolSize: 0, creaturePoolCapacity: CREATURE_POOL_CAPACITY,
    creatureDisplaysCreated: 0, creatureDisplaysReused: 0, creatureDisplaysEvicted: 0,
    appearanceCacheSize: 0, appearanceCacheCapacity: APPEARANCE_CACHE_CAPACITY,
    appearanceCacheHits: 0, appearanceCacheMisses: 0, appearanceCacheEvictions: 0,
    visibleWorldItems: 0, visibleCombatTelegraphs: 0, visibleRivalMarkers: 0,
    visibleParticles: 0, visibleWorldLabels: 0, visibleSpeechBubbles: 0,
    visibleSquadMarkers: 0, visibleHazards: 0,
    riggedAppendageCreatures: 0, segmentedBodyCreatures: 0,
    lod0Creatures: 0, lod1Creatures: 0, lod2Creatures: 0, lod2AnimatedUpdates: 0,
    lodTextureCacheSize: 0, lodTextureCacheBytes: 0,
    lodTextureCacheCapacity: LOD_TEXTURE_CAPACITY, lodTextureCacheBudgetBytes: LOD_TEXTURE_BUDGET_BYTES,
    lodTextureCacheHits: 0, lodTextureCacheMisses: 0, lodTextureCacheEvictions: 0,
    cameraX: 0, cameraY: 0, cameraZoom: 1,
  };

  async init(host: HTMLElement, viewport: Viewport): Promise<void> {
    if (this.app) return;
    this.viewport = viewport;
    const app = new Application();
    await app.init({
      width: viewport.width,
      height: viewport.height,
      resolution: viewport.resolution,
      autoDensity: true,
      antialias: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
      backgroundColor: 0x071c3d,
      autoStart: false,
      sharedTicker: false,
    });
    app.stop();
    this.app = app;
    app.canvas.dataset.renderer = 'pixi';
    app.canvas.style.display = 'block';
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    host.appendChild(app.canvas);

    app.stage.addChild(this.screenBackground, this.worldRoot, this.screenFlashGraphics);
    for (const name of PIXI_LAYER_NAMES) {
      const layer = new Container({ label: name });
      this.layers.set(name, layer);
      this.worldRoot.addChild(layer);
    }
    this.layers.get('background')?.addChild(this.worldBackground, this.sceneryLayer);
    this.layers.get('terrain')?.addChild(this.currentGraphics, this.obstacleLayer, this.terrainGraphics);
    this.layers.get('underEffects')?.addChild(this.underEffectsGraphics);
    this.layers.get('worldItems')?.addChild(this.worldItemsGraphics);
    this.layers.get('overEffects')?.addChild(this.overEffectsGraphics);
    this.currentMetrics.rendererName = app.renderer.constructor.name;
    this.currentMetrics.layerCount = this.layers.size;
    this.resize(viewport);
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    this.app?.renderer.resize(viewport.width, viewport.height, viewport.resolution);
    this.screenBackground
      .clear()
      .rect(0, 0, viewport.width, viewport.height)
      .fill(this.screenGradient);
  }

  render(state: Readonly<GameState>, now: number): RenderMetrics {
    const app = this.app;
    if (!app) throw new Error('PixiGameRenderer.render() called before init()');
    const startedAt = performance.now();
    const backgroundKey = state.worldMode === 'ENDLESS'
      ? `endless:${state.endlessWorld?.seed ?? 0}`
      : state.pondLayout
      ? `${state.pondId}:${state.pondLayout.version}:${state.pondLayout.seed}`
      : state.pondId;
    if (this.backgroundPondId !== backgroundKey) this.drawWorldBackground(state.pondId, state.pondLayout, state.worldMode, state.endlessWorld?.seed);
    this.camera.update(state.camera, this.viewport);
    const transform = this.camera.transform();
    this.worldRoot.pivot.set(transform.pivot.x, transform.pivot.y);
    this.worldRoot.position.set(transform.position.x, transform.position.y);
    this.worldRoot.scale.set(transform.scale);
    this.currentMetrics.cameraX = state.camera.x;
    this.currentMetrics.cameraY = state.camera.y;
    this.currentMetrics.cameraZoom = state.camera.zoom;
    const visibleStaticObjects = this.drawTerrain(state, now);
    this.syncCreatures(state, now);
    this.syncLabels(state);
    this.drawDynamicWorld(state, now);
    app.render();

    this.currentMetrics.renderCount += 1;
    this.disposeExpiredCreatureDisplays();
    this.currentMetrics.lastRenderMs = performance.now() - startedAt;
    this.currentMetrics.tickerStarted = app.ticker.started;
    this.currentMetrics.visibleStaticObjects = visibleStaticObjects;
    this.currentMetrics.displayObjects = this.countDisplayObjects(this.worldRoot);
    return this.currentMetrics;
  }

  metrics(): Readonly<PixiWorldMetrics> {
    return this.currentMetrics;
  }

  canvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }

  forceContextLoss(): void {
    const renderer = this.app?.renderer as WebGLRenderer | undefined;
    renderer?.context.forceContextLoss();
  }

  destroy(): void {
    this.screenGradient.destroy();
    for (const entry of this.lodTextureCache.values()) entry.asset.texture.destroy(true);
    this.lodTextureCache.clear();
    this.labels.clear();
    this.sceneryDisplays.clear();
    this.obstacleDisplays.clear();
    this.obstacleOrderKey = '';
    this.creatures.clear();
    this.creaturePool.length = 0;
    this.pendingCreatureDisposals.length = 0;
    this.appearanceCache.clear();
    this.layers.clear();
    this.app?.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: true, textureSource: true, context: true });
    this.app = null;
  }

  private isVisible(x: number, y: number, radius: number): boolean {
    const screen = this.camera.toScreen({ x, y });
    const padding = Math.max(radius, 50) * this.currentMetrics.cameraZoom + 100;
    return screen.x >= -padding && screen.x <= this.viewport.width + padding
      && screen.y >= -padding && screen.y <= this.viewport.height + padding;
  }

  private drawWorldBackground(
    pondId: string,
    layout?: GameState['pondLayout'],
    worldMode: GameState['worldMode'] = 'FINITE',
    endlessSeed = 0,
  ): void {
    this.backgroundPondId = worldMode === 'ENDLESS'
      ? `endless:${endlessSeed}`
      : layout ? `${pondId}:${layout.version}:${layout.seed}` : pondId;
    const pond = getPond(pondId);
    const g = this.worldBackground.clear();
    if (worldMode === 'ENDLESS') return;
    const steps = 128;
    const points: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const radius = getMapBoundaryRadius(angle, pondId);
      points.push(MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * radius,
        MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * radius);
    }
    g.poly(points).fill({ color: pond.waterColor, alpha: 0.58 });
    for (let layer = 0; layer < 4; layer += 1) {
      const ring: number[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const radius = getMapBoundaryRadius(angle, pondId) + layer * 55;
        const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * radius;
        const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * radius;
        ring.push(x, y);
      }
      g.poly(ring).stroke({ color: pond.shoreColor, width: Math.max(8, 32 - layer * 7), alpha: 0.28 - layer * 0.05 });
    }
    if (layout) {
      const routeColor = pondId === 'CLEAR' ? '#bae6fd' : pondId === 'CORAL' ? '#99f6e4' : '#c4b5fd';
      for (const route of layout.routes) {
        if (route.points.length < 2) continue;
        const points = route.points.flatMap(point => [point.x, point.y]);
        g.poly(points).stroke({ color: routeColor, width: 9, alpha: 0.14 });
      }
    }
    if (layout) {
      for (const landmark of layout.landmarks) {
        const color = landmark.kind === 'LILY' ? '#86efac'
          : landmark.kind === 'NURSERY' || landmark.kind === 'PEARL_BED' ? '#5eead4' : '#c4b5fd';
        g.circle(landmark.x, landmark.y, landmark.radius)
          .stroke({ color, width: 5, alpha: 0.75 });
      }
    }
  }

  private drawScenery(state: Readonly<GameState>, now: number): number {
    const marks = getOceanScenery(state);
    const markId = (mark: typeof marks[number]) => mark.id ?? `${mark.kind}:${mark.x}:${mark.y}:${mark.angle}`;
    const active = new Set(marks.map(markId));
    for (const entry of this.sceneryDisplays.values()) entry.graphics.visible = false;
    let visible = 0;
    for (const mark of marks) {
      if (!this.isVisible(mark.x, mark.y, mark.radius)) continue;
      if (visible >= 64) break;
      const id = markId(mark);
      let entry = this.sceneryDisplays.get(id);
      if (!entry) {
        entry = { graphics: new Graphics(), visualKey: '' };
        this.sceneryDisplays.set(id, entry); this.sceneryLayer.addChild(entry.graphics);
      }
      entry.graphics.visible = true;
      entry.graphics.position.set(mark.x, mark.y);
      const visualKey = `${mark.kind}:${mark.radius}:${mark.angle}`;
      if (visualKey !== entry.visualKey || mark.kind === 'BUBBLES') {
        drawCutePondScenery(new CosmeticGraphicsContext(entry.graphics.clear()).asCanvas(), { ...mark, x: 0, y: 0 }, now / 16);
        entry.visualKey = visualKey;
      }
      visible++;
    }
    // Retain nearby static drawings while panning; old streamed chunks cannot accumulate GPU nodes.
    for (const [id, entry] of this.sceneryDisplays) {
      if (active.has(id) && (entry.graphics.visible || this.sceneryDisplays.size <= 96)) continue;
      entry.graphics.destroy(); this.sceneryDisplays.delete(id);
    }
    return visible;
  }

  private drawTerrain(state: Readonly<GameState>, now: number): number {
    const currents = this.currentGraphics.clear();
    const g = this.terrainGraphics.clear();
    let visible = this.drawScenery(state, now);
    for (const zone of state.currents ?? []) {
      const radius = Math.hypot(zone.length, zone.width) / 2;
      if (!this.isVisible(zone.x, zone.y, radius)) continue;
      this.drawWaterCurrent(currents, zone, now);
      visible += 1;
    }
    const activeObstacleIds = new Set<string>();
    const orderedObstacleGraphics: Graphics[] = [];
    for (const obstacle of state.obstacles) {
      activeObstacleIds.add(obstacle.id);
      let entry = this.obstacleDisplays.get(obstacle.id);
      if (!entry) {
        entry = { graphics: new Graphics(), visualKey: '' };
        this.obstacleDisplays.set(obstacle.id, entry);
      }
      orderedObstacleGraphics.push(entry.graphics);
      const visualRadius = obstacle.feature === 'VENT' && obstacle.featureState !== 'IDLE'
        ? obstacle.radius + OBSTACLE_ECOLOGY.VENT_RANGE
        : obstacle.reef?.anchor ? obstacle.reef.halfLength + 220 : obstacle.radius;
      entry.graphics.visible = this.isVisible(obstacle.x, obstacle.y, visualRadius);
      if (!entry.graphics.visible) continue;
      const visualKey = obstacleVisualKey(obstacle);
      const animated = obstacleIsAnimated(obstacle);
      if (animated || entry.visualKey !== visualKey) {
        drawObstaclePixi(entry.graphics.clear(), obstacle, now / 16);
        entry.visualKey = visualKey;
        if (animated) this.currentMetrics.obstacleAnimatedBuilds += 1;
        else this.currentMetrics.obstacleStaticBuilds += 1;
      } else {
        this.currentMetrics.obstacleStaticCacheHits += 1;
      }
      visible += 1;
    }
    for (const [id, entry] of this.obstacleDisplays) {
      if (activeObstacleIds.has(id)) continue;
      entry.graphics.destroy();
      this.obstacleDisplays.delete(id);
    }
    const orderKey = state.obstacles.map(obstacle => obstacle.id).join('\0');
    if (orderKey !== this.obstacleOrderKey) {
      this.obstacleLayer.removeChildren();
      if (orderedObstacleGraphics.length > 0) this.obstacleLayer.addChild(...orderedObstacleGraphics);
      this.obstacleOrderKey = orderKey;
    }
    for (const building of state.buildings) {
      if (!this.isVisible(building.x, building.y, building.radius)) continue;
      this.drawBuilding(g, building, state.time);
      visible += 1;
    }
    for (const fountain of state.fountains) {
      if (!this.isVisible(fountain.x, fountain.y, fountain.radius)) continue;
      g.circle(fountain.x, fountain.y, fountain.radius).fill({ color: '#38bdf8', alpha: 0.28 }).stroke({ color: '#38bdf8', width: 2 });
      g.circle(fountain.x, fountain.y, 20).fill({ color: '#0ea5e9' });
      visible += 1;
    }
    for (const portal of state.portals) {
      if (!this.isVisible(portal.x, portal.y, portal.radius * 2.5)) continue;
      this.drawPortal(g, portal, now);
      visible += 1;
    }
    return visible;
  }

  private drawWaterCurrent(g: Graphics, zone: WaterCurrentZone, now: number): void {
    const cos = Math.cos(zone.angle);
    const sin = Math.sin(zone.angle);
    const point = (along: number, across: number) => ({
      x: zone.x + cos * along - sin * across,
      y: zone.y + sin * along + cos * across,
    });
    const halfLength = zone.length / 2;
    const halfWidth = zone.width / 2;
    const corners = [
      point(-halfLength, -halfWidth), point(halfLength, -halfWidth),
      point(halfLength, halfWidth), point(-halfLength, halfWidth),
    ];
    g.poly(corners.flatMap(p => [p.x, p.y])).fill({ color: zone.color, alpha: 0.08 })
      .stroke({ color: zone.color, width: 3, alpha: 0.42 });

    const spacing = 120;
    const travel = (now * 0.055 * zone.strength) % spacing;
    for (let along = -halfLength + travel; along < halfLength; along += spacing) {
      for (const across of [-zone.width * 0.22, zone.width * 0.22]) {
        const tip = point(along, across);
        const upper = point(along - 18, across - 13);
        const lower = point(along - 18, across + 13);
        g.moveTo(upper.x, upper.y).lineTo(tip.x, tip.y).lineTo(lower.x, lower.y)
          .stroke({ color: zone.color, width: 5, alpha: 0.68, cap: 'round' });
      }
    }
  }

  private drawBuilding(g: Graphics, building: Building, time: number): void {
    const config = (BUILDING_CONFIGS as Record<string, { color: string }>)[building.type];
    if (!config) return;
    const alpha = building.cooldown > 0 ? 0.45 : 1;
    const pulseRadius = building.radius * (1 + Math.sin(time * 0.03) * 0.04);
    g.circle(building.x, building.y, pulseRadius).fill({ color: config.color, alpha: 0.2 * alpha }).stroke({ color: config.color, width: 4, alpha });
    if (building.type === 'SHIPWRECK') {
      const r = building.radius;
      const cos = Math.cos(-0.16);
      const sin = Math.sin(-0.16);
      const point = (x: number, y: number) => ({
        x: building.x + x * cos - y * sin,
        y: building.y + x * sin + y * cos,
      });
      const hull = [point(-r * 0.68, -r * 0.18), point(r * 0.7, -r * 0.18), point(r * 0.46, r * 0.38), point(-r * 0.48, r * 0.38)];
      g.poly(hull.flatMap(p => [p.x, p.y])).fill({ color: '#78350f', alpha }).stroke({ color: '#451a03', width: 5, alpha });
      for (const x of [-0.36, -0.08, 0.2, 0.48]) {
        const from = point(r * x, -r * 0.15);
        const to = point(r * (x - 0.08), r * 0.32);
        g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: '#a16207', width: 7, alpha });
      }
      const mastA = point(-r * 0.1, -r * 0.2);
      const mastB = point(-r * 0.18, -r * 0.72);
      const mastC = point(r * 0.1, -r * 0.5);
      g.moveTo(mastA.x, mastA.y).lineTo(mastB.x, mastB.y).lineTo(mastC.x, mastC.y)
        .stroke({ color: '#92400e', width: 9, alpha });
      const entrance = point(r * 0.48, r * 0.08);
      g.ellipse(entrance.x, entrance.y, r * 0.13, r * 0.18).fill({ color: '#0f172a', alpha: 0.95 });
    } else {
      g.circle(building.x, building.y, building.radius * 0.55).fill({ color: config.color, alpha });
    }
    if (building.activity) {
      const progress = Math.max(0, Math.min(1, building.activity.progress));
      const activityRadius = building.radius * 0.76;
      g.moveTo(building.x, building.y - activityRadius).arc(
        building.x, building.y, activityRadius,
        -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress
      ).stroke({ color: building.activity.color, width: 9, alpha: 0.95, cap: 'round' });
    }
  }

  private drawPortal(g: Graphics, portal: Portal, now: number): void {
    const [primary, secondary] = portalColors(portal);
    const pulse = 1 + Math.sin(now * 0.00375) * 0.12;
    g.circle(portal.x, portal.y, portal.radius * 1.8 * pulse).fill({ color: primary, alpha: 0.08 });
    for (let i = 0; i < 3; i += 1) {
      const rotation = now * 0.0009 * (i % 2 ? -1 : 1) + i * Math.PI / 3;
      g.ellipse(portal.x, portal.y, portal.radius * 1.45 * pulse, portal.radius * (0.28 + i * 0.04))
        .stroke({ color: i % 2 ? secondary : primary, width: 4, alpha: 0.65 });
      const px = portal.x + Math.cos(rotation) * portal.radius * 0.75;
      const py = portal.y + Math.sin(rotation) * portal.radius * 0.75;
      g.circle(px, py, 5 + i).fill({ color: '#ffffff', alpha: 0.9 });
    }
    g.circle(portal.x, portal.y, portal.radius * 0.72 * pulse).fill({ color: primary, alpha: 0.36 });
    g.circle(portal.x, portal.y, portal.radius * 0.22).fill({ color: '#ffffff', alpha: 0.9 });
    if (portal.kind === 'POND') g.circle(portal.x, portal.y, portal.radius * 1.15).stroke({ color: secondary, width: 3, alpha: 0.9 });
  }

  private drawDynamicWorld(state: Readonly<GameState>, now: number): void {
    this.underEffectsGraphics.visible = false;
    this.worldItemsGraphics.visible = false;
    this.overEffectsGraphics.visible = false;
    const under = this.underEffectsGraphics.clear();
    const items = this.worldItemsGraphics.clear();
    const over = this.overEffectsGraphics.clear();
    let underContent = false;
    let visibleItems = 0;
    let telegraphs = 0;
    let rivalMarkers = 0;
    let visibleParticles = 0;
    let visibleWorldLabels = 0;
    let visibleSpeechBubbles = 0;
    let visibleSquadMarkers = 0;
    let visibleHazards = 0;

    const feeding = state.feedingEvent;
    if (feeding && feeding.x !== null && feeding.y !== null && !['WAITING', 'COOLDOWN'].includes(feeding.phase)) {
      if (this.isVisible(feeding.x, feeding.y, FEEDING_EVENT_CONFIG.EVENT_RADIUS)) {
        const warning = feeding.phase === 'WARNING';
        const color = warning ? '#fb923c' : '#facc15';
        const pulse = 1 + Math.sin(now * 0.004) * 0.08;
        const radius = FEEDING_EVENT_CONFIG.EVENT_RADIUS * pulse;
        under.circle(feeding.x, feeding.y, radius).fill({ color, alpha: warning ? 0.1 : 0.08 });
        this.drawDashedCircle(under, feeding.x, feeding.y, radius, color, 5, warning ? 18 : 10, warning ? 10 : 14, now * 0.001);
        this.setLabel('feeding:event', warning ? '投食即将开始' : '投食争夺区', feeding.x, feeding.y - radius - 18, 18, '#fff7ed');
        underContent = true;
      }
      feeding.drops.forEach((drop, index) => {
        if (!this.isVisible(drop.x, drop.y, drop.radius)) return;
        this.drawCookie(items, drop.x, drop.y, drop.radius, now * 0.002 + index);
        visibleItems += 1;
      });
    }

    for (const treasure of state.treasures) {
      if (!this.isVisible(treasure.x, treasure.y, treasure.radius * 3)) continue;
      this.drawTreasure(items, treasure, now);
      this.setLabel(
        `treasure:${treasure.id}`,
        treasure.status === 'WARNING' ? '即将出现' : ({ FEAST: '盛宴', CHEST: '宝箱', GEM: '宝石', FOOD: '美食' } as const)[treasure.type],
        treasure.x,
        treasure.y + treasure.radius + 18,
        12,
        treasure.status === 'WARNING' ? '#fef3c7' : '#ffffff'
      );
      visibleItems += 1;
    }

    for (const powerUp of state.powerUps) {
      if (!this.isVisible(powerUp.x, powerUp.y, powerUp.radius)) continue;
      this.drawPowerUp(items, powerUp, now);
      visibleItems += 1;
    }

    for (const particle of state.particles) {
      if (!this.isVisible(particle.x, particle.y, Math.max(particle.size, particle.length ?? 0))) continue;
      const alpha = Math.max(0, Math.min(1, particle.life / Math.max(0.001, particle.maxLife)));
      if (isBoostTrail(particle)) drawBoostTrailPixi(under, particle);
      else if (particle.shape === 'COOKIE') this.drawCookie(under, particle.x, particle.y, particle.size, particle.spin ?? 0);
      else under.circle(particle.x, particle.y, particle.size).fill({ color: particle.color, alpha });
      underContent = true;
      visibleParticles += 1;
    }

    for (let index = 0; index < 16; index += 1) {
      const drift = (now * (0.012 + (index % 4) * 0.0036)) % 5800;
      const x = ((index * 733) % 5800) + 100;
      const y = ((index * 547 + drift) % 5800) + 100;
      if (Math.abs(x - state.player.x) > 1600 || Math.abs(y - state.player.y) > 1200 || !this.isVisible(x, y, 6)) continue;
      this.drawCookie(under, x, y, 3.5 + (index % 3), index + now * 0.0006);
      underContent = true;
    }

    for (const hazard of state.hazards) {
      if (!this.isVisible(hazard.x, hazard.y, hazard.radius)) continue;
      const color = hazard.stage === 'STRIKE' ? '#ef4444' : '#f97316';
      const pulse = 1 + Math.sin(now * 0.012) * 0.08;
      under.circle(hazard.x, hazard.y, hazard.radius * pulse).fill({ color, alpha: hazard.stage === 'STRIKE' ? 0.28 : 0.12 });
      this.drawDashedCircle(over, hazard.x, hazard.y, hazard.radius * pulse, color, hazard.stage === 'STRIKE' ? 6 : 3, 12, 9, now * 0.002);
      if (hazard.countdown !== undefined) {
        this.setLabel(`hazard:${hazard.id}`, `陨石 ${Math.max(0, hazard.countdown).toFixed(1)}s`, hazard.x, hazard.y - hazard.radius - 16, 14, '#fecaca');
        visibleWorldLabels += 1;
      }
      underContent = true;
      visibleHazards += 1;
    }

    const rivals = new Map((state.rivalSquads ?? []).map(squad => [squad.id, squad]));
    const namedRivals = new Set<string>();
    const allCreatures = [...state.entities, state.player];
    for (const entity of allCreatures) {
      if (!this.isVisible(entity.x, entity.y, entity.radius * 2)) continue;
      if ((entity.counterWindup ?? 0) > 0) {
        this.drawCounterTelegraph(over, entity, now);
        telegraphs += 1;
      }
      if (entity.ownerId === 'player') {
        this.drawDashedCircle(over, entity.x, entity.y, entity.radius + 9, '#22d3ee', 2, 6, 5, now * -0.003);
        this.setLabel(`squad:${entity.id}`, '己', entity.x, entity.y - entity.radius - 15, 13, '#22d3ee');
        visibleSquadMarkers += 1;
      }
      const bubble = entity.speechBubble;
      if (bubble && bubble.timer > 0 && bubble.text) {
        const y = entity.y - entity.radius - 34 + Math.sin(now * 0.007 + entity.animOffset) * 3;
        const width = Math.max(42, bubble.text.length * 15 + 20);
        over.roundRect(entity.x - width / 2, y - 13, width, 26, 13)
          .fill({ color: '#0f172a', alpha: 0.84 }).stroke({ color: bubble.color, width: 2 });
        over.moveTo(entity.x - 5, y + 12).lineTo(entity.x + 5, y + 12).lineTo(entity.x, y + 20).closePath()
          .fill({ color: '#0f172a', alpha: 0.84 });
        this.setLabel(`speech:${entity.id}`, bubble.text, entity.x, y, 14, bubble.color);
        visibleSpeechBubbles += 1;
      }
      if (entity !== state.player) {
        if (entity.cosmetics?.rareVariant === 'STARRY_CLOWN') {
          const dx = entity.x - state.player.x;
          const dy = entity.y - state.player.y;
          if (dx * dx + dy * dy <= 700 * 700) {
            this.setLabel(`rare:${entity.id}`, '✦ 星夜小丑鱼', entity.x, entity.y - entity.radius - 18, 12, '#b6f7ff');
            visibleWorldLabels += 1;
          }
        }
        const mood = getMood(entity.moodId);
        const dx = entity.x - state.player.x;
        const dy = entity.y - state.player.y;
        if (mood.badge && dx * dx + dy * dy <= 900 * 900) {
          this.setLabel(`mood:${entity.id}`, mood.badge, entity.x - entity.radius * 0.95, entity.y - entity.radius * 0.8, 13, '#ffffff');
          visibleWorldLabels += 1;
        }
      }
      const rival = entity.ownerId ? rivals.get(entity.ownerId) : undefined;
      if (!rival) continue;
      const ambusher = rival.kind === 'AMBUSHER';
      const color = ambusher ? '#c4b5fd' : '#fb923c';
      const radius = entity.radius + 9;
      if (ambusher) this.drawDashedCircle(over, entity.x, entity.y, radius, color, 3, 4, 3, now * -0.002);
      else over.circle(entity.x, entity.y, radius).stroke({ color, width: 3, alpha: 0.9 });
      if (!namedRivals.has(rival.id) && (!entity.speechBubble || entity.speechBubble.timer <= 0)) {
        namedRivals.add(rival.id);
        this.setLabel(`rival:${rival.id}`, `敌 · ${rival.name}`, entity.x, entity.y - entity.radius - 16, 12, color);
      }
      rivalMarkers += 1;
    }

    for (const label of state.labels) {
      if (!this.isVisible(label.x, label.y, 90)) continue;
      const size = label.size ?? 28;
      const y = label.y + Math.sin(now * 0.006 + label.x) * 5;
      const width = Math.max(64, label.text.length * size * 0.72 + 20);
      over.roundRect(label.x - width / 2, y - (size + 12) / 2, width, size + 12, 10)
        .fill({ color: '#000000', alpha: 0.7 }).stroke({ color: label.color, width: 3 });
      this.setLabel(`float:${label.x}:${label.y}:${label.text}`, label.text, label.x, y, size, label.color);
      visibleWorldLabels += 1;
    }

    this.drawScreenFlash(state);

    this.currentMetrics.visibleWorldItems = visibleItems;
    this.currentMetrics.visibleCombatTelegraphs = telegraphs;
    this.currentMetrics.visibleRivalMarkers = rivalMarkers;
    this.currentMetrics.visibleParticles = visibleParticles;
    this.currentMetrics.visibleWorldLabels = visibleWorldLabels;
    this.currentMetrics.visibleSpeechBubbles = visibleSpeechBubbles;
    this.currentMetrics.visibleSquadMarkers = visibleSquadMarkers;
    this.currentMetrics.visibleHazards = visibleHazards;
    this.underEffectsGraphics.visible = underContent;
    this.worldItemsGraphics.visible = visibleItems > 0;
    this.overEffectsGraphics.visible = telegraphs + rivalMarkers > 0;
  }

  private drawScreenFlash(state: Readonly<GameState>): void {
    const flash = state.screenFlash;
    this.screenFlashGraphics.visible = false;
    this.screenFlashGraphics.clear();
    if (!flash || flash.timer <= 0) return;
    const alpha = Math.min(0.8, flash.timer / 40) * 0.8;
    this.screenFlashGraphics.rect(0, 0, this.viewport.width, this.viewport.height).fill({ color: flash.color, alpha });
    this.screenFlashGraphics.visible = true;
  }

  private drawDashedCircle(g: Graphics, x: number, y: number, radius: number, color: string, width: number, dash: number, gap: number, offset = 0): void {
    const circumference = Math.PI * 2 * radius;
    const count = Math.max(8, Math.floor(circumference / (dash + gap)));
    const dashAngle = Math.PI * 2 * (dash / (dash + gap)) / count;
    for (let index = 0; index < count; index += 1) {
      const start = offset + index / count * Math.PI * 2;
      g.moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
        .arc(x, y, radius, start, start + dashAngle).stroke({ color, width, alpha: 0.9 });
    }
  }

  private drawCookie(g: Graphics, x: number, y: number, radius: number, rotation: number): void {
    g.circle(x, y, radius).fill({ color: '#d97706' }).stroke({ color: '#78350f', width: 2 });
    for (let index = 0; index < 5; index += 1) {
      const angle = rotation + index / 5 * Math.PI * 2;
      g.circle(x + Math.cos(angle) * radius * 0.48, y + Math.sin(angle) * radius * 0.48, Math.max(1.5, radius * 0.12)).fill({ color: '#451a03' });
    }
  }

  private drawTreasure(g: Graphics, treasure: Treasure, now: number): void {
    const pulse = 1 + Math.sin(now * 0.006 + treasure.x) * 0.16;
    if (treasure.status === 'WARNING') {
      g.circle(treasure.x, treasure.y, treasure.radius * 3 * pulse).fill({ color: '#fcd34d', alpha: 0.1 });
      g.circle(treasure.x, treasure.y, treasure.radius * pulse).fill({ color: '#fcd34d' }).stroke({ color: '#fef3c7', width: 3, alpha: 0.8 });
      g.moveTo(treasure.x, treasure.y - treasure.radius * 0.45).lineTo(treasure.x, treasure.y + treasure.radius * 0.08)
        .stroke({ color: '#78350f', width: Math.max(3, treasure.radius * 0.18) });
      g.circle(treasure.x, treasure.y + treasure.radius * 0.45, Math.max(2, treasure.radius * 0.1)).fill({ color: '#78350f' });
      return;
    }
    const color = TREASURE_COLORS[treasure.type] ?? TREASURE_COLORS.DEFAULT;
    g.circle(treasure.x, treasure.y, treasure.radius * 2 * pulse).fill({ color, alpha: 0.12 });
    for (let ring = 0; ring < 3; ring += 1) this.drawDashedCircle(g, treasure.x, treasure.y, treasure.radius * (1.2 + ring * 0.18), color, 2, 7, 8, now * 0.001 * (ring + 1));
    g.circle(treasure.x, treasure.y, treasure.radius).fill({ color }).stroke({ color: '#ffffff', width: 2, alpha: 0.65 });
    const inner = treasure.type === 'GEM' ? '#f5d0fe' : treasure.type === 'FOOD' ? '#dcfce7' : '#fef3c7';
    g.circle(treasure.x, treasure.y, treasure.radius * 0.38).fill({ color: inner, alpha: 0.95 });
  }

  private drawPowerUp(g: Graphics, powerUp: PowerUp, now: number): void {
    const bob = Math.sin(now * 0.004 + powerUp.x) * 3;
    const x = powerUp.x;
    const y = powerUp.y + bob;
    if (powerUp.type === 'COIN') {
      const width = powerUp.radius * Math.max(0.25, Math.abs(Math.sin(now * 0.003 + powerUp.x)));
      g.ellipse(x, y, width, powerUp.radius).fill({ color: '#fbbf24' }).stroke({ color: '#b45309', width: 2 });
      g.ellipse(x, y, width * 0.62, powerUp.radius * 0.62).fill({ color: '#fde68a' });
    } else if (powerUp.type === 'SHELL') {
      g.moveTo(x - powerUp.radius, y).arc(x, y, powerUp.radius, Math.PI, Math.PI * 2).lineTo(x + powerUp.radius, y + powerUp.radius * 0.5)
        .lineTo(x - powerUp.radius, y + powerUp.radius * 0.5).closePath().fill({ color: '#fbcfe8' }).stroke({ color: '#db2777', width: 2 });
    } else if (powerUp.type === 'BOTTLE') {
      g.roundRect(x - powerUp.radius * 0.55, y - powerUp.radius * 0.8, powerUp.radius * 1.1, powerUp.radius * 1.6, 5)
        .fill({ color: '#a7f3d0', alpha: 0.65 }).stroke({ color: '#059669', width: 2 });
      g.rect(x - powerUp.radius * 0.25, y - powerUp.radius, powerUp.radius * 0.5, powerUp.radius * 0.25).fill({ color: '#d97706' });
    } else {
      const color = powerUp.type === 'SHIELD' ? '#60a5fa' : '#22d3ee';
      g.circle(x, y, powerUp.radius).fill({ color, alpha: 0.75 }).stroke({ color: '#ffffff', width: 2, alpha: 0.7 });
    }
  }

  private drawCounterTelegraph(g: Graphics, entity: Entity, now: number): void {
    const windup = entity.counterWindup ?? 0;
    const progress = 1 - Math.min(1, windup / Math.max(1, COMBAT_CONFIG.COUNTER_WINDUP));
    const range = entity.radius * COMBAT_CONFIG.COUNTER_RANGE_MULT;
    g.circle(entity.x, entity.y, range).fill({ color: '#f97316', alpha: 0.16 });
    g.circle(entity.x, entity.y, entity.radius + 20 - progress * 10)
      .stroke({ color: progress > 0.75 ? '#fca5a5' : '#fbbf24', width: 3, alpha: 0.45 + progress * 0.5 });
    g.moveTo(entity.x, entity.y - range)
      .arc(entity.x, entity.y, range, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
      .stroke({ color: '#f97316', width: 4, alpha: 0.55 + Math.sin(now * 0.02) * 0.25 });
  }

  private syncCreatures(state: Readonly<GameState>, now: number): void {
    const activeIds = new Set<string>();
    const activeLodTextureKeys = new Set<string>();
    let visible = 0;
    let standardFish = 0;
    let riggedAppendages = 0;
    let segmentedBodies = 0;
    let lod0 = 0;
    let lod1 = 0;
    let lod2 = 0;
    let lod2AnimatedUpdates = 0;
    const updateOne = (entity: Entity, isPlayer: boolean) => {
      activeIds.add(entity.id);
      let display = this.creatures.get(entity.id);
      const inView = this.isVisible(entity.x, entity.y, entity.radius * 2);
      if (!inView) {
        if (display) display.root.visible = false;
        return;
      }
      if (!display) {
        const reusableIndex = this.creaturePool.findIndex(entry => entry.availableAfter <= this.currentMetrics.renderCount);
        display = reusableIndex >= 0
          ? this.creaturePool.splice(reusableIndex, 1)[0].display
          : new CreatureDisplay(entity.id);
        if (reusableIndex >= 0) this.currentMetrics.creatureDisplaysReused += 1;
        else this.currentMetrics.creatureDisplaysCreated += 1;
        display.rebind(entity.id);
        this.creatures.set(entity.id, display);
        if (!display.root.parent) this.layers.get('creatures')?.addChild(display.root);
      }
      display.root.visible = true;
      const previousSignature = display.appearanceSignature();
      const distance = Math.hypot(entity.x - state.player.x, entity.y - state.player.y);
      const lod = selectCreatureLod(distance, isPlayer);
      if (lod === 0) lod0 += 1;
      else if (lod === 1) lod1 += 1;
      else lod2 += 1;

      if (lod === 2) {
        const textureKey = lod2TextureSignature(entity);
        activeLodTextureKeys.add(textureKey);
        let cached = this.lodTextureCache.get(textureKey);
        if (cached) {
          cached.lastUsed = this.currentMetrics.renderCount;
          this.currentMetrics.lodTextureCacheHits += 1;
          display.update(entity, now, isPlayer, 2, true);
        } else {
          this.currentMetrics.lodTextureCacheMisses += 1;
          // 离屏纹理只在外观首次进入 LOD 2 时生成；后续帧不再更新关节。
          display.update(entity, now, isPlayer, 0, false);
          lod2AnimatedUpdates += 1;
          cached = { asset: this.createLodTexture(display), lastUsed: this.currentMetrics.renderCount };
          this.lodTextureCache.set(textureKey, cached);
          display.update(entity, now, isPlayer, 2, true);
        }
        display.useLodTexture(cached.asset);
      } else {
        display.update(entity, now, isPlayer, lod, false);
      }
      const nextSignature = display.appearanceSignature();
      if (nextSignature !== previousSignature) {
        const cacheResult = this.appearanceCache.touch(nextSignature);
        if (cacheResult.hit) this.currentMetrics.appearanceCacheHits += 1;
        else this.currentMetrics.appearanceCacheMisses += 1;
        if (cacheResult.evicted) this.currentMetrics.appearanceCacheEvictions += 1;
      }
      visible += 1;
      if (display.isStandardFish()) standardFish += 1;
      const shape = entity.config.shape ?? 'FISH';
      if (['JELLY', 'CEPHALOPOD', 'OCTOPUS', 'KRAKEN'].includes(shape)) riggedAppendages += 1;
      if (shape === 'EEL' || shape === 'OARFISH') segmentedBodies += 1;
    };
    for (const entity of state.entities) updateOne(entity, false);
    updateOne(state.player, true);

    for (const [id, display] of this.creatures) {
      if (activeIds.has(id)) continue;
      display.root.visible = false;
      display.releaseAppearance();
      this.creatures.delete(id);
      this.creaturePool.push({ display, availableAfter: this.currentMetrics.renderCount + CREATURE_REUSE_COOLDOWN_FRAMES });
      if (this.creaturePool.length > CREATURE_POOL_CAPACITY) {
        const evicted = this.creaturePool.shift();
        if (evicted) {
          this.pendingCreatureDisposals.push({
            display: evicted.display,
            destroyAfter: this.currentMetrics.renderCount + CREATURE_DISPOSE_DELAY_FRAMES,
          });
          this.currentMetrics.creatureDisplaysEvicted += 1;
        }
      }
    }
    this.currentMetrics.creatureObjects = this.creatures.size;
    this.currentMetrics.visibleCreatures = visible;
    this.currentMetrics.standardFish = standardFish;
    this.currentMetrics.riggedAppendageCreatures = riggedAppendages;
    this.currentMetrics.segmentedBodyCreatures = segmentedBodies;
    this.currentMetrics.creaturePoolSize = this.creaturePool.length;
    this.currentMetrics.appearanceCacheSize = this.appearanceCache.size;
    const evictions = pickTextureEvictions(
      [...this.lodTextureCache].map(([key, entry]) => ({ key, bytes: entry.asset.bytes, lastUsed: entry.lastUsed })),
      activeLodTextureKeys
    );
    for (const key of evictions) {
      const entry = this.lodTextureCache.get(key);
      if (!entry) continue;
      entry.asset.texture.destroy(true);
      this.lodTextureCache.delete(key);
      this.currentMetrics.lodTextureCacheEvictions += 1;
    }
    const lodTextureBytes = [...this.lodTextureCache.values()].reduce((sum, entry) => sum + entry.asset.bytes, 0);
    this.currentMetrics.lod0Creatures = lod0;
    this.currentMetrics.lod1Creatures = lod1;
    this.currentMetrics.lod2Creatures = lod2;
    this.currentMetrics.lod2AnimatedUpdates = lod2AnimatedUpdates;
    this.currentMetrics.lodTextureCacheSize = this.lodTextureCache.size;
    this.currentMetrics.lodTextureCacheBytes = lodTextureBytes;
    this.currentMetrics.textures = this.lodTextureCache.size;
  }

  private createLodTexture(display: CreatureDisplay): LodTextureAsset {
    const app = this.app;
    if (!app) throw new Error('Cannot create a LOD texture before renderer initialization');
    const snapshot = display.createSnapshotTarget();
    const texture = app.renderer.generateTexture({
      target: snapshot.target,
      resolution: Math.min(1, this.viewport.resolution),
    }) as Texture;
    // 克隆节点共享原 GraphicsContext，销毁临时容器时必须保留这些上下文。
    for (const child of [...snapshot.target.children]) child.destroy({ context: false });
    snapshot.target.destroy({ children: false });
    return {
      texture,
      centerX: snapshot.centerX,
      centerY: snapshot.centerY,
      bytes: Math.ceil(texture.width * texture.height * 4),
    };
  }

  private disposeExpiredCreatureDisplays(): void {
    for (const entry of this.creaturePool) {
      if (entry.availableAfter <= this.currentMetrics.renderCount && entry.display.root.parent) {
        entry.display.root.removeFromParent();
      }
    }
    const retained: typeof this.pendingCreatureDisposals = [];
    for (const entry of this.pendingCreatureDisposals) {
      if (entry.destroyAfter > this.currentMetrics.renderCount) {
        retained.push(entry);
        continue;
      }
      entry.display.root.removeFromParent();
      entry.display.destroy();
    }
    this.pendingCreatureDisposals = retained;
  }

  private syncLabels(state: Readonly<GameState>): void {
    for (const label of this.labels.values()) label.visible = false;
    for (const building of state.buildings) {
      if (!this.isVisible(building.x, building.y, building.radius)) continue;
      const key = `building:${building.id}`;
      if (building.type !== 'SHIPWRECK') {
        this.setLabel(key, BUILDING_GLYPHS[building.type] ?? '点', building.x, building.y, 22, '#ffffff');
      }
      if (building.prompt?.text) this.setLabel(`building-prompt:${building.id}`, building.prompt.text, building.x, building.y + building.radius + 24, 14, building.prompt.color);
    }
    for (const portal of state.portals) {
      if (!portal.name || !this.isVisible(portal.x, portal.y, portal.radius * 2.5)) continue;
      const key = `portal:${portal.id}`;
      const [, color] = portalColors(portal);
      this.setLabel(key, portal.name, portal.x, portal.y + portal.radius * 1.5, 14, color);
    }
  }

  private setLabel(key: string, value: string, x: number, y: number, size: number, color: string): void {
    let label = this.labels.get(key);
    if (!label) {
      // 每帧 syncLabels 开头会把旧标签全部设为 invisible；新世界/新布局的建筑和门
      // 往往换了一批 id。旧实现只有塞满 128 个后才复用，导致连续重开时对象树会
      // 一局一局增长，直到碰到硬上限。隐藏标签此时没有任何屏幕职责，可以立即换 key
      // 复用；同一帧已经重新启用的标签 visible=true，不会被抢走。
      const reusable = [...this.labels.entries()].find(([, candidate]) => !candidate.visible);
      if (reusable) {
        this.labels.delete(reusable[0]);
        label = reusable[1];
      } else if (this.labels.size >= WORLD_LABEL_CAPACITY) {
        return;
      }
      if (!label) {
        label = new Text({ text: value, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: size, fontWeight: 'bold', fill: color, align: 'center' } });
        label.anchor.set(0.5);
        this.layers.get('worldLabels')?.addChild(label);
      }
      this.labels.set(key, label);
    }
    label.text = value;
    label.style.fontSize = size;
    label.style.fill = color;
    label.position.set(x, y);
    label.visible = true;
  }

  private countDisplayObjects(container: Container): number {
    let count = 1;
    for (const child of container.children) count += child instanceof Container ? this.countDisplayObjects(child) : 1;
    return count;
  }
}
