import { CREATURES, WORLD_SIZE, MAX_ENTITIES, LEVEL_THRESHOLDS, BOOST_CONFIG, MAX_OBSTACLES } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState } from './types';

// Helper for unique IDs
const uuid = () => Math.random().toString(36).substr(2, 9);

// Distance helper
const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

// Create Entity
export const createEntity = (type: CreatureType, x: number, y: number): Entity => {
  const config = CREATURES[type];
  return {
    id: uuid(),
    type,
    x,
    y,
    vx: (Math.random() - 0.5) * config.speed,
    vy: (Math.random() - 0.5) * config.speed,
    radius: config.baseRadius,
    angle: Math.random() * Math.PI * 2,
    health: config.health,
    maxHealth: config.health,
    speed: config.speed,
    config,
    mouthOpenValue: 0,
    isHidden: false,
    animOffset: Math.random() * 100, // Randomize animation phase
    renderScale: 1.0,
    isInvulnerable: false
  };
};

export const createObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < MAX_OBSTACLES; i++) {
    const type = Math.random() > 0.5 ? 'ROCK' : 'CORAL';
    const radius = 50 + Math.random() * 200; // Size 50 to 250
    // Keep obstacles away from center spawn initially to avoid trapping player immediately
    let x, y;
    do {
      x = Math.random() * WORLD_SIZE;
      y = Math.random() * WORLD_SIZE;
    } while (dist({x, y}, {x: WORLD_SIZE/2, y: WORLD_SIZE/2}) < 500);

    obstacles.push({
      id: uuid(),
      x,
      y,
      radius,
      type
    });
  }
  return obstacles;
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

// Helper: Check if entity is inside an obstacle
const checkHiding = (entity: Entity, obstacles: Obstacle[]) => {
  entity.isHidden = false;
  for (const obs of obstacles) {
    const d = dist(entity, obs);
    if (d < obs.radius - entity.radius * 0.5) {
       if (entity.radius < obs.radius * 0.7) {
         entity.isHidden = true;
         return; // Found a hiding spot
       }
    }
  }
};

// AI Behavior Logic
const updateAI = (entity: Entity, player: PlayerState, entities: Entity[], worldW: number, worldH: number) => {
  let tx = entity.x + entity.vx * 20; // Default: Keep moving
  let ty = entity.y + entity.vy * 20;

  const distToPlayer = dist(entity, player);
  const detectionRange = 400 * (entity.config.tier === 4 ? 3 : 1); // Bosses see further

  // 1. Boundary Avoidance
  const margin = 200;
  if (entity.x < margin) tx += 100;
  if (entity.x > worldW - margin) tx -= 100;
  if (entity.y < margin) ty += 100;
  if (entity.y > worldH - margin) ty -= 100;

  // 2. Target Selection (Player or Food)
  let target: {x: number, y: number} | null = null;
  const isAggressive = entity.config.behavior === 'AGGRESSIVE' || entity.config.behavior === 'BOSS';

  // Check Player first
  const playerSafe = player.isHidden;
  const canSeePlayer = distToPlayer < detectionRange && !playerSafe;
  
  // Basic AI State Machine
  if (isAggressive && canSeePlayer && entity.radius > player.radius * 0.8) {
     // Chase Player
     target = player;
  } else if (entity.config.behavior === 'FLEE' && canSeePlayer && entity.radius < player.radius) {
     // Flee Player
     tx = entity.x - (player.x - entity.x);
     ty = entity.y - (player.y - entity.y);
  } else {
    // Look for other entities to eat
    let bestFood: Entity | null = null;
    let minDist = detectionRange;

    for (const other of entities) {
        if (other.id === entity.id || other.isHidden) continue;
        
        const d = dist(entity, other);
        if (d > minDist) continue;

        // Can we eat it?
        const isPlankton = other.type === CreatureType.PLANKTON;
        const sizeAdvantage = entity.radius >= other.radius * 1.1;
        
        // Passive fish only look for plankton
        if (!isAggressive && !isPlankton) continue;
        // Aggressive fish look for anything smaller
        if (isAggressive && !sizeAdvantage) continue; 
        
        // Found food
        if (sizeAdvantage) {
            minDist = d;
            bestFood = other;
        }
    }

    if (bestFood) {
        target = bestFood;
    }
  }

  // Apply Movement
  if (target) {
     tx = target.x;
     ty = target.y;
  }

  // 3. Move towards target vector
  const angleToTarget = Math.atan2(ty - entity.y, tx - entity.x);
  
  // Smooth rotation
  let angleDiff = angleToTarget - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * 0.05;

  entity.vx = Math.cos(entity.angle) * entity.speed;
  entity.vy = Math.sin(entity.angle) * entity.speed;

  entity.x += entity.vx;
  entity.y += entity.vy;
  
  // Return render scale to 1.0
  if (entity.renderScale > 1.0) {
     entity.renderScale += (1.0 - entity.renderScale) * 0.1;
  }
};

