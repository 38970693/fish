import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal, BiomeType, Building, BuildingType, Treasure } from './types';

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

/**
 * 物理引擎核心修正：强力边界推离逻辑
 * 解决抽搐的关键：检测到碰撞后，必须将实体推离到一段距离之外，并重定向航向
 */
const clampToMap = (entity: {x: number, y: number, radius: number, angle: number, vx?: number, vy?: number}) => {
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
    
    const maxR = getMapBoundaryRadius(angle);
    const limit = maxR - entity.radius;
    
    // 如果越界，采取强力物理推回
    if (currentDist > limit) {
        // 关键改进：直接推回到安全区内 30 像素处，彻底断开高频振荡循环
        const pushBackBuffer = 30; 
        const safeDist = limit - pushBackBuffer;
        
        entity.x = cx + Math.cos(angle) * safeDist;
        entity.y = cy + Math.sin(angle) * safeDist;
        
        if (entity.vx !== undefined && entity.vy !== undefined) {
             // 撞墙后动量损失并反转
             entity.vx *= -0.1;
             entity.vy *= -0.1;
             // 强制航向朝向中心点，带一点点随机偏转，模拟生物受惊转向
             const angleToCenter = Math.atan2(cy - entity.y, cx - entity.x);
             entity.angle = angleToCenter + (Math.random() - 0.5) * 0.3;
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

const getNextEvolution = (currentType: CreatureType, history: Record<CreatureType, number>, radius: number): CreatureType => {
  const config = CREATURES[currentType];
  const nextTier = config.tier + 1;
  const threshold = EVOLUTION_THRESHOLDS.find(t => t.tier === nextTier);
  
  if (!threshold || radius < threshold.radius) return currentType;

  const aggressiveScore = (history[CreatureType.CLOWN_FISH] || 0) + (history[CreatureType.SEAHORSE] || 0) + (history[CreatureType.SWORD_FISH] || 0) + (history[CreatureType.ELECTRIC_EEL] || 0) + (history[CreatureType.AROWANA] || 0);
  const passiveScore = (history[CreatureType.JELLYFISH] || 0) + (history[CreatureType.PLANKTON] || 0) + (history[CreatureType.TURTLE] || 0) + (history[CreatureType.STINGRAY] || 0) + (history[CreatureType.FUR_SEAL] || 0);
  const tankScore = (history[CreatureType.CRAB] || 0) + (history[CreatureType.PUFFER_FISH] || 0) + (history[CreatureType.HAMMERHEAD] || 0);

  if (nextTier === 2) {
      if (tankScore > aggressiveScore) return CreatureType.CRAB;
      if (aggressiveScore > passiveScore) return CreatureType.ELECTRIC_EEL;
      if (passiveScore > 20) return CreatureType.SEAHORSE;
      return CreatureType.SQUID;
  }
  if (nextTier === 3) {
      if (config.type === CreatureType.SEAHORSE || config.type === CreatureType.BLUE_TANG) return CreatureType.FUR_SEAL;
      if (config.type === CreatureType.CRAB) return CreatureType.HAMMERHEAD;
      if (passiveScore > aggressiveScore) return CreatureType.STINGRAY;
      if (aggressiveScore > 20) return CreatureType.AROWANA;
      if (aggressiveScore > 10) return CreatureType.SWORD_FISH;
      return CreatureType.ANGLER_FISH;
  }
  if (nextTier === 4) {
      if (currentType === CreatureType.SWORD_FISH || currentType === CreatureType.AROWANA) return CreatureType.NARWHAL;
      if (aggressiveScore > tankScore) return CreatureType.GREAT_WHITE;
      if (Math.random() < 0.05) return CreatureType.MERMAID;
      return CreatureType.ORCA;
  }
  return currentType;
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
    evolutionVisualTimer: 0
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
                id: uuid(),
                x: pos.x,
                y: pos.y,
                type: type,
                radius: conf.radius,
                cooldown: 0
            });
        }
    };
    spawn(BuildingType.HOSPITAL, BiomeType.SHALLOWS, 1);
    spawn(BuildingType.HOSPITAL, BiomeType.REEF, 1);
    spawn(BuildingType.ARMORY, BiomeType.ABYSS, 2);
    spawn(BuildingType.SHRINE, BiomeType.SWAMP, 1);
    spawn(BuildingType.SHRINE, BiomeType.REEF, 1);
    
    buildings.push({
        id: 'shop-1',
        x: MAP_SHAPE_CONFIG.CENTER_X - 400,
        y: MAP_SHAPE_CONFIG.CENTER_Y - 400,
        type: BuildingType.SHOP,
        radius: BUILDING_CONFIGS.SHOP.radius,
        cooldown: 0
    });
    
    return buildings;
};

export const createPortals = (): Portal[] => {
    const portals: Portal[] = [];
    const makePortal = (biome: BiomeType) => {
        const pos = getRandomPosInBiome(biome);
        portals.push({
            id: uuid(),
            x: pos.x,
            y: pos.y,
            radius: PORTAL_CONFIG.RADIUS,
            angle: 0
        });
    };
    makePortal(BiomeType.SHALLOWS);
    makePortal(BiomeType.REEF);
    makePortal(BiomeType.SWAMP);
    makePortal(BiomeType.ABYSS);
    return portals;
};

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

const spawnPowerUps = (state: GameState) => {
  if (state.powerUps.length >= MAX_POWERUPS) return;
  if (Math.random() > 0.03) return; 
  const angle = Math.random() * Math.PI * 2;
  const d = 600 + Math.random() * 1000;
  const x = state.player.x + Math.cos(angle) * d;
  const y = state.player.y + Math.sin(angle) * d;
  if (!isPositionValid(x, y, 100)) return;

  const r = Math.random();
  let type: 'SPEED' | 'SHIELD' | 'TORPEDO' = 'SPEED';
  if (r < 0.6) type = 'SPEED';
  else if (r < 0.8) type = 'SHIELD';
  else type = 'TORPEDO';

  state.powerUps.push({ id: uuid(), x, y, type, radius: 20 });
};

