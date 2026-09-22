/**
 * 世界系统 —— 生态区、建筑、传送门（塘内 + 塘际）、障碍物。
 *
 * 这一整块在重构前基本是空壳：
 *   - BIOME_CONFIGS 写了四套加成，但 player.currentBiome 从初始化后就没人更新过
 *   - 建筑生成了 5 座，既不渲染也没有任何交互
 *   - 传送门只画了个圈，走过去没有任何反应
 *   - 障碍物生成了 80 个，既看不见也撞不到
 * 现在全部在这里落地。
 *
 * 「多鱼塘」阶段 2a 追加：传送门分成两类（kind）——
 *   LOCAL 塘内门：老行为，在本塘的门之间随机传送
 *   POND  塘际门：通往另一个塘，触发 pondTravel() 重建世界（同尺寸，不同内容）
 */

import { MAX_OBSTACLES, WORLD_SIZE, BUILDING_CONFIGS, PORTAL_CONFIG, METEOR_CONFIG, PROTECTION_CONFIG, TREASURE_CONFIG } from '../data/world';
import { BIOME_DATA, BIOME_EFFECTS, BiomeType } from '../data/biomes';
import { BUILDING_DATA, BUILDING_SPAWN_RULES, BuildingType } from '../data/buildings';
import { getPond, otherPonds, DEFAULT_POND, POND_DATA, scoreGain, type PondId } from '../data/ponds';
import { DEFAULT_COSMETICS, GameStatus, type Building, type GameState, type FrameContext, type Obstacle, type Portal } from '../types';
import { uuid, dist, pick } from '../core/math';
import { getBiome, getRandomPosInBiome, isPositionValid, clampToMap, resolveObstacles, MAP_CENTER, ObstacleIndex } from './terrain';
import { createParticle, dealDamage } from './combat';
import { spawnSystem, createEntity } from './spawn';
import { createCurrentZones } from '../data/habitats';
import { configureObstacleEcology } from './obstacleEcology';
import { getOceanRegion } from '../data/oceanRegions';

/** 塘际门比塘内门大一圈，一眼能认出来 */
const POND_PORTAL_RADIUS = PORTAL_CONFIG.RADIUS * 1.4;
/** 塘际门距塘中心的基准环半径（放不下就往外挪） */
const POND_PORTAL_RING = 1150;
/** 过场闪屏时长（帧） */
const POND_TRAVEL_FLASH = 40;
/** 塘际传送后给新塘铺底的鱼数量（别让玩家跳进空塘） */
const POND_SEED_COUNT = 12;
/** 落地保护：传送完站在中心，给一点时间别被立刻吃掉 */
const POND_TRAVEL_PROTECTION = PROTECTION_CONFIG.REVIVE_DURATION;

/**
 * 商场位置 —— **固定地标**（createBuildings 里写死），玩家每局都要进。
 * 抽出来是因为别处也要拿它做避让（见 SHOP_PORTAL_KEEPOUT）。
 */
export const SHOP_POSITION = { x: MAP_CENTER.x - 1500, y: MAP_CENTER.y - 1500 };

/**
 * 商场交互圈：SHOP 建筑按 1.5 倍半径算交互范围（worldSystem 的建筑段）。
 * 随机内容如果压进来，玩家"想进商场"的动作会被别的东西抢走。
 */
const SHOP_INTERACT_RANGE = BUILDING_DATA.SHOP.radius * 1.5;

/**
 * 传送门与商场中心的最小距离。
 *
 * ⚠️ 为什么必须有这个约束（实测抓到的 bug，2026-09-15）：
 *    塘内门是**踩上去就传**（不需要按键），而且传完还锁 90 帧。
 *    随机塘内门一旦压在商场交互圈上，玩家游向商场的路上就被传走 ——
 *    这一局的商场等于废弃（按 E 永远进不去，因为人已经不在圈里了）。
 *    实测约 0.5% 的随机世界会中招，表现就是 p0「按 E 进商场」用例偶发红。
 */
