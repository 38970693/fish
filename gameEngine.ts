import { CREATURES, WORLD_SIZE, MAX_ENTITIES, LEVEL_THRESHOLDS, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, BIRD_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const getNextEvolution = (currentType: CreatureType, history: Record<CreatureType, number>, level: number): CreatureType => {
  if (level < 2) return currentType; 
  
  // Strategy Analysis
  const aggressiveCount = (history[CreatureType.ALGAE_FISH] || 0) + (history[CreatureType.NEEDLE_FISH] || 0);
  const passiveCount = (history[CreatureType.JELLYFISH] || 0) + (history[CreatureType.PLANKTON] || 0);
  const exoticCount = (history[CreatureType.OCTOPUS] || 0) + (history[CreatureType.POISON_FISH] || 0);

  if (level >= 2 && level < 5) {
     if (CREATURES[currentType].tier >= 2) return currentType;
     if (exoticCount > aggressiveCount) return CreatureType.OCTOPUS; // Strategy Path
     if (aggressiveCount > passiveCount) return CreatureType.NEEDLE_FISH;
     return CreatureType.POISON_FISH;
  }
  if (level >= 5 && level < 8) {
    if (CREATURES[currentType].tier >= 3) return currentType;
    if (currentType === CreatureType.OCTOPUS || exoticCount > aggressiveCount) return CreatureType.ANGLER_FISH; // Ambush Path
    if (currentType === CreatureType.NEEDLE_FISH) return CreatureType.SWORD_FISH;
    return CreatureType.GHOST;
  }
  if (level >= 8) {
    if (CREATURES[currentType].tier >= 4) return currentType;
    return CreatureType.LEVIATHAN;
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
  for (let i = 0; i < MAX_OBSTACLES; i++) {
    const r = Math.random();
    const type = r < 0.35 ? 'ROCK' : (r < 0.65 ? 'CORAL' : 'SEAWEED');
    const radius = 60 + Math.random() * 220; 
    let x, y;
    do {
      x = Math.random() * WORLD_SIZE;
      y = Math.random() * WORLD_SIZE;
    } while (dist({x, y}, {x: WORLD_SIZE/2, y: WORLD_SIZE/2}) < 500);

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
  state.powerUps.push({
    id: uuid(),
    x: Math.random() * WORLD_SIZE,
    y: Math.random() * WORLD_SIZE,
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
        tx = Math.random() * WORLD_SIZE;
        ty = Math.random() * WORLD_SIZE;
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
  // Check Velocity
  const speed = Math.hypot(entity.vx, entity.vy);
  entity.isIdle = speed < GAME_MECHANICS.IDLE_THRESHOLD;

  // Angler Fish Lure Logic
  if (entity.config.special === 'LURE') {
    if (entity.isIdle) {
      entity.lureActive = true;
    } else {
      // Break lure if moving
      if (entity.lureActive) {
        // Just started moving from lure state -> Ambush Bonus!
        entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
      }
      entity.lureActive = false;
    }
  }

  // Octopus Camo Logic
  if (entity.config.special === 'CAMO') {
    if (entity.isIdle) {
      entity.camoActive = true;
    } else {
      if (entity.camoActive) {
        // Break camo -> Ambush Bonus
        entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
      }
      entity.camoActive = false;
    }
  }

  // Tick down ambush timer
  if (entity.ambushTimer > 0) entity.ambushTimer--;
};

const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities, worldWidth: worldW, worldHeight: worldH } = state;
  updateStrategyState(entity);

  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;

  // Plankton drifting
  if (entity.type === CreatureType.PLANKTON) {
    entity.x += Math.cos(entity.angle) * 0.5;
    entity.y += Math.sin(entity.angle) * 0.5;
    // Wrap
    if(entity.x<0)entity.x=worldW; if(entity.x>worldW)entity.x=0;
    if(entity.y<0)entity.y=worldH; if(entity.y>worldH)entity.y=0;
    return; 
  }

  // Special Logic: AMBUSH types (Angler, Octopus) may choose to stay still
  if (entity.config.behavior === 'AMBUSH' && entity.isIdle) {
    // If we have a target nearby, we might want to stay still to lure/camo
    // Check if we should break cover
    let shouldBreakCover = false;
    if (entity.targetId) {
      // If target is very close, LUNGE
      const target = entity.targetId === 'player' ? player : entities.find(e => e.id === entity.targetId);
      if (target) {
        const d = dist(entity, target);
        if (d < entity.radius * 3) shouldBreakCover = true; // Strike distance
        else if (d > entity.radius * 12) shouldBreakCover = true; // Target lost/too far
      } else {
        shouldBreakCover = true;
      }
    } else {
      // Randomly move sometimes
      if (Math.random() < 0.005) shouldBreakCover = true; 
    }

    if (!shouldBreakCover) {
      // Stay idle
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      entity.x += entity.vx;
      entity.y += entity.vy;
      return; 
    }
  }

  const agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * 0.001));
  let fx = 0;
  let fy = 0;
  const detectionRange = 400 + (entity.radius * 2); 
  
  let fearFactor = 0;
  let nearestFoodDist = Infinity;
  let nearestFood: {x: number, y: number} | null = null;
  let attractionSource: {x: number, y: number} | null = null; // Lure attraction

  // 1. Process Player
  if (!player.isHidden) {
    const d = dist(entity, player);
    const dirX = (player.x - entity.x) / d;
    const dirY = (player.y - entity.y) / d;

    if (d < detectionRange) {
      // Check for Lure
      if (player.lureActive && entity.radius < player.radius * 0.8) {
        // It's a trap! But I'm a dumb fish.
        attractionSource = player; 
      }
      // Check for Threat
      else if (player.radius > entity.radius * 1.5) {
         if (!player.camoActive) { // If camo, don't flee
           const weight = 3000 / (d + 1);
           fx -= dirX * weight;
           fy -= dirY * weight;
           fearFactor += weight;
         }
      }
      // Check for Food
      else if (player.radius < entity.radius * 0.9) {
         entity.targetId = 'player';
         nearestFood = player;
         nearestFoodDist = d;
      }
    }
  }

  // 2. Process Neighbors
  for (const other of entities) {
    if (other.id === entity.id) continue;
    if (other.isHidden) continue;
    if (other.type !== CreatureType.PLANKTON && other.radius <= GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE) continue;

    const d = dist(entity, other);
    if (d > detectionRange) continue;
    
    const dirX = (other.x - entity.x) / d;
    const dirY = (other.y - entity.y) / d;

    // Lure Logic: If other is Luring, and I am smaller, I am attracted
    if (other.lureActive && entity.radius < other.radius * 0.9) {
      // Strong attraction, overrides some fear
      fx += dirX * 2.5; 
      fy += dirY * 2.5;
      continue; 
    }

    const isDangerous = other.radius > entity.radius * 1.5;
    const isFood = (other.radius < entity.radius * 0.9) || (other.type === CreatureType.PLANKTON);
    
    if (isDangerous) {
       // If dangerous but Camouflaged, ignore danger
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

  // Behavior Integration
  if (attractionSource && fearFactor < 10) { // Lure works if not terrified by something else
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
     
     // Store target for ambush logic
     if ('id' in nearestFood) entity.targetId = (nearestFood as Entity).id;
  }

  // Wander
  fx += Math.cos(entity.angle) * 0.5;
  fy += Math.sin(entity.angle) * 0.5;

  // Bounds
  const margin = 150;
  if (entity.x < margin) fx += 2;
  if (entity.x > worldW - margin) fx -= 2;
  if (entity.y < margin) fy += 2;
  if (entity.y > worldH - margin) fy -= 2;

  if (Math.abs(fx) > 0.1 || Math.abs(fy) > 0.1) {
    const targetAngle = Math.atan2(fy, fx);
    let angleDiff = targetAngle - entity.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    entity.angle += angleDiff * agility;
  }

  // Speed Calculation
  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  else if (fearFactor > 50) speedMult = 1.5; 
  
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  }

  // Ambush Burst
  if (entity.ambushTimer > 0) {
    speedMult *= GAME_MECHANICS.AMBUSH_SPEED_BONUS;
    if (state.time % 3 === 0) {
      // Trail effect
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
  
  // 1. Plankton
  if (victim.type === CreatureType.PLANKTON) {
    const massGained = GAME_MECHANICS.PLANKTON_MASS;
    const newRadius = Math.sqrt(attacker.radius * attacker.radius + massGained);
    attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newRadius);
    if ('xp' in attacker) {
       (attacker as PlayerState).xp += victim.config.xpValue;
       (attacker as PlayerState).eatenHistory[victim.type] = ((attacker as PlayerState).eatenHistory[victim.type] || 0) + 1;
    }
    victim.health = 0; 
    attacker.renderScale = 1.1;
    return;
  }

  // 2. Swallow Whole (Big eats Small instantly)
  // If attacker is significantly larger (>1.4x), they can swallow the victim whole
  // Player has a slightly higher threshold to be swallowed to avoid frustration (2.0x)
  const swallowThreshold = (victim.id === 'player') ? 2.0 : 1.4;
  
  if (attacker.radius > victim.radius * swallowThreshold && victim.id !== 'player') {
      // Swallow effect
      const victimMass = victim.radius * victim.radius;
      // Gain 50% of victim's mass efficiency
      const newR = Math.sqrt(attacker.radius * attacker.radius + victimMass * 0.5);
      attacker.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, newR);
      
      victim.health = 0; // Instant kill
      attacker.renderScale = 1.2; // Big gulp pop
      
      // Visuals
      particles.push(createParticle(victim.x, victim.y, victim.config.color));
      particles.push(createParticle(victim.x, victim.y, 'white'));
      
      if ('xp' in attacker) {
          (attacker as PlayerState).xp += victim.config.xpValue * 1.5; // Bonus XP for swallow
          (attacker as PlayerState).eatenHistory[victim.type] = ((attacker as PlayerState).eatenHistory[victim.type] || 0) + 1;
      }
      return; 
  }
  
  // Logic from existing codebase prevents infinite biting on tiny victims
  if (victim.radius <= GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE) return;

  // 3. Combat Nibble (Mass Steal)
  // Can be "Big nibbling Medium" OR "Small biting Big's tail"
  
  let damage = attacker.config.damage;
  
  // --- UNDERDOG BONUS ---
  // If attacker is smaller than victim, they deal MORE damage/steal more mass (biting sensitive tail)
  if (attacker.radius < victim.radius) {
      damage *= 2.5; // Significant bonus for brave small fish
      particles.push(createParticle(victim.x, victim.y, 'yellow')); // Crit effect
  }

  // AMBUSH DAMAGE BONUS
  if (attacker.ambushTimer > 0) {
     damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;
     particles.push(createParticle(victim.x, victim.y, 'red'));
     particles.push(createParticle(victim.x, victim.y, 'orange'));
  }

  const desiredMassSteal = damage * GAME_MECHANICS.COMBAT_BITE_MASS_FACTOR;
  const victimCurrentMass = victim.radius * victim.radius; 
  const victimMinMass = GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE * GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE;
  const availableMass = Math.max(0, victimCurrentMass - victimMinMass);
  const actualMassSteal = Math.min(desiredMassSteal, availableMass);

  // Apply Changes
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

  if ('xp' in attacker) {
      (attacker as PlayerState).xp += 10 + (attacker.ambushTimer > 0 ? 50 : 0);
      (attacker as PlayerState).eatenHistory[victim.type] = ((attacker as PlayerState).eatenHistory[victim.type] || 0) + 1;
  }

  if (!('xp' in victim)) {
     const v = victim as Entity;
     v.targetId = attacker.id;
     v.aggroTimer = 200;
  }

  victim.health -= damage;
  if (victim.id !== 'player' && victim.health <= 0) {
      victim.health = 0; 
      if ('xp' in attacker) (attacker as PlayerState).xp += victim.config.xpValue;
      for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
  }
};

const spawnEntities = (state: GameState) => {
  if (state.entities.length >= MAX_ENTITIES) return;
  const planktonCount = state.entities.filter(e => e.type === CreatureType.PLANKTON).length;
  let type: CreatureType = CreatureType.PLANKTON;

  if (planktonCount < 80) { 
    type = CreatureType.PLANKTON;
  } else {
    const r = Math.random();
    // Weighted spawn
    if (r < 0.30) type = CreatureType.ALGAE_FISH;
    else if (r < 0.50) type = CreatureType.JELLYFISH;
    else if (r < 0.65) type = Math.random() < 0.5 ? CreatureType.OCTOPUS : CreatureType.NEEDLE_FISH;
    else if (r < 0.80) type = Math.random() < 0.5 ? CreatureType.POISON_FISH : CreatureType.ANGLER_FISH;
    else if (r < 0.95) type = Math.random() < 0.5 ? CreatureType.SWORD_FISH : CreatureType.GHOST;
    else type = CreatureType.LEVIATHAN; 
  }

  let sx, sy;
  if (type === CreatureType.PLANKTON) {
    sx = Math.random() * WORLD_SIZE;
    sy = Math.random() * WORLD_SIZE;
  } else {
    do {
      sx = Math.random() * WORLD_SIZE;
      sy = Math.random() * WORLD_SIZE;
    } while (dist({x: sx, y: sy}, state.player) < 800); 
  }

  state.entities.push(createEntity(type, sx, sy));
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, boostActive: boolean, tauntActive: boolean, screenW: number, screenH: number): GameState => {
  if (state.status !== GameStatus.PLAYING) return state;

  state.time += 1;
  const { player, obstacles } = state;
  const newParticles: Particle[] = [];

  spawnPowerUps(state);
  spawnHazards(state);
  updateHazards(state, newParticles);
  updateStrategyState(player); // Check if player is idle/luring/camo

  // --- TAUNT LOGIC (Old) & LURE VISUALS (New) ---
  if (tauntActive) {
     // Taunt shake
     player.x += (Math.random() - 0.5) * 4;
     player.y += (Math.random() - 0.5) * 4;
     // Manual taunt always attracts aggro
     state.entities.forEach(e => {
        if (e.type === CreatureType.PLANKTON) return;
        if (player.isHidden) return;
        if (dist(player, e) < 600) {
           e.aggroTimer = 150; 
           e.targetId = 'player';
        }
     });
  }

  // --- Player Boost ---
  let speedMult = player.stats.speedMult;
  
  if (player.speedBoostTimer && player.speedBoostTimer > 0) {
      player.speedBoostTimer--;
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
      if (state.time % 10 === 0) newParticles.push(createParticle(player.x, player.y, '#fde047'));
  }

  // Ambush Bonus for Player
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

  player.x = Math.max(player.radius, Math.min(WORLD_SIZE - player.radius, player.x + player.vx));
  player.y = Math.max(player.radius, Math.min(WORLD_SIZE - player.radius, player.y + player.vy));

  if (player.renderScale > 1.0) player.renderScale += (1.0 - player.renderScale) * 0.1;

  checkHiding(player, obstacles);
  state.entities.forEach(e => checkHiding(e, obstacles));

  player.mouthOpenValue = Math.max(0, player.mouthOpenValue - 0.1);
  if (isMouseDownRefForMouth) player.mouthOpenValue = 0.8; 

  // --- Entities AI ---
  state.entities.forEach(entity => {
    updateAI(entity, state);
  });

  // --- Collision Resolution (Nibble System) ---
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

  // --- Evolution Logic ---
  const nextLevelXp = LEVEL_THRESHOLDS[player.level] || 9999999;
  if (player.xp >= nextLevelXp) {
    player.level++;
    const nextType = getNextEvolution(player.type, player.eatenHistory, player.level);
    
    if (nextType !== player.type) {
        player.type = nextType;
        player.config = CREATURES[nextType];
        player.maxHealth += 50; 
        player.health = player.maxHealth;
        const grewRadius = Math.max(player.radius, player.config.baseRadius);
        player.radius = Math.min(GAME_MECHANICS.MAX_RADIUS, grewRadius); 
        
        for(let i=0; i<20; i++) newParticles.push(createParticle(player.x, player.y, '#fbbf24'));
        player.renderScale = 1.5;
    }
    player.isInvulnerable = true; 
    setTimeout(() => { player.isInvulnerable = false; }, 3000); 
  }

  state.particles = state.particles.map(p => ({
    ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05
  })).filter(p => p.life > 0).concat(newParticles);

  spawnEntities(state);

  const targetZoom = Math.max(0.5, 1.4 - (player.radius / 300));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;
  state.camera.x = player.x; 
  state.camera.y = player.y;

  return state;
};

let isMouseDownRefForMouth = false;