const spawnHazards = (state: GameState) => {
  if (state.time % METEOR_CONFIG.INTERVAL === 0) {
    for (let i = 0; i < METEOR_CONFIG.WAVE_COUNT; i++) {
      let tx, ty;
      for(let attempt=0; attempt<5; attempt++) {
          const r = Math.random();
          if (r < 0.3) {
            tx = state.player.x + (Math.random() - 0.5) * 600;
            ty = state.player.y + (Math.random() - 0.5) * 600;
          } else if (state.entities.length > 0) {
            const ent = state.entities[Math.floor(Math.random() * state.entities.length)];
            tx = ent.x;
            ty = ent.y;
          } else {
            const angle = Math.random() * Math.PI * 2;
            const d = 500 + Math.random() * 1000;
            tx = state.player.x + Math.cos(angle) * d;
            ty = state.player.y + Math.sin(angle) * d;
          }
          if (isPositionValid(tx, ty, 100)) break;
      }
      state.hazards.push({
        id: uuid(),
        x: tx || MAP_SHAPE_CONFIG.CENTER_X,
        y: ty || MAP_SHAPE_CONFIG.CENTER_Y,
        radius: METEOR_CONFIG.RADIUS,
        type: 'METEOR_STRIKE',
        timer: METEOR_CONFIG.WARNING_TIME,
        duration: METEOR_CONFIG.WARNING_TIME + METEOR_CONFIG.STRIKE_TIME,
        stage: 'WARNING'
      });
    }
  }
};

const spawnMascot = (state: GameState) => {
  const mascots = state.entities.filter(e => e.type === CreatureType.MASCOT);
  if (mascots.length >= 4) return;
  const biomes = [BiomeType.SHALLOWS, BiomeType.REEF, BiomeType.SWAMP, BiomeType.ABYSS];
  biomes.forEach(biome => {
      const hasMascot = mascots.some(m => getBiome(m.x, m.y) === biome);
      if (!hasMascot) {
          const pos = getRandomPosInBiome(biome);
          if (isPositionValid(pos.x, pos.y, 100)) {
              const mascot = createEntity(CreatureType.MASCOT, pos.x, pos.y);
              mascot.angle = -Math.PI / 2;
              state.entities.push(mascot);
          }
      }
  });
};

const spawnPortals = (state: GameState) => {
    if (state.portals.length >= 6) return;
    if (Math.random() > 0.002) return;

    const px = Math.random() * WORLD_SIZE;
    const py = Math.random() * WORLD_SIZE;
    if (isPositionValid(px, py, 150)) {
        state.portals.push({
            id: uuid(),
            x: px,
            y: py,
            radius: PORTAL_CONFIG.RADIUS,
            angle: 0
        });
    }
};

