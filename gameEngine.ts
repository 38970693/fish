import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, BIRD_CONFIG, EVOLUTION_THRESHOLDS } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

// Updated Logic: Evolution depends on current species and what you ate
const getNextEvolution = (currentType: CreatureType, history: Record<CreatureType, number>, radius: number): CreatureType => {
  const config = CREATURES[currentType];
  
  // Find next tier threshold
  const nextTier = config.tier + 1;
  const threshold = EVOLUTION_THRESHOLDS.find(t => t.tier === nextTier);
  
  if (!threshold || radius < threshold.radius) return currentType;

  // Evolution Logic based on Playstyle (Diet)
  const aggressiveScore = (history[CreatureType.CLOWN_FISH] || 0) + (history[CreatureType.SEAHORSE] || 0) + (history[CreatureType.SWORD_FISH] || 0);
  const passiveScore = (history[CreatureType.JELLYFISH] || 0) + (history[CreatureType.PLANKTON] || 0) + (history[CreatureType.TURTLE] || 0);
  const tankScore = (history[CreatureType.CRAB] || 0) + (history[CreatureType.PUFFER_FISH] || 0);

  if (nextTier === 2) {
      if (tankScore > aggressiveScore) return CreatureType.CRAB;
      if (aggressiveScore > passiveScore) return CreatureType.SEAHORSE;
      return CreatureType.SQUID; // Default agile
  }
  
  if (nextTier === 3) {
      if (config.type === CreatureType.CRAB) return CreatureType.HAMMERHEAD;
      if (passiveScore > aggressiveScore) return CreatureType.STINGRAY;
      if (aggressiveScore > 10) return CreatureType.SWORD_FISH;
      return CreatureType.ANGLER_FISH;
  }

  if (nextTier === 4) {
      if (aggressiveScore > tankScore) return CreatureType.GREAT_WHITE;
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
    
    // Strategy
    isIdle: false,
    lureActive: false,
    camoActive: false,
    ambushTimer: 0,

    animOffset: Math.random() * 100, 
    renderScale: 1.0,
    isInvulnerable: false,
    aggroTimer: 0,
    speedBoostTimer: 0
  };
};

