
import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal, BiomeType, Building, BuildingType } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const EAT_PHRASES = ["好吃!", "真香!", "爽!", "嗝~", "美味!", "再來!", "捕获!", "进框!", "收!"];
const HURT_PHRASES = ["疼!", "哎哟!", "别吃我!", "雅蠛蝶!", "救命!", "好痛!", "卡喉咙了!"];
const SQUAD_PHRASES = ["老大!", "跟你混了!", "誓死效忠!", "冲啊!", "战队+1"];
const PANIC_PHRASES = ["巨物恐惧!", "快逃!", "太大了!", "看不见我...", "妈耶!"];
const AMBUSH_PHRASES = ["偷袭!", "背刺!", "千年杀!", "不讲武德!"];
const ANGRY_PHRASES = ["别跑!", "站住!", "你瞅啥?", "吼!!", "小别致!"];

const getRandomPhrase = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// --- MAP GEOMETRY ---
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

// Clamp position to flower boundary and ensure not NaN
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
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    
    const limit = getMapBoundaryRadius(angle) - entity.radius;
    
    if (dist > limit) {
        entity.x = cx + Math.cos(angle) * limit;
        entity.y = cy + Math.sin(angle) * limit;
        
        if (entity.vx !== undefined && entity.vy !== undefined) {
             entity.vx *= -0.5;
             entity.vy *= -0.5;
             entity.angle += Math.PI;
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
    if (!isPositionValid(x, y, 100)) continue;

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
    
    // SPAWN 4 SHOPS
    const cx = MAP_SHAPE_CONFIG.CENTER_X;
    const cy = MAP_SHAPE_CONFIG.CENTER_Y;
    const shopDist = 2200;

    const addShop = (angle: number) => {
        buildings.push({
            id: uuid(),
            x: cx + Math.cos(angle) * shopDist,
            y: cy + Math.sin(angle) * shopDist,
            type: BuildingType.SHOP,
            radius: BUILDING_CONFIGS.SHOP.radius,
            cooldown: 0
        });
    };

    addShop(-Math.PI * 0.75); 
    addShop(-Math.PI * 0.25);
    addShop(Math.PI * 0.75);
    addShop(Math.PI * 0.25);
    
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
  const dist = 600 + Math.random() * 1000;
  
  const r = Math.random();
  let type: 'SPEED' | 'SHIELD' | 'TORPEDO' = 'SPEED';
  
  if (r < 0.6) type = 'SPEED';
  else if (r < 0.8) type = 'SHIELD';
  else type = 'TORPEDO';

  // Ensure within map
  const x = state.player.x + Math.cos(angle) * dist;
  const y = state.player.y + Math.sin(angle) * dist;
  if (!isPositionValid(x, y)) return;

  state.powerUps.push({
    id: uuid(),
    x,
    y,
    type,
    radius: 20
  });
};

const spawnHazards = (state: GameState) => {
  if (state.time % METEOR_CONFIG.INTERVAL === 0) {
    for (let i = 0; i < METEOR_CONFIG.WAVE_COUNT; i++) {
      let tx, ty;
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

      if (!isPositionValid(tx, ty)) continue;

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
          if (isPositionValid(pos.x, pos.y)) {
              const mascot = createEntity(CreatureType.MASCOT, pos.x, pos.y);
              mascot.angle = -Math.PI / 2;
              state.entities.push(mascot);
          }
      }
  });
};