export const manualSquadSwitch = (state: GameState): boolean => {
    const squad = state.entities.filter(e => e.ownerId === 'player');
    if (squad.length === 0) return false;
    const newBodyIndex = Math.floor(Math.random() * squad.length);
    const newBody = squad[newBodyIndex];
    const oldBody = createEntity(state.player.type, state.player.x, state.player.y);
    oldBody.radius = state.player.radius;
    oldBody.health = state.player.health;
    oldBody.maxHealth = state.player.maxHealth;
    oldBody.ownerId = 'player'; 
    oldBody.angle = state.player.angle;
    state.entities.push(oldBody);
    state.player.type = newBody.type;
    state.player.config = newBody.config;
    state.player.x = newBody.x;
    state.player.y = newBody.y;
    state.player.radius = newBody.radius;
    state.player.health = newBody.health;
    state.player.maxHealth = newBody.maxHealth;
    state.player.speed = newBody.speed * 1.2; 
    state.player.speechBubble = { text: "夺舍成功!", timer: 60, color: '#fef08a' };
    state.player.isInvulnerable = true;
    setTimeout(() => { if(state.player) state.player.isInvulnerable = false; }, 1000);
    state.entities = state.entities.filter(e => e.id !== newBody.id);
    return true;
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

const emergencySquadSwitch = (state: GameState): boolean => {
    const squad = state.entities.filter(e => e.ownerId === 'player');
    if (squad.length === 0) return false;
    const newBody = squad.reduce((prev, current) => (prev.radius > current.radius) ? prev : current);
    state.player.type = newBody.type;
    state.player.config = newBody.config;
    state.player.x = newBody.x;
    state.player.y = newBody.y;
    state.player.radius = newBody.radius;
    state.player.health = newBody.health;
    state.player.maxHealth = newBody.maxHealth;
    state.player.speed = newBody.speed * 1.2;
    state.player.speechBubble = { text: "我不死之身!", timer: 90, color: '#ef4444' };
    state.player.isInvulnerable = true;
    setTimeout(() => { if(state.player) state.player.isInvulnerable = false; }, 2000);
    state.entities = state.entities.filter(e => e.id !== newBody.id);
    for(let i=0; i<20; i++) state.particles.push(createParticle(state.player.x, state.player.y, '#ffffff'));
    return true;
};

const updateHazards = (state: GameState, particles: Particle[]) => {
  const activeHazards: Hazard[] = [];
  const { player, entities } = state;
  state.hazards.forEach(hazard => {
    hazard.timer--;
    if (hazard.timer > 0) {
        hazard.stage = 'WARNING';
    } else if (hazard.timer === 0) {
        hazard.stage = 'STRIKE';
        for(let i=0; i<30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * 10;
            particles.push({
                ...createParticle(hazard.x, hazard.y, '#f59e0b'),
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                size: Math.random() * 10 + 5,
                life: 2.0
            });
        }
        for(let i=0; i<METEOR_CONFIG.SPLASH_COUNT; i++) {
           const angle = (Math.PI * 2 / METEOR_CONFIG.SPLASH_COUNT) * i + Math.random();
           const spd = 5 + Math.random() * 8;
           particles.push({
             ...createParticle(hazard.x, hazard.y, '#38bdf8'), 
             vx: Math.cos(angle) * spd,
             vy: Math.sin(angle) * spd,
             life: 1.5, 
             size: 8 + Math.random() * 6,
             interactionType: 'SHRINK'
           });
        }
        const playerInvulnerable = player.isGodMode || player.isInvulnerable || (player.shieldTimer > 0);
        if (dist(player, hazard) < hazard.radius && !playerInvulnerable && !player.isHidden) {
            player.health = 0;
        }
        for (const ent of entities) {
             if (ent.type !== CreatureType.MASCOT && dist(ent, hazard) < hazard.radius) {
                 ent.health = 0; 
                 for(let i=0; i<5; i++) particles.push(createParticle(ent.x, ent.y, ent.config.color));
             }
        }
    } else {
        hazard.stage = 'COOLDOWN';
    }
    if (hazard.timer > -40) activeHazards.push(hazard);
  });
  state.hazards = activeHazards;
};

const updatePortals = (state: GameState, particles: Particle[]) => {
    state.portals.forEach(p => {
        p.angle += 0.05;
        if (Math.random() < 0.2) {
            const angle = Math.random() * Math.PI * 2;
            const d = p.radius * (1.5 + Math.random());
            const px = p.x + Math.cos(angle) * d;
            const py = p.y + Math.sin(angle) * d;
            const vx = (p.x - px) * 0.08;
            const vy = (p.y - py) * 0.08;
            particles.push({
                ...createParticle(px, py, PORTAL_CONFIG.COLORS[Math.floor(Math.random() * 3)]),
                life: 0.8,
                size: 3,
                vx,
                vy
            });
        }
    });

    const checkTeleport = (entity: Entity | PlayerState) => {
        if (entity.type === CreatureType.MASCOT) return;
        for (const p of state.portals) {
            if (dist(entity, p) < p.radius) {
                const currentBiome = getBiome(entity.x, entity.y);
                const biomes = [BiomeType.SHALLOWS, BiomeType.REEF, BiomeType.SWAMP, BiomeType.ABYSS];
                const otherBiomes = biomes.filter(b => b !== currentBiome);
                const targetBiome = otherBiomes[Math.floor(Math.random() * otherBiomes.length)];
                const dest = getRandomPosInBiome(targetBiome);
                for(let i=0; i<60; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const d = entity.radius * 3;
                    const spd = 12;
                    particles.push({
                        ...createParticle(entity.x + Math.cos(angle) * d, entity.y + Math.sin(angle) * d, '#d8b4fe'),
                        vx: -Math.cos(angle) * spd,
                        vy: -Math.sin(angle) * spd,
                        life: 0.5,
                        size: 6
                    });
                }
                if (entity.id === 'player') {
                    particles.push({
                        id: uuid(), x: entity.x, y: entity.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: 'rgba(216, 180, 254, 0.8)', size: 5000 
                    });
                }
                entity.x = dest.x;
                entity.y = dest.y;
                for(let i=0; i<80; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 4 + Math.random() * 15;
                    particles.push({
                        ...createParticle(entity.x, entity.y, '#22d3ee'),
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        life: 0.8,
                        size: 8
                    });
                }
                if (entity.id === 'player') {
                    particles.push({
                        id: uuid(), x: entity.x, y: entity.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: 'rgba(34, 211, 238, 0.8)', size: 5000 
                    });
                }
                entity.speechBubble = { text: "量子跃迁!", timer: 60, color: '#d8b4fe' };
                if (entity.id === 'player') {
                    const p = entity as PlayerState;
                    p.speedBoostTimer = 180; 
                    p.shieldTimer = Math.max(p.shieldTimer, 180); 
                    p.renderScale = 2.0; 
                }
                break;
            }
        }
    };
    checkTeleport(state.player);
    state.entities.forEach(e => checkTeleport(e));
};

const updateBuildings = (state: GameState, particles: Particle[]) => {
    state.buildings.forEach(b => {
        if (b.cooldown > 0) b.cooldown--;
        if (state.time % 60 === 0) {
             const angle = Math.random() * Math.PI * 2;
             const d = b.radius;
             particles.push({
                ...createParticle(b.x + Math.cos(angle)*d, b.y + Math.sin(angle)*d, BUILDING_CONFIGS[b.type].color),
                life: 0.5,
                size: 3,
                vx: 0, vy: -1
             });
        }
        if (b.cooldown <= 0 && dist(state.player, b) < b.radius * 0.8) {
            let success = false;
            if (b.type === BuildingType.SHOP) {
                state.status = GameStatus.SHOP;
                state.player.speechBubble = { text: "欢迎光临!", timer: 60, color: '#f472b6' };
                state.player.vx = 0;
                state.player.vy = 0;
                success = true;
            } else if (b.type === BuildingType.HOSPITAL) {
                if (state.player.health < state.player.maxHealth) {
                    state.player.health = state.player.maxHealth;
                    state.player.speechBubble = { text: "满血复活!", timer: 60, color: '#ef4444' };
                    success = true;
                }
            } else if (b.type === BuildingType.ARMORY) {
                state.player.torpedoCount += 5;
                state.player.speechBubble = { text: "弹药补充!", timer: 60, color: '#f59e0b' };
                success = true;
            } else if (b.type === BuildingType.SHRINE) {
                const r = Math.random();
                if (r < 0.33) {
                    state.player.speedBoostTimer = 600;
                    state.player.speechBubble = { text: "神速!", timer: 60, color: '#fde047' };
                } else if (r < 0.66) {
                    state.player.shieldTimer = 600;
                    state.player.speechBubble = { text: "神佑!", timer: 60, color: '#22d3ee' };
                } else {
                    state.player.weight += 10;
                    state.player.speechBubble = { text: "天赐!", timer: 60, color: '#d8b4fe' };
                }
                success = true;
            }
            if (success) {
                b.cooldown = BUILDING_CONFIGS[b.type].cooldown;
                for(let i=0; i<20; i++) particles.push(createParticle(b.x, b.y, BUILDING_CONFIGS[b.type].color));
            }
        }
    });
};

const checkHiding = (entity: Entity, obstacles: Obstacle[]) => {
  entity.isHidden = false;
  for (const obs of obstacles) {
    const d = dist(entity, obs);
    const radiusFactor = obs.type === 'SEAWEED' ? 0.8 : 0.7;
    const coverageFactor = obs.type === 'SEAWEED' ? 0.7 : 0.5;
    if (d < obs.radius - entity.radius * coverageFactor) {
       if (entity.radius < obs.radius * radiusFactor) {
         entity.isHidden = true;
         return; 
       }
    }
  }
};

const updateStrategyState = (entity: Entity) => {
  const speed = Math.hypot(entity.vx, entity.vy);
  entity.isIdle = speed < GAME_MECHANICS.IDLE_THRESHOLD;
  if (entity.config.special === 'LURE') {
    if (entity.isIdle) {
      entity.lureActive = true;
    } else {
      if (entity.lureActive) {
        entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
      }
      entity.lureActive = false;
    }
  }
  if (entity.config.special === 'CAMO') {
    if (entity.isIdle) {
      entity.camoActive = true;
    } else {
      if (entity.camoActive) {
        entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
      }
      entity.camoActive = false;
    }
  }
  if (entity.ambushTimer > 0) entity.ambushTimer--;
  if (entity.happyTimer && entity.happyTimer > 0) entity.happyTimer--;
  if (entity.fearTimer && entity.fearTimer > 0) entity.fearTimer--;
  if (entity.evolutionVisualTimer && entity.evolutionVisualTimer > 0) entity.evolutionVisualTimer--;
  if (entity.speechBubble) {
    entity.speechBubble.timer--;
    if (entity.speechBubble.timer <= 0) entity.speechBubble = null;
  }
};

const calculateAIMovement = (entity: Entity, entities: Entity[], player: PlayerState, hazards: Hazard[], obstacles: Obstacle[], isPlayer: boolean, treasures: Treasure[]) => {
    if (entity.type === CreatureType.MASCOT) {
        return { desiredAngle: -Math.PI / 2, targetEntityId: null, fearFactor: 0, panicFactor: 0 };
    }
    const cx = MAP_SHAPE_CONFIG.CENTER_X;
    const cy = MAP_SHAPE_CONFIG.CENTER_Y;
    const dxFromCenter = entity.x - cx;
    const dyFromCenter = entity.y - cy;
    const distFromCenter = Math.hypot(dxFromCenter, dyFromCenter);
    const angleFromCenter = Math.atan2(dyFromCenter, dxFromCenter);
    const maxR = getMapBoundaryRadius(angleFromCenter);
    
    let fx = 0, fy = 0, fearFactor = 0, panicFactor = 0, nearestFoodDist = Infinity, nearestFood: {x: number, y: number} | null = null, targetEntityId: string | null = null;
    
    /**
     * 核心改进：软边界避障感应
     * 在鱼距离边缘 500 像素时就开始产生指向中心的推力，防止它们靠近边界
     */
    const boundaryDangerZone = 500;
    if (distFromCenter > maxR - boundaryDangerZone) {
         const dangerIntensity = (distFromCenter - (maxR - boundaryDangerZone)) / boundaryDangerZone;
         // 产生一个背离边缘（指向中心）的强力矢量
         fx -= Math.cos(angleFromCenter) * dangerIntensity * 30;
         fy -= Math.sin(angleFromCenter) * dangerIntensity * 30;
    }

    const baseDetection = 700;
    const nearby = entities.filter(e => {
        if (e.id === entity.id || e.isHidden) return false;
        const spottingDist = baseDetection + (e.radius * 5); 
        return dist(entity, e) < spottingDist;
    });
    if (!isPlayer && !player.isHidden && entity.ownerId !== 'player') {
        const spottingDist = baseDetection + (player.radius * 5);
        if (dist(entity, player) < spottingDist) nearby.push(player);
    }
    
    if (treasures && treasures.length > 0) {
        for (const t of treasures) {
            const d = dist(entity, t);
            if (d < TREASURE_CONFIG.DETECTION_RANGE) {
                const weight = t.status === 'ACTIVE' ? 4.0 : 2.5; 
                fx += ((t.x - entity.x) / d) * weight;
                fy += ((t.y - entity.y) / d) * weight;
            }
        }
    }
    if (entity.ownerId === 'player') {
         const distToPlayer = dist(entity, player);
         if (distToPlayer > 300) {
             const dirX = (player.x - entity.x) / distToPlayer;
             const dirY = (player.y - entity.y) / distToPlayer;
             fx += dirX * 2.0; fy += dirY * 2.0;
         } else {
             const wanderAngle = entity.angle + (Math.random() - 0.5);
             fx += Math.cos(wanderAngle) * 0.5; fy += Math.sin(wanderAngle) * 0.5;
         }
    }
    const playerHasShield = player.shieldTimer > 0 || player.isInvulnerable || player.isGodMode;
    for (const h of hazards) {
        // Fix typo in hazard stage check: 'COoldOWN' -> 'COOLDOWN'
        if (h.stage !== 'COOLDOWN' && h.timer > 0) {
            const d = dist(entity, h);
            if (d < h.radius + 100) {
                const dirX = (h.x - entity.x) / d, dirY = (h.y - entity.y) / d, evadeWeight = 5000 / (d + 1);
                fx -= dirX * evadeWeight; fy -= dirY * evadeWeight; fearFactor += evadeWeight;
            }
        }
    }
    if (entity.aggroTimer && entity.aggroTimer > 0 && entity.targetId) {
         let target = (entity.targetId === 'player') ? player : entities.find(e => e.id === entity.targetId);
         if (target && !target.isHidden) {
             const distToTarget = dist(entity, target), dx = target.x - entity.x, dy = target.y - entity.y;
             fx += (dx / distToTarget) * 4.0; fy += (dy / distToTarget) * 4.0;
             return { desiredAngle: Math.atan2(fy, fx), targetEntityId: entity.targetId, fearFactor: 0, panicFactor: 0 };
         }
    }
    for (const other of nearby) {
        if (other.id === player.id && playerHasShield) continue; 
        if (entity.ownerId === 'player' && (other.id === player.id || other.ownerId === 'player')) continue;
        if (isPlayer && other.ownerId === 'player') continue;
        if (isPlayer) {
             const insideSeaweed = obstacles.some(o => o.type === 'SEAWEED' && dist(other, o) < o.radius);
             if (insideSeaweed) continue;
        }
        const d = dist(entity, other), dirX = (other.x - entity.x) / d, dirY = (other.y - entity.y) / d;
        const sizeRatio = other.radius / entity.radius;
        const isPredator = sizeRatio > 1.1; 
        const isFood = other.radius < entity.radius * 0.9 || other.type === CreatureType.PLANKTON;
        if (isPredator) {
            if (!other.camoActive) {
                let panicMultiplier = (sizeRatio > 5.0 || other.radius > 100) ? 4.0 : (sizeRatio > 2.0 ? 1.5 : 1.0);
                const repulsion = 50000 / (d * d + 1), evasionForce = repulsion * 300 * panicMultiplier;
                fx -= dirX * evasionForce; fy -= dirY * evasionForce; fearFactor += repulsion * panicMultiplier;
                if (sizeRatio > 5.0 || other.radius > 100) panicFactor += repulsion;
            }
        } else if (isFood) {
            if (d < nearestFoodDist) {
                nearestFoodDist = d; nearestFood = other;
                if ('id' in other) targetEntityId = (other as Entity).id;
            }
        }
    }
    if (fearFactor > 0.8) { targetEntityId = null; } 
    else if (nearestFood) {
        const dx = nearestFood.x - entity.x, dy = nearestFood.y - entity.y, d = Math.hypot(dx, dy);
        fx += (dx / d) * 2.5; fy += (dy / d) * 2.5;
    } else {
        if (!isPlayer && entity.ownerId !== 'player') { 
             fx += Math.cos(entity.angle) * 0.5; fy += Math.sin(entity.angle) * 0.5;
             if (Math.random() < 0.05) { fx += (Math.random() - 0.5) * 2; fy += (Math.random() - 0.5) * 2; }
        }
    }
    const desiredAngle = (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) ? Math.atan2(fy, fx) : entity.angle;
    return { desiredAngle, targetEntityId, fearFactor, panicFactor };
};


const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities, hazards, obstacles, treasures } = state; 
  updateStrategyState(entity);
  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;
  if (entity.type === CreatureType.PLANKTON) {
    entity.x += Math.cos(entity.angle) * 0.5;
    entity.y += Math.sin(entity.angle) * 0.5;
    if (Math.random() < 0.01) entity.angle += (Math.random() - 0.5) * 2;
    clampToMap(entity); return; 
  }
  if (entity.type === CreatureType.MASCOT) {
      entity.y += Math.sin(state.time * 0.05) * 1.5;
      if (dist(entity, player) < 400 && !entity.speechBubble && state.time % 240 === 0) {
          entity.speechBubble = { text: "马年快乐!", timer: 120, color: '#f59e0b' };
      }
      return; 
  }
  const playerHasShield = player.shieldTimer > 0 || player.isInvulnerable || player.isGodMode;
  if (playerHasShield && entity.targetId === 'player') {
      entity.targetId = null; entity.angle += Math.PI;
      if (!entity.speechBubble) entity.speechBubble = { text: "?", timer: 30, color: 'white' };
  }
  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  const { desiredAngle, targetEntityId, fearFactor, panicFactor } = calculateAIMovement(entity, entities, player, hazards, obstacles, false, treasures);
  if (targetEntityId) entity.targetId = targetEntityId;
  if (panicFactor > 0.1) entity.fearTimer = 20; 
  let angleDiff = desiredAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;
  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  if (panicFactor > 0.1) { 
      const panicIntensity = Math.min(2.5, panicFactor * 0.5), panicSpeed = 1.5 + panicIntensity;
      speedMult = Math.max(speedMult, panicSpeed);
  }
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  if (entity.ownerId === 'player') speedMult *= 1.1;
  const finalSpeed = entity.speed * speedMult;
  entity.vx = Math.cos(entity.angle) * finalSpeed; entity.vy = Math.sin(entity.angle) * finalSpeed;
  entity.x += entity.vx; entity.y += entity.vy;
  if (entity.renderScale > 1.0) entity.renderScale += (1.0 - entity.renderScale) * 0.1;
  clampToMap(entity);
};

const processCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[], state: GameState) => {
  if (attacker.type === CreatureType.MASCOT || victim.type === CreatureType.MASCOT) return;
  if ('shieldTimer' in victim) {
      const v = victim as PlayerState;
      if (v.shieldTimer > 0 || v.isGodMode || v.isInvulnerable) {
          const angle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
          attacker.x += Math.cos(angle) * 20; attacker.y += Math.sin(angle) * 20;
          particles.push(createParticle((attacker.x+victim.x)/2, (attacker.y+victim.y)/2, '#06b6d4')); return;
      }
  }
  const isFriendly = (e: Entity | PlayerState) => e.id === 'player' || ('ownerId' in e && e.ownerId === 'player');
  if (isFriendly(attacker) && isFriendly(victim)) return;
  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  if (Math.abs(angleDiff) > Math.PI / 3) return;

  if (victim.type === CreatureType.PLANKTON) {
    let massGained = attacker.radius > 60 ? 0 : GAME_MECHANICS.PLANKTON_MASS;
    attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, Math.sqrt(attacker.radius * attacker.radius + massGained));
    if ('weight' in attacker) {
       const w = (attacker as PlayerState); w.weight += victim.config.weightValue;
       w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
    }
    victim.health = 0; attacker.renderScale = 1.1; attacker.happyTimer = 60; 
    if (Math.random() < 0.1) attacker.speechBubble = { text: "好吃", timer: 60, color: '#bef264' };
    return;
  }

  if (attacker.radius > victim.radius) {
      const ratio = attacker.radius / victim.radius;
      if (victim.id === 'player') {
         if (!(attacker.targetId === 'player' && (attacker.aggroTimer || 0) > 0)) {
              attacker.targetId = 'player'; attacker.aggroTimer = 300; attacker.speechBubble = { text: getRandomPhrase(ANGRY_PHRASES), timer: 60, color: '#ef4444' };
              const ang = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
              victim.x = attacker.x + Math.cos(ang) * (attacker.radius + victim.radius + 15); victim.y = attacker.y + Math.sin(ang) * (attacker.radius + victim.radius + 15);
              victim.vx += Math.cos(ang) * 15; victim.vy += Math.sin(ang) * 15;
              if ('invulnerableTimer' in victim) { (victim as PlayerState).invulnerableTimer = 30; (victim as PlayerState).isInvulnerable = true; }
              victim.fearTimer = 60; if (!victim.speechBubble) victim.speechBubble = { text: "妈耶!", timer: 45, color: '#fca5a5' };
              for(let k=0; k<10; k++) particles.push(createParticle(attacker.x, attacker.y, '#ef4444')); return; 
         }
      }
      let swallowChance = ratio < 1.2 ? 0.01 : (ratio < 2.0 ? 0.05 + (ratio - 1.2) * 0.3 : (ratio < 3.0 ? 0.50 : (ratio < 5.0 ? 0.80 : 1.0)));
      let chaseAngleDiff = Math.abs(attacker.angle - victim.angle);
      while (chaseAngleDiff > Math.PI) chaseAngleDiff -= Math.PI * 2;
      while (chaseAngleDiff < -Math.PI) chaseAngleDiff += Math.PI * 2;
      const isAmbush = Math.abs(chaseAngleDiff) < Math.PI / 3; 
      if (isAmbush) swallowChance += 0.4; 
      if (Math.random() < swallowChance) {
          if (attacker.id === 'player' && !victim.ownerId) {
               const squadCount = state.entities.filter(e => e.ownerId === 'player').length;
               if (squadCount < GAME_MECHANICS.MAX_SQUAD_SIZE) {
                   victim.ownerId = 'player'; victim.health = victim.maxHealth; victim.targetId = null; victim.speechBubble = { text: getRandomPhrase(SQUAD_PHRASES), timer: 90, color: '#bef264' };
                   for(let i=0; i<10; i++) particles.push(createParticle(victim.x, victim.y, '#4ade80'));
                   const w = (attacker as PlayerState); w.weight += victim.config.weightValue * 0.5; attacker.happyTimer = 60; return; 
               }
          }
          let efficiency = victim.radius / attacker.radius < 0.20 ? 0 : (victim.radius / attacker.radius < 0.35 ? 0.1 : 0.5);
          attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, Math.sqrt(attacker.radius * attacker.radius + (victim.radius * victim.radius) * efficiency));
          victim.health = 0; attacker.renderScale = 1.2; attacker.happyTimer = 60;
          attacker.speechBubble = { text: isAmbush ? "偷袭!" : getRandomPhrase(EAT_PHRASES), timer: 60, color: isAmbush ? '#fef08a' : '#bef264' };
          particles.push(createParticle(victim.x, victim.y, victim.config.color)); particles.push(createParticle(victim.x, victim.y, 'white'));
          if ('weight' in attacker) {
              const w = (attacker as PlayerState); w.weight += victim.config.weightValue * 2.0; 
              w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
          }
      } else {
          let damage = attacker.config.damage * 1.2; if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
          if (isAmbush) {
              damage *= 3.0; for(let k=0; k<8; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
              attacker.speechBubble = { text: "暴击!", timer: 45, color: '#ef4444' };
          } else {
              const bounceAngle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
              attacker.x += Math.cos(bounceAngle) * 10; attacker.y += Math.sin(bounceAngle) * 10;
              attacker.speechBubble = { text: "好硬!", timer: 30, color: 'white' }; victim.speechBubble = { text: "卡喉咙!", timer: 45, color: '#fca5a5' };
          }
          victim.health -= damage; particles.push(createParticle(victim.x, victim.y, 'red'));
          if (!('weight' in victim)) { 
              const v = victim as Entity; v.targetId = attacker.id; v.aggroTimer = 300; v.speedBoostTimer = (v.speedBoostTimer || 0) + 10; v.angle = attacker.angle; 
          }
      }
  } else {
      if (Math.random() < 0.85) { particles.push(createParticle((attacker.x + victim.x)/2, (attacker.y + victim.y)/2, '#94a3b8')); return; }
      let damage = attacker.config.damage; if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
      if (victim.radius > attacker.radius * GAME_MECHANICS.AGGRO_SIZE_THRESHOLD) {
          if (!('weight' in victim)) {
              const v = victim as Entity; v.targetId = attacker.id; v.aggroTimer = 300; v.speechBubble = { text: "找死!", timer: 60, color: '#ef4444' };
          }
      }
      let desiredMassSteal = damage * GAME_MECHANICS.COMBAT_BITE_MASS_FACTOR, availableMass = Math.max(0, victim.radius * victim.radius - GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE * GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE);
      let actualMassSteal = Math.min(desiredMassSteal, availableMass);
      attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, Math.sqrt(attacker.radius * attacker.radius + actualMassSteal));
      victim.radius = Math.max(GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE, Math.sqrt(victim.radius * victim.radius - actualMassSteal));
      attacker.renderScale = 1.05; victim.renderScale = 0.95;
      particles.push(createParticle((attacker.x + victim.x) / 2, (attacker.y + victim.y) / 2, victim.config.color));
      if ('weight' in attacker) { (attacker as PlayerState).eatenHistory[victim.type] = ((attacker as PlayerState).eatenHistory[victim.type] || 0) + 1; attacker.happyTimer = 60; }
      if (!('weight' in victim)) { (victim as Entity).targetId = attacker.id; (victim as Entity).aggroTimer = 200; }
      victim.health -= damage; attacker.speechBubble = { text: "爽!", timer: 45, color: '#bef264' }; victim.speechBubble = { text: getRandomPhrase(HURT_PHRASES), timer: 60, color: '#f87171' };
  }
  if (victim.id !== 'player' && victim.health <= 0) {
      if (attacker.id === 'player' && !victim.ownerId) {
          const squadCount = state.entities.filter(e => e.ownerId === 'player').length;
          if (squadCount < GAME_MECHANICS.MAX_SQUAD_SIZE) {
               victim.ownerId = 'player'; victim.health = victim.maxHealth; victim.targetId = null; victim.speechBubble = { text: getRandomPhrase(SQUAD_PHRASES), timer: 90, color: '#bef264' };
               for(let i=0; i<10; i++) particles.push(createParticle(victim.x, victim.y, '#4ade80')); return; 
          }
      }
      victim.health = 0; if ('weight' in attacker) (attacker as PlayerState).weight += victim.config.weightValue;
      if (victim.radius >= attacker.radius * 2.0) {
           attacker.speechBubble = { text: "逆转!", timer: 90, color: '#fbbf24' }; attacker.happyTimer = 120; 
           for(let k=0; k<30; k++) { let p = createParticle(victim.x, victim.y, victim.config.color); p.vx *= 3; p.vy *= 3; p.life = 1.5; p.size *= 1.5; particles.push(p); }
           for(let k=0; k<20; k++) { let p = createParticle(victim.x, victim.y, '#fbbf24'); p.vx *= 4; p.vy *= 4; p.life = 1.0; particles.push(p); }
           for(let k=0; k<16; k++) { let ang = (Math.PI * 2 * k) / 16; particles.push({ ...createParticle(victim.x, victim.y, '#ffffff'), vx: Math.cos(ang) * 8, vy: Math.sin(ang) * 8, life: 0.5, size: 5 }); }
      } else {
           for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color)); attacker.happyTimer = 60;
      }
  }
};

