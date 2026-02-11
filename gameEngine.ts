
import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal, BiomeType, Building, BuildingType, Treasure, Cosmetics } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const getRandomPhrase = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
const ANGRY_PHRASES = ["别跑!", "站住!", "你瞅啥?", "吼!!", "小别致!"];

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
    
    // 如果是战斗测试，限制在中心 800 像素的圆形竞技场内
    const maxR = isBattleTest ? 800 : getMapBoundaryRadius(angle);
    const limit = maxR - entity.radius;
    
    if (currentDist > limit) {
        const safetyPush = 30; 
        const correctedDist = limit - safetyPush;
        entity.x = cx + Math.cos(angle) * correctedDist;
        entity.y = cy + Math.sin(angle) * correctedDist;
        
        if (entity.vx !== undefined && entity.vy !== undefined) {
             entity.vx *= -0.2; 
             entity.vy *= -0.2;
             // 撞墙后强制转向中心
             const angleToCenter = Math.atan2(cy - entity.y, cx - entity.x);
             entity.angle = angleToCenter + (Math.random() - 0.5) * 0.4;
        }
    }
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

const updateAIBehavior = (entity: Entity, state: GameState) => {
  const { player } = state;
  
  if (entity.type === CreatureType.MASCOT) {
      entity.y += Math.sin(state.time * 0.05) * 1.5;
      return; 
  }
  
  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  
  // 战斗测试专用 AI：始终锁定玩家并尝试撕咬
  let dx = player.x - entity.x;
  let dy = player.y - entity.y;
  let targetAngle = Math.atan2(dy, dx);
  
  let angleDiff = targetAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;
  
  const finalSpeed = entity.speed * 1.05;
  entity.vx = Math.cos(entity.angle) * finalSpeed; 
  entity.vy = Math.sin(entity.angle) * finalSpeed;
  entity.x += entity.vx; 
  entity.y += entity.vy;
  
  clampToMap(entity, state.status === GameStatus.BATTLE_TEST);
};

const handleCombatCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[]) => {
  if (attacker.type === CreatureType.MASCOT || victim.type === CreatureType.MASCOT) return;
  
  const dx = victim.x - attacker.x;
  const dy = victim.y - attacker.y;
  const distance = Math.hypot(dx, dy);
  
  if (distance < attacker.radius + victim.radius) {
      // 判定攻击者是否面向受害者（嘴部碰撞）
      const angleToVictim = Math.atan2(dy, dx);
      let angleDiff = angleToVictim - attacker.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      if (Math.abs(angleDiff) < Math.PI / 3) {
          const damage = attacker.config.damage / 30; // 每帧伤害
          victim.health -= damage;
          if (Math.random() < 0.1) {
              particles.push(createParticle(victim.x, victim.y, 'red'));
          }
          attacker.renderScale = 1.05;
      }
  }
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  // 核心修复：允许 PLAYING 和 BATTLE_TEST 进入更新逻辑
  if (state.status === GameStatus.MENU || state.status === GameStatus.SHOP) return state;
  
  state.time++;

  const { player, entities, particles } = state;
  
  // 1. 玩家移动逻辑
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
  player.x += player.vx; 
  player.y += player.vy;
  
  clampToMap(player, state.status === GameStatus.BATTLE_TEST);

  // 2. AI 逻辑
  entities.forEach(ent => updateAIBehavior(ent, state));
  
  // 3. 碰撞与战斗
  entities.forEach(ent => {
      handleCombatCollision(player, ent, particles);
      handleCombatCollision(ent, player, particles);
  });

  // 4. 粒子更新
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { 
      p.x += p.vx; 
      p.y += p.vy; 
      p.life -= 0.02; 
  });

  // 5. 死亡检查
  if (player.health <= 0) state.status = GameStatus.GAME_OVER;
  state.entities = state.entities.filter(e => e.health > 0);

  // 6. 相机平滑跟随
  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
  
  return state;
};

// 占位函数，保持与其他代码兼容
export const createObstacles = () => [];
export const createBuildings = () => [];
export const createPortals = () => [];
export const digestBasket = (state: any) => {};
export const manualSquadSwitch = (state: any) => false;