export const createObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  const cx = WORLD_SIZE / 2;
  const cy = WORLD_SIZE / 2;
  
  for (let i = 0; i < MAX_OBSTACLES; i++) {
    const r = Math.random();
    const type = r < 0.35 ? 'ROCK' : (r < 0.65 ? 'CORAL' : 'SEAWEED');
    const radius = 60 + Math.random() * 220; 
    
    const dist = 300 + Math.random() * 2000;
    const angle = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;

    obstacles.push({ id: uuid(), x, y, radius, type });
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

const spawnPowerUps = (state: GameState) => {
  if (state.powerUps.length >= MAX_POWERUPS) return;
  if (Math.random() > 0.02) return; 
  
  const angle = Math.random() * Math.PI * 2;
  const dist = 800 + Math.random() * 800;
  
  state.powerUps.push({
    id: uuid(),
    x: state.player.x + Math.cos(angle) * dist,
    y: state.player.y + Math.sin(angle) * dist,
    type: 'SPEED',
    radius: 15
  });
};

const spawnHazards = (state: GameState) => {
  if (state.time % BIRD_CONFIG.INTERVAL === 0) {
    for (let i = 0; i < BIRD_CONFIG.WAVE_COUNT; i++) {
      let tx, ty;
      const r = Math.random();
      if (r < 0.3) {
        tx = state.player.x + (Math.random() - 0.5) * 200;
        ty = state.player.y + (Math.random() - 0.5) * 200;
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

      state.hazards.push({
        id: uuid(),
        x: tx,
        y: ty,
        radius: BIRD_CONFIG.RADIUS,
        type: 'BIRD_STRIKE',
        timer: BIRD_CONFIG.WARNING_TIME + Math.random() * 60,
        duration: BIRD_CONFIG.WARNING_TIME + BIRD_CONFIG.STRIKE_TIME,
        stage: 'WARNING'
      });
    }
  }
};

const updateHazards = (state: GameState, particles: Particle[]) => {
  const activeHazards: Hazard[] = [];
  const { player, entities } = state;

  state.hazards.forEach(hazard => {
    hazard.timer--;
    
    if (hazard.timer > BIRD_CONFIG.STRIKE_TIME) {
      hazard.stage = 'WARNING';
    } else if (hazard.timer > 0) {
      if (hazard.stage !== 'STRIKE') {
         hazard.stage = 'STRIKE';
         for(let i=0; i<10; i++) {
            particles.push(createParticle(hazard.x + (Math.random()-0.5)*hazard.radius, hazard.y + (Math.random()-0.5)*hazard.radius, 'white'));
         }
      }
      if (player.radius < BIRD_CONFIG.SAFE_SIZE && !player.isGodMode && !player.isHidden) {
         if (dist(player, hazard) < hazard.radius) {
            player.health = 0;
            state.status = GameStatus.GAME_OVER;
         }
      }
      for (const ent of entities) {
         if (ent.radius < BIRD_CONFIG.SAFE_SIZE && !ent.isHidden) {
             if (dist(ent, hazard) < hazard.radius) {
                 ent.health = 0; 
                 particles.push(createParticle(ent.x, ent.y, '#fca5a5')); 
             }
         }
      }
    } else {
      hazard.stage = 'COOLDOWN';
    }
    if (hazard.timer > -60) activeHazards.push(hazard);
  });
  state.hazards = activeHazards;
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
};

const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities } = state; 
  updateStrategyState(entity);

  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;

  if (entity.type === CreatureType.PLANKTON) {
    entity.x += Math.cos(entity.angle) * 0.5;
    entity.y += Math.sin(entity.angle) * 0.5;
    if (Math.random() < 0.01) entity.angle += (Math.random() - 0.5) * 2;
    return; 
  }

  if (entity.config.behavior === 'AMBUSH' && entity.isIdle) {
    let shouldBreakCover = false;
    if (entity.targetId) {
      const target = entity.targetId === 'player' ? player : entities.find(e => e.id === entity.targetId);
      if (target) {
        const d = dist(entity, target);
        if (d < entity.radius * 3) shouldBreakCover = true;
        else if (d > entity.radius * 12) shouldBreakCover = true;
      } else {
        shouldBreakCover = true;
      }
    } else {
      if (Math.random() < 0.005) shouldBreakCover = true; 
    }

    if (!shouldBreakCover) {
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      entity.x += entity.vx;
      entity.y += entity.vy;
      return; 
    }
  }

  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * 0.001));
  
  if (entity.aggroTimer && entity.aggroTimer > 0 && entity.targetId) {
      agility *= 3.0; 
  }

  let fx = 0;
  let fy = 0;
  const detectionRange = 400 + (entity.radius * 2); 
  
  let fearFactor = 0;
  let nearestFoodDist = Infinity;
  let nearestFood: {x: number, y: number} | null = null;
  let attractionSource: {x: number, y: number} | null = null; 

  if (!player.isHidden) {
    const d = dist(entity, player);
    const dirX = (player.x - entity.x) / d;
    const dirY = (player.y - entity.y) / d;

    if (d < detectionRange) {
      if (player.lureActive && entity.radius < player.radius * 0.8) {
        attractionSource = player; 
      }
      else if (player.radius > entity.radius * 1.5) {
         if (!player.camoActive) {
           const weight = 3000 / (d + 1);
           fx -= dirX * weight;
           fy -= dirY * weight;
           fearFactor += weight;
         }
      }
      else if (player.radius < entity.radius * 0.9) {
         entity.targetId = 'player';
         nearestFood = player;
         nearestFoodDist = d;
      }
    }
  }

  for (const other of entities) {
    if (other.id === entity.id) continue;
    if (other.isHidden) continue;
    if (other.type !== CreatureType.PLANKTON && other.radius <= GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE) continue;

    const d = dist(entity, other);
    if (d > detectionRange) continue;
    
    const dirX = (other.x - entity.x) / d;
    const dirY = (other.y - entity.y) / d;

    if (other.lureActive && entity.radius < other.radius * 0.9) {
      fx += dirX * 2.5; 
      fy += dirY * 2.5;
      continue; 
    }

    const isDangerous = other.radius > entity.radius * 1.5;
    const isFood = (other.radius < entity.radius * 0.9) || (other.type === CreatureType.PLANKTON);
    
    if (isDangerous) {
       if (!other.camoActive) {
         const weight = 2000 / (d + 1);
         fx -= dirX * weight;
         fy -= dirY * weight;
         fearFactor += weight;
       }
    } else if (isFood) {
       if (d < nearestFoodDist) {
           nearestFoodDist = d;
           nearestFood = other;
       }
    }
  }

  if (attractionSource && fearFactor < 10) { 
      const dx = attractionSource.x - entity.x;
      const dy = attractionSource.y - entity.y;
      const d = Math.hypot(dx, dy);
      fx += (dx/d) * 2.0;
      fy += (dy/d) * 2.0;
  }
  else if (nearestFood && fearFactor < 5) {
     const dx = nearestFood.x - entity.x;
     const dy = nearestFood.y - entity.y;
     const d = Math.hypot(dx, dy);
     fx += (dx / d) * 1.5; 
     fy += (dy / d) * 1.5;
     
     if ('id' in nearestFood) entity.targetId = (nearestFood as Entity).id;
  }

  fx += Math.cos(entity.angle) * 0.5;
  fy += Math.sin(entity.angle) * 0.5;

  if (Math.abs(fx) > 0.1 || Math.abs(fy) > 0.1) {
    const targetAngle = Math.atan2(fy, fx);
    let angleDiff = targetAngle - entity.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    entity.angle += angleDiff * agility;
  }

  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  else if (fearFactor > 50) speedMult = 1.5; 
  
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  }

  if (entity.ambushTimer > 0) {
    speedMult *= GAME_MECHANICS.AMBUSH_SPEED_BONUS;
    if (state.time % 3 === 0) {
      state.particles.push(createParticle(entity.x, entity.y, 'white'));
    }
  }

  const finalSpeed = entity.speed * speedMult;
  entity.vx = Math.cos(entity.angle) * finalSpeed;
  entity.vy = Math.sin(entity.angle) * finalSpeed;

  entity.x += entity.vx;
  entity.y += entity.vy;
  
  if (entity.renderScale > 1.0) {
     entity.renderScale += (1.0 - entity.renderScale) * 0.1;
  }
};

const processCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[]) => {
  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const isBiting = Math.abs(angleDiff) < Math.PI / 3;

  if (!isBiting) return;
  
  // Plankton Consumption
  if (victim.type === CreatureType.PLANKTON) {
    let massGained = GAME_MECHANICS.PLANKTON_MASS;
    if (attacker.radius > 60) massGained = 0;

    const newRadius = Math.sqrt(attacker.radius * attacker.radius + massGained);
    attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newRadius);
    
    // Weight Gain
    if ('weight' in attacker) {
       const w = (attacker as PlayerState);
       w.weight += victim.config.weightValue;
       w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
    }

    victim.health = 0; 
    attacker.renderScale = 1.1;
    return;
  }

  const swallowThreshold = (victim.id === 'player') ? 2.0 : 1.4;
  
  // Swallow Logic
  if (attacker.radius > victim.radius * swallowThreshold && victim.id !== 'player') {
      const victimMass = victim.radius * victim.radius;
      
      let efficiency = 0.5;
      const ratio = victim.radius / attacker.radius;
      if (ratio < 0.20) efficiency = 0; 
      else if (ratio < 0.35) efficiency = 0.1; 

      const newR = Math.sqrt(attacker.radius * attacker.radius + victimMass * efficiency);
      attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newR);
      
      victim.health = 0; 
      attacker.renderScale = 1.2; 
      
      particles.push(createParticle(victim.x, victim.y, victim.config.color));
      particles.push(createParticle(victim.x, victim.y, 'white'));
      
      if ('weight' in attacker) {
          const w = (attacker as PlayerState);
          w.weight += victim.config.weightValue * 2.0; 
          w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
      }
      return; 
  }
  
  if (victim.radius <= GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE) return;
  
  let damage = attacker.config.damage;
  
  if (attacker.radius < victim.radius) {
      damage *= 1.5; 
      
      if (!('weight' in victim)) { 
          const v = victim as Entity;
          v.targetId = attacker.id; 
          v.aggroTimer = 300; 
          v.speedBoostTimer = (v.speedBoostTimer || 0) + 5; 
          
          const angleToAttacker = Math.atan2(attacker.y - v.y, attacker.x - v.x);
          let angleDiff = angleToAttacker - v.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          v.angle += angleDiff * 0.15; 
      }
      
      particles.push(createParticle(victim.x, victim.y, 'yellow')); 
  }

  if (attacker.ambushTimer > 0) {
     damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
     particles.push(createParticle(victim.x, victim.y, 'red'));
     particles.push(createParticle(victim.x, victim.y, 'orange'));
  }

  let desiredMassSteal = damage * GAME_MECHANICS.COMBAT_BITE_MASS_FACTOR;
  
  if (attacker.radius > victim.radius) {
      desiredMassSteal = 0;
  }

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
  particles.push(createParticle(
     (attacker.x + victim.x) / 2,
     (attacker.y + victim.y) / 2,
     victim.config.color
  ));

  if ('weight' in attacker) {
      const w = (attacker as PlayerState);
      // Biting large fish gives good weight
      if (attacker.radius < victim.radius) {
         w.weight += 10;
      }
      w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
  }

  if (!('weight' in victim)) {
     const v = victim as Entity;
     v.targetId = attacker.id;
     v.aggroTimer = 200;
  }

  victim.health -= damage;
  if (victim.id !== 'player' && victim.health <= 0) {
      victim.health = 0; 
      if ('weight' in attacker) (attacker as PlayerState).weight += victim.config.weightValue;
      for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
  }
};

