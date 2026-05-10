
import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal, BiomeType, Building, BuildingType, Treasure, Cosmetics } from './types';
import { QuadTree } from './utils/SpatialHash';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const EAT_PHRASES = ["捕获!", "进框!", "收!", "拿来吧你!", "喜加一!"];
const HURT_PHRASES = ["疼!", "哎哟!", "别吃我!", "救命!", "好痛!", "卡喉咙了!"];
const SQUAD_PHRASES = ["老大!", "跟你混了!", "誓死效忠!", "冲啊!", "战队+1"];
const PANIC_PHRASES = ["巨物恐惧!", "快逃!", "太大了!", "看不见我...", "妈耶!"];
const AMBUSH_PHRASES = ["偷袭!", "背刺!", "千年杀!", "不讲武德!"];
const ANGRY_PHRASES = ["别跑!", "站住!", "你瞅啥?", "吼!!", "小别致!"];

const getRandomPhrase = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export const createParticle = (x: number, y: number, color: string): Particle => ({
  id: uuid(),
  x,
  y,
  vx: (Math.random() - 0.5) * 4,
  vy: (Math.random() - 0.5) * 4,
  life: 1.0,
  maxLife: 1.0,
  color,
  size: Math.random() * 3 + 2
});

export const getMapBoundaryRadius = (angle: number): number => {
    const variance = MAP_SHAPE_CONFIG.PETAL_VARIANCE * Math.abs(Math.sin(2 * angle));
    return MAP_SHAPE_CONFIG.BASE_RADIUS + variance;
};

const isPositionValid = (x: number, y: number, buffer: number = 0): boolean => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const cx = MAP_SHAPE_CONFIG.CENTER_X;
    const cy = MAP_SHAPE_CONFIG.CENTER_Y;
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const maxR = getMapBoundaryRadius(angle);
    return distance < maxR - buffer;
};

const clampToMap = (entity: {x: number, y: number, radius: number, angle: number, vx?: number, vy?: number}, isBattleTest?: boolean) => {
    const cx = MAP_SHAPE_CONFIG.CENTER_X;
    const cy = MAP_SHAPE_CONFIG.CENTER_Y;

    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
        entity.x = cx;
        entity.y = cy;
        return;
    }

    const dx = entity.x - cx;
    const dy = entity.y - cy;
    const currentDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    // 如果是战斗测试，限制在中心的小区域内
    const maxR = isBattleTest ? 800 : getMapBoundaryRadius(angle);

    // 边界缓冲区域：增大缓冲，让鱼不会在边界处反复横跳
    const boundaryBuffer = Math.max(entity.radius * 3, 150); // 增大到150px基础缓冲
    const limit = maxR - entity.radius;
    const softLimit = maxR - entity.radius - boundaryBuffer; // 软限制，开始减速区域

    // 硬限制：超过此距离才强制推送
    const hardLimit = maxR - entity.radius - 5;

    if (currentDist > limit) {
        // 在边界外，直接推回
        const correctedDist = Math.max(limit - boundaryBuffer, limit * 0.95);
        entity.x = cx + Math.cos(angle) * correctedDist;
        entity.y = cy + Math.sin(angle) * correctedDist;

        if (entity.vx !== undefined && entity.vy !== undefined) {
            // 计算朝向中心的角度
            const angleToCenter = Math.atan2(cy - entity.y, cx - entity.x);

            // 使用平滑的速度反转，而不是随机
            const dotProduct = entity.vx * Math.cos(angleToCenter) + entity.vy * Math.sin(angleToCenter);

            // 只有当速度朝向边界外时才反转
            if (dotProduct > 0) {
                // 计算垂直分量用于平滑转向
                const perpX = -Math.sin(angleToCenter);
                const perpY = Math.cos(angleToCenter);
                const perpDot = entity.vx * perpX + entity.vy * perpY;

                // 朝向中心反弹，加上原有的切向速度（平滑过渡）
                // 使用更大的平滑系数，让转向更自然
                const smoothFactor = 0.5;
                entity.vx = -Math.abs(entity.vx) * smoothFactor * Math.cos(angleToCenter) + perpX * perpDot * (1 - smoothFactor);
                entity.vy = -Math.abs(entity.vy) * smoothFactor * Math.sin(angleToCenter) + perpY * perpDot * (1 - smoothFactor);
            }

            // 平滑的角度调整，朝向中心（增大平滑系数）
            entity.angle = angleToCenter + (entity.angle - angleToCenter) * 0.6;
        }
    } else if (currentDist > softLimit) {
        // 在软限制区域（边界附近），平滑减速而不是突然反弹
        if (entity.vx !== undefined && entity.vy !== undefined) {
            const penetrationRatio = (currentDist - softLimit) / (limit - softLimit);
            // 更温和的减速因子，减少抖动
            const slowFactor = Math.max(0.4, 1 - penetrationRatio * 0.6);

            // 平滑降低速度分量，朝向中心方向
            const angleToCenter = Math.atan2(cy - entity.y, cx - entity.x);
            const dotProduct = entity.vx * Math.cos(angleToCenter) + entity.vy * Math.sin(angleToCenter);

            if (dotProduct > 0) {
                entity.vx -= Math.cos(angleToCenter) * dotProduct * (1 - slowFactor) * 0.3;
                entity.vy -= Math.sin(angleToCenter) * dotProduct * (1 - slowFactor) * 0.3;
            }

            // 平滑调整角度（更大的平滑系数）
            entity.angle = angleToCenter + (entity.angle - angleToCenter) * (0.5 + slowFactor * 0.5);
        }
    }
};

const getBiome = (x: number, y: number): BiomeType => {
  const half = WORLD_SIZE / 2;
  if (x < half && y < half) return BiomeType.SHALLOWS;
  if (x >= half && y < half) return BiomeType.REEF;
  if (x < half && y >= half) return BiomeType.SWAMP;
  return BiomeType.ABYSS;
};

const getRandomPosInBiome = (biome: BiomeType) => {
    let baseAngle = 0;
    if (biome === BiomeType.SHALLOWS) baseAngle = -3 * Math.PI / 4; 
    else if (biome === BiomeType.REEF) baseAngle = -Math.PI / 4;    
    else if (biome === BiomeType.SWAMP) baseAngle = 3 * Math.PI / 4; 
    else baseAngle = Math.PI / 4;                                   
    
    const maxR = MAP_SHAPE_CONFIG.BASE_RADIUS + MAP_SHAPE_CONFIG.PETAL_VARIANCE * 0.8;
    const r = 500 + Math.random() * (maxR - 800);
    const a = baseAngle + (Math.random() - 0.5) * 0.5;
    
    return {
        x: MAP_SHAPE_CONFIG.CENTER_X + Math.cos(a) * r,
        y: MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(a) * r
    };
};

export const createEntity = (type: CreatureType, x: number, y: number): Entity => {
  const config = CREATURES[type];
  return {
    id: uuid(),
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: config.baseRadius,
    angle: Math.random() * Math.PI * 2,
    health: config.health,
    maxHealth: config.health,
    speed: config.speed,
    config,
    mouthOpenValue: 0,
    isHidden: false,
    isIdle: false,
    lureActive: false,
    camoActive: false,
    ambushTimer: 0,
    animOffset: Math.random() * 100,
    renderScale: 1.0,
    isInvulnerable: false,
    aggroTimer: 0,
    speedBoostTimer: 0,
    happyTimer: 0,
    fearTimer: 0,
    speechBubble: null,
    evolutionVisualTimer: 0,
    level: config.tier + 1, // Basic level assignment
    cosmetics: {
        teeth: 'NORMAL', skinColor: 'DEFAULT', pattern: 'NONE', scaleType: 'NONE', accessory: 'NONE',
        tailType: 'DEFAULT', bodyType: 'DEFAULT', mouthType: 'TRIANGLE', eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE'
    },
    // 新生成的鱼有3秒半虚状态保护
    semiGhostTimer: TREASURE_CONFIG.SEMI_GHOST_DURATION
  };
};

export const createObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < MAX_OBSTACLES * 1.5; i++) { 
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    if (!isPositionValid(x, y, 150)) continue;

    const biome = getBiome(x, y);
    let type: 'ROCK' | 'CORAL' | 'SEAWEED' = 'ROCK';
    if (biome === BiomeType.SHALLOWS) type = Math.random() < 0.2 ? 'CORAL' : 'ROCK';
    else if (biome === BiomeType.REEF) type = 'CORAL';
    else if (biome === BiomeType.SWAMP) type = 'SEAWEED';
    else type = 'ROCK'; 

    const radius = 60 + Math.random() * 220; 
    obstacles.push({ id: uuid(), x, y, radius, type });
    if (obstacles.length >= MAX_OBSTACLES) break;
  }
  return obstacles;
};

export const createBuildings = (): Building[] => {
    const buildings: Building[] = [];
    const spawn = (type: BuildingType, biome: BiomeType, count: number) => {
        const conf = BUILDING_CONFIGS[type];
        for(let i=0; i<count; i++) {
            const pos = getRandomPosInBiome(biome);
            buildings.push({
                id: uuid(), x: pos.x, y: pos.y, type: type, radius: conf.radius, cooldown: 0
            });
        }
    };
    spawn(BuildingType.HOSPITAL, BiomeType.SHALLOWS, 1);
    spawn(BuildingType.HOSPITAL, BiomeType.REEF, 1);
    spawn(BuildingType.SHRINE, BiomeType.SWAMP, 1);
    spawn(BuildingType.SHRINE, BiomeType.REEF, 1);
    buildings.push({
        id: 'shop-1', x: MAP_SHAPE_CONFIG.CENTER_X - 400, y: MAP_SHAPE_CONFIG.CENTER_Y - 400, type: BuildingType.SHOP, radius: BUILDING_CONFIGS.SHOP.radius, cooldown: 0
    });
    return buildings;
};

export const createPortals = (): Portal[] => {
    const portals: Portal[] = [];
    const names = ['浅滩之门', '珊瑚之门', '沼泽之门', '深渊之门'];
    const biomes = [BiomeType.SHALLOWS, BiomeType.REEF, BiomeType.SWAMP, BiomeType.ABYSS];
    biomes.forEach((biome, i) => {
        const pos = getRandomPosInBiome(biome);
        portals.push({ id: uuid(), x: pos.x, y: pos.y, radius: PORTAL_CONFIG.RADIUS, angle: 0, name: names[i] });
    });
    return portals;
};

export const digestBasket = (state: GameState) => {
    const { player } = state;
    if (!player.basket || player.basket.length === 0) return;
    let totalWeight = 0;
    player.basket.forEach(item => {
        totalWeight += item.totalWeight;
        player.eatenHistory[item.type] = (player.eatenHistory[item.type] || 0) + item.count;
    });
    if (totalWeight > 0) {
        player.weight += totalWeight;
        player.evolutionPoints += totalWeight;
        player.health = Math.min(player.maxHealth, player.health + totalWeight * 2);
        player.basket = [];
        player.speechBubble = { text: "消化!", timer: 60, color: '#bef264' };
        player.happyTimer = 90;
        for(let i=0; i<20; i++) state.particles.push(createParticle(player.x, player.y, '#bef264'));
    }
};

const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities, hazards, obstacles, treasures } = state;
  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;

  // 更新半虚状态
  if (entity.semiGhostTimer && entity.semiGhostTimer > 0) entity.semiGhostTimer--;

  if (entity.type === CreatureType.MASCOT) {
      entity.y += Math.sin(state.time * 0.05) * 1.5;
      return;
  }

  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));

  let targetAngle = entity.angle;
  let finalSpeed = entity.speed;

  // AI 逻辑：如果玩家使用了”诱惑”技能（变成肉块），且AI鱼由于比玩家小本该逃跑，现在被骗过来吃
  if (player.lureActive && player.level > entity.level) {
      let dx = player.x - entity.x;
      let dy = player.y - entity.y;
      targetAngle = Math.atan2(dy, dx);
      finalSpeed *= 1.5; // 被肉块诱惑，加速冲向玩家
  } else {
      // 检查附近是否有宝物，有则奔向宝物
      let hasTreasureTarget = false;
      for (const treasure of treasures) {
          if (treasure.status === 'ACTIVE' && dist(entity, treasure) < TREASURE_CONFIG.SWARM_DETECTION_RANGE) {
              // 奔向宝物
              const dx = treasure.x - entity.x;
              const dy = treasure.y - entity.y;
              targetAngle = Math.atan2(dy, dx);
              finalSpeed *= TREASURE_CONFIG.SWARM_SPEED_BOOST; // 加速
              hasTreasureTarget = true;
              break;
          }
      }

      if (!hasTreasureTarget) {
          // 简化版AI，始终追逐玩家（战斗测试核心）
          let dx = player.x - entity.x;
          let dy = player.y - entity.y;
          targetAngle = Math.atan2(dy, dx);

          // 如果玩家比自己大，逃跑
          if (player.level > entity.level) {
              targetAngle += Math.PI; // 反向逃跑
              finalSpeed *= 1.1;
          }
      }
  }

  let angleDiff = targetAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;

  entity.vx = Math.cos(entity.angle) * finalSpeed;
  entity.vy = Math.sin(entity.angle) * finalSpeed;
  entity.x += entity.vx; entity.y += entity.vy;

  clampToMap(entity, state.status === GameStatus.BATTLE_TEST);
};

const processCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[], state: GameState) => {
  if (attacker.type === CreatureType.MASCOT || victim.type === CreatureType.MASCOT) return;
  const isFriendly = (e: Entity | PlayerState) => e.id === 'player' || ('ownerId' in e && e.ownerId === 'player');
  if (isFriendly(attacker) && isFriendly(victim)) return;

  // 同类不能互吃
  if (attacker.type === victim.type) return;

  // 半虚状态保护：新生成的鱼不能被吃也不能吃别人
  const attackerIsSemiGhost = 'semiGhostTimer' in attacker && attacker.semiGhostTimer && attacker.semiGhostTimer > 0;
  const victimIsSemiGhost = 'semiGhostTimer' in victim && victim.semiGhostTimer && victim.semiGhostTimer > 0;
  if (attackerIsSemiGhost || victimIsSemiGhost) return;

  // 计算距离
  const distance = dist(attacker, victim);

  // 限制偷袭检测范围
  if (distance > AMBUSH_CONFIG.DETECTION_RANGE_MAX || distance < AMBUSH_CONFIG.DETECTION_RANGE_MIN * 0.5) {
    // 超出范围时只有直接碰撞才能吃
    if (distance > attacker.radius + victim.radius) return;
  }

  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  
  // 检查是否为背面攻击（偷袭）
  const isBackAttack = Math.abs(angleDiff) > AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD;
  const canEatForward = Math.abs(angleDiff) <= Math.PI / 3;
  
  // 如果不是正面也不是背面，不处理
  if (!canEatForward && !isBackAttack) return;

  // 计算体型比例
  const sizeRatio = attacker.radius / victim.radius;
  
  // 判断是否可以从背后偷袭成功
  let canEat = false;
  let eatProbability = 0;
  let damageMultiplier = 1.0;
  
  if (sizeRatio >= 2) {
    // 大2倍以上：80% 直接吞噬（背面再加成）
    eatProbability = AMBUSH_CONFIG.EAT_PROBABILITY.DOUBLE_OR_MORE;
    if (isBackAttack) eatProbability = Math.min(1, eatProbability + 0.15);
  } else if (sizeRatio >= 1.5) {
    // 大1.5倍：30% 概率吞噬
    eatProbability = AMBUSH_CONFIG.EAT_PROBABILITY.ONE_HALF_OR_MORE;
    if (isBackAttack) eatProbability += 0.2;
  } else if (sizeRatio >= 1.2) {
    // 大1.2倍：10% 概率吞噬
    eatProbability = AMBUSH_CONFIG.EAT_PROBABILITY.ONE_FIFTH_OR_MORE;
    if (isBackAttack) eatProbability += 0.15;
  } else {
    // 大小相近：5% 概率（背面加成更少）
    eatProbability = AMBUSH_CONFIG.EAT_PROBABILITY.SIMILAR;
    if (isBackAttack) eatProbability += 0.1;
  }
  
  // 同等级下大鱼吃小鱼（小丑鱼除外）
  if (attacker.level === victim.level && attacker.radius > victim.radius) {
    eatProbability = Math.max(eatProbability, 0.5);
  }
  if (attacker.level === victim.level && victim.type === CreatureType.CLOWN_FISH && attacker.type !== CreatureType.CLOWN_FISH) {
    eatProbability = 0.7;
  }
  
  // 等级压制：等级高的吃等级低的
  if (attacker.level > victim.level) {
    const levelDiff = attacker.level - victim.level;
    eatProbability = Math.min(1, eatProbability + levelDiff * 0.15);
  }
  
  // 随机判定
  canEat = Math.random() < eatProbability;
  
  // 背刺额外伤害
  if (isBackAttack && !canEat) {
    // 即使没吃掉，背刺也能造成伤害
    damageMultiplier = AMBUSH_CONFIG.BACK_DAMAGE_MULT;
  }
  
  if (canEat) {
    victim.health = 0;
    const attackerIsPlayer = attacker.id === 'player';
    const victimIsPlayer = victim.id === 'player';
    
    // 检查是否为逆转（小鱼反杀大鱼）
    if (sizeRatio < AMBUSH_CONFIG.REVERSAL_SIZE_THRESHOLD && !attackerIsPlayer && victimIsPlayer) {
      // 小鱼反杀大鱼！触发逆转特效
      state.labels.push({
        x: victim.x,
        y: victim.y - 50,
        text: REVERSAL_PHRASE,
        color: '#ef4444'
      });
      // 逆转粒子特效
      for (let i = 0; i < 30; i++) {
        particles.push(createParticle(victim.x, victim.y, '#fcd34d'));
        particles.push(createParticle(victim.x, victim.y, '#ef4444'));
      }
      state.score += Math.floor(victim.radius * 10);
    }
    
    // 背刺成功提示
    if (isBackAttack && attackerIsPlayer) {
      attacker.speechBubble = { text: getRandomPhrase(AMBUSH_PHRASES), timer: 45, color: '#ef4444' };
      for (let i = 0; i < 10; i++) particles.push(createParticle(attacker.x, attacker.y, '#ef4444'));
    }
    
    if (attackerIsPlayer) {
      const pState = attacker as PlayerState;
      pState.weight += victim.config.weightValue;
      pState.evolutionPoints += victim.config.weightValue;
      pState.eatenHistory[victim.type] = (pState.eatenHistory[victim.type] || 0) + 1;
      
      attacker.health = Math.min(attacker.maxHealth, attacker.health + victim.config.weightValue * 2);
      attacker.speechBubble = { text: getRandomPhrase(EAT_PHRASES), timer: 45, color: '#bef264' };
      
      // 更新玩家等级
      const prevLevel = (attacker as PlayerState).level;
      const newLevel = Math.floor((attacker as PlayerState).weight / 10) + 1;
      if (newLevel > prevLevel) {
        (attacker as PlayerState).level = newLevel;
        (attacker as PlayerState).radius += 2;
        attacker.speechBubble = { text: `升级至 Lv.${newLevel}!`, timer: 60, color: '#fcd34d' };
      }
    } else if (victimIsPlayer) {
      // 玩家被吃
      state.labels.push({
        x: attacker.x,
        y: attacker.y - 50,
        text: getRandomPhrase(EAT_PHRASES),
        color: '#ef4444'
      });
    }
  } else if (damageMultiplier > 1.0) {
    // 背刺造成伤害但没吃掉
    const damage = victim.maxHealth * 0.3 * damageMultiplier;
    victim.health -= damage;
    victim.fearTimer = 60;
    if (attacker.id === 'player') {
      attacker.speechBubble = { text: getRandomPhrase(AMBUSH_PHRASES), timer: 30, color: '#fcd34d' };
    }
  }
  
  if (attacker.radius > victim.radius * 1.1) {
    attacker.renderScale = 1.1;
    attacker.happyTimer = 30;
  }
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, isRightMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  if (state.status === GameStatus.MENU || state.status === GameStatus.EVOLVING) return state;
  state.time++;

  if (state.status === GameStatus.PLAYING && state.entities.length < MAX_ENTITIES) {
      // Determine what to spawn based on player's level
      const playerLevel = state.player.level;
      let typeToSpawn = CreatureType.PLANKTON;
      
      const r = Math.random();
      
      // Increased chance to spawn plankton if we are just starting
      if (r < 0.4) {
          typeToSpawn = CreatureType.PLANKTON;
      } else {
         // Determine max tier to spawn. Cap it at player's level + 1, max tier 4
         const maxTier = Math.min(4, Math.floor(playerLevel / 2) + 1);
         // Randomly select a tier from 1 to maxTier
         const targetTier = Math.floor(Math.random() * maxTier) + 1;
         
         const tier1 = [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.TURTLE, CreatureType.JELLYFISH];
         const tier2 = [CreatureType.SEAHORSE, CreatureType.CRAB, CreatureType.PUFFER_FISH, CreatureType.SQUID, CreatureType.ELECTRIC_EEL];
         const tier3 = [CreatureType.STINGRAY, CreatureType.SWORD_FISH, CreatureType.ANGLER_FISH, CreatureType.HAMMERHEAD, CreatureType.AROWANA, CreatureType.FUR_SEAL];
         const tier4 = [CreatureType.GREAT_WHITE, CreatureType.ORCA, CreatureType.NARWHAL, CreatureType.MERMAID, CreatureType.KRAKEN];
         
         let pool = tier1;
         if (targetTier === 2) pool = tier2;
         if (targetTier === 3) pool = tier3;
         if (targetTier === 4) pool = tier4;
         
         typeToSpawn = pool[Math.floor(Math.random() * pool.length)];
      }

      const spawnX = Math.random() * WORLD_SIZE, spawnY = Math.random() * WORLD_SIZE;
      if (isPositionValid(spawnX, spawnY, 50)) state.entities.push(createEntity(typeToSpawn, spawnX, spawnY));
  }

  const { player, entities, particles, obstacles } = state;
  
  // 玩家控制
  let targetAngle = Math.atan2(mouse.y - screenHeight / 2, mouse.x - screenWidth / 2);
  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  let angleDiff = targetAngle - player.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  player.angle += angleDiff * agility;
  
  let speedMult = player.stats.speedMult;
  if (isSpacePressed && player.boost.current > 0) {
      speedMult *= BOOST_CONFIG.SPEED_MULTIPLIER;
      player.boost.current -= BOOST_CONFIG.DRAIN_RATE;
  } else {
      if (player.boost.current < player.boost.max) player.boost.current += BOOST_CONFIG.REGEN_RATE;
  }
  
  player.vx = Math.cos(player.angle) * player.speed * speedMult; 
  player.vy = Math.sin(player.angle) * player.speed * speedMult;
  player.x += player.vx; player.y += player.vy;

  // 技能逻辑 (右键)
  if (isRightMouseDown && player.skillCooldown <= 0 && player.config.skillName && player.level >= 3) {
      player.speechBubble = { text: player.config.skillName + "!", timer: 45, color: '#fcd34d' };
      // 技能等级加成：降低冷却、提高强度
      const skillMult = 1 + (player.skillLevel * 0.1); 
      player.skillCooldown = Math.max(60, 180 - player.skillLevel * 10); 
      
      // 逃跑 / 冲刺
      if (player.config.skillName === "逃跑" || player.config.skillName === "冲刺") {
          player.speedBoostTimer = 60 * skillMult;
          player.vx += Math.cos(player.angle) * 20 * skillMult;
          player.vy += Math.sin(player.angle) * 20 * skillMult;
      }
      // 闪避
      else if (player.config.skillName === "闪避") {
          player.invulnerableTimer = 30 * skillMult;
      }
      // 缩壳
      else if (player.config.skillName === "缩壳") {
          player.shieldTimer = 120 * skillMult;
      }
      // 电击 / 雷霆
      else if (player.config.skillName === "电击" || player.config.skillName === "雷霆") {
          const range = (player.config.skillName === "雷霆" ? 300 : 150) * skillMult;
          entities.forEach(e => {
              if (dist(player, e) < range) {
                  e.health -= player.config.damage * 2 * skillMult;
                  e.speedBoostTimer = -60; // 减速/麻痹
                  for(let i=0; i<5; i++) particles.push(createParticle(e.x, e.y, '#fde047'));
              }
          });
      }
      // 伪装
      else if (player.config.skillName === "伪装") {
          player.camoActive = true;
          player.ambushTimer = 180 * skillMult;
      }
      // 诱惑 (灯笼鱼)
      else if (player.config.skillName === "诱惑") {
          player.lureActive = true;
          player.ambushTimer = 180 * skillMult; // 持续时间受技能等级加成
      }
      // 重击
      else if (player.config.skillName === "重击") {
          const hitX = player.x + Math.cos(player.angle) * player.radius * 2;
          const hitY = player.y + Math.sin(player.angle) * player.radius * 2;
          entities.forEach(e => {
              if (dist({x: hitX, y: hitY}, e) < player.radius * 2 * skillMult) {
                  e.health -= player.config.damage * 3 * skillMult;
                  for(let i=0; i<5; i++) particles.push(createParticle(e.x, e.y, '#ef4444'));
              }
          });
      }
      // 膨胀
      else if (player.config.skillName === "膨胀") {
          player.renderScale = 1.5 + (skillMult - 1) * 0.5;
          player.shieldTimer = 120 * skillMult;
      }
      // 喷墨
      else if (player.config.skillName === "喷墨") {
          player.x -= Math.cos(player.angle) * 100 * skillMult;
          player.y -= Math.sin(player.angle) * 100 * skillMult;
          for(let i=0; i<20; i++) particles.push(createParticle(player.x + Math.cos(player.angle)*50, player.y + Math.sin(player.angle)*50, '#1e293b'));
      }
      // 穿刺
      else if (player.config.skillName === "穿刺") {
          player.x += Math.cos(player.angle) * 300 * skillMult;
          player.y += Math.sin(player.angle) * 300 * skillMult;
          entities.forEach(e => {
              if (dist(player, e) < player.radius * 2 * skillMult) e.health -= player.config.damage * 4 * skillMult;
          });
      }
      // 诱捕
      else if (player.config.skillName === "诱捕") {
          entities.forEach(e => {
              if (dist(player, e) < 400 * skillMult) {
                  e.x += (player.x - e.x) * 0.5;
                  e.y += (player.y - e.y) * 0.5;
              }
          });
      }
      // 声波探测
      else if (player.config.skillName === "声波探测") {
          entities.forEach(e => {
              if (dist(player, e) < 600 * skillMult) {
                  e.isHidden = false;
                  e.camoActive = false;
                  e.speedBoostTimer = -60; // 减速
                  for(let i=0; i<3; i++) particles.push(createParticle(e.x, e.y, '#9ca3af'));
              }
          });
      }
      // 龙威
      else if (player.config.skillName === "龙威") {
          entities.forEach(e => {
              if (dist(player, e) < 300 * skillMult) {
                  e.speedBoostTimer = -120; // 强力减速/定身
              }
          });
      }
      // 翻滚
      else if (player.config.skillName === "翻滚") {
          player.invulnerableTimer = 45 * skillMult;
          player.health = Math.min(player.maxHealth, player.health + 20 * skillMult);
          player.angle += Math.PI * 2; // 视觉翻滚
      }
      // 鲨吞
      else if (player.config.skillName === "鲨吞") {
          entities.forEach(e => {
              if (dist(player, e) < player.radius * 4 * skillMult && e.level < player.level) {
                  e.x += (player.x - e.x) * 0.8;
                  e.y += (player.y - e.y) * 0.8;
                  if (dist(player, e) < player.radius) {
                      e.health = 0;
                      player.weight += e.config.weightValue;
                      player.health = Math.min(player.maxHealth, player.health + e.config.weightValue * 2);
                      for(let i=0; i<5; i++) particles.push(createParticle(e.x, e.y, '#ef4444'));
                  }
              }
          });
      }
      // 声波冲击
      else if (player.config.skillName === "声波冲击") {
          entities.forEach(e => {
              if (dist(player, e) < 500 * skillMult) {
                  e.health -= player.config.damage * 2 * skillMult;
                  for(let i=0; i<5; i++) particles.push(createParticle(e.x, e.y, '#38bdf8'));
              }
          });
      }
      // 独角贯穿
      else if (player.config.skillName === "独角贯穿") {
          const hitX = player.x + Math.cos(player.angle) * player.radius * 3;
          const hitY = player.y + Math.sin(player.angle) * player.radius * 3;
          entities.forEach(e => {
              if (dist({x: hitX, y: hitY}, e) < player.radius * 1.5 * skillMult) {
                  e.health -= player.config.damage * 5 * skillMult; // 巨额伤害
                  for(let i=0; i<10; i++) particles.push(createParticle(e.x, e.y, '#cbd5e1'));
              }
          });
      }
      // 海妖之歌
      else if (player.config.skillName === "海妖之歌") {
          entities.forEach(e => {
              if (dist(player, e) < 400 * skillMult) {
                  e.aggroTimer = 180;
                  e.targetId = entities[Math.floor(Math.random() * entities.length)]?.id; // 随机攻击其他目标
                  for(let i=0; i<3; i++) particles.push(createParticle(e.x, e.y, '#f472b6'));
              }
          });
      }
      // 触手绞杀
      else if (player.config.skillName === "触手绞杀") {
          entities.forEach(e => {
              if (dist(player, e) < 800 * skillMult) {
                  e.x += (player.x - e.x) * 0.8;
                  e.y += (player.y - e.y) * 0.8;
                  e.health -= player.config.damage * skillMult;
                  for(let i=0; i<5; i++) particles.push(createParticle(e.x, e.y, '#7f1d1d'));
              }
          });
      }
  }
  if (player.skillCooldown > 0) player.skillCooldown--;
  if (player.speedBoostTimer && player.speedBoostTimer > 0) {
      player.vx *= 1.5;
      player.vy *= 1.5;
      player.speedBoostTimer--;
  }
  if (player.invulnerableTimer > 0) player.invulnerableTimer--;
  if (player.shieldTimer > 0) player.shieldTimer--;
  if (player.ambushTimer > 0) {
      player.ambushTimer--;
      if (player.ambushTimer <= 0) {
          player.camoActive = false;
          player.lureActive = false;
      }
  }
  if (player.renderScale > 1.0) player.renderScale -= 0.01;

  // 如果处于诱惑状态，让玩家自动远离大鱼
  if (player.lureActive) {
      let isEscaping = false;
      let escX = 0, escY = 0;
      entities.forEach(e => {
          if (e.level > player.level && dist(player, e) < 400) {
              escX += player.x - e.x;
              escY += player.y - e.y;
              isEscaping = true;
          }
      });
      if (isEscaping) {
          const escapeAngle = Math.atan2(escY, escX);
          player.vx += Math.cos(escapeAngle) * 8; // 增加额外逃跑速度
          player.vy += Math.sin(escapeAngle) * 8;
      }
  }

  // 随机生成漂流瓶或贝壳
  if (Math.random() < 0.007 && state.powerUps.length < MAX_POWERUPS) {
      const isShell = Math.random() < 0.3; // 30% chance for shell, 70% for bottle
      state.powerUps.push({
          id: uuid(),
          x: Math.random() * WORLD_SIZE,
          y: Math.random() * WORLD_SIZE,
          type: isShell ? 'SHELL' : 'BOTTLE',
          radius: isShell ? 30 : 20
      });
  }

  // ==================== 宝藏事件系统 ====================
  // 每60秒生成一个宝藏，提前3秒显示预告

  // 生成宝藏逻辑（每帧检查是否需要生成预告）
  // 使用 state.time 来控制生成时机
  const treasureSpawnTime = Math.floor(state.time / TREASURE_CONFIG.SPAWN_INTERVAL);
  const timeSinceLastSpawn = state.time % TREASURE_CONFIG.SPAWN_INTERVAL;

  // 在生成宝藏前3秒，创建预告
  if (timeSinceLastSpawn === TREASURE_CONFIG.SPAWN_INTERVAL - TREASURE_CONFIG.WARNING_DURATION) {
      // 生成一个随机位置（在地图边界内）
      let spawnX: number, spawnY: number;
      do {
          spawnX = Math.random() * WORLD_SIZE;
          spawnY = Math.random() * WORLD_SIZE;
      } while (!isPositionValid(spawnX, spawnY, 100));

      // 随机选择宝藏类型
      const treasureTypes: Array<Treasure['type']> = ['FEAST', 'CHEST', 'GEM', 'FOOD'];
      const randomType = treasureTypes[Math.floor(Math.random() * treasureTypes.length)];

      // 创建预告状态的宝藏
      const newTreasure: Treasure = {
          id: uuid(),
          x: spawnX,
          y: spawnY,
          type: randomType,
          status: 'WARNING',
          timer: TREASURE_CONFIG.WARNING_DURATION + 60 * 10, // 预告3秒 + 存在10秒
          radius: TREASURE_CONFIG.RADIUS,
          effect: randomType === 'FEAST' ? 'EXP' :
                  randomType === 'CHEST' ? 'GOLD' :
                  randomType === 'GEM' ? 'SKILL' : 'SHIELD',
          rewardValue: randomType === 'FEAST' ? TREASURE_CONFIG.FEAST_REWARD :
                      randomType === 'CHEST' ? TREASURE_CONFIG.CHEST_GOLD :
                      randomType === 'GEM' ? 2 : TREASURE_CONFIG.FOOD_HEAL
      };

      state.treasures.push(newTreasure);

      // 显示预告标签
      state.labels.push({
          x: spawnX,
          y: spawnY - 80,
          text: '宝贝出现！',
          color: '#fcd34d'
      });
  }

  // 更新宝藏状态
  state.treasures.forEach(treasure => {
      treasure.timer--;

      // 预告结束，变为激活状态
      if (treasure.status === 'WARNING' && treasure.timer <= 60 * 10 - TREASURE_CONFIG.WARNING_DURATION) {
          treasure.status = 'ACTIVE';
      }

      // 宝藏激活状态下检测玩家拾取
      if (treasure.status === 'ACTIVE') {
          if (dist(player, treasure) < player.radius + treasure.radius) {
              // 拾取宝藏
              if (treasure.effect === 'EXP') {
                  player.weight += treasure.rewardValue || 0;
                  player.evolutionPoints += treasure.rewardValue || 0;
                  player.speechBubble = { text: `+${treasure.rewardValue} 经验！`, timer: 60, color: '#fcd34d' };
              } else if (treasure.effect === 'GOLD') {
                  player.speechBubble = { text: `+${treasure.rewardValue} 金币！`, timer: 60, color: '#fbbf24' };
              } else if (treasure.effect === 'SKILL') {
                  player.skillLevel++;
                  player.speechBubble = { text: '技能+1！', timer: 60, color: '#a855f7' };
              } else if (treasure.effect === 'SHIELD') {
                  player.shieldTimer = 300; // 5秒护盾
                  player.speechBubble = { text: '获得护盾！', timer: 60, color: '#38bdf8' };
              }

              // 拾取特效
              for (let i = 0; i < 20; i++) {
                  particles.push(createParticle(treasure.x, treasure.y, '#fcd34d'));
              }

              // 标记删除
              treasure.timer = 0;
          }
      }
  });

  // 移除过期或已拾取的宝藏
  state.treasures = state.treasures.filter(t => t.timer > 0);
  // ==================== 宝藏事件系统结束 ====================

  // 随机生成秘境喷泉
  if (Math.random() < 0.001 && state.fountains.length < 2) {
      state.fountains.push({
          id: uuid(),
          x: Math.random() * WORLD_SIZE,
          y: Math.random() * WORLD_SIZE,
          timer: 3600, // 1 minute at 60fps
          radius: 100
      });
  }

  // 更新喷泉
  state.fountains.forEach(f => {
      f.timer--;
      if (f.timer % 10 === 0) {
          // 喷出小饼干
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * f.radius;
          state.entities.push(createEntity(CreatureType.PLANKTON, f.x + Math.cos(angle) * dist, f.y + Math.sin(angle) * dist));
      }
  });
  state.fountains = state.fountains.filter(f => f.timer > 0);

  // 漂流瓶和贝壳碰撞
  state.powerUps.forEach(p => {
      if (dist(player, p) < player.radius + p.radius) {
          if (p.type === 'BOTTLE') {
              player.skillLevel++;
              localStorage.setItem('skillLevel', player.skillLevel.toString());
              player.speechBubble = { text: "技能等级 +1!", timer: 60, color: '#60a5fa' };
              p.radius = 0; // 标记删除
          } else if (p.type === 'SHELL') {
              if (Math.random() < 0.5) {
                  // 变身机甲
                  player.isMecha = true;
                  player.mechaTimer = 1800; // 30秒 (60fps)
                  player.speechBubble = { text: "机甲变身！", timer: 90, color: '#ef4444' };
              } else {
                  // 等级+2
                  player.level += 2;
                  player.weight += 20; // 增加一些体重以匹配等级
                  player.radius += 5; // 变大一点
                  player.speechBubble = { text: "等级 +2！", timer: 90, color: '#10b981' };
              }
              p.radius = 0; // 标记删除
          }
      }
  });
  state.powerUps = state.powerUps.filter(p => p.radius > 0);

  // 机甲状态更新
  if (player.isMecha) {
      if (player.mechaTimer > 0) {
          player.mechaTimer--;
          if (player.mechaTimer <= 0) {
              player.isMecha = false;
              player.speechBubble = { text: "机甲能量耗尽", timer: 60, color: '#94a3b8' };
          }
      }
  }

  // 发射子弹逻辑 (仅限机甲)
  if (isMouseDown && player.isMecha && player.torpedoCooldown <= 0) {
      state.projectiles.push({
          id: uuid(),
          x: player.x + Math.cos(player.angle) * player.radius,
          y: player.y + Math.sin(player.angle) * player.radius,
          vx: Math.cos(player.angle) * 15,
          vy: Math.sin(player.angle) * 15,
          targetId: null,
          life: 100,
          radius: 8,
          damage: 50,
          angle: player.angle
      });
      player.torpedoCooldown = 15; // 0.25s cooldown at 60fps
  }
  if (player.torpedoCooldown > 0) player.torpedoCooldown--;
  
  clampToMap(player, state.status === GameStatus.BATTLE_TEST);

  // 更新子弹
  state.projectiles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      
      // 子弹与实体碰撞
      for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (e.type === CreatureType.MASCOT) continue;
          if (dist(p, e) < p.radius + e.radius) {
              e.health = 0; // 直接打死
              p.life = 0; // 子弹消失
              
              // 变成一堆鱼食 (PLANKTON)
              const foodCount = Math.floor(e.radius / 5) + 2;
              for (let j = 0; j < foodCount; j++) {
                  const food = createEntity(CreatureType.PLANKTON, e.x + (Math.random() - 0.5) * 20, e.y + (Math.random() - 0.5) * 20);
                  state.entities.push(food);
              }
              
              for(let k=0; k<10; k++) state.particles.push(createParticle(e.x, e.y, e.config.color));
              break;
          }
      }
  });
  state.projectiles = state.projectiles.filter(p => p.life > 0);

  // 更新AI（仅更新范围内的实体）
  const AI_UPDATE_RANGE = 2000;
  entities.forEach(ent => {
    if (dist(ent, player) < AI_UPDATE_RANGE) {
      updateAI(ent, state);
    }
  });

  // 使用QuadTree进行碰撞检测
  const quadTree = new QuadTree(WORLD_SIZE);
  quadTree.insertAll(entities);

  const nearbyEntities = quadTree.queryPlayer(player.x, player.y, Math.max(player.radius, 1000), player.radius);
  for (const e1 of nearbyEntities) {
    if (e1.type === CreatureType.MASCOT) continue;
    if (dist(e1, player) < e1.radius + player.radius) {
      processCollision(e1, player, particles, state);
      processCollision(player, e1, particles, state);
    }
  }

  state.entities = state.entities.filter(e => e.health > 0);
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; });

  if (player.health <= 0) state.status = GameStatus.GAME_OVER;

  // 检查进化
  const currentTier = player.config.tier;
  const nextThreshold = EVOLUTION_THRESHOLDS.find(t => t.tier === currentTier + 1);
  if (nextThreshold && player.evolutionPoints >= nextThreshold.weight) {
      state.status = GameStatus.EVOLVING;
  }

  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
  
  return state;
};

export const manualSquadSwitch = (state: GameState): boolean => false;
