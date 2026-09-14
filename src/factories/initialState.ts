/**
 * 游戏初始状态工厂。
 *
 * 原来这段 40 行的初始化写在 App.tsx 里，测试要用就只能复制一份（然后慢慢和实现脱节）。
 * 抽出来之后，运行时和测试共用同一份，测出来的就是真实跑的那套状态。
 */

import { CREATURES, CreatureType } from '../data/creatures';
import { WORLD_SIZE, BOOST_CONFIG, MAP_SHAPE_CONFIG } from '../data/world';
import { BiomeType } from '../data/biomes';
import { DEFAULT_POND, type PondId } from '../data/ponds';
import {
  RIVALS_RULES,
  createRunState,
  resolveRunMode,
  type RunMode,
} from '../data/runRules';
import { DEFAULT_COSMETICS, GameStatus, type Cosmetics, type GameState } from '../types';
import { createObstacles, createBuildings, createPortals } from '../systems/world';

export interface CreateInitialStateOptions {
  startType?: string;
  cosmetics?: Cosmetics;
  /** 选塘（「多鱼塘」阶段 1）：决定开局生态区、刷怪与计分。缺省 = 清水塘 */
  pondId?: PondId;
  /** 跳过地形生成（测试里想省时间时用） */
  skipWorldGen?: boolean;
  /**
   * 玩法模式（G0 / FQ-02）。缺省走 `resolveRunMode()`：
   * URL `?mode=` > localStorage > LEGACY（默认仍是旧 Demo）。
   * 显式传入是为了让单测与探针能在**不使用全局开关**的前提下跑指定模式。
   */
  mode?: RunMode;
}

/** 读取存档的技能等级，读不到就当 1 级 */
const loadSkillLevel = (): number => {
  try {
    return parseInt(localStorage.getItem('skillLevel') || '1', 10) || 1;
  } catch {
    return 1;
  }
};

export const createInitialState = (options: CreateInitialStateOptions = {}): GameState => {
  const startType = options.startType ?? CreatureType.CLOWN_FISH;
  const pondId = options.pondId ?? DEFAULT_POND;
  // 「鱼群争霸」规则入口：LEGACY 时 createRunState 返回 undefined，state.run 保持缺省
  const mode = options.mode ?? resolveRunMode();
  const run = createRunState(mode);
  // 单塘模式：不开塘际传送门，堵死「换塘重置对手与决战进度」这条路径
  const allowPondTravel = !run || RIVALS_RULES.allowPondTravel;
  const baseConfig = CREATURES[startType as CreatureType] ?? CREATURES[CreatureType.CLOWN_FISH];
  const startX = MAP_SHAPE_CONFIG.CENTER_X;
  const startY = MAP_SHAPE_CONFIG.CENTER_Y;
  const startWeight = baseConfig.tier * 10 + 5;

  const player: GameState['player'] = {
    id: 'player',
    type: baseConfig.type,
    x: startX,
    y: startY,
    vx: 0,
    vy: 0,
    radius: baseConfig.baseRadius + baseConfig.tier * 2,
    angle: 0,
    health: baseConfig.health,
    maxHealth: baseConfig.health,
    speed: baseConfig.speed * 1.2,
    config: baseConfig,
    weight: startWeight,
    evolutionPoints: startWeight,
    stats: { speedMult: 1, sizeMult: 1, defenseMult: 1, visionRadius: 1 },
    eatenHistory: {},
    mouthOpenValue: 0,
    animOffset: 0,
    renderScale: 1.0,
    isInvulnerable: false,
    boost: { current: BOOST_CONFIG.MAX_ENERGY, max: BOOST_CONFIG.MAX_ENERGY, active: false },
    isGodMode: false,
    reviveCount: 0,
    isIdle: false,
    lureActive: false,
    camoActive: false,
    ambushTimer: 0,
    shieldTimer: 0,
    invulnerableTimer: 0,
    evolutionVisualTimer: 0,
    currentBiome: BiomeType.SHALLOWS,
    biomeDebuffTimer: 0,
    skillCooldown: 0,
    skillMaxCooldown: 180,
    skillLevel: loadSkillLevel(),
    // P1-3 流派技能：由 systems/skills.ts 每帧按等级写回 schoolSkillId
    schoolSkillId: undefined,
    schoolSkillCooldown: 0,
    level: Math.floor(startWeight / 10) + 1,
    cosmetics: options.cosmetics ?? { ...DEFAULT_COSMETICS },
    semiGhostTimer: 0,
    poisonTimer: 0,
    angerTimer: 0,
  };

  return {
    status: GameStatus.MENU,
    player,
    entities: [],
    squad: { pending: [], switchCooldown: 0, recruitedTotal: 0, possessCount: 0 },
    particles: [],
    obstacles: options.skipWorldGen ? [] : createObstacles(pondId),
    powerUps: [],
    hazards: [],
    portals: options.skipWorldGen || !allowPondTravel ? [] : createPortals(pondId),
    buildings: options.skipWorldGen ? [] : createBuildings(pondId),
    treasures: [],
    fountains: [],
    labels: [],
    pondId,
    screenFlash: null,
    evolveOptions: [],
    run,
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    camera: { x: startX, y: startY, zoom: 0.8 },
    score: 0,
    time: 0,
  };
};
