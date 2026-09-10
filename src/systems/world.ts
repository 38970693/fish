/**
 * 世界系统 —— 生态区、建筑、传送门、障碍物。
 *
 * 这一整块在重构前基本是空壳：
 *   - BIOME_CONFIGS 写了四套加成，但 player.currentBiome 从初始化后就没人更新过
 *   - 建筑生成了 5 座，既不渲染也没有任何交互
 *   - 传送门只画了个圈，走过去没有任何反应
 *   - 障碍物生成了 80 个，既看不见也撞不到
 * 现在全部在这里落地。
 */

import { MAX_OBSTACLES, WORLD_SIZE, BUILDING_CONFIGS, PORTAL_CONFIG, METEOR_CONFIG } from '../data/world';
import { BIOME_DATA, BIOME_EFFECTS, BiomeType } from '../data/biomes';
import { BUILDING_DATA, BUILDING_SPAWN_RULES, BuildingType } from '../data/buildings';
import { DEFAULT_COSMETICS, GameStatus, type Building, type GameState, type FrameContext, type Obstacle, type Portal } from '../types';
import { uuid, dist, pick } from '../core/math';
import { getBiome, getRandomPosInBiome, isPositionValid, clampToMap, resolveObstacles, MAP_CENTER } from './terrain';
import { createParticle } from './combat';

/* ══════════════ 世界构建（初始化时调用一次） ══════════════ */

export const createObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < MAX_OBSTACLES * 1.5; i += 1) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    const radius = 60 + Math.random() * 220;
    // 整块障碍物（含边缘）都要在花瓣边界内，否则边缘会把鱼挤出地图
    if (!isPositionValid(x, y, radius + 80)) continue;

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

    obstacles.push({ id: uuid(), x, y, radius, type });
    if (obstacles.length >= MAX_OBSTACLES) break;
  }
  return obstacles;
};

export const createBuildings = (): Building[] => {
  const buildings: Building[] = [];
  for (const rule of BUILDING_SPAWN_RULES) {
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
    x: MAP_CENTER.x - 1500,
    y: MAP_CENTER.y - 1500,
    type: BuildingType.SHOP,
    radius: BUILDING_DATA.SHOP.radius,
    cooldown: 0,
  });
  return buildings;
};

export const createPortals = (): Portal[] => {
  const names = ['浅滩之门', '珊瑚之门', '沼泽之门', '深渊之门'];
  const biomes: BiomeType[] = [
    BiomeType.SHALLOWS,
    BiomeType.REEF,
    BiomeType.SWAMP,
    BiomeType.ABYSS,
  ];
  return biomes.map((biome, i) => {
    const pos = getRandomPosInBiome(biome);
    return {
      id: uuid(),
      x: pos.x,
      y: pos.y,
      radius: PORTAL_CONFIG.RADIUS,
      angle: 0,
      name: names[i],
    };
  });
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
};

/** E 键上升沿检测（每帧末尾更新）：按住不放只触发一次 */
let prevInteract = false;

/** 传送门冷却：防止刚传送过去又被吸回来，形成死循环 */
let teleportLockUntilFrame = -1;

export const worldSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;

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
      player.health -= player.maxHealth * effect.corrosionPerFrame;
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
    b.cooldown = BUILDING_CONFIGS[b.type as keyof typeof BUILDING_CONFIGS]?.cooldown ?? 600;
    for (let i = 0; i < 15; i += 1) {
      state.particles.push(createParticle(b.x, b.y, BUILDING_DATA[b.type as BuildingType]?.color ?? '#fff'));
    }
  }

  /* ── 3. 传送门 ── */
  if (state.time > teleportLockUntilFrame) {
    for (const portal of state.portals) {
      if (dist(player, portal) > portal.radius) continue;
      const others = state.portals.filter((p) => p.id !== portal.id);
      if (others.length === 0) break;
      const target = pick(others) as Portal;
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
     先推障碍物再拉边界：边界拥有最终决定权，障碍物永远不会把鱼挤到地图外 */
  const obstacles = state.obstacles;
  const isBattleTest = state.status === 'BATTLE_TEST';

  if (obstacles.length) resolveObstacles(player, obstacles);
  clampToMap(player, isBattleTest);

  for (const e of state.entities) {
    if (obstacles.length) resolveObstacles(e, obstacles);
    clampToMap(e, isBattleTest);
  }

  /* ── 5. E 键状态记录（供下一帧上升沿检测） ── */
  prevInteract = ctx.input.interact;
};

export { DEFAULT_COSMETICS, METEOR_CONFIG };