const spawnEntities = (state: GameState) => {
  if (state.entities.length >= MAX_ENTITIES) return;
  const planktonCount = state.entities.filter(e => e.type === CreatureType.PLANKTON).length;
  let type: CreatureType = CreatureType.PLANKTON;

  if (planktonCount < 60) { 
    type = CreatureType.PLANKTON;
  } else {
    const r = Math.random();
    // Balanced Ocean Ecosystem spawn rates
    if (r < 0.20) type = CreatureType.CLOWN_FISH;
    else if (r < 0.35) type = CreatureType.BLUE_TANG;
    else if (r < 0.45) type = CreatureType.TURTLE;
    else if (r < 0.55) type = CreatureType.JELLYFISH;
    else if (r < 0.65) type = CreatureType.SEAHORSE;
    else if (r < 0.72) type = CreatureType.PUFFER_FISH;
    else if (r < 0.78) type = CreatureType.CRAB;
    else if (r < 0.84) type = CreatureType.SQUID;
    else if (r < 0.89) type = CreatureType.STINGRAY;
    else if (r < 0.93) type = CreatureType.SWORD_FISH;
    else if (r < 0.96) type = CreatureType.HAMMERHEAD;
    else if (r < 0.98) type = CreatureType.ANGLER_FISH;
    else if (r < 0.995) type = CreatureType.GREAT_WHITE;
    else type = CreatureType.ORCA; 
  }

  const spawnRadiusMin = 1200; 
  const spawnRadiusMax = 2000;
  const angle = Math.random() * Math.PI * 2;
  const d = spawnRadiusMin + Math.random() * (spawnRadiusMax - spawnRadiusMin);
  
  const sx = state.player.x + Math.cos(angle) * d;
  const sy = state.player.y + Math.sin(angle) * d;

  state.entities.push(createEntity(type, sx, sy));
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, boostActive: boolean, tauntActive: boolean, screenW: number, screenH: number): GameState => {
  if (state.status !== GameStatus.PLAYING) return state;

  state.time += 1;
  const { player } = state;
  const newParticles: Particle[] = [];

  spawnPowerUps(state);
  spawnHazards(state);
  createObstacles().forEach(o => { if (Math.random() < 0.005 && state.obstacles.length < MAX_OBSTACLES) state.obstacles.push(o) });
  updateHazards(state, newParticles);
  updateStrategyState(player); 

  const MAX_RENDER_DIST = 3000;
  state.entities = state.entities.filter(e => dist(player, e) < MAX_RENDER_DIST);
  state.obstacles = state.obstacles.filter(o => dist(player, o) < MAX_RENDER_DIST);
  state.powerUps = state.powerUps.filter(p => dist(player, p) < MAX_RENDER_DIST);

  if (tauntActive) {
     player.x += (Math.random() - 0.5) * 4;
     player.y += (Math.random() - 0.5) * 4;
     state.entities.forEach(e => {
        if (e.type === CreatureType.PLANKTON) return;
        if (player.isHidden) return;
        if (dist(player, e) < 600) {
           e.aggroTimer = 150; 
           e.targetId = 'player';
        }
     });
  }

  let speedMult = player.stats.speedMult;
  
  if (player.speedBoostTimer && player.speedBoostTimer > 0) {
      player.speedBoostTimer--;
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
      if (state.time % 10 === 0) newParticles.push(createParticle(player.x, player.y, '#fde047'));
  }

  if (player.ambushTimer > 0) {
      speedMult *= GAME_MECHANICS.AMBUSH_SPEED_BONUS;
      if (state.time % 3 === 0) newParticles.push(createParticle(player.x, player.y, 'white'));
  }

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
  
  const dx = mouse.x - (screenW / 2);
  const dy = mouse.y - (screenH / 2);
  const targetAngle = Math.atan2(dy, dx);
  let angleDiff = targetAngle - player.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  
  const playerAgility = Math.max(0.03, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * 0.0005));
  player.angle += angleDiff * playerAgility;

  const currentSpeed = player.speed * speedMult;
  player.vx = Math.cos(player.angle) * currentSpeed;
  player.vy = Math.sin(player.angle) * currentSpeed;

  player.x += player.vx;
  player.y += player.vy;

  if (player.renderScale > 1.0) player.renderScale += (1.0 - player.renderScale) * 0.1;

  checkHiding(player, state.obstacles);
  state.entities.forEach(e => checkHiding(e, state.obstacles));

  player.mouthOpenValue = Math.max(0, player.mouthOpenValue - 0.1);
  if (isMouseDownRefForMouth) player.mouthOpenValue = 0.8; 

  state.entities.forEach(entity => {
    updateAI(entity, state);
  });

  const deadEntityIds = new Set<string>();

  for (let i = 0; i < state.entities.length; i++) {
    const a = state.entities[i];
    if (deadEntityIds.has(a.id) || a.isHidden) continue;

    for (let j = 0; j < state.entities.length; j++) {
      if (i === j) continue;
      const b = state.entities[j];
      if (deadEntityIds.has(b.id) || b.isHidden) continue;

      const distSq = (a.x - b.x)**2 + (a.y - b.y)**2;
      const minDist = a.radius + b.radius;
      if (distSq < minDist * minDist) {
          processCollision(a, b, newParticles);
      }
    }
  }

  for (const entity of state.entities) {
    if (deadEntityIds.has(entity.id)) continue;
    
    const d = dist(player, entity);
    if (d < player.radius + entity.radius) {
       if (!player.isHidden && !entity.isHidden) {
          processCollision(player, entity, newParticles);
          
          if (!player.isGodMode && !player.isInvulnerable) {
             processCollision(entity, player, newParticles);
          }
       }
    }
  }

  const keptPowerups: PowerUp[] = [];
  for(const p of state.powerUps) {
     if (dist(player, p) < player.radius + p.radius) {
         player.speedBoostTimer = GAME_MECHANICS.SPEED_ITEM_DURATION;
         newParticles.push(createParticle(p.x, p.y, '#fef08a'));
     } else {
         keptPowerups.push(p);
     }
  }
  state.powerUps = keptPowerups;

  state.entities = state.entities.filter(e => e.health > 0 && !deadEntityIds.has(e.id));

  // Evolution Check
  const nextType = getNextEvolution(player.type, player.eatenHistory, player.radius);
  if (nextType !== player.type) {
        player.type = nextType;
        player.config = CREATURES[nextType];
        player.maxHealth += 50; 
        player.health = player.maxHealth;
        // Radius increases naturally via mass gain, but give a small boost on evolve
        player.radius *= 1.1;
        player.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, player.radius); 
        
        for(let i=0; i<30; i++) newParticles.push(createParticle(player.x, player.y, '#fbbf24'));
        player.renderScale = 1.6;
        player.isInvulnerable = true; 
        setTimeout(() => { player.isInvulnerable = false; }, 3000); 
  }

  state.particles = state.particles.map(p => ({
    ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05
  })).filter(p => p.life > 0).concat(newParticles);

  spawnEntities(state);

  const targetZoom = Math.max(0.5, 1.4 - (player.radius / 400));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;
  state.camera.x = player.x; 
  state.camera.y = player.y;

  return state;
};

let isMouseDownRefForMouth = false;