// Spawning Logic
const spawnEntities = (state: GameState) => {
  if (state.entities.length >= MAX_ENTITIES) return;

  // --- POPULATION CONTROL ---
  // Ensure enough small "shrimp" (Plankton/Algae) are present
  const smallCreaturesCount = state.entities.filter(e => 
    e.type === CreatureType.PLANKTON || e.type === CreatureType.ALGAE_FISH
  ).length;

  let type: CreatureType = CreatureType.PLANKTON;

  if (smallCreaturesCount < 400) { // Keep minimum 400 small fish
    // Force spawn small prey if scarce
    type = Math.random() < 0.7 ? CreatureType.PLANKTON : CreatureType.ALGAE_FISH;
  } else {
    // Regular Spawning Logic
    const r = Math.random();
    
    // Faster pacing for demo
    const tier1Prob = state.player.level === 1 ? 0.7 : state.player.level === 2 ? 0.3 : 0.1;
    const tier2Prob = state.player.level === 1 ? 0.25 : state.player.level === 2 ? 0.5 : 0.3;

    if (r < tier1Prob) {
      const subR = Math.random();
      type = subR < 0.6 ? CreatureType.PLANKTON : subR < 0.8 ? CreatureType.ALGAE_FISH : CreatureType.JELLYFISH;
    } else if (r < tier1Prob + tier2Prob) {
      const subR = Math.random();
      type = subR < 0.2 ? CreatureType.WORKER : subR < 0.5 ? CreatureType.NEEDLE_FISH : subR < 0.8 ? CreatureType.ARMOR_FISH : CreatureType.POISON_FISH;
    } else {
      // High tier
      const subR = Math.random();
      if (state.player.level >= 4 && Math.random() < 0.05) {
        type = Math.random() > 0.5 ? CreatureType.LEVIATHAN : CreatureType.MUTANT;
      } else {
        type = subR < 0.3 ? CreatureType.GHOST : subR < 0.6 ? CreatureType.SWORD_FISH : subR < 0.8 ? CreatureType.EEL : CreatureType.MEGA_MOUTH;
      }
    }
  }

  // Spawn away from player
  let sx, sy;
  do {
    sx = Math.random() * WORLD_SIZE;
    sy = Math.random() * WORLD_SIZE;
  } while (dist({x: sx, y: sy}, state.player) < 800); 

  state.entities.push(createEntity(type, sx, sy));
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, boostActive: boolean, screenW: number, screenH: number): GameState => {
  if (state.status !== GameStatus.PLAYING) return state;

  state.time += 1; // Increment global tick
  const { player, obstacles } = state;
  const newParticles: Particle[] = [];

  // --- Player Boost Logic ---
  let speedMult = player.stats.speedMult;
  
  if (!boostActive && player.boost.current < player.boost.max) {
    player.boost.current = Math.min(player.boost.max, player.boost.current + BOOST_CONFIG.REGEN_RATE);
  }

  if (boostActive && player.boost.current > 0) {
    player.boost.current = Math.max(0, player.boost.current - BOOST_CONFIG.DRAIN_RATE);
    speedMult *= BOOST_CONFIG.SPEED_MULTIPLIER;
    if (state.time % 5 === 0) {
       const bx = player.x - Math.cos(player.angle) * player.radius;
       const by = player.y - Math.sin(player.angle) * player.radius;
       newParticles.push(createParticle(bx, by, 'rgba(255, 255, 255, 0.5)'));
    }
  }
  
  // --- Player Movement ---
  const screenCenterX = screenW / 2;
  const screenCenterY = screenH / 2;
  
  const dx = mouse.x - screenCenterX;
  const dy = mouse.y - screenCenterY;
  
  const targetAngle = Math.atan2(dy, dx);
  
  let angleDiff = targetAngle - player.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  
  const turnSpeed = 0.15 / player.stats.sizeMult; 
  player.angle += angleDiff * turnSpeed;

  const currentSpeed = player.speed * speedMult;
  player.vx = Math.cos(player.angle) * currentSpeed;
  player.vy = Math.sin(player.angle) * currentSpeed;

  player.x = Math.max(player.radius, Math.min(WORLD_SIZE - player.radius, player.x + player.vx));
  player.y = Math.