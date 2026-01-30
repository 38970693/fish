import { CREATURES, WORLD_SIZE, MAX_ENTITIES, BOOST_CONFIG, MAX_OBSTACLES, GAME_MECHANICS, MAX_POWERUPS, METEOR_CONFIG, EVOLUTION_THRESHOLDS, SKINNY_PHRASES, REVERSAL_PHRASE, PORTAL_CONFIG } from './constants';
import { CreatureType, Entity, GameState, GameStatus, Obstacle, Particle, PlayerState, PowerUp, Hazard, Projectile, Portal } from './types';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: {x: number, y: number}, e2: {x: number, y: number}) => 
  Math.hypot(e1.x - e2.x, e1.y - e2.y);

const EAT_PHRASES = ["好吃!", "真香!", "爽!", "嗝~", "美味!", "再來!"];
const HURT_PHRASES = ["疼!", "哎哟!", "别吃我!", "雅蠛蝶!", "救命!", "好痛!", "卡喉咙了!"];
const SQUAD_PHRASES = ["老大!", "跟你混了!", "誓死效忠!", "冲啊!", "战队+1"];
const PANIC_PHRASES = ["巨物恐惧!", "快逃!", "太大了!", "看不见我...", "妈耶!"];
const AMBUSH_PHRASES = ["偷袭!", "背刺!", "千年杀!", "不讲武德!"];
const ANGRY_PHRASES = ["别跑!", "站住!", "你瞅啥?", "吼!!", "小别致!"];

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
    fearTimer: 0, // Init
    speechBubble: null,
    evolutionVisualTimer: 0
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
  if (Math.random() > 0.03) return; 
  
  const angle = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 1000;
  
  const r = Math.random();
  let type: 'SPEED' | 'SHIELD' | 'TORPEDO' = 'SPEED';
  
  if (r < 0.6) type = 'SPEED';
  else if (r < 0.8) type = 'SHIELD';
  else type = 'TORPEDO';

  state.powerUps.push({
    id: uuid(),
    x: state.player.x + Math.cos(angle) * dist,
    y: state.player.y + Math.sin(angle) * dist,
    type,
    radius: 20 // Slightly larger for new items
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

const spawnPortals = (state: GameState) => {
    if (state.portals.length >= PORTAL_CONFIG.MAX_COUNT) return;
    if (Math.random() > PORTAL_CONFIG.SPAWN_CHANCE) return;

    // Spawn randomly
    const px = (Math.random() * WORLD_SIZE * 0.8) + (WORLD_SIZE * 0.1);
    const py = (Math.random() * WORLD_SIZE * 0.8) + (WORLD_SIZE * 0.1);

    state.portals.push({
        id: uuid(),
        x: px,
        y: py,
        radius: PORTAL_CONFIG.RADIUS,
        timer: PORTAL_CONFIG.DURATION,
        angle: 0
    });
};

// --- SQUAD LOGIC ---

export const manualSquadSwitch = (state: GameState): boolean => {
    const squad = state.entities.filter(e => e.ownerId === 'player');
    if (squad.length === 0) return false;

    // 1. Pick random squad member
    const newBodyIndex = Math.floor(Math.random() * squad.length);
    const newBody = squad[newBodyIndex];

    // 2. Turn current player into an NPC (Old Body)
    const oldBody = createEntity(state.player.type, state.player.x, state.player.y);
    oldBody.radius = state.player.radius;
    oldBody.health = state.player.health;
    oldBody.maxHealth = state.player.maxHealth;
    oldBody.ownerId = 'player'; // Stays in squad
    oldBody.angle = state.player.angle;
    
    // Add old body to world
    state.entities.push(oldBody);

    // 3. Update Player State to match New Body
    state.player.type = newBody.type;
    state.player.config = newBody.config;
    state.player.x = newBody.x;
    state.player.y = newBody.y;
    state.player.radius = newBody.radius;
    state.player.health = newBody.health;
    state.player.maxHealth = newBody.maxHealth;
    state.player.speed = newBody.speed * 1.2; // Player bonus
    
    // Visual FX
    state.player.speechBubble = { text: "夺舍成功!", timer: 60, color: '#fef08a' };
    state.player.isInvulnerable = true;
    setTimeout(() => { if(state.player) state.player.isInvulnerable = false; }, 1000);

    // 4. Remove the selected squad member from entities (since it's now the player)
    state.entities = state.entities.filter(e => e.id !== newBody.id);

    return true;
};

// Returns TRUE if successfully switched, FALSE if game over
const emergencySquadSwitch = (state: GameState): boolean => {
    const squad = state.entities.filter(e => e.ownerId === 'player');
    if (squad.length === 0) return false;

    // Pick largest radius squad member
    const newBody = squad.reduce((prev, current) => (prev.radius > current.radius) ? prev : current);
    
    // Current body is DEAD (do not create NPC)
    
    // Move soul
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

    // Remove new body from entity list
    state.entities = state.entities.filter(e => e.id !== newBody.id);
    
    // VFX
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

        // Damage Player - Check Invulnerability Shield
        const playerInvulnerable = player.isGodMode || player.isInvulnerable || (player.shieldTimer > 0);
        
        if (dist(player, hazard) < hazard.radius && !playerInvulnerable && !player.isHidden) {
            player.health = 0;
            // DEATH CHECK HANDLED IN UPDATEGAME NOW VIA EMERGENCY SWITCH
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

const updatePortals = (state: GameState, particles: Particle[]) => {
    state.portals = state.portals.filter(p => p.timer > 0);
    
    state.portals.forEach(p => {
        p.timer--;
        p.angle += 0.05;

        // Particle effect for portal
        if (Math.random() < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            const dist = p.radius * Math.random();
            particles.push({
                ...createParticle(p.x + Math.cos(angle) * dist, p.y + Math.sin(angle) * dist, PORTAL_CONFIG.COLORS[Math.floor(Math.random() * 3)]),
                life: 0.5,
                size: 2,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2
            });
        }
    });

    // Check interactions
    const checkTeleport = (entity: Entity | PlayerState) => {
        for (const p of state.portals) {
            if (dist(entity, p) < p.radius) {
                // TELEPORT!
                const r = Math.random();
                let destX, destY, type;
                
                // 15% Treasure (High reward)
                if (r < 0.15) {
                    type = "TREASURE";
                    destX = Math.random() * WORLD_SIZE;
                    destY = Math.random() * WORLD_SIZE;
                    
                    // Spawn LOOT at destination
                    for(let i=0; i<20; i++) {
                        state.entities.push(createEntity(CreatureType.PLANKTON, destX + (Math.random()-0.5)*300, destY + (Math.random()-0.5)*300));
                    }
                    state.powerUps.push({ id: uuid(), x: destX, y: destY, type: 'SPEED', radius: 20 });
                } 
                // 5% Danger (Near Boss/Hazard)
                else if (r < 0.20) {
                    type = "DANGER";
                    // Find biggest fish
                    const boss = state.entities.sort((a,b) => b.radius - a.radius)[0];
                    if (boss) {
                        destX = boss.x + (Math.random() - 0.5) * 300;
                        destY = boss.y + (Math.random() - 0.5) * 300;
                    } else {
                        // Fallback
                        destX = Math.random() * WORLD_SIZE;
                        destY = Math.random() * WORLD_SIZE;
                    }
                } 
                // 80% Normal
                else {
                    type = "NORMAL";
                    destX = Math.random() * WORLD_SIZE;
                    destY = Math.random() * WORLD_SIZE;
                }

                // Effects at OLD position
                for(let i=0; i<10; i++) particles.push(createParticle(entity.x, entity.y, '#d8b4fe'));

                // Move
                entity.x = destX;
                entity.y = destY;

                // Effects at NEW position
                for(let i=0; i<10; i++) particles.push(createParticle(entity.x, entity.y, '#22d3ee'));

                // Text
                if (type === "TREASURE") entity.speechBubble = { text: "发财了!", timer: 60, color: '#fcd34d' };
                else if (type === "DANGER") entity.speechBubble = { text: "救命啊!", timer: 60, color: '#fca5a5' };
                else entity.speechBubble = { text: "穿越!", timer: 45, color: '#d8b4fe' };

                // Add slight cooldown/push to prevent instant re-teleport if portal spawns there
                entity.x += 60; 
                
                // For player, add camera shake effect maybe? (handled by camera smoothing automatically)
                if (entity.id === 'player') {
                   // Just let camera catch up
                }

                break; // Only one teleport per frame
            }
        }
    };

    checkTeleport(state.player);
    state.entities.forEach(e => checkTeleport(e));
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
  
  // Speech Bubble Timer
  if (entity.speechBubble) {
    entity.speechBubble.timer--;
    if (entity.speechBubble.timer <= 0) {
       entity.speechBubble = null;
    }
  }
};

// Generic AI logic used by both NPCs and Player Auto-Mode
const calculateAIMovement = (entity: Entity, entities: Entity[], player: PlayerState, hazards: Hazard[], obstacles: Obstacle[], isPlayer: boolean) => {
    // 1. Scan environment - INCREASED VISUAL RANGE FOR SMALL FISH TO SEE BIG FISH
    // Base detection is 700 pixels (was 500)
    const baseDetection = 700;
    const nearby = entities.filter(e => {
        if (e.id === entity.id || e.isHidden) return false;
        // Check distance based on target size (Big things are seen from further away)
        const spottingDist = baseDetection + (e.radius * 5); 
        return dist(entity, e) < spottingDist;
    });
    
    // Add player to nearby if this is NPC AI, or exclude if this IS the player
    // If entity is in player squad, player is NOT a target but a leader
    if (!isPlayer && !player.isHidden && entity.ownerId !== 'player') {
        const spottingDist = baseDetection + (player.radius * 5);
        if (dist(entity, player) < spottingDist) {
            nearby.push(player);
        }
    }

    let fx = 0;
    let fy = 0;
    let fearFactor = 0;
    let panicFactor = 0; // New: Specific for super threats
    let nearestFoodDist = Infinity;
    let nearestFood: {x: number, y: number} | null = null;
    let targetEntityId: string | null = null;
    
    // Squad Follow Logic
    if (entity.ownerId === 'player') {
         const distToPlayer = dist(entity, player);
         if (distToPlayer > 300) {
             // Too far, follow player
             const dirX = (player.x - entity.x) / distToPlayer;
             const dirY = (player.y - entity.y) / distToPlayer;
             fx += dirX * 2.0;
             fy += dirY * 2.0;
             // Don't scan for food/enemies as aggressively when catching up
         } else {
             // Nearby, behave protectively
             // Wander around player
             const wanderAngle = entity.angle + (Math.random() - 0.5);
             fx += Math.cos(wanderAngle) * 0.5;
             fy += Math.sin(wanderAngle) * 0.5;
         }
    }

    // Shield Check (Global for AI): If target is player and player has shield, ignore them
    const playerHasShield = player.shieldTimer > 0 || player.isInvulnerable || player.isGodMode;

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
    
    // PRIORITY 0: RAGE / AGGRO (Override Fear & Food logic below, but still affected by Hazard above)
    // If this entity is enraged and has a target, it will tunnel vision on it
    if (entity.aggroTimer && entity.aggroTimer > 0 && entity.targetId) {
         // Find target
         let target = null;
         if (entity.targetId === 'player') target = player;
         else target = entities.find(e => e.id === entity.targetId);
         
         if (target && !target.isHidden) {
             const distToTarget = dist(entity, target);
             const dx = target.x - entity.x;
             const dy = target.y - entity.y;
             fx += (dx / distToTarget) * 4.0; // STRONG CHASE BIAS
             fy += (dy / distToTarget) * 4.0;
             
             // Ignore other logic, just chase
             const desiredAngle = Math.atan2(fy, fx);
             return { desiredAngle, targetEntityId: entity.targetId, fearFactor: 0, panicFactor: 0 };
         }
    }

    for (const other of nearby) {
        // Skip player if they have shield and we are predators (basically ignore them)
        if (other.id === player.id && playerHasShield) {
            continue; 
        }

        // Squad members don't attack each other or the player
        if (entity.ownerId === 'player' && (other.id === player.id || other.ownerId === 'player')) {
            continue;
        }

        // Player (Auto Mode) should not chase their own squad
        if (isPlayer && other.ownerId === 'player') {
            continue;
        }
        
        // Auto Mode optimization: Don't chase things inside seaweed even if not fully hidden yet
        // This solves the issue where AI gets stuck trying to eat something it can't eat
        if (isPlayer) {
             const insideSeaweed = obstacles.some(o => o.type === 'SEAWEED' && dist(other, o) < o.radius);
             if (insideSeaweed) continue;
        }
        
        // Enemies don't fight other enemies in simple AI, but they attack squad
        if (!entity.ownerId && !other.ownerId && other.id !== player.id) {
             // Simplification: Wild fish mostly ignore each other unless predator/prey
        }

        const d = dist(entity, other);
        const dirX = (other.x - entity.x) / d;
        const dirY = (other.y - entity.y) / d;

        // Is it bigger? (Predator)
        const sizeRatio = other.radius / entity.radius;
        const isPredator = sizeRatio > 1.1; 
        // Is it smaller? (Food)
        const isFood = other.radius < entity.radius * 0.9 || other.type === CreatureType.PLANKTON;

        if (isPredator) {
            if (!other.camoActive) {
                // EVASION LOGIC: Strong repulsion based on size threat
                let panicMultiplier = 1.0;
                
                // Panic Logic: The bigger the fish, the harder we run
                // Only scale evasion force for massive threats here, logic handles acceleration separately
                if (sizeRatio > 5.0 || other.radius > 100) {
                    panicMultiplier = 4.0; // MASSIVE threat (Bosses/Giants)
                } else if (sizeRatio > 2.0) {
                    panicMultiplier = 1.5;
                }

                // INCREASED REPULSION FOR "ACCELERATE AWAY" EFFECT
                const distanceSq = d * d;
                const repulsion = 50000 / (distanceSq + 1); 
                const evasionForce = repulsion * 300 * panicMultiplier;

                fx -= dirX * evasionForce;
                fy -= dirY * evasionForce;
                fearFactor += repulsion * panicMultiplier;
                
                // NEW: Accumulate Panic for "Speed Boost" Trigger
                // User requirement: > 10x size (practically > 5x for implementation) OR Super Giant (>100px)
                if (sizeRatio > 5.0 || other.radius > 100) {
                    panicFactor += repulsion;
                }
                
                // Visual Panic (Only if very close and huge)
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
        
        // Skinny Shaming Logic (Aggro to player if they are super thin)
        if (other.id === player.id && !isPlayer) {
             const p = other as PlayerState;
             if (p.weight <= BOOST_CONFIG.OVERDRIVE_MIN_WEIGHT + 0.5) {
                 // If the player is thin, predators are more aggressive/likely to chase
                 // Random chance to talk
                 if (Math.random() < 0.005 && !entity.speechBubble && dist(entity, player) < 400) {
                     entity.speechBubble = { text: getRandomPhrase(SKINNY_PHRASES), timer: 60, color: '#fca5a5' };
                 }
             }
        }
    }

    // 4. Decision Making
    
    // PRIORITY: FEAR
    // If fear is high (even moderately high), IGNORE FOOD completely.
    if (fearFactor > 0.8) { 
        targetEntityId = null; // Forget food
    } 
    // If not scared (or fear is low enough), eat.
    else if (nearestFood) {
        const dx = nearestFood.x - entity.x;
        const dy = nearestFood.y - entity.y;
        const d = Math.hypot(dx, dy);
        fx += (dx / d) * 2.5; // AGGRESSIVELY CHASE FOOD (Increased from 2.0)
        fy += (dy / d) * 2.5;
    } else {
        // Wander
        if (!isPlayer && entity.ownerId !== 'player') { // Squad already has wander logic above
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
    return; 
  }

  // Check if player has shield and reset aggro
  const playerHasShield = player.shieldTimer > 0 || player.isInvulnerable || player.isGodMode;
  if (playerHasShield && entity.targetId === 'player') {
      entity.targetId = null; // Lost target
      // Confusion spin
      entity.angle += Math.PI;
      if (!entity.speechBubble) entity.speechBubble = { text: "?", timer: 30, color: 'white' };
  }

  // UPDATED AGILITY CALCULATION: Small = Agile, Big = Clumsy
  let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
  
  // Use shared AI logic
  const { desiredAngle, targetEntityId, fearFactor, panicFactor } = calculateAIMovement(entity, entities, player, hazards, obstacles, false);
  
  if (targetEntityId) entity.targetId = targetEntityId;

  // Set Fear State based on Factor
  if (panicFactor > 0.1) { // Only show fear animation for big threats
      entity.fearTimer = 20; 
  }

  // Turn towards desired angle
  let angleDiff = desiredAngle - entity.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  entity.angle += angleDiff * agility;

  let speedMult = 1.0; 
  if (entity.targetId) speedMult = 1.3; 
  
  // NEW: ACCELERATE AWAY LOGIC
  // Only trigger massive speed boost if specifically PANICKING (Giant threats)
  if (panicFactor > 0.1) { 
      // Scale speed based on how scary/close the threat is
      const panicIntensity = Math.min(2.5, panicFactor * 0.5);
      const panicSpeed = 1.5 + panicIntensity;
      speedMult = Math.max(speedMult, panicSpeed);
      
      // Panic Bubble Trail
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
  
  if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  }
  
  // Squad speed bonus to keep up
  if (entity.ownerId === 'player') speedMult *= 1.1;

  const finalSpeed = entity.speed * speedMult;
  entity.vx = Math.cos(entity.angle) * finalSpeed;
  entity.vy = Math.sin(entity.angle) * finalSpeed;

  entity.x += entity.vx;
  entity.y += entity.vy;
  
  if (entity.renderScale > 1.0) {
     entity.renderScale += (1.0 - entity.renderScale) * 0.1;
  }
};

const processCollision = (attacker: Entity | PlayerState, victim: Entity | PlayerState, particles: Particle[], state: GameState) => {
  // SHIELD CHECK (Victim has shield)
  if ('shieldTimer' in victim) {
      const v = victim as PlayerState;
      if (v.shieldTimer > 0 || v.isGodMode || v.isInvulnerable) {
          // Attacker bounces off
          const angle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
          attacker.x += Math.cos(angle) * 20;
          attacker.y += Math.sin(angle) * 20;
          particles.push(createParticle((attacker.x+victim.x)/2, (attacker.y+victim.y)/2, '#06b6d4')); // Cyan spark
          return;
      }
  }

  // Friendly Fire Check (Squad members don't hurt player or each other)
  const isFriendly = (e: Entity | PlayerState) => e.id === 'player' || ('ownerId' in e && e.ownerId === 'player');
  if (isFriendly(attacker) && isFriendly(victim)) return;

  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  
  const isBiting = Math.abs(angleDiff) < Math.PI / 3;
  if (!isBiting) return;

  // Plankton is always eaten
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

  // --- BIG EATS SMALL (NEW PROBABILISTIC LOGIC) ---
  if (attacker.radius > victim.radius) {
      const ratio = attacker.radius / victim.radius;

      // --- NEW: PLAYER SURVIVAL MECHANIC (Wake the Beast) ---
      if (victim.id === 'player') {
         // Check if attacker is already enraged at player
         const isEnraged = attacker.targetId === 'player' && (attacker.aggroTimer || 0) > 0;
         
         // If NOT enraged, this is just a "bump" to wake it up
         if (!isEnraged) {
              // Trigger Rage
              attacker.targetId = 'player';
              attacker.aggroTimer = 300; // 5 seconds
              attacker.speechBubble = { text: getRandomPhrase(ANGRY_PHRASES), timer: 60, color: '#ef4444' };
              attacker.happyTimer = 0;
              
              // Bounce Player Away (Survival Bounce)
              const ang = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
              const pushDist = attacker.radius * 0.5 + 20;
              victim.x = attacker.x + Math.cos(ang) * (attacker.radius + victim.radius + 15); // Teleport out of hitbox
              victim.y = attacker.y + Math.sin(ang) * (attacker.radius + victim.radius + 15);
              victim.vx += Math.cos(ang) * 15;
              victim.vy += Math.sin(ang) * 15;
              
              // Brief invulnerability to prevent glitchy double-hits immediately
              if ('invulnerableTimer' in victim) {
                  (victim as PlayerState).invulnerableTimer = 30; 
                  (victim as PlayerState).isInvulnerable = true;
              }
              
              // Fear status for player
              victim.fearTimer = 60;
              if (!victim.speechBubble) victim.speechBubble = { text: "妈耶!", timer: 45, color: '#fca5a5' };
              
              // Angry Particles
              for(let k=0; k<10; k++) particles.push(createParticle(attacker.x, attacker.y, '#ef4444'));
              
              return; // PLAYER LIVES!
         }
         // IF ENRAGED: Fall through to death logic below...
      }
      
      // 1. Calculate Base Swallow Probability
      let swallowChance = 0;
      if (ratio < 1.2) swallowChance = 0.01; // 1% - Almost never swallow similar size
      else if (ratio < 2.0) swallowChance = 0.05 + (ratio - 1.2) * 0.3; // 5% -> 30% linear scale
      else if (ratio < 3.0) swallowChance = 0.50; // 50%
      else if (ratio < 5.0) swallowChance = 0.80; // 80%
      else swallowChance = 1.0; // 100% Guaranteed

      // 2. Ambush / Backstab Bonus
      // If attacker is approaching from behind (angles match)
      // Angle diff between Attacker Direction and Victim Direction
      let chaseAngleDiff = Math.abs(attacker.angle - victim.angle);
      while (chaseAngleDiff > Math.PI) chaseAngleDiff -= Math.PI * 2;
      while (chaseAngleDiff < -Math.PI) chaseAngleDiff += Math.PI * 2;
      chaseAngleDiff = Math.abs(chaseAngleDiff);

      const isAmbush = chaseAngleDiff < Math.PI / 3; // Within 60 degrees arc behind
      
      if (isAmbush) {
          swallowChance += 0.4; // Massive +40% bonus
      }

      // 3. Roll Logic
      const roll = Math.random();
      const isSwallowed = roll < swallowChance;

      // 4. Execution
      if (isSwallowed) {
          // --- SQUAD RECRUITMENT LOGIC ---
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

          // SUCCESSFUL EAT
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
          if (isAmbush) {
             // Change to "Sneak Attack" since Reversal is now reserved for underdog kills
             attacker.speechBubble = { text: "偷袭!", timer: 60, color: '#fef08a' };
          } else {
             attacker.speechBubble = { text: getRandomPhrase(EAT_PHRASES), timer: 60, color: '#bef264' };
          }

          particles.push(createParticle(victim.x, victim.y, victim.config.color));
          particles.push(createParticle(victim.x, victim.y, 'white'));
          
          if ('weight' in attacker) {
              const w = (attacker as PlayerState);
              w.weight += victim.config.weightValue * 2.0; 
              w.eatenHistory[victim.type] = (w.eatenHistory[victim.type] || 0) + 1;
          }
      } else {
          // --- FAILED SWALLOW (BITE DAMAGE) ---
          
          let damage = attacker.config.damage * 1.2; 
          if (attacker.ambushTimer > 0) damage *= GAME_MECHANICS.AMBUSH_DAMAGE_MULT;

          // Critical Hit if Ambush failed swallow
          if (isAmbush) {
              damage *= 3.0; // CRIT
              // Extra gore
              for(let k=0; k<8; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
              attacker.speechBubble = { text: "暴击!", timer: 45, color: '#ef4444' };
          } else {
              // Failed swallow normal bite -> Bounce back slightly
              const bounceAngle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
              attacker.x += Math.cos(bounceAngle) * 10;
              attacker.y += Math.sin(bounceAngle) * 10;
              attacker.speechBubble = { text: "好硬!", timer: 30, color: 'white' };
              victim.speechBubble = { text: "卡喉咙!", timer: 45, color: '#fca5a5' };
          }

          victim.health -= damage;
          particles.push(createParticle(victim.x, victim.y, 'red'));
          
          // Knockback / Fear
           if (!('weight' in victim)) { 
              const v = victim as Entity;
              v.targetId = attacker.id; 
              v.aggroTimer = 300; 
              v.speedBoostTimer = (v.speedBoostTimer || 0) + 10; 
              // Run away
              v.angle = attacker.angle; 
          }
      }
  } 
  // --- SMALL BITES BIG (Disadvantage & AGGRO) ---
  else {
      // 85% chance to FAIL (Deflect)
      if (Math.random() < 0.85) {
          particles.push(createParticle((attacker.x + victim.x)/2, (attacker.y + victim.y)/2, '#94a3b8'));
          return; 
      }

      // 15% Chance to hit
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
      attacker.speechBubble = { text: "爽!", timer: 45, color: '#bef264' };
      victim.speechBubble = { text: getRandomPhrase(HURT_PHRASES), timer: 60, color: '#f87171' };
  }

  // Death Check
  if (victim.id !== 'player' && victim.health <= 0) {
      // LAST CHANCE RECRUITMENT (If killed by damage)
      if (attacker.id === 'player' && !victim.ownerId) {
          const squadCount = state.entities.filter(e => e.ownerId === 'player').length;
          if (squadCount < GAME_MECHANICS.MAX_SQUAD_SIZE) {
               victim.ownerId = 'player';
               victim.health = victim.maxHealth;
               victim.targetId = null;
               victim.speechBubble = { text: getRandomPhrase(SQUAD_PHRASES), timer: 90, color: '#bef264' };
               for(let i=0; i<10; i++) particles.push(createParticle(victim.x, victim.y, '#4ade80'));
               return; // Saved
          }
      }

      victim.health = 0; 
      if ('weight' in attacker) (attacker as PlayerState).weight += victim.config.weightValue;
      
      // --- REVERSAL CHECK (Condition: Victim is >= 2x larger than Attacker) ---
      if (victim.radius >= attacker.radius * 2.0) {
           attacker.speechBubble = { text: "逆转!", timer: 90, color: '#fbbf24' }; // Gold text
           attacker.happyTimer = 120; // Long celebration

           // COOL EFFECTS
           // 1. Massive Blood Explosion
           for(let k=0; k<30; k++) {
              const p = createParticle(victim.x, victim.y, victim.config.color);
              p.vx *= 3; p.vy *= 3; p.life = 1.5; p.size *= 1.5;
              particles.push(p);
           }
           // 2. Gold/Light sparks (Victory)
           for(let k=0; k<20; k++) {
              const p = createParticle(victim.x, victim.y, '#fbbf24');
              p.vx *= 4; p.vy *= 4; p.life = 1.0;
              particles.push(p);
           }
           // 3. Shockwave ring effect (simulated with particles)
           for(let k=0; k<16; k++) {
              const ang = (Math.PI * 2 * k) / 16;
              particles.push({
                 ...createParticle(victim.x, victim.y, '#ffffff'),
                 vx: Math.cos(ang) * 8,
                 vy: Math.sin(ang) * 8,
                 life: 0.5,
                 size: 5
              });
           }
      } else {
           // Normal Death Particles
           for(let k=0; k<5; k++) particles.push(createParticle(victim.x, victim.y, victim.config.color));
           attacker.happyTimer = 60;
      }
  }
};

export const updateGame = (state: GameState, mouse: {x: number, y: number}, isSpacePressed: boolean, isMouseDown: boolean, screenWidth: number, screenHeight: number): GameState => {
  if (state.status !== GameStatus.PLAYING && state.status !== GameStatus.MENU) return state;

  state.time++;
  
  // --- SPAWNING ---
  // Maintain population
  if (state.entities.length < MAX_ENTITIES) {
      const r = Math.random();
      let type = CreatureType.PLANKTON;
      
      // Spawn logic based on player size or random
      if (r < 0.6) type = CreatureType.PLANKTON;
      else if (r < 0.8) type = CreatureType.CLOWN_FISH;
      else if (r < 0.9) type = CreatureType.JELLYFISH;
      else if (r < 0.95) type = CreatureType.CRAB;
      else type = CreatureType.STINGRAY; // Rare big ones

      // Ensure we don't spawn too many big things if player is small?
      // Just random spawn at edges
      const spawnX = Math.random() * WORLD_SIZE;
      const spawnY = Math.random() * WORLD_SIZE;
      
      state.entities.push(createEntity(type, spawnX, spawnY));
  }
  
  spawnPowerUps(state);
  spawnHazards(state);
  spawnPortals(state);
  
  const { player, entities, particles, obstacles, powerUps, hazards, projectiles } = state;

  // --- PLAYER UPDATE ---
  if (state.status === GameStatus.PLAYING) {
      // Mouse Direction
      // Translate mouse screen pos to world pos relative to player
      const cx = screenWidth / 2;
      const cy = screenHeight / 2;
      const dx = mouse.x - cx;
      const dy = mouse.y - cy;
      
      let targetAngle = Math.atan2(dy, dx);
      if (player.isAutoMode) {
          // AUTO MODE AI
          updateStrategyState(player);
          const aiResult = calculateAIMovement(player, entities, player, hazards, obstacles, true);
          targetAngle = aiResult.desiredAngle;
      }

      // Turn Speed
      let agility = Math.max(0.02, GAME_MECHANICS.BASE_TURN_SPEED - (player.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY));
      // Boost improves turning slightly? No, usually makes it harder, but for game feel let's keep it constant or slight nerf
      
      let angleDiff = targetAngle - player.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      player.angle += angleDiff * agility;

      // Speed & Boost
      let speedMult = player.stats.speedMult;
      
      // Boost Logic
      const canBoost = player.boost.current > 0;
      if (isSpacePressed && canBoost) {
          player.boost.active = true;
          player.boost.current -= BOOST_CONFIG.DRAIN_RATE;
          speedMult *= BOOST_CONFIG.SPEED_MULTIPLIER;
          
          // Overdrive (Burn Weight for Speed if empty energy)
          if (player.boost.current <= 0 && player.weight > BOOST_CONFIG.OVERDRIVE_MIN_WEIGHT) {
               player.isOverdrive = true;
               player.weight -= BOOST_CONFIG.OVERDRIVE_WEIGHT_COST;
               player.boost.current = 0; // Stay empty
          } else {
               player.isOverdrive = false;
          }
          
          // Boost Particles
          if (Math.random() < 0.5) {
              const pAngle = player.angle + Math.PI + (Math.random()-0.5)*0.5;
              state.particles.push({
                  ...createParticle(player.x, player.y, '#fef08a'), // Yellow bubbles
                  vx: Math.cos(pAngle) * 5,
                  vy: Math.sin(pAngle) * 5,
                  life: 0.5
              });
          }
      } else {
          player.boost.active = false;
          player.isOverdrive = false;
          if (player.boost.current < player.boost.max) {
              player.boost.current += BOOST_CONFIG.REGEN_RATE;
          }
      }
      
      // Speed Items
      if (player.speedBoostTimer && player.speedBoostTimer > 0) {
          speedMult *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
          player.speedBoostTimer--;
      }
      
      // Movement
      const moveSpeed = player.speed * speedMult;
      player.vx = Math.cos(player.angle) * moveSpeed;
      player.vy = Math.sin(player.angle) * moveSpeed;
      
      player.x += player.vx;
      player.y += player.vy;
      
      // World Bounds (Bounce)
      if (player.x < 0) { player.x = 0; player.angle = Math.PI - player.angle; }
      if (player.x > WORLD_SIZE) { player.x = WORLD_SIZE; player.angle = Math.PI - player.angle; }
      if (player.y < 0) { player.y = 0; player.angle = -player.angle; }
      if (player.y > WORLD_SIZE) { player.y = WORLD_SIZE; player.angle = -player.angle; }
      
      // Timers
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
      
      // Torpedo Ability (Click)
      if (isMouseDown && player.torpedoCount > 0 && player.torpedoCooldown <= 0) {
           player.torpedoCount--;
           player.torpedoCooldown = GAME_MECHANICS.TORPEDO_COOLDOWN;
           
           // Fire Projectile
           state.projectiles.push({
               id: uuid(),
               x: player.x + Math.cos(player.angle) * (player.radius + 10),
               y: player.y + Math.sin(player.angle) * (player.radius + 10),
               vx: Math.cos(player.angle) * GAME_MECHANICS.TORPEDO_SPEED,
               vy: Math.sin(player.angle) * GAME_MECHANICS.TORPEDO_SPEED,
               radius: 8,
               damage: GAME_MECHANICS.TORPEDO_DAMAGE,
               life: 120, // 2 seconds
               angle: player.angle,
               targetId: null // Dumb fire for now
           });
      }
      
      // Evolution Check
      const nextType = getNextEvolution(player.type, player.eatenHistory, player.radius);
      if (nextType !== player.type) {
           // Evolve!
           const oldHealthRatio = player.health / player.maxHealth;
           const newConfig = CREATURES[nextType];
           
           player.type = nextType;
           player.config = newConfig;
           player.maxHealth = newConfig.health * player.stats.sizeMult; // Apply stats if any
           player.health = player.maxHealth * oldHealthRatio;
           // Don't reset radius, let it grow naturally or clamp it?
           // Actually radius drives evolution, so it stays.
           
           player.evolutionVisualTimer = 180; // 3 seconds visual
           player.speechBubble = { text: "进化!", timer: 120, color: '#d8b4fe' };
           
           // Particles
           for(let i=0; i<30; i++) {
               state.particles.push(createParticle(player.x, player.y, '#d8b4fe'));
           }
      }

      // Hiding
      checkHiding(player, obstacles);
  }

  // --- ENTITIES UPDATE ---
  state.entities.forEach(ent => {
     updateAI(ent, state);
     
     // Bounds
     if (ent.x < -100 || ent.x > WORLD_SIZE + 100 || ent.y < -100 || ent.y > WORLD_SIZE + 100) {
         ent.health = 0; // Despawn
     }
  });
  
  // Cleanup dead entities
  // Don't remove player here, handled separately
  state.entities = state.entities.filter(e => e.health > 0);

  // --- PROJECTILES ---
  state.projectiles = state.projectiles.filter(p => p.life > 0);
  state.projectiles.forEach(p => {
      p.life--;
      p.x += p.vx;
      p.y += p.vy;
      
      // Trail
      if (Math.random() < 0.5) {
          state.particles.push({
             ...createParticle(p.x, p.y, '#f87171'),
             size: 2,
             life: 0.3
          });
      }
      
      // Collision with Entities
      for (const ent of state.entities) {
          if (dist(p, ent) < ent.radius + p.radius) {
              ent.health -= p.damage;
              p.life = 0;
              // Explosion
              for(let i=0; i<5; i++) state.particles.push(createParticle(p.x, p.y, '#ef4444'));
              ent.aggroTimer = 120; // Aggro if survived
              ent.targetId = 'player';
              break;
          }
      }
  });

  // --- PARTICLES ---
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      
      // Interaction (Shrink Water)
      if (p.interactionType === 'SHRINK') {
          if (dist(p, player) < player.radius) {
              player.radius *= 0.999; // Shrink slightly
              if (player.radius < 10) player.radius = 10;
          }
      }
  });
  
  // --- HAZARDS & PORTALS ---
  updateHazards(state, state.particles);
  updatePortals(state, state.particles);
  
  // --- COLLISIONS ---
  if (state.status === GameStatus.PLAYING) {
      // 1. Entity vs Entity
      // Optimization: Spatial grid would be better but N=400 is small enough for brute force checks mostly or simple nested loop
      // We'll just do checking against nearby?
      // For now, simple loop
      for (let i = 0; i < state.entities.length; i++) {
          const e1 = state.entities[i];
          
          // Check vs Player
          if (dist(e1, player) < e1.radius + player.radius) {
              processCollision(e1, player, state.particles, state);
              processCollision(player, e1, state.particles, state);
          }
          
          // Check vs Other Entities (limit checks for performance? e.g. only if close in array sorted by X? No, array is unsorted)
          // Let's just check against a few or use the AI nearby scan? 
          // Actually, `processCollision` is usually called when they overlap.
          // Let's iterate all pairs? 400^2 is 160,000. A bit heavy for JS single thread 60fps?
          // Maybe only check if distance < sum of max radius?
          // Let's stick to checking within the AI loop or just here.
          // To optimize: Only check if they are close.
          
          for (let j = i + 1; j < state.entities.length; j++) {
              const e2 = state.entities[j];
              const d = dist(e1, e2);
              if (d < e1.radius + e2.radius) {
                  processCollision(e1, e2, state.particles, state);
                  processCollision(e2, e1, state.particles, state);
              }
          }
      }
      
      // 2. Player vs PowerUps
      state.powerUps = state.powerUps.filter(p => {
          if (dist(player, p) < player.radius + p.radius) {
              // Collect
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
              return false; // Remove
          }
          return true;
      });
      
      // Check Player Death
      if (player.health <= 0) {
           // Try Emergency Squad Switch
           const switched = emergencySquadSwitch(state);
           if (!switched) {
               state.status = GameStatus.GAME_OVER;
           }
      }
  }

  // --- CAMERA UPDATE ---
  // Smooth follow player
  const targetCamX = player.x - (screenWidth / 2) / state.camera.zoom;
  const targetCamY = player.y - (screenHeight / 2) / state.camera.zoom;
  
  state.camera.x += (targetCamX - state.camera.x) * 0.1;
  state.camera.y += (targetCamY - state.camera.y) * 0.1;
  
  // Dynamic Zoom based on player size
  const targetZoom = Math.max(0.3, 0.8 - (player.radius / 500));
  state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;

  return state;
};