const spawnTreasures = (state: GameState) => {
    if (state.time > 0 && state.time % TREASURE_CONFIG.SPAWN_INTERVAL === 0) {
        let tx = 0, ty = 0;
        for(let i=0; i<10; i++) { 
            const angle = Math.random() * Math.PI * 2, distVal = 500 + Math.random() * 2000;
            tx = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * distVal;
            ty = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * distVal;
            if (isPositionValid(tx, ty, 200)) break;
        }
        const type = Math.random() < 0.6 ? 'FEAST' : 'CHEST';
        if (!state.treasures) state.treasures = [];
        state.treasures.push({
            id: uuid(), x: tx, y: ty, type, status: 'WARNING',
            timer: TREASURE_CONFIG.WARNING_DURATION,
            radius: TREASURE_CONFIG.RADIUS
        });
        const typeText = type === 'FEAST' ? '超级盛宴' : '神秘宝箱';
        state.player.speechBubble = { text: `${typeText} 即将出现!`, timer: 120, color: '#fbbf24' };
    }
};

const updateTreasures = (state: GameState) => {
    if (!state.treasures) return;
    const { player, entities } = state;
    state.treasures.forEach(t => {
        if (t.status === 'WARNING') {
            t.timer--;
            if (t.timer <= 0) t.status = 'ACTIVE';
        }
        if (t.status === 'ACTIVE') {
            if (dist(player, t) < player.radius + t.radius) {
                t.timer = -1;
                if (t.type === 'FEAST') {
                    player.weight += TREASURE_CONFIG.MASS_REWARD;
                    player.speechBubble = { text: "饱餐一顿!", timer: 120, color: '#bef264' };
                    for(let i=0; i<30; i++) state.particles.push(createParticle(t.x, t.y, '#bef264'));
                } else {
                    player.shieldTimer = TREASURE_CONFIG.BUFF_DURATION;
                    player.speedBoostTimer = TREASURE_CONFIG.BUFF_DURATION;
                    player.speechBubble = { text: "神力加持!", timer: 120, color: '#d8b4fe' };
                    for(let i=0; i<30; i++) state.particles.push(createParticle(t.x, t.y, '#d8b4fe'));
                }
            }
            for (const ent of entities) {
                if (dist(ent, t) < ent.radius + t.radius) {
                    t.timer = -1; ent.renderScale = 1.5;
                    ent.speechBubble = { text: "抢到了!", timer: 60, color: '#fbbf24' };
                    if (t.type === 'FEAST') {
                        ent.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, Math.sqrt(ent.radius*ent.radius + 3000));
                    } else {
                        ent.isInvulnerable = true; ent.speedBoostTimer = TREASURE_CONFIG.BUFF_DURATION;
                    }
                    break;
                }
            }
        }
    });
    state.treasures = state.treasures.filter(t => t.timer !== -1);
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  if (state.status !== GameStatus.PLAYING && state.status !== GameStatus.MENU) return state;
  state.time++;
  if (state.entities.length < MAX_ENTITIES) {
      const r = Math.random();
      let type = r < 0.6 ? CreatureType.PLANKTON : (r < 0.8 ? CreatureType.CLOWN_FISH : (r < 0.9 ? CreatureType.JELLYFISH : (r < 0.95 ? CreatureType.CRAB : CreatureType.STINGRAY)));
      const spawnX = Math.random() * WORLD_SIZE, spawnY = Math.random() * WORLD_SIZE;
      if (isPositionValid(spawnX, spawnY, 150)) state.entities.push(createEntity(type, spawnX, spawnY));
  }
  spawnPowerUps(state);
  spawnHazards(state);
  spawnPortals(state);
  spawnMascot(state);
  spawnTreasures(state);
  
  const { player, entities, particles, obstacles, powerUps, hazards, projectiles, treasures } = state;
  if (state.status === GameStatus.PLAYING) {
      if (player.cosmetics && player.cosmetics.trailType && player.cosmetics.trailType !== 'NONE') {
          if (Math.random() < 0.4) {
              const tType = player.cosmetics.trailType;
              let color = '#ffffff', size = Math.random() * 3 + 2, life = 0.5;
              if (tType === 'BUBBLES') color = 'rgba(255,255,255,0.5)';
              else if (tType === 'RAINBOW') color = `hsl(${(state.time * 10) % 360}, 100%, 50%)`;
              else if (tType === 'FIRE') color = Math.random() < 0.5 ? '#ef4444' : '#f59e0b';
              else if (tType === 'GLITTER') { color = '#fef08a'; life = 0.8; }
              else if (tType === 'HEARTS') color = '#ec4899';
              else if (tType === 'ELECTRIC') color = '#22d3ee';
              else if (tType === 'SLIME') color = '#4ade80';
              state.particles.push({ id: uuid(), x: player.x - Math.cos(player.angle) * player.radius, y: player.y - Math.sin(player.angle) * player.radius, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life, maxLife: life, color, size });
          }
      }
      
      // 计算目标角度
      let targetAngle = Math.atan2(mouse.y - screenHeight / 2, mouse.x - screenWidth / 2);
      if (player.isAutoMode) {
          updateStrategyState(player);
          targetAngle = calculateAIMovement(player, entities, player, hazards, obstacles, true, treasures).desiredAngle;
      }

      // 自动修正玩家进入边界时的转向（软性辅助）
      const pCx = MAP_SHAPE_CONFIG.CENTER_X;
      const pCy = MAP_SHAPE_CONFIG.CENTER_Y;
      const pDist = Math.hypot(player.x - pCx, player.y - pCy);
      const pAngleFromCenter = Math.atan2(player.y - pCy, player.x - pCx);
      const pMaxR = getMapBoundaryRadius(pAngleFromCenter);
      if (pDist > pMaxR - 400) {
          const toCenter = Math.atan2(pCy - player.y, pCx - player.x);
          const weight = (pDist - (pMaxR - 400)) / 400;
          // 平滑地将目标航向转向地图中心
          let diff = toCenter - targetAngle;
          while(diff > Math.PI) diff -= Math.PI*2;
          while(diff < -Math.PI) diff += Math.PI*2;
          targetAngle += diff * weight * 0.8;
      }

      let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
      let angleDiff = targetAngle - player.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      player.angle += angleDiff * agility;
      
      let speedMult = player.stats.speedMult;
      if (isSpacePressed && player.boost.current > 0) {
          player.boost.active = true; player.boost.current -= BOOST_CONFIG.DRAIN_RATE;
          let massBonus = player.radius > 150 ? 1.8 : (player.radius > 100 ? 1.5 : (player.radius > 50 ? 1.2 : 1.0));
          speedMult *= (BOOST_CONFIG.SPEED_MULTIPLIER * massBonus);
      } else {
          player.boost.active = false; 
          if (player.boost.current < player.boost.max) player.boost.current += BOOST_CONFIG.REGEN_RATE;
      }
      if (player.speedBoostTimer && player.speedBoostTimer > 0) { speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER; player.speedBoostTimer--; }
      
      player.vx = Math.cos(player.angle) * player.speed * speedMult; 
      player.vy = Math.sin(player.angle) * player.speed * speedMult;
      
      player.x += player.vx; player.y += player.vy;
      clampToMap(player);
      
      if (player.shieldTimer > 0) player.shieldTimer--;
      if (player.invulnerableTimer > 0) { player.invulnerableTimer--; if (player.invulnerableTimer <= 0) player.isInvulnerable = false; }
      if (player.torpedoCooldown > 0) player.torpedoCooldown--;
      if (player.happyTimer && player.happyTimer > 0) player.happyTimer--;
      if (player.fearTimer && player.fearTimer > 0) player.fearTimer--;
      if (player.speechBubble) { player.speechBubble.timer--; if (player.speechBubble.timer <= 0) player.speechBubble = null; }
      if (isMouseDown && player.torpedoCount > 0 && player.torpedoCooldown <= 0) {
           player.torpedoCount--; player.torpedoCooldown = GAME_MECHANICS.TORPEDO_COOLDOWN;
           state.projectiles.push({ id: uuid(), x: player.x + Math.cos(player.angle) * (player.radius + 10), y: player.y + Math.sin(player.angle) * (player.radius + 10), vx: Math.cos(player.angle) * GAME_MECHANICS.TORPEDO_SPEED, vy: Math.sin(player.angle) * GAME_MECHANICS.TORPEDO_SPEED, radius: 8, damage: GAME_MECHANICS.TORPEDO_DAMAGE, life: 120, angle: player.angle, targetId: null });
      }
      const nextType = getNextEvolution(player.type, player.eatenHistory, player.radius);
      if (nextType !== player.type) {
           const oldRatio = player.health / player.maxHealth, newConfig = CREATURES[nextType];
           player.type = nextType; player.config = newConfig; player.maxHealth = newConfig.health * player.stats.sizeMult; 
           player.health = player.maxHealth * oldRatio; player.evolutionVisualTimer = 180; player.speechBubble = { text: "进化!", timer: 120, color: '#d8b4fe' };
           for(let i=0; i<30; i++) state.particles.push(createParticle(player.x, player.y, '#d8b4fe'));
      }
      checkHiding(player, obstacles); player.currentBiome = getBiome(player.x, player.y);
  }
  state.entities.forEach(ent => {
     updateAI(ent, state);
     const dToCenter = Math.hypot(ent.x - MAP_SHAPE_CONFIG.CENTER_X, ent.y - MAP_SHAPE_CONFIG.CENTER_Y);
     if (dToCenter > MAP_SHAPE_CONFIG.BASE_RADIUS + MAP_SHAPE_CONFIG.PETAL_VARIANCE + 300) ent.health = 0;
  });
  state.entities = state.entities.filter(e => e.health > 0);
  state.projectiles = state.projectiles.filter(p => p.life > 0);
  state.projectiles.forEach(p => {
      p.life--; p.x += p.vx; p.y += p.vy;
      if (Math.random() < 0.5) state.particles.push({ ...createParticle(p.x, p.y, '#f87171'), size: 2, life: 0.3 });
      for (const ent of state.entities) {
          if (dist(p, ent) < ent.radius + p.radius) { ent.health -= p.damage; p.life = 0; for(let i=0; i<5; i++) state.particles.push(createParticle(p.x, p.y, '#ef4444')); ent.aggroTimer = 120; ent.targetId = 'player'; break; }
      }
  });
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      if (p.interactionType === 'SHRINK' && dist(p, player) < player.radius) { player.radius = Math.max(10, player.radius * 0.999); }
  });
  updateHazards(state, state.particles); updatePortals(state, state.particles); updateBuildings(state, state.particles); updateTreasures(state);
  if (state.status === GameStatus.PLAYING) {
      for (let i = 0; i < state.entities.length; i++) {
          const e1 = state.entities[i];
          if (dist(e1, player) < e1.radius + player.radius) { processCollision(e1, player, state.particles, state); processCollision(player, e1, state.particles, state); }
          for (let j = i + 1; j < state.entities.length; j++) {
              const e2 = state.entities[j];
              if (dist(e1, e2) < e1.radius + e2.radius) { processCollision(e1, e2, state.particles, state); processCollision(e2, e1, state.particles, state); }
          }
      }
      state.powerUps = state.powerUps.filter(p => {
          if (dist(player, p) < player.radius + p.radius) {
              if (p.type === 'SPEED') { player.speedBoostTimer = GAME_MECHANICS.SPEED_ITEM_DURATION; player.speechBubble = { text: "加速!", timer: 60, color: '#fde047' }; } 
              else if (p.type === 'SHIELD') { player.shieldTimer = GAME_MECHANICS.SHIELD_DURATION; player.speechBubble = { text: "护盾!", timer: 60, color: '#22d3ee' }; } 
              else if (p.type === 'TORPEDO') { player.torpedoCount += 3; player.speechBubble = { text: "鱼雷装填!", timer: 60, color: '#f87171' }; }
              return false; 
          }
          return true;
      });
      if (player.health <= 0 && !emergencySquadSwitch(state)) state.status = GameStatus.GAME_OVER;
  }
  state.camera.x += (player.x - state.camera.x) * 0.1; state.camera.y += (player.y - state.camera.y) * 0.1;
  const targetZoom = Math.max(0.3, Math.min(1.5, 1.0 - (player.radius / 800)));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;
  return state;
};