const spawnPortals = (state: GameState) => {
    if (state.portals.length >= (PORTAL_CONFIG as any).MAX_COUNT || 6) return;
    if (Math.random() > (PORTAL_CONFIG as any).SPAWN_CHANCE || 0.002) return;
    const px = Math.random() * WORLD_SIZE;
    const py = Math.random() * WORLD_SIZE;
    if (isPositionValid(px, py)) {
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
                vx: vx,
                vy: vy
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

                for(let i=0; i<20; i++) particles.push(createParticle(entity.x, entity.y, '#d8b4fe'));
                entity.x = dest.x;
                entity.y = dest.y;
                for(let i=0; i<20; i++) particles.push(createParticle(entity.x, entity.y, '#22d3ee'));
                
                entity.speechBubble = { text: "穿越!", timer: 60, color: '#d8b4fe' };
                if (entity.id === 'player') (entity as PlayerState).shieldTimer = 120;
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
                vx: 0, 
                vy: -1
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
    if (entity.isIdle) entity.lureActive = true;
    else {
      if (entity.lureActive) entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
      entity.lureActive = false;
    }
  }
  if (entity.config.special === 'CAMO') {
    if (entity.isIdle) entity.camoActive = true;
    else {
      if (entity.camoActive) entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
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

const calculateAIMovement = (entity: Entity, entities: Entity[], player: PlayerState, hazards: Hazard[], obstacles: Obstacle[], isPlayer: boolean) => {
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

    let fx = 0, fy = 0, fearFactor = 0, panicFactor = 0;
    let nearestFoodDist = Infinity;
    let nearestFood: {x: number, y: number} | null = null;
    let targetEntityId: string | null = null;
    
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
        if (h.stage !== 'COOLDOWN' && h.timer > 0) {
            const d = dist(entity, h);
            if (d < h.radius + 100) {
                const dirX = (h.x - entity.x) / d;
                const dirY = (h.y - entity.y) / d;
                const evadeWeight = 5000 / (d + 1);
                fx -= dirX * evadeWeight; fy -= dirY * evadeWeight;
                fearFactor += evadeWeight;
            }
        }
    }

    if (entity.aggroTimer && entity.aggroTimer > 0 && entity.targetId) {
         let target = null;
         if (entity.targetId === 'player') target = player;
         else target = entities.find(e => e.id === entity.targetId);
         
         if (target && !target.isHidden) {
             const distToTarget = dist(entity, target);
             const dx = target.x - entity.x;
             const dy = target.y - entity.y;
             fx += (dx / distToTarget) * 4.0; fy += (dy / distToTarget) * 4.0;
             const desiredAngle = Math.atan2(fy, fx);
             return { desiredAngle, targetEntityId: entity.targetId, fearFactor: 0, panicFactor: 0 };
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

        const d = dist(entity, other);
        const dirX = (other.x - entity.x) / d;
        const dirY = (other.y - entity.y) / d;
        const sizeRatio = other.radius / entity.radius;
        const isPredator = sizeRatio > 1.1; 
        const isFood = other.radius < entity.radius * 0.9 || other.type === CreatureType.PLANKTON;

        if (isPredator) {
            if (!other.camoActive) {
                let panicMultiplier = 1.0;
                if (sizeRatio > 5.0 || other.radius > 100) panicMultiplier = 4.0; 
                else if (sizeRatio > 2.0) panicMultiplier = 1.5;

                const distanceSq = d * d;
                const repulsion = 50000 / (distanceSq + 1); 
                const evasionForce = repulsion * 300 * panicMultiplier;

                fx -= dirX * evasionForce; fy -= dirY * evasionForce;
                fearFactor += repulsion * panicMultiplier;
                
                if (sizeRatio > 5.0 || other.radius > 100) panicFactor += repulsion;
                
                if (sizeRatio > 5.0 && d < 400 && Math.random() < 0.05 && !entity.speechBubble) {
                     entity.speechBubble = { text: getRandomPhrase(PANIC_PHRASES), timer: 45, color: '#fca5a5' };
                }
            }
        } else if (isFood) {
            if (d < nearestFoodDist) {
                nearestFoodDist = d;
                nearestFood = other;
                if ('id' in other) targetEntityId = (other as Entity).id;
            }
        }
        
        if (other.id === player.id && !isPlayer) {
             const p = other as PlayerState;
             if (p.weight <= BOOST_CONFIG.OVERDRIVE_MIN_WEIGHT + 0.5) {
                 if (Math.random() < 0.005 && !entity.speechBubble && dist(entity, player) < 400) {
                     entity.speechBubble = { text: getRandomPhrase(SKINNY_PHRASES), timer: 60, color: '#fca5a5' };
                 }
             }
        }
    }

    if (fearFactor > 0.8) targetEntityId = null; 
    else if (nearestFood) {
        const dx = nearestFood.x - entity.x;
        const dy = nearestFood.y - entity.y;
        const d = Math.hypot(dx, dy);
        fx += (dx / d) * 2.5; fy += (dy / d) * 2.5;
    } else {
        if (!isPlayer && entity.ownerId !== 'player') { 
             fx += Math.cos(entity.angle) * 0.5; fy += Math.sin(entity.angle) * 0.5;
             if (Math.random() < 0.05) {
                fx += (Math.random() - 0.5) * 2; fy += (Math.random() - 0.5) * 2;
             }
        }
    }
    const desiredAngle = (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) ? Math.atan2(fy, fx) : entity.angle;
    return { desiredAngle, targetEntityId, fearFactor, panicFactor };
};

const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities, hazards, obstacles } = state; 
  updateStrategyState(entity);

  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;

  if (entity.type === CreatureType.PLANKTON) {
    entity.x += Math.cos(entity.angle) * 0.5;
    entity.y += Math.sin(entity.angle) * 0.5;
    if (Math.random() < 0.01) entity.angle += (Math.random() - 0.5) * 2;
    clampToMap(entity);
    return; 
  }

  // --- MASCOT SPECIAL MOVEMENT ---
  if (entity.type === CreatureType.MASCOT) {
      entity.y += Math.sin(state.time * 0.05) * 1.5;
      if (dist(entity, player) < 400) {
          if (!entity.speechBubble && state.time % 240 === 0) {
              entity.speechBubble = { text: "马年快乐!", timer: 120, color: '#f59e0b' };
          }
      }
      return; 
  }

  const playerHasShield = player.shieldTimer > 0 || player.isInvulnerable || player.isGodMode;
  if (playerHasShield && entity.targetId === 'player') {
      entity.targetId = null; 
      entity.angle += Math.PI;
      if (!entity.speechBubble) entity.speechBubble = { text: "?", timer: 30, color: 'white' };
  }

  // Use higher base turn speed and reduced size penalty
  let agility = Math.max(0.05, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  const { desiredAngle, targetEntityId, fearFactor, panicFactor } = calculateAIMovement(entity, entities, player, hazards, obstacles, false);
  
  if (targetEntityId) entity.targetId = targetEntityId;
  if (panicFactor > 0.1) entity.fearTimer = 20; 

  let angleDiff = desiredAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;

  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  if (panicFactor > 0.1) { 
      const panicIntensity = Math.min(2.5, panicFactor * 0.5);
      speedMult = Math.max(speedMult, 1.5 + panicIntensity);
      if (Math.random() < 0.4) {
          const trailAngle = entity.angle + Math.PI + (Math.random() - 0.5) * 0.5;
          const px = entity.x + Math.cos(trailAngle) * entity.radius;
          const py = entity.y + Math.sin(trailAngle) * entity.radius;
          state.particles.push({
             ...createParticle(px, py, 'rgba(255,255,255,0.3)'),
             size: Math.random() * 3 + 1,
             life: 0.4
          });
      }
  }
  
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  if (entity.ownerId === 'player') speedMult *= 1.1;

  const finalSpeed = entity.speed * speedMult;
  entity.vx = Math.cos(entity.angle) * finalSpeed;
  entity.vy = Math.sin(entity.angle) * finalSpeed;

  entity.x += entity.vx;
  entity.y += entity.vy;
  
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
          particles.push(createParticle((attacker.x+victim.x)/2, (attacker.y+victim.y)/2, '#06b6d4')); 
          return;
      }
  }
  const isFriendly = (e: Entity | PlayerState) => e.id === 'player' || ('ownerId' in e && e.ownerId === 'player');
  if (isFriendly(attacker) && isFriendly(victim)) return;

  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  
  const isBiting = Math.abs(angleDiff) < Math.PI / 3;
  if (!isBiting) return;

  if (victim.type === CreatureType.PLANKTON) {
    let massGained = GAME_MECHANICS.PLANKTON_MASS;
    if (attacker.radius > 60) massGained = 0;
    const newRadius = Math.sqrt(attacker.radius * attacker.radius + massGained);
    attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newRadius);
    if ('weight' in attacker) {
       const w = (attacker as PlayerState);
       w.weight += victim.config.weightValue;
       w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
    }
    victim.health = 0; 
    attacker.renderScale = 1.1;
    attacker.happyTimer = 60; 
    if (Math.random() < 0.1) attacker.speechBubble = { text: "好吃", timer: 60, color: '#bef264' };
    return;
  }

  if (attacker.radius > victim.radius) {
      const ratio = attacker.radius / victim.radius;
      if (victim.id === 'player') {
         const isEnraged = attacker.targetId === 'player' && (attacker.aggroTimer || 0) > 0;
         if (!isEnraged) {
              attacker.targetId = 'player';
              attacker.aggroTimer = 300; 
              attacker.speechBubble = { text: getRandomPhrase(ANGRY_PHRASES), timer: 60, color: '#ef4444' };
              attacker.happyTimer = 0;
              const ang = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
              victim.x = attacker.x + Math.cos(ang) * (attacker.radius + victim.radius + 15); 
              victim.y = attacker.y + Math.sin(ang) * (attacker.radius + victim.radius + 15);
              victim.vx += Math.cos(ang) * 15;
              victim.vy += Math.sin(ang) * 15;
              if ('invulnerableTimer' in victim) {
                  (victim as PlayerState).invulnerableTimer = 30; 
                  (victim as PlayerState).isInvulnerable = true;
              }
              victim.fearTimer = 60;
              if (!victim.speechBubble) victim.speechBubble = { text: "妈耶!", timer: 45, color: '#fca5a5' };
              for(let k=0; k<10; k++) particles.push(createParticle(attacker.x, attacker.y, '#ef4444'));
              return; 
         }
      }
      
      let swallowChance = 0;
      if (ratio < 1.2) swallowChance = 0.01; 
      else if (ratio < 2.0) swallowChance = 0.05 + (ratio - 1.2) * 0.3; 
      else if (ratio < 3.0) swallowChance = 0.50; 
      else if (ratio < 5.0) swallowChance = 0.80; 
      else swallowChance = 1.0; 

      let chaseAngleDiff = Math.abs(attacker.angle - victim.angle);
      while (chaseAngleDiff > Math.PI) chaseAngleDiff -= Math.PI * 2;
      while (chaseAngleDiff < -Math.PI) chaseAngleDiff += Math.PI * 2;
      chaseAngleDiff = Math.abs(chaseAngleDiff);
      const isAmbush = chaseAngleDiff < Math.PI / 3; 
      if (isAmbush) swallowChance += 0.4; 
      const isSwallowed = Math.random() < swallowChance;

      if (isSwallowed) {
          if (attacker.id === 'player' && !victim.ownerId) {
               const squadCount = state.entities.filter(e => e.ownerId === 'player').length;
               if (squadCount < GAME_MECHANICS.MAX_SQUAD_SIZE) {
                   victim.ownerId = 'player';
                   victim.health = victim.maxHealth;
                   victim.targetId = null;
                   victim.speechBubble = { text: getRandomPhrase(SQUAD_PHRASES), timer: 90, color: '#bef264' };
                   for(let i=0; i<10; i++) particles.push(createParticle(victim.x, victim.y, '#4ade80'));
                   const w = (attacker as PlayerState);
                   w.weight += victim.config.weightValue * 0.5;
                   attacker.happyTimer = 60;
                   return; 
               }
          }
          const victimMass = victim.radius * victim.radius;
          let efficiency = 0.5;
          const rInv = victim.radius / attacker.radius;
          if (rInv < 0.20) efficiency = 0; 
          else if (rInv < 0.35) efficiency = 0.1; 
          const newR = Math.sqrt(attacker.radius * attacker.radius + victimMass * efficiency);
          attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newR);
          
          victim.health = 0; 
          attacker.renderScale = 1.2; 
          attacker.happyTimer = 60;
          if (isAmbush) attacker.speechBubble = { text: "偷袭!", timer: 60, color: '#fef08a' };
          else attacker.speechBubble = { text: getRandomPhrase(EAT_PHRASES), timer: 60, color: '#bef264' };

          particles.push(createParticle(victim.x, victim.y, victim.config.color));
          particles.push(createParticle(victim.x, victim.y, 'white'));
          if ('weight' in attacker) {
              const w = (attacker as PlayerState);
              w.weight += victim.config.weightValue * 2.0; 
              w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
          }
      } else {
          let damage = attacker.config.damage * 1.2; 
          if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
          if (isAmbush) {
              damage *= 3.0; 
              for(let k=0; k<8; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
              attacker.speechBubble = { text: "暴击!", timer: 45, color: '#ef4444' };
          } else {
              const bounceAngle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
              attacker.x += Math.cos(bounceAngle) * 10; attacker.y += Math.sin(bounceAngle) * 10;
              attacker.speechBubble = { text: "好硬!", timer: 30, color: 'white' };
              victim.speechBubble = { text: "卡喉咙!", timer: 45, color: '#fca5a5' };
          }
          victim.health -= damage;
          particles.push(createParticle(victim.x, victim.y, 'red'));
           if (!('weight' in victim)) { 
              const v = victim as Entity;
              v.targetId = attacker.id; 
              v.aggroTimer = 300; 
              v.speedBoostTimer = (v.speedBoostTimer || 0) + 10; 
              v.angle = attacker.angle; 
          }
      }
  } 
  else {
      if (Math.random() < 0.85) {
          particles.push(createParticle((attacker.x + victim.x)/2, (attacker.y + victim.y)/2, '#94a3b8'));
          return; 
      }
      let damage = attacker.config.damage;
      if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
      if (victim.radius > attacker.radius * GAME_MECHANICS.AGGRO_SIZE_THRESHOLD) {
          if (!('weight' in victim)) {
              const v = victim as Entity;
              v.targetId = attacker.id; 
              v.aggroTimer = 300; 
              v.speechBubble = { text: "找死!", timer: 60, color: '#ef4444' };
          }
      }
      let desiredMassSteal = damage * GAME_MECHANICS.COMBAT_BITE_MASS_FACTOR;
      const victimCurrentMass = victim.radius * victim.radius; 
      const victimMinMass = GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE * GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE;
      const availableMass = Math.max(0, victimCurrentMass - victimMinMass);
      const actualMassSteal = Math.min(desiredMassSteal, availableMass);
      const attackerCurrentMass = attacker.radius * attacker.radius;
      const attackerNewRadius = Math.sqrt(attackerCurrentMass + actualMassSteal);
      attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, attackerNewRadius);
      const victimNewRadius = Math.sqrt(victimCurrentMass - actualMassSteal);
      victim.radius = Math.max(GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE, victimNewRadius);
      attacker.renderScale = 1.05;
      victim.renderScale = 0.95;
      particles.push(createParticle((attacker.x + victim.x) / 2, (attacker.y + victim.y) / 2, victim.config.color));
      if ('weight' in attacker) {
          const w = (attacker as PlayerState);
          w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
          attacker.happyTimer = 60;
      }
      if (!('weight' in victim)) {
         const v = victim as Entity;
         v.targetId = attacker.id;
         v.aggroTimer = 200;
      }
      victim.health -= damage;
      attacker.speechBubble = { text: "爽!", timer: 45, color: '#bef264' };
      victim.speechBubble = { text: getRandomPhrase(HURT_PHRASES), timer: 60, color: '#f87171' };
  }

  if (victim.id !== 'player' && victim.health <= 0) {
      if (attacker.id === 'player' && !victim.ownerId) {
          const squadCount = state.entities.filter(e => e.ownerId === 'player').length;
          if (squadCount < GAME_MECHANICS.MAX_SQUAD_SIZE) {
               victim.ownerId = 'player';
               victim.health = victim.maxHealth;
               victim.targetId = null;
               victim.speechBubble = { text: getRandomPhrase(SQUAD_PHRASES), timer: 90, color: '#bef264' };
               for(let i=0; i<10; i++) particles.push(createParticle(victim.x, victim.y, '#4ade80'));
               return; 
          }
      }
      victim.health = 0; 
      if ('weight' in attacker) (attacker as PlayerState).weight += victim.config.weightValue;
      if (victim.radius >= attacker.radius * 2.0) {
           attacker.speechBubble = { text: "逆转!", timer: 90, color: '#fbbf24' }; 
           attacker.happyTimer = 120; 
           for(let k=0; k<30; k++) {
              const p = createParticle(victim.x, victim.y, victim.config.color);
              p.vx *= 3; p.vy *= 3; p.life = 1.5; p.size *= 1.5;
              particles.push(p);
           }
           for(let k=0; k<20; k++) {
              const p = createParticle(victim.x, victim.y, '#fbbf24');
              p.vx *= 4; p.vy *= 4; p.life = 1.0;
              particles.push(p);
           }
           for(let k=0; k<16; k++) {
              const ang = (Math.PI * 2 * k) / 16;
              particles.push({
                 ...createParticle(victim.x, victim.y, '#ffffff'),
                 vx: Math.cos(ang) * 8, vy: Math.sin(ang) * 8, life: 0.5, size: 5
              });
           }
      } else {
           for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
           attacker.happyTimer = 60;
      }
  }
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  if (state.status !== GameStatus.PLAYING && state.status !== GameStatus.MENU) return state;

  state.time++;
  if (state.entities.length < MAX_ENTITIES) {
      const r = Math.random();
      let type = CreatureType.PLANKTON;
      if (r < 0.6) type = CreatureType.PLANKTON;
      else if (r < 0.8) type = CreatureType.CLOWN_FISH;
      else if (r < 0.9) type = CreatureType.JELLYFISH;
      else if (r < 0.95) type = CreatureType.CRAB;
      else type = CreatureType.STINGRAY; 
      const spawnX = Math.random() * WORLD_SIZE;
      const spawnY = Math.random() * WORLD_SIZE;
      if (isPositionValid(spawnX, spawnY)) state.entities.push(createEntity(type, spawnX, spawnY));
  }
  
  spawnPowerUps(state);
  spawnHazards(state);
  spawnPortals(state);
  spawnMascot(state);
  
  const { player, entities, particles, obstacles, powerUps, hazards, projectiles } = state;

  if (state.status === GameStatus.PLAYING) {
      // Trail Particles Logic
      if (player.cosmetics && player.cosmetics.trailType && player.cosmetics.trailType !== 'NONE') {
          if (Math.random() < 0.4) {
              let color = '#ffffff';
              let size = Math.random() * 3 + 2;
              let life = 0.5;
              const tType = player.cosmetics.trailType;
              if (tType === 'BUBBLES') { color = 'rgba(255,255,255,0.5)'; }
              else if (tType === 'RAINBOW') { color = `hsl(${(state.time * 10) % 360}, 100%, 50%)`; }
              else if (tType === 'FIRE') { color = Math.random() < 0.5 ? '#ef4444' : '#f59e0b'; }
              else if (tType === 'GLITTER') { color = '#fef08a'; life = 0.8; }
              else if (tType === 'HEARTS') { color = '#ec4899'; }
              else if (tType === 'ELECTRIC') { color = '#22d3ee'; }
              else if (tType === 'SLIME') { color = '#4ade80'; }
              state.particles.push({
                  id: uuid(),
                  x: player.x - Math.cos(player.angle) * player.radius, 
                  y: player.y - Math.sin(player.angle) * player.radius,
                  vx: (Math.random() - 0.5) * 2,
                  vy: (Math.random() - 0.5) * 2,
                  life,
                  maxLife: life,
                  color,
                  size
              });
          }
      }

      const cx = screenWidth / 2;
      const cy = screenHeight / 2;
      const dx = mouse.x - cx;
      const dy = mouse.y - cy;
      
      let targetAngle = Math.atan2(dy, dx);
      if (player.isAutoMode) {
          updateStrategyState(player);
          const aiResult = calculateAIMovement(player, entities, player, hazards, obstacles, true);
          targetAngle = aiResult.desiredAngle;
      }

      // Use higher base turn speed and reduced size penalty, min clamp increased
      let agility = Math.max(0.05, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
      let angleDiff = targetAngle - player.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      player.angle += angleDiff * agility;
      let speedMult = player.stats.speedMult;
      const canBoost = player.boost.current > 0;
      if (isSpacePressed && canBoost) {
          player.boost.active = true;
          player.boost.current -= BOOST_CONFIG.DRAIN_RATE;
          
          let massBonus = 1.0;
          if (player.radius > 50) massBonus = 1.2;
          if (player.radius > 100) massBonus = 1.5;
          if (player.radius > 150) massBonus = 1.8;

          speedMult *= (BOOST_CONFIG.SPEED_MULTIPLIER * massBonus);
          if (player.boost.current <= 0 && player.weight > BOOST_CONFIG.OVERDRIVE_MIN_WEIGHT) {
               player.isOverdrive = true;
               player.weight -= BOOST_CONFIG.OVERDRIVE_WEIGHT_COST;
               player.boost.current = 0; 
          } else player.isOverdrive = false;
          if (Math.random() < 0.5) {
              const pAngle = player.angle + Math.PI + (Math.random()-0.5)*0.5;
              state.particles.push({
                  ...createParticle(player.x, player.y, '#fef08a'),
                  vx: Math.cos(pAngle) * 5, vy: Math.sin(pAngle) * 5, life: 0.5
              });
          }
      } else {
          player.boost.active = false;
          player.isOverdrive = false;
          if (player.boost.current < player.boost.max) player.boost.current += BOOST_CONFIG.REGEN_RATE;
      }
      
      if (player.speedBoostTimer && player.speedBoostTimer > 0) {
          speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
          player.speedBoostTimer--;
      }
      
      const moveSpeed = player.speed * speedMult;
      player.vx = Math.cos(player.angle) * moveSpeed;
      player.vy = Math.sin(player.angle) * moveSpeed;
      
      player.x += player.vx;
      player.y += player.vy;
      clampToMap(player);
      
      if (player.shieldTimer > 0) player.shieldTimer--;
      if (player.invulnerableTimer > 0) {
          player.invulnerableTimer--;
          if (player.invulnerableTimer <= 0) player.isInvulnerable = false;
      }
      if (player.torpedoCooldown > 0) player.torpedoCooldown--;
      if (player.happyTimer && player.happyTimer > 0) player.happyTimer--;
      if (player.fearTimer && player.fearTimer > 0) player.fearTimer--;
      if (player.speechBubble) {
          player.speechBubble.timer--;
          if (player.speechBubble.timer <= 0) player.speechBubble = null;
      }
      
      if (isMouseDown && player.torpedoCount > 0 && player.torpedoCooldown <= 0) {
           player.torpedoCount--;
           player.torpedoCooldown = GAME_MECHANICS.TORPEDO_COOLDOWN;
           state.projectiles.push({
               id: uuid(),
               x: player.x + Math.cos(player.angle) * (player.radius + 10),
               y: player.y + Math.sin(player.angle) * (player.radius + 10),
               vx: Math.cos(player.angle) * GAME_MECHANICS.TORPEDO_SPEED,
               vy: Math.sin(player.angle) * GAME_MECHANICS.TORPEDO_SPEED,
               radius: 8,
               damage: GAME_MECHANICS.TORPEDO_DAMAGE,
               life: 120,
               angle: player.angle,
               targetId: null 
           });
      }
      
      const nextType = getNextEvolution(player.type, player.eatenHistory, player.radius);
      if (nextType !== player.type) {
           const oldHealthRatio = player.health / player.maxHealth;
           const newConfig = CREATURES[nextType];
           player.type = nextType;
           player.config = newConfig;
           player.maxHealth = newConfig.health * player.stats.sizeMult; 
           player.health = player.maxHealth * oldHealthRatio;
           player.evolutionVisualTimer = 180; 
           player.speechBubble = { text: "进化!", timer: 120, color: '#d8b4fe' };
           for(let i=0; i<30; i++) state.particles.push(createParticle(player.x, player.y, '#d8b4fe'));
      }
      checkHiding(player, obstacles);
      player.currentBiome = getBiome(player.x, player.y);
  }

  // --- LABEL GENERATION (Dynamic Hints) ---
  state.labels = []; // Clear previous labels
  if (state.status === GameStatus.PLAYING) {
      // 1. Buildings (Always handy)
      state.buildings.forEach(b => {
          const d = dist(player, b);
          if (d < 400) {
              let text = "";
              if (b.type === BuildingType.SHOP) text = "商店: 停止移动进入换装";
              else if (b.type === BuildingType.HOSPITAL) text = "急救站: 靠近恢复生命";
              else if (b.type === BuildingType.ARMORY) text = "军火库: 靠近补充鱼雷";
              else if (b.type === BuildingType.SHRINE) text = "龙王庙: 随机强力BUFF";
              
              if (text) state.labels.push({ x: b.x, y: b.y - b.radius - 20, text, color: '#ffffff' });
          }
      });

      // 2. Portals
      state.portals.forEach(p => {
          if (dist(player, p) < 300) {
              state.labels.push({ x: p.x, y: p.y - p.radius - 30, text: "传送阵: 瞬间转移", color: '#d8b4fe' });
          }
      });

      // 3. Ambush Opportunities (Behind Big Fish)
      state.entities.forEach(e => {
          if (e.radius > player.radius * 1.5 && !e.isHidden && e.type !== CreatureType.PLANKTON) {
              const distToEnemy = dist(player, e);
              if (distToEnemy < 500) {
                  // Check angle to see if player is behind
                  const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);
                  let angleDiff = Math.abs(angleToPlayer - e.angle);
                  while(angleDiff > Math.PI) angleDiff -= Math.PI*2;
                  angleDiff = Math.abs(angleDiff);
                  
                  // If angleDiff is large (close to PI, meaning player vector is opposite to fish velocity vector), player is behind
                  if (angleDiff > 2.0) { // > ~115 degrees
                       state.labels.push({ x: e.x, y: e.y + e.radius + 40, text: "机会! 背后偷袭暴击!", color: '#fca5a5' });
                  }
              }
          }
      });

      // 4. NEW: Extensive Tutorial & Status Hints (Idiot-proofing)
      
      // A. Hiding in Seaweed
      let nearestSeaweed = null;
      let minSeaweedDist = 350;
      state.obstacles.forEach(o => {
          if (o.type === 'SEAWEED') {
              const d = dist(player, o);
              if (d < minSeaweedDist) {
                  minSeaweedDist = d;
                  nearestSeaweed = o;
              }
          }
      });
      if (nearestSeaweed && !player.isHidden) {
          state.labels.push({ x: (nearestSeaweed as Obstacle).x, y: (nearestSeaweed as Obstacle).y - 60, text: "躲进草丛! 隐身!", color: '#bef264' });
      }

      // B. Low Health Warning
      if (player.health < player.maxHealth * 0.3) {
          state.labels.push({ x: player.x, y: player.y - 80, text: "残血了! 快找急救站(红十字)!", color: '#ef4444' });
      }

      // C. Basket Full
      const basketTotal = player.basket.reduce((acc, item) => acc + item.count, 0);
      if (basketTotal >= 3) {
          state.labels.push({ x: player.x, y: player.y + 80, text: "鱼篓满了! 点右下角消化变强!", color: '#f59e0b' });
      }

      // D. Boost Tip
      if (player.boost.current >= 90 && Math.hypot(player.vx, player.vy) > 1 && !isSpacePressed && state.time % 300 < 100) {
           // Intermittent reminder
           state.labels.push({ x: player.x, y: player.y + 110, text: "按住空格冲刺!", color: '#fde047' });
      }

      // E. Newbie Food Hint & Danger Hint
      let foodMarked = false;
      let dangerMarked = false;
      state.entities.forEach(e => {
          const d = dist(player, e);
          
          // Food (Only for small players)
          if (player.radius < 30 && !foodMarked && e.type === CreatureType.PLANKTON && d < 400) {
              state.labels.push({ x: e.x, y: e.y - 20, text: "吃我! +经验", color: '#86efac' });
              foodMarked = true;
          }

          // Danger (Any size)
          if (!dangerMarked && e.radius > player.radius * 1.5 && d < 550 && !e.isHidden) {
              state.labels.push({ x: e.x, y: e.y - e.radius - 30, text: "太大了! 快跑!", color: '#ef4444' });
              dangerMarked = true;
          }
      });

      // F. PowerUp Identification
      state.powerUps.forEach(p => {
          if (dist(player, p) < 400) {
              let txt = "道具";
              let col = "#fff";
              if (p.type === 'SPEED') { txt = "加速BUFF"; col = "#fde047"; }
              else if (p.type === 'SHIELD') { txt = "无敌护盾"; col = "#22d3ee"; }
              else if (p.type === 'TORPEDO') { txt = "鱼雷弹药"; col = "#f87171"; }
              state.labels.push({ x: p.x, y: p.y - 30, text: txt, color: col });
          }
      });

      // G. Map Boundary Warning
      const distFromCenter = Math.hypot(player.x - MAP_SHAPE_CONFIG.CENTER_X, player.y - MAP_SHAPE_CONFIG.CENTER_Y);
      const boundaryR = getMapBoundaryRadius(Math.atan2(player.y - MAP_SHAPE_CONFIG.CENTER_Y, player.x - MAP_SHAPE_CONFIG.CENTER_X));
      if (distFromCenter > boundaryR - 600) {
           const labelX = player.x + (MAP_SHAPE_CONFIG.CENTER_X - player.x) * 0.1;
           const labelY = player.y + (MAP_SHAPE_CONFIG.CENTER_Y - player.y) * 0.1;
           state.labels.push({ x: labelX, y: labelY, text: "前方地图边界! 回头!", color: '#f87171' });
      }
  }

  state.entities.forEach(ent => {
     updateAI(ent, state);
     const distFromCenter = Math.hypot(ent.x - MAP_SHAPE_CONFIG.CENTER_X, ent.y - MAP_SHAPE_CONFIG.CENTER_Y);
     if (distFromCenter > MAP_SHAPE_CONFIG.BASE_RADIUS + MAP_SHAPE_CONFIG.PETAL_VARIANCE + 200) {
         ent.health = 0;
     }
  });
  
  state.entities = state.entities.filter(e => e.health > 0);

  state.projectiles = state.projectiles.filter(p => p.life > 0);
  state.projectiles.forEach(p => {
      p.life--;
      p.x += p.vx;
      p.y += p.vy;
      if (Math.random() < 0.5) state.particles.push({ ...createParticle(p.x, p.y, '#f87171'), size: 2, life: 0.3 });
      for (const ent of state.entities) {
          if (dist(p, ent) < ent.radius + p.radius) {
              ent.health -= p.damage;
              p.life = 0;
              for(let i=0; i<5; i++) state.particles.push(createParticle(p.x, p.y, '#ef4444'));
              ent.aggroTimer = 120; 
              ent.targetId = 'player';
              break;
          }
      }
  });

  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      if (p.interactionType === 'SHRINK') {
          if (dist(p, player) < player.radius) {
              player.radius *= 0.999; 
              if (player.radius < 10) player.radius = 10;
          }
      }
  });
  
  updateHazards(state, state.particles);
  updatePortals(state, state.particles);
  updateBuildings(state, state.particles);
  
  if (state.status === GameStatus.PLAYING) {
      for (let i = 0; i < state.entities.length; i++) {
          const e1 = state.entities[i];
          if (dist(e1, player) < e1.radius + player.radius) {
              processCollision(e1, player, state.particles, state);
              processCollision(player, e1, state.particles, state);
          }
          for (let j = i + 1; j < state.entities.length; j++) {
              const e2 = state.entities[j];
              const d = dist(e1, e2);
              if (d < e1.radius + e2.radius) {
                  processCollision(e1, e2, state.particles, state);
                  processCollision(e2, e1, state.particles, state);
              }
          }
      }
      
      state.powerUps = state.powerUps.filter(p => {
          if (dist(player, p) < player.radius + p.radius) {
              if (p.type === 'SPEED') {
                  player.speedBoostTimer = GAME_MECHANICS.SPEED_ITEM_DURATION;
                  player.speechBubble = { text: "加速!", timer: 60, color: '#fde047' };
              } else if (p.type === 'SHIELD') {
                  player.shieldTimer = GAME_MECHANICS.SHIELD_DURATION;
                  player.speechBubble = { text: "护盾!", timer: 60, color: '#22d3ee' };
              } else if (p.type === 'TORPEDO') {
                  player.torpedoCount += 3;
                  player.speechBubble = { text: "鱼雷装填!", timer: 60, color: '#f87171' };
              }
              return false; 
          }
          return true;
      });
      
      if (player.health <= 0) {
           const switched = emergencySquadSwitch(state);
           if (!switched) {
               state.status = GameStatus.GAME_OVER;
           }
      }
  }

  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
  // Increase max zoom to 1.5, min zoom 0.3
  const targetZoom = Math.max(0.3, Math.min(1.5, 1.0 - (player.radius / 800)));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;

  return state;
};
