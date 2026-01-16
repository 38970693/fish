import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const EAT_PHRASES = ["好吃!", "真香!", "爽!", "嗝~", "美味!", "再來!"];
const HURT_PHRASES = ["疼!", "哎哟!", "别吃我!", "雅蠛蝶!", "救命!", "好痛!"];

const getRandomPhrase = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// Updated Logic: Evolution depends on current species and what you ate
const getNextEvolution = (currentType: CreatureType, history: Record<CreatureType, number>, radius: number): CreatureType => {
  const config = CREATURES[currentType];
  
  // Find next tier threshold
  const nextTier = config.tier + 1;
  const threshold = EVOLUTION_THRESHOLDS.find(t => t.tier === nextTier);
  
  if (!threshold || radius < threshold.radius) return currentType;

  // Evolution Logic based on Playstyle (Diet)
  const aggressiveScore = (history[CreatureType.CLOWN_FISH] || 0) + (history[CreatureType.SEAHORSE] || 0) + (history[CreatureType.SWORD_FISH] || 0) + (history[CreatureType.ELECTRIC_EEL] || 0) + (history[CreatureType.AROWANA] || 0);
  const passiveScore = (history[CreatureType.JELLYFISH] || 0) + (history[CreatureType.PLANKTON] || 0) + (history[CreatureType.TURTLE] || 0) + (history[CreatureType.STINGRAY] || 0) + (history[CreatureType.FUR_SEAL] || 0);
  const tankScore = (history[CreatureType.CRAB] || 0) + (history[CreatureType.PUFFER_FISH] || 0) + (history[CreatureType.HAMMERHEAD] || 0);

  if (nextTier === 2) {
      if (tankScore > aggressiveScore) return CreatureType.CRAB;
      if (aggressiveScore > passiveScore) return CreatureType.ELECTRIC_EEL;
      if (passiveScore > 20) return CreatureType.SEAHORSE;
      return CreatureType.SQUID; // Default agile
  }
  
  if (nextTier === 3) {
      if (config.type === CreatureType.SEAHORSE || config.type === CreatureType.BLUE_TANG) return CreatureType.FUR_SEAL; // Speed evolution
      if (config.type === CreatureType.CRAB) return CreatureType.HAMMERHEAD;
      if (passiveScore > aggressiveScore) return CreatureType.STINGRAY;
      if (aggressiveScore > 20) return CreatureType.AROWANA; // Elite hunter
      if (aggressiveScore > 10) return CreatureType.SWORD_FISH;
      return CreatureType.ANGLER_FISH;
  }

  if (nextTier === 4) {
      if (currentType === CreatureType.SWORD_FISH || currentType === CreatureType.AROWANA) return CreatureType.NARWHAL;
      if (aggressiveScore > tankScore) return CreatureType.GREAT_WHITE;
      if (Math.random() < 0.05) return CreatureType.MERMAID; // Very rare evolution chance
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
    speedBoostTimer: 0,
    happyTimer: 0,
    speechBubble: null
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

      state.hazards.push({
        id: uuid(),
        x: tx,
        y: ty,
        radius: METEOR_CONFIG.RADIUS,
        type: 'METEOR_STRIKE',
        timer: METEOR_CONFIG.WARNING_TIME,
        duration: METEOR_CONFIG.WARNING_TIME + METEOR_CONFIG.STRIKE_TIME,
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
    
    if (hazard.timer > 0) {
        hazard.stage = 'WARNING';
    } else if (hazard.timer === 0) {
        // IMPACT FRAME
        hazard.stage = 'STRIKE';
        
        // Massive Explosion Particles
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
        
        // NEW: Splash Particles (Water that shrinks fish)
        for(let i=0; i<METEOR_CONFIG.SPLASH_COUNT; i++) {
           const angle = (Math.PI * 2 / METEOR_CONFIG.SPLASH_COUNT) * i + Math.random();
           const spd = 5 + Math.random() * 8;
           particles.push({
             ...createParticle(hazard.x, hazard.y, '#38bdf8'), // Cyan/Blue water
             vx: Math.cos(angle) * spd,
             vy: Math.sin(angle) * spd,
             life: 1.5, // Lasts a bit
             size: 8 + Math.random() * 6,
             interactionType: 'SHRINK'
           });
        }

        // Damage Player
        if (dist(player, hazard) < hazard.radius && !player.isGodMode && !player.isHidden) {
            player.health = 0;
            state.status = GameStatus.GAME_OVER;
        }

        // Damage Entities
        for (const ent of entities) {
             if (dist(ent, hazard) < hazard.radius) {
                 ent.health = 0; 
                 // Blood/Destruction particles
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
  
  // Speech Bubble Timer
  if (entity.speechBubble) {
    entity.speechBubble.timer--;
    if (entity.speechBubble.timer <= 0) {
       entity.speechBubble = null;
    }
  }
};

// Generic AI logic used by both NPCs and Player Auto-Mode
const calculateAIMovement = (entity: Entity, entities: Entity[], player: PlayerState, hazards: Hazard[], isPlayer: boolean) => {
    // 1. Scan environment
    const detectionRange = 500 + (entity.radius * 3);
    const nearby = entities.filter(e => e.id !== entity.id && !e.isHidden && dist(entity, e) < detectionRange);
    
    // Add player to nearby if this is NPC AI, or exclude if this IS the player
    if (!isPlayer && !player.isHidden && dist(entity, player) < detectionRange) {
        nearby.push(player);
    }

    let fx = 0;
    let fy = 0;
    let fearFactor = 0;
    let nearestFoodDist = Infinity;
    let nearestFood: {x: number, y: number} | null = null;
    let targetEntityId: string | null = null;

    // 2. Hazard Avoidance (High Priority)
    for (const h of hazards) {
        if (h.stage !== 'COOLDOWN' && h.timer > 0) {
            const d = dist(entity, h);
            if (d < h.radius + 100) {
                const dirX = (h.x - entity.x) / d;
                const dirY = (h.y - entity.y) / d;
                const evadeWeight = 5000 / (d + 1);
                fx -= dirX * evadeWeight;
                fy -= dirY * evadeWeight;
                fearFactor += evadeWeight;
            }
        }
    }

    // 3. Entity Interaction (Predator/Prey)
    for (const other of nearby) {
        const d = dist(entity, other);
        const dirX = (other.x - entity.x) / d;
        const dirY = (other.y - entity.y) / d;

        // Is it bigger? (Predator)
        const isPredator = other.radius > entity.radius * 1.1; // Safety margin
        // Is it smaller? (Food)
        const isFood = other.radius < entity.radius * 0.9 || other.type === CreatureType.PLANKTON;

        if (isPredator) {
            if (!other.camoActive) {
                // EVASION LOGIC: Strong repulsion
                const repulsion = 4000 / (d * d); // Exponential fear
                fx -= dirX * repulsion * 200; // Stronger force
                fy -= dirY * repulsion * 200;
                fearFactor += repulsion;
            }
        } else if (isFood) {
            if (d < nearestFoodDist) {
                nearestFoodDist = d;
                nearestFood = other;
                if ('id' in other) targetEntityId = (other as Entity).id;
            }
        }
    }

    // 4. Decision Making
    // If scared, RUN!
    if (fearFactor > 0.5) {
        // Just run away from the composite fear vector
        // Vectors already summed in fx/fy
    } 
    // If not scared, eat.
    else if (nearestFood) {
        const dx = nearestFood.x - entity.x;
        const dy = nearestFood.y - entity.y;
        const d = Math.hypot(dx, dy);
        fx += (dx / d) * 2.0; 
        fy += (dy / d) * 2.0;
    } else {
        // Wander
        if (!isPlayer) {
             fx += Math.cos(entity.angle) * 0.5;
             fy += Math.sin(entity.angle) * 0.5;
             if (Math.random() < 0.05) {
                fx += (Math.random() - 0.5) * 2;
                fy += (Math.random() - 0.5) * 2;
             }
        }
    }

    // Return the desired angle and target
    const desiredAngle = (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) ? Math.atan2(fy, fx) : entity.angle;
    return { desiredAngle, targetEntityId, fearFactor };
};


const updateAI = (entity: Entity, state: GameState) => {
  const { player, entities, hazards } = state; 
  updateStrategyState(entity);

  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) entity.speedBoostTimer--;

  if (entity.type === CreatureType.PLANKTON) {
    entity.x += Math.cos(entity.angle) * 0.5;
    entity.y += Math.sin(entity.angle) * 0.5;
    if (Math.random() < 0.01) entity.angle += (Math.random() - 0.5) * 2;
    return; 
  }

  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * 0.001));
  
  // Use shared AI logic
  const { desiredAngle, targetEntityId, fearFactor } = calculateAIMovement(entity, entities, player, hazards, false);
  
  if (targetEntityId) entity.targetId = targetEntityId;

  // Turn towards desired angle
  let angleDiff = desiredAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;

  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  if (fearFactor > 0.5) speedMult = 1.8; // Run faster when scared!
  
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
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
  
  // "Big eats Small" logic refinement
  // 1. High probability for big fish to eat small fish
  // 2. Low probability for small fish to bite big fish (deflect)

  const isBiting = Math.abs(angleDiff) < Math.PI / 3;
  if (!isBiting) return;

  // Plankton is always eaten
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
    attacker.happyTimer = 60; 
    
    // Plankton doesn't trigger speech always (too noisy), 10% chance
    if (Math.random() < 0.1) {
        attacker.speechBubble = { text: "好吃", timer: 60, color: '#bef264' };
    }
    return;
  }

  // --- BIG EATS SMALL (Advantage) ---
  if (attacker.radius > victim.radius) {
      // Chance to INSTA-SWALLOW even if not 2x bigger (Lucky Gulp)
      // Normal swallow threshold is 1.4x (2.0x for player victim)
      const swallowThreshold = (victim.id === 'player') ? 2.0 : 1.4;
      const ratio = attacker.radius / victim.radius; // e.g. 1.2
      
      let isSwallowed = false;
      if (ratio > swallowThreshold) {
          isSwallowed = true;
      } else if (ratio > 1.1) {
          // 20% chance to swallow anyway if slightly bigger
          if (Math.random() < 0.2) isSwallowed = true;
      }

      if (isSwallowed) {
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
          
          // Talk
          attacker.speechBubble = { text: getRandomPhrase(EAT_PHRASES), timer: 60, color: '#bef264' };
          
          particles.push(createParticle(victim.x, victim.y, victim.config.color));
          particles.push(createParticle(victim.x, victim.y, 'white'));
          
          if ('weight' in attacker) {
              const w = (attacker as PlayerState);
              w.weight += victim.config.weightValue * 2.0; 
              w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
          }
          return;
      }

      // If not swallowed, deal HUGE damage
      let damage = attacker.config.damage * 1.2; // Bonus damage for being bigger
      if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;

      victim.health -= damage;
      particles.push(createParticle(victim.x, victim.y, 'red'));
      attacker.happyTimer = 60;
      
      // Talk
      attacker.speechBubble = { text: getRandomPhrase(EAT_PHRASES), timer: 45, color: '#bef264' };
      victim.speechBubble = { text: getRandomPhrase(HURT_PHRASES), timer: 60, color: '#f87171' };

      // Knockback / Fear
       if (!('weight' in victim)) { 
          const v = victim as Entity;
          v.targetId = attacker.id; 
          v.aggroTimer = 300; 
          v.speedBoostTimer = (v.speedBoostTimer || 0) + 10; 
          // Turn away
          v.angle = attacker.angle; 
      }
  } 
  // --- SMALL BITES BIG (Disadvantage) ---
  else {
      // 85% chance to FAIL (Deflect)
      if (Math.random() < 0.85) {
          // Spark effect (Gray particles)
          particles.push(createParticle((attacker.x + victim.x)/2, (attacker.y + victim.y)/2, '#94a3b8'));
          return; 
      }

      // 15% Chance to hit (Normal damage, no bonus)
      let damage = attacker.config.damage;
      if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;

      // Mass Steal
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
      
      // Talk
      attacker.speechBubble = { text: "爽!", timer: 45, color: '#bef264' };
      victim.speechBubble = { text: getRandomPhrase(HURT_PHRASES), timer: 60, color: '#f87171' };
  }

  // Death Check
  if (victim.id !== 'player' && victim.health <= 0) {
      victim.health = 0; 
      if ('weight' in attacker) (attacker as PlayerState).weight += victim.config.weightValue;
      for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
      attacker.happyTimer = 60;
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
    // Optimized spawn rates to include new creatures
    if (r < 0.15) type = CreatureType.CLOWN_FISH;
    else if (r < 0.28) type = CreatureType.BLUE_TANG;
    else if (r < 0.38) type = CreatureType.TURTLE; 
    else if (r < 0.45) type = CreatureType.JELLYFISH;
    else if (r < 0.52) type = CreatureType.SEAHORSE;
    else if (r < 0.58) type = CreatureType.PUFFER_FISH;
    else if (r < 0.64) type = CreatureType.CRAB;
    else if (r < 0.70) type = CreatureType.ELECTRIC_EEL; 
    else if (r < 0.75) type = CreatureType.SQUID;
    else if (r < 0.82) type = CreatureType.STINGRAY; 
    else if (r < 0.86) type = CreatureType.FUR_SEAL; // New
    else if (r < 0.90) type = CreatureType.AROWANA; // New
    else if (r < 0.93) type = CreatureType.SWORD_FISH;
    else if (r < 0.96) type = CreatureType.HAMMERHEAD; 
    else if (r < 0.98) type = CreatureType.ANGLER_FISH;
    else if (r < 0.99) type = CreatureType.GREAT_WHITE; 
    else if (r < 0.995) type = CreatureType.NARWHAL; // New
    else if (r < 0.998) type = CreatureType.ORCA; 
    else type = CreatureType.MERMAID; // Very rare
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
  
  if (player.happyTimer && player.happyTimer > 0) player.happyTimer--;

  // Player Movement Logic (Mouse vs Auto)
  let playerAgility = Math.max(0.03, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * 0.0005));
  let targetAngle = player.angle;

  if (player.isAutoMode) {
      // Auto AI
      const aiResult = calculateAIMovement(player, state.entities, player, state.hazards, true);
      targetAngle = aiResult.desiredAngle;
      if (aiResult.fearFactor > 0.5 && player.boost.current > 10) {
          boostActive = true; // Auto boost when scared
      }
  } else {
      // Mouse Control
      const dx = mouse.x - (screenW / 2);
      const dy = mouse.y - (screenH / 2);
      targetAngle = Math.atan2(dy, dx);
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

  let angleDiff = targetAngle - player.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
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

  // UPDATE PARTICLES & HANDLE SPLASH COLLISION
  state.particles = state.particles.filter(p => p.life > 0).map(p => {
    // If it's a splash/shrink particle, check collision with fish
    if (p.interactionType === 'SHRINK' && p.life > 0.5) {
        // Check Player
        if (dist(player, p) < player.radius) {
            player.radius *= METEOR_CONFIG.SPLASH_SHRINK; 
            player.radius = Math.max(GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE, player.radius);
            p.life = 0; // Destroy particle
            player.speechBubble = { text: "变小了!", timer: 45, color: '#38bdf8' };
        }
        // Check Entities
        else {
            for(const e of state.entities) {
               if (dist(e, p) < e.radius) {
                  e.radius *= METEOR_CONFIG.SPLASH_SHRINK;
                  e.radius = Math.max(GAME_MECHANICS.MIN_RADIUS_TO_SURVIVE, e.radius);
                  p.life = 0;
                  break; 
               }
            }
        }
    }

    return {
       ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05
    };
  }).filter(p => p.life > 0).concat(newParticles);

  spawnEntities(state);

  const targetZoom = Math.max(0.5, 1.4 - (player.radius / 400));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;
  state.camera.x = player.x; 
  state.camera.y = player.y;

  return state;
};

let isMouseDownRefForMouth = false;