export const SHOP_PORTAL_KEEPOUT = SHOP_INTERACT_RANGE + PORTAL_CONFIG.RADIUS + 60;

/** 点是否落在「商场禁区」内（传送门落点一律要避开） */
const insideShopKeepOut = (p: { x: number; y: number }): boolean =>
  Math.hypot(p.x - SHOP_POSITION.x, p.y - SHOP_POSITION.y) < SHOP_PORTAL_KEEPOUT;

/** 传送门不能压在洋流上，否则玩家顺流时会在没有选择的情况下被强制换位。 */
const intersectsCurrentKeepOut = (
  p: { x: number; y: number },
  clearance: number,
  pondId?: string | null
): boolean => {
  const pond = ((pondId && pondId in POND_DATA) ? pondId : DEFAULT_POND) as PondId;
  return createCurrentZones(pond).some(zone => {
    const cos = Math.cos(zone.angle);
    const sin = Math.sin(zone.angle);
    const dx = p.x - zone.x;
    const dy = p.y - zone.y;
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    return Math.abs(along) < zone.length / 2 + clearance
      && Math.abs(across) < zone.width / 2 + clearance;
  });
};

const insideCurrentKeepOut = (p: { x: number; y: number }, pondId?: string | null): boolean =>
  intersectsCurrentKeepOut(p, PORTAL_CONFIG.RADIUS + 60, pondId);

const pushOutsideCurrent = (p: { x: number; y: number }, pondId?: string | null): { x: number; y: number } => {
  const pond = ((pondId && pondId in POND_DATA) ? pondId : DEFAULT_POND) as PondId;
  for (const zone of createCurrentZones(pond)) {
    const cos = Math.cos(zone.angle);
    const sin = Math.sin(zone.angle);
    const dx = p.x - zone.x;
    const dy = p.y - zone.y;
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    const alongLimit = zone.length / 2 + PORTAL_CONFIG.RADIUS + 60;
    const acrossLimit = zone.width / 2 + PORTAL_CONFIG.RADIUS + 60;
    if (Math.abs(along) >= alongLimit || Math.abs(across) >= acrossLimit) continue;
    const side = across < 0 ? -1 : 1;
    const pushedAcross = side * (acrossLimit + 20);
    return {
      x: zone.x + cos * along - sin * pushedAcross,
      y: zone.y + sin * along + cos * pushedAcross,
    };
  }
  return p;
};

/* ══════════════ 世界构建（初始化 / 跨塘重建时调用） ══════════════ */

export const createObstacles = (pondId?: string | null): Obstacle[] => {
  // 珊瑚塘礁石密布、深渊塘空旷 —— 由塘的 obstacleScale 决定
  const target = Math.max(8, Math.round(MAX_OBSTACLES * getPond(pondId).obstacleScale));
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < target * 1.5; i += 1) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    const radius = 60 + Math.random() * 220;
    // 整块障碍物（含边缘）都要在花瓣边界内，否则边缘会把鱼挤出地图
    if (!isPositionValid(x, y, radius + 80)) continue;
    // 洋流必须是一条真正可用的路线；随机巨石/珊瑚不能横在水道中间。
    if (intersectsCurrentKeepOut({ x, y }, radius + 35, pondId)) continue;

    // ⚠️ 拒绝深重叠：两块岩石叠出夹缝会把鱼卡死在里面（玩家和 AI 都中过招）
    let overlaps = false;
    for (const o of obstacles) {
      if (dist(o, { x, y }) < (o.radius + radius) * 0.7) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const biome = getBiome(x, y);
    let type: Obstacle['type'] = 'ROCK';
    if (biome === BiomeType.SHALLOWS) type = Math.random() < 0.2 ? 'CORAL' : 'ROCK';
    else if (biome === BiomeType.REEF) type = 'CORAL';
    else if (biome === BiomeType.SWAMP) type = 'SEAWEED';
    else type = 'ROCK';

    obstacles.push(configureObstacleEcology({ id: uuid(), x, y, radius, type }));
    if (obstacles.length >= target) break;
  }
  return obstacles;
};

/**
 * 按塘生成建筑：塘限定规则（`rule.pond`）只在所属塘生效，其余全塘生成。
 * 不传塘按默认塘处理（与开局缺省清水塘一致），保证结果确定性。
 */
export const createBuildings = (pondId?: string | null): Building[] => {
  const pond = ((pondId && pondId in POND_DATA) ? pondId : DEFAULT_POND) as PondId;
  const buildings: Building[] = [];
  for (const rule of BUILDING_SPAWN_RULES) {
    if (rule.pond && rule.pond !== pond) continue;
    const conf = BUILDING_DATA[rule.type];
    for (let i = 0; i < rule.count; i += 1) {
      const pos = getRandomPosInBiome(rule.biome);
      buildings.push({
        id: uuid(),
        x: pos.x,
        y: pos.y,
        type: rule.type,
        radius: conf.radius,
        cooldown: 0,
      });
    }
  }
  // 商场放在离出生点较远的浅滩深处。之前离出生点只有 565px，
  // 鱼一开局自动巡游 3 秒就撞进去，换装面板突然弹出把世界暂停（开局被"隔离"）
  buildings.push({
    id: 'shop-1',
    x: SHOP_POSITION.x,
    y: SHOP_POSITION.y,
    type: BuildingType.SHOP,
    radius: BUILDING_DATA.SHOP.radius,
    cooldown: 0,
  });
  return buildings;
};

export const createPortals = (pondId?: string | null): Portal[] => {
  const names = ['浅滩之门', '珊瑚之门', '沼泽之门', '深渊之门'];
  const biomes: BiomeType[] = [
    BiomeType.SHALLOWS,
    BiomeType.REEF,
    BiomeType.SWAMP,
    BiomeType.ABYSS,
  ];
  const locals: Portal[] = biomes.map((biome, i) => {
    // 塘内门是随机落点，必须避开固定商场（见 SHOP_PORTAL_KEEPOUT）：
    // 先重摇，摇不出来就沿「远离商场」的方向推到禁区外（保证门的数量不减）。
    let pos = getRandomPosInBiome(biome);
    for (let attempt = 0; attempt < 12 && (insideShopKeepOut(pos) || insideCurrentKeepOut(pos, pondId)); attempt += 1) {
      pos = getRandomPosInBiome(biome);
    }
    if (insideShopKeepOut(pos)) {
      const a = Math.atan2(pos.y - SHOP_POSITION.y, pos.x - SHOP_POSITION.x);
      const pushed = {
        x: SHOP_POSITION.x + Math.cos(a) * SHOP_PORTAL_KEEPOUT,
        y: SHOP_POSITION.y + Math.sin(a) * SHOP_PORTAL_KEEPOUT,
      };
      if (isPositionValid(pushed.x, pushed.y, PORTAL_CONFIG.RADIUS + 40)) pos = pushed;
    }
    if (insideCurrentKeepOut(pos, pondId)) {
      const pushed = pushOutsideCurrent(pos, pondId);
      if (isPositionValid(pushed.x, pushed.y, PORTAL_CONFIG.RADIUS + 40)) pos = pushed;
    }
    return {
      id: uuid(),
      x: pos.x,
      y: pos.y,
      radius: PORTAL_CONFIG.RADIUS,
      angle: 0,
      name: names[i],
      kind: 'LOCAL',
    };
  });

  // 塘际门：每个「别的塘」一扇，摆在塘中心周围一圈（角度分开，别叠在一起）
  const targets = otherPonds(pondId ?? DEFAULT_POND);
  const pondPortals: Portal[] = targets.map((targetId, i) => {
    const pond = getPond(targetId);
    const region = getOceanRegion(targetId);
    const baseAngle = (Math.PI * 2 * i) / Math.max(1, targets.length) + Math.PI * 0.25;
    let x = MAP_CENTER.x;
    let y = MAP_CENTER.y;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const a = baseAngle + attempt * 0.35;
      const r = POND_PORTAL_RING + attempt * 60;
      const px = MAP_CENTER.x + Math.cos(a) * r;
      const py = MAP_CENTER.y + Math.sin(a) * r;
      // 商场禁区同样适用：塘际门把人换到别的塘，落在商场旁边一样会把购物打断
      if (isPositionValid(px, py, POND_PORTAL_RADIUS + 60)
          && !insideShopKeepOut({ x: px, y: py })
          && !insideCurrentKeepOut({ x: px, y: py }, pondId)) {
        x = px;
        y = py;
        break;
      }
    }
    return {
      id: uuid(),
      x,
      y,
      radius: POND_PORTAL_RADIUS,
      angle: 0,
      name: `${region.name}·航门`,
      kind: 'POND',
      targetPond: targetId,
    };
  });

  return [...locals, ...pondPortals];
};

/* ══════════════ 塘际传送：重建世界 ══════════════ */

/**
 * 换塘：把世界换成目标塘的内容。
 *
 * 保留：玩家全部成长（体重/等级/技能/进化点数/装扮/分数/计时）与**战队成员**。
 * 重置：地形（障碍/门/建筑）、散落的鱼/道具/宝藏/危险事件/粒子/飘字。
 * 玩家回塘中心，带一段落地保护 —— 免得一落地就被隔壁大鱼当点心。
 *
 * @param ctx 传了才给新塘「铺底」撒一批鱼（单元测试里可以省掉）
 * @returns 是否真的发生了换塘
 */
export const pondTravel = (state: GameState, targetPondId?: string | null, ctx?: FrameContext): boolean => {
  if (!targetPondId) return false;
  const target = getPond(targetPondId);
  const targetId = targetPondId as PondId;
  if (targetId === state.pondId) return false;

  const player = state.player;

  // 战队跟着走：成员就是 entities 里 ownerId === 'player' 的活体，清场前先捞出来
  const squadMembers = state.entities.filter((e) => e.ownerId === 'player');

  state.pondId = targetId;
  state.obstacles = createObstacles(targetId);
  state.portals = createPortals(targetId);
  // 建筑按塘重建：目标塘的特产建筑在这里落地（阶段 3a）
  state.buildings = createBuildings(targetId);
  state.currents = createCurrentZones(targetId);
  if (state.exploration) {
    state.exploration.id = null;
    state.exploration.targetBuildingId = null;
    state.exploration.phase = 'IDLE';
    state.exploration.timer = 0;
    state.exploration.interactHeld = false;
    state.exploration.lastResult = null;
  }

  // 清场：鱼 / 道具 / 宝藏 / 危险事件 / 粒子 / 飘字 全部换成新塘的
  state.powerUps = [];
  state.treasures = [];
  state.hazards = [];
  state.particles = [];
  state.labels = [];
  state.entities = squadMembers;

  // 玩家回塘中心
  player.x = MAP_CENTER.x;
  player.y = MAP_CENTER.y;
  player.vx = 0;
  player.vy = 0;
  player.semiGhostTimer = 0;
  player.invulnerableTimer = POND_TRAVEL_PROTECTION;
  // ⚠️ 顺手把生态区同步掉：否则下一帧 worldSystem 会发一次「进入新海域」并写好气泡，
  // 把下面这句「进入 XX塘」顶掉（和当年商场气泡被顶掉是同一个坑）
  player.currentBiome = getBiome(player.x, player.y);
  player.speechBubble = { text: `抵达 ${getOceanRegion(targetId).name}`, timer: 90, color: target.color };

  // 战队成员围到玩家身边（下一帧由 squad 系统接管队形）
  squadMembers.forEach((m, i) => {
    const a = (Math.PI * 2 * i) / Math.max(1, squadMembers.length);
    m.x = player.x + Math.cos(a) * (m.radius + player.radius + 120);
    m.y = player.y + Math.sin(a) * (m.radius + player.radius + 120);
    m.semiGhostTimer = TREASURE_CONFIG.SEMI_GHOST_DURATION;
    m.speechBubble = null;
  });

  // 过场闪屏（GameCanvas 按 timer 递减绘制）
  state.screenFlash = { timer: POND_TRAVEL_FLASH, color: target.color };

  // 新塘别是空的：复用 spawnSystem 的规则撒一批（它本身吃 state.pondId）
  if (ctx) {
    for (let i = 0; i < POND_SEED_COUNT; i += 1) spawnSystem(state, ctx);
  }

  return true;
};

/* ══════════════ 每帧世界逻辑 ══════════════ */

/**
 * 玩家进入建筑时的效果。加新建筑只需在这里补一个 case。
 * 返回 false = 只是提示、没真正触发（不进冷却）；其他返回值 = 已触发。
 */
const BUILDING_EFFECTS: Record<string, (state: GameState, ctx: FrameContext, b: Building) => boolean | void> = {
  [BuildingType.HOSPITAL]: (state, ctx, b) => {
    state.player.health = state.player.maxHealth;
    ctx.events.emit('building', { x: b.x, y: b.y, label: '生命已恢复！', color: '#ef4444' });
  },
  [BuildingType.SHRINE]: (state, ctx, b) => {
    // 随机祝福：技能等级 +1 或 获得护盾
    if (Math.random() < 0.5) {
      state.player.skillLevel += 1;
      ctx.events.emit('building', { x: b.x, y: b.y, label: '龙王庇佑：技能 +1', color: '#8b5cf6' });
    } else {
      state.player.shieldTimer = 600;
      ctx.events.emit('building', { x: b.x, y: b.y, label: '龙王庇佑：获得护盾', color: '#8b5cf6' });
    }
  },
  [BuildingType.SHOP]: (state, ctx, b) => {
    // 必须按 E 才进商场：商场会把整个世界暂停弹面板，路过就被劫持太恶心了。
    // 提示画在**商场脚下**（b.prompt），不再写 player.speechBubble ——
    // 那个槽位战斗也在用（升级/吞噬/夺舍），互相顶掉，这就是路线图挂着的遗留 bug。
    // （不画头顶是因为顶部的「宝贝倒计时」HUD 面板正好压在那儿。）
    const risingE = ctx.input.interact && !prevInteract;
    if (!risingE) {
      b.prompt = { text: '按 E 进入商场换装', color: '#ec4899' };
      return false; // ⚠️ 只提示不触发：不能吃冷却，否则按 E 会连续 10 秒无效
    }
    b.prompt = null; // 真进去了就别再挂着提示
    state.status = GameStatus.SHOP;
    ctx.events.emit('building', { x: b.x, y: b.y, label: '深海商场', color: '#ec4899' });
    return true;
  },

  /* ── 塘特产建筑（阶段 3a）── */

  /** 清水塘 · 许愿池：投一枚硬币，稳定换回金币（龙王庙的随机祝福的确定性版） */
  [BuildingType.WISHING_WELL]: (state, ctx, b) => {
    const gained = scoreGain(state.pondId, 15);
    state.score += gained;
    state.player.speechBubble = { text: `许愿成功 +${gained} 金币！`, timer: 60, color: '#f59e0b' };
    ctx.events.emit('coin', { x: b.x, y: b.y, value: gained });
    ctx.events.emit('building', { x: b.x, y: b.y, label: '许愿池赐福', color: '#f59e0b' });
  },

  /** 珊瑚塘 · 珍珠养殖场：珍珠开了，一圈金币滚出来（走 COIN 拾取，吃得到才算） */
  [BuildingType.PEARL_FARM]: (state, ctx, b) => {
    for (let i = 0; i < 4; i += 1) {
      const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.8;
      const d = 40 + Math.random() * 70;
      state.powerUps.push({
        id: uuid(),
        x: b.x + Math.cos(ang) * d,
        y: b.y + Math.sin(ang) * d,
        type: 'COIN',
        radius: 14,
      });
    }
    ctx.events.emit('building', { x: b.x, y: b.y, label: '珍珠丰收！', color: '#cbd5e1' });
  },

  // 沉船由 explorationEvents 接管：旧版“游进去立即领奖”已替换为按 E 持续搜索。
};

/** E 键上升沿检测（每帧末尾更新）：按住不放只触发一次 */
let prevInteract = false;

/** 传送门冷却：防止刚传送过去又被吸回来，形成死循环 */
let teleportLockUntilFrame = -1;

/**
 * 重置传送冷却。⚠️ 这是模块级状态，会在**单测用例之间泄漏**
 * （前一个用例把锁设到 time+120，后一个用例 time 从 0 开始就被锁住了）。
 * 与 squad 的 `__resetSwitchCursor` 同款处理：用例开头调一次。
 */
export const __resetTeleportLock = (): void => {
  teleportLockUntilFrame = -1;
};

/**
 * 障碍物宽相位索引（模块级复用，避免每帧 new）。
 * ⚠️ 测试需要隔离状态时调 `__resetObstacleIndex()` 重建 —— 和 teleportLock 一个道理。
 */
let obstacleIndex = new ObstacleIndex();

/** 测试/探针用：把模块级可变状态恢复到初始（见 teleportLockUntilFrame 的先例） */
export const __resetObstacleIndex = (): void => {
  obstacleIndex = new ObstacleIndex();
};

export const worldSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;

  /* ── 0. 过场闪屏计时（塘际传送用，渲染层只读不写） ── */
  if (state.screenFlash) {
    state.screenFlash.timer -= 1;
    if (state.screenFlash.timer <= 0) state.screenFlash = null;
  }

  /* ── 1. 生态区归属与效果 ── */
  const biome = getBiome(player.x, player.y);
  if (biome !== player.currentBiome) {
    const from = player.currentBiome;
    player.currentBiome = biome;
    ctx.events.emit('biome', { from, to: biome });
    player.speechBubble = {
      text: BIOME_DATA[biome]?.name ?? '未知海域',
      timer: 60,
      color: BIOME_DATA[biome]?.color ?? '#38bdf8',
    };
  }

  const effect = BIOME_EFFECTS[biome];
  if (effect && effect.corrosionPerFrame > 0) {
    // 沼泽腐蚀：硬壳体质免疫
    if (player.config.special !== 'SHELL') {
      // ⚠️ 必须走统一伤害入口：原来直接 `player.health -=` 绕过了 dealDamage，
      //    无敌模式 / 无敌帧（新手保护、闪避、复活保护）/ 护盾 / 易伤全部失效 ——
      //    开着无敌在沼泽里每秒仍被扣 4.8% 最大生命，约 20 秒就「战斗失败」
      //    （用户报「无敌还会失败」的直接元凶）。
      dealDamage(player, player.maxHealth * effect.corrosionPerFrame);
      player.biomeDebuffTimer = 30;
    }
  }
  if (player.biomeDebuffTimer > 0) player.biomeDebuffTimer--;

  /* ── 2. 建筑交互 ── */
  for (const b of state.buildings) {
    // 先清上一帧的提示：本帧不在交互圈里就不该再显示（写入方只在进圈时赋值）
    b.prompt = null;
    if (b.cooldown > 0) {
      b.cooldown--;
      continue;
    }
    // 商场用 1.5 倍交互圈：鱼游得快，圈太小会直接冲过去，提示都看不清
    const range = b.type === BuildingType.SHOP ? b.radius * 1.5 : b.radius;
    if (dist(player, b) > range) continue;
    const handler = BUILDING_EFFECTS[b.type];
    if (!handler) continue;
    const triggered = handler(state, ctx, b);
    if (triggered === false) continue; // 提示帧不吃冷却，否则按 E 会长时间无效
    // 真触发才发埋点（供成就统计）。刻意不复用 'building'：那个已被 audio 订阅，
    // 再发一次会让一次触发播两遍音效
    ctx.events.emit('buildingUse', { type: b.type });
    b.cooldown = BUILDING_CONFIGS[b.type as keyof typeof BUILDING_CONFIGS]?.cooldown ?? 600;
    for (let i = 0; i < 15; i += 1) {
      state.particles.push(createParticle(b.x, b.y, BUILDING_DATA[b.type as BuildingType]?.color ?? '#fff'));
    }
  }

  /* ── 3. 传送门（塘内 / 塘际） ── */
  if (state.time > teleportLockUntilFrame) {
    for (const portal of state.portals) {
      if (dist(player, portal) > portal.radius) continue;

      // 塘际门：整个换成目标塘的世界
      if (portal.kind === 'POND') {
        const targetColor = getPond(portal.targetPond).color;
        for (let i = 0; i < 30; i += 1) {
          state.particles.push(createParticle(player.x, player.y, targetColor));
        }
        const traveled = pondTravel(state, portal.targetPond, ctx);
        if (traveled) teleportLockUntilFrame = state.time + 120;
        break;
      }

      // 塘内门：只在**塘内门**里挑目标。
      // ⚠️ 不能把塘际门算进来 —— 否则随机传送会把你丢到塘际门上，下一帧被动换塘。
      const locals = state.portals.filter(
        (p) => p.id !== portal.id && (p.kind ?? 'LOCAL') === 'LOCAL'
      );
      if (locals.length === 0) continue;
      const target = pick(locals) as Portal;
      for (let i = 0; i < 20; i += 1) {
        state.particles.push(createParticle(player.x, player.y, '#d8b4fe'));
      }
      player.x = target.x + Math.cos(Math.random() * Math.PI * 2) * (target.radius + player.radius + 20);
      player.y = target.y + Math.sin(Math.random() * Math.PI * 2) * (target.radius + player.radius + 20);
      player.speechBubble = { text: `${target.name ?? '传送门'}！`, timer: 60, color: '#d8b4fe' };
      teleportLockUntilFrame = state.time + 90;
      break;
    }
  }

  /* ── 4. 障碍物与边界（玩家 + 所有鱼）──
     先推障碍物再拉边界：边界拥有最终决定权，障碍物永远不会把鱼挤到地图外

     ⚠️ 水草(SEAWEED)**不参与碰撞** —— 它是植物，得能游进去才叫「躲进水草」。
        以前它混在列表里被 resolveObstacles 一起推开，玩家物理上根本进不去，
        这就是「水草不能躲避追杀」的根因之一。
        水草仍留在 `state.obstacles` 里，继续供渲染和隐蔽判定（systems/concealment.ts）使用。
        这里每帧 filter 一次（80 个元素）换来的可读性，比省那点分配划算。 */
  const obstacles = state.obstacles;
  const isBattleTest = state.status === 'BATTLE_TEST';
  const solidObstacles = obstacles.filter((o) => o.type !== 'SEAWEED' && o.featureState !== 'BROKEN');

  // 障碍物宽相位索引（四叉树）：把「每个实体 × 全部障碍 × 2 遍」的盲扫
  // 缩成「每个实体 × 附近那几个」。性能基线量出这块占逻辑层 ~29%（~0.5ms/帧）。
  // 每帧重建（几十微秒）换来「树永远和本帧一致」，行为与全量扫描完全一致（见 ObstacleIndex）。
  obstacleIndex.rebuild(solidObstacles);

  if (solidObstacles.length) resolveObstacles(player, solidObstacles, obstacleIndex);
  clampToMap(player, isBattleTest);

  for (const e of state.entities) {
    if (solidObstacles.length) resolveObstacles(e, solidObstacles, obstacleIndex);
    clampToMap(e, isBattleTest);
  }

  /* ── 5. E 键状态记录（供下一帧上升沿检测） ── */
  prevInteract = ctx.input.interact;
};

export { DEFAULT_COSMETICS, METEOR_CONFIG };
