
import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal, BiomeType, Building, BuildingType, Treasure, Cosmetics } from './types';

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
    const limit = maxR - entity.radius;
    
    const safetyPush = 30; 
    
    if (currentDist > limit) {
        const correctedDist = limit - safetyPush;
        entity.x = cx + Math.cos(angle) * correctedDist;
        entity.y = cy + Math.sin(angle) * correctedDist;
        
        if (entity.vx !== undefined && entity.vy !== undefined) {
             entity.vx *= -0.2; 
             entity.vy *= -0.2;
             const angleToCenter = Math.atan2(cy - entity.y, cx - entity.x);
             entity.angle = angleToCenter + (Math.random() - 0.5) * 0.4;
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
    cosmetics: {
        teeth: 'NORMAL', skinColor: 'DEFAULT', pattern: 'NONE', scaleType: 'NONE', accessory: 'NONE',
        tailType: 'DEFAULT', bodyType: 'DEFAULT', mouthType: 'TRIANGLE', eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE'
    }
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
    spawn(BuildingType.ARMORY, BiomeType.ABYSS, 2);
    spawn(BuildingType.SHRINE, BiomeType.SWAMP, 1);
    spawn(BuildingType.SHRINE, BiomeType.REEF, 1);
    buildings.push({
        id: 'shop-1', x: MAP_SHAPE_CONFIG.CENTER_X - 400, y: MAP_SHAPE_CONFIG.CENTER_Y - 400, type: BuildingType.SHOP, radius: BUILDING_CONFIGS.SHOP.radius, cooldown: 0
    });
    return buildings;
};

export const createPortals = (): Portal[] => {
    const portals: Portal[] = [];
    const makePortal = (biome: BiomeType) => {
        const pos = getRandomPosInBiome(biome);
        portals.push({ id: uuid(), x: pos.x, y: pos.y, radius: PORTAL_CONFIG.RADIUS, angle: 0 });
    };
    makePortal(BiomeType.SHALLOWS);
    makePortal(BiomeType.REEF);
    makePortal(BiomeType.SWAMP);
    makePortal(BiomeType.ABYSS);
    return portals;
};

export const digestBasket = (state: GameState) => {
    const { player } = state;
    if (!player.basket || player.basket.length === 0) return;
    let totalWeight = 0;
    player.basket.forEach(item => totalWeight += item.totalWeight);
    if (totalWeight > 0) {
        player.weight += totalWeight;
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
  
  if (entity.type === CreatureType.MASCOT) {
      entity.y += Math.sin(state.time * 0.05) * 1.5;
      return; 
  }
  
  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  
  // 简化版AI，始终追逐玩家（战斗测试核心）
  let dx = player.x - entity.x;
  let dy = player.y - entity.y;
  let targetAngle = Math.atan2(dy, dx);
  
  let angleDiff = targetAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;
  
  const finalSpeed = entity.speed * 1.1;
  entity.vx = Math.cos(entity.angle) * finalSpeed; 
  entity.vy = Math.sin(entity.angle) * finalSpeed;
  entity.x += entity.vx; entity.y += entity.vy;
  
  clampToMap(entity, state.status === GameStatus.BATTLE_TEST);
};

const processCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[], state: GameState) => {
  if (attacker.type === CreatureType.MASCOT || victim.type === CreatureType.MASCOT) return;
  const isFriendly = (e: Entity | PlayerState) => e.id === 'player' || ('ownerId' in e && e.ownerId === 'player');
  if (isFriendly(attacker) && isFriendly(victim)) return;
  
  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  if (Math.abs(angleDiff) > Math.PI / 3) return;

  // 基础碰撞伤害
  let damage = attacker.config.damage;
  victim.health -= damage;
  particles.push(createParticle(victim.x, victim.y, 'red'));
  
  if (attacker.radius > victim.radius * 1.1) {
      attacker.renderScale = 1.1;
      attacker.happyTimer = 30;
  }
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  if (state.status === GameStatus.MENU) return state;
  state.time++;

  if (state.status === GameStatus.PLAYING && state.entities.length < MAX_ENTITIES) {
      const r = Math.random();
      let type = r < 0.6 ? CreatureType.PLANKTON : (r < 0.8 ? CreatureType.CLOWN_FISH : (r < 0.9 ? CreatureType.JELLYFISH : CreatureType.CRAB));
      const spawnX = Math.random() * WORLD_SIZE, spawnY = Math.random() * WORLD_SIZE;
      if (isPositionValid(spawnX, spawnY, 50)) state.entities.push(createEntity(type, spawnX, spawnY));
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
  
  clampToMap(player, state.status === GameStatus.BATTLE_TEST);

  // 更新AI
  entities.forEach(ent => updateAI(ent, state));
  
  // 碰撞检测
  for (let i = 0; i < entities.length; i++) {
      const e1 = entities[i];
      if (dist(e1, player) < e1.radius + player.radius) {
          processCollision(e1, player, particles, state);
          processCollision(player, e1, particles, state);
      }
  }

  state.entities = state.entities.filter(e => e.health > 0);
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; });

  if (player.health <= 0) state.status = GameStatus.GAME_OVER;

  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
  
  return state;
};

export const manualSquadSwitch = (state: GameState): boolean => false;
