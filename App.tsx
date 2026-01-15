import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, PlayerState, CreatureType } from './types';
import { INITIAL_PLAYER_STATS, WORLD_SIZE, CREATURES, BOOST_CONFIG } from './constants';
import { updateGame, createEntity, createObstacles } from './gameEngine';

// Initial state factory
const createInitialState = (options: { isPremium?: boolean } = {}): GameState => {
  const isPremium = options.isPremium || false;
  
  // Default Start
  let startType = CreatureType.ALGAE_FISH;
  let startLevel = 1;
  let startRadius = INITIAL_PLAYER_STATS.radius;
  let startHealth = INITIAL_PLAYER_STATS.health;
  let startXp = 0;
  
  // Premium Start (Ad Revive)
  if (isPremium) {
    startType = CreatureType.SWORD_FISH;
    startLevel = 10;
    startRadius = CREATURES[CreatureType.SWORD_FISH].baseRadius * 1.5; // Bigger start
    startHealth = 300;
    startXp = 2500; // Boosted XP
  }

  const baseConfig = CREATURES[startType];

  return {
    status: GameStatus.MENU,
    player: {
      id: 'player',
      type: startType,
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      vx: 0,
      vy: 0,
      radius: startRadius,
      angle: 0,
      health: startHealth,
      maxHealth: startHealth,
      speed: baseConfig.speed * (isPremium ? 1.2 : 1),
      config: baseConfig,
      xp: startXp,
      level: startLevel,
      evolutionPoints: isPremium ? 5 : 0, // Free points
      traits: isPremium ? ['复仇者'] : [],
      stats: {
        speedMult: 1,
        sizeMult: 1,
        defenseMult: 1,
        visionRadius: 1
      },
      eatenHistory: {} as Record<CreatureType, number>,
      mouthOpenValue: 0,
      animOffset: 0,
      boost: {
        current: BOOST_CONFIG.MAX_ENERGY,
        max: BOOST_CONFIG.MAX_ENERGY,
        active: false
      },
      isGodMode: false
    },
    entities: [],
    particles: [],
    obstacles: createObstacles(),
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    camera: { x: 0, y: 0, zoom: 1 },
    score: isPremium ? 1000 : 0,
    genePoints: 0,
    time: 0
  };
};

const App: React.FC = () => {
  const gameStateRef = useRef<GameState>(createInitialState());
  const [uiState, setUiState] = useState<GameState>(gameStateRef.current);
  
  const mouseRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<{ space: boolean }>({ space: false });
  const frameIdRef = useRef<number>(0);

  // Sync state for UI updates (throttled)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = gameStateRef.current;
      setUiState({ ...currentState });
    }, 100); 
    return () => clearInterval(interval);
  }, []);

  // Keyboard Listeners for Boost
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') keysRef.current.space = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') keysRef.current.space = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spawnInitialEntities = (state: GameState) => {
    // Initial Spawn - Massive swarm of food (400 entities - Doubled from 200)
    for(let i=0; i<400; i++) {
        const x = Math.random() * WORLD_SIZE;
        const y = Math.random() * WORLD_SIZE;
        state.entities.push(
            createEntity(Math.random() > 0.5 ? CreatureType.PLANKTON : CreatureType.ALGAE_FISH, x, y)
        );
    }
  };

  const startGame = () => {
    gameStateRef.current = createInitialState();
    spawnInitialEntities(gameStateRef.current);
    gameStateRef.current.status = GameStatus.PLAYING;
  };

  const handleRevive = (useAd: boolean) => {
    gameStateRef.current = createInitialState({ isPremium: useAd });
    spawnInitialEntities(gameStateRef.current);
    gameStateRef.current.status = GameStatus.PLAYING;
  };

  const handleMouseMove = (x: number, y: number) => {
    mouseRef.current = { x, y };
  };

  const handleEvolve = (trait: string, statBonus: Partial<PlayerState['stats']>) => {
    const state = gameStateRef.current;
    state.player.traits.push(trait);
    
    if (statBonus.speedMult) state.player.stats.speedMult += (statBonus.speedMult - 1);
    if (statBonus.sizeMult) state.player.stats.sizeMult += (statBonus.sizeMult - 1);
    if (statBonus.defenseMult) state.player.stats.defenseMult += (statBonus.defenseMult - 1);
    if (statBonus.visionRadius) state.player.stats.visionRadius += (statBonus.visionRadius - 1);
    
    state.status = GameStatus.PLAYING;
  };

  const handleToggleGodMode = () => {
    const p = gameStateRef.current.player;
    if (!p.isGodMode) {
      // Activate God Mode
      p.isGodMode = true;
      p.type = CreatureType.LEVIATHAN;
      p.config = CREATURES[CreatureType.LEVIATHAN];
      p.radius = 160;
      p.maxHealth = 99999;
      p.health = 99999;
      p.speed = 5; // Good cruising speed
      p.stats.sizeMult = 2.0;
      p.level = 99;
      p.traits.push("神");
    }
  };

  const gameLoop = useCallback(() => {
    if (gameStateRef.current.status === GameStatus.PLAYING) {
      gameStateRef.current = updateGame(
        gameStateRef.current,
        mouseRef.current,
        keysRef.current.space, // Pass boost intent
        window.innerWidth,
        window.innerHeight
      );
      gameStateRef.current.score += 0.05; 
    }
    frameIdRef.current = requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    frameIdRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [gameLoop]);

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-900 relative select-none">
      <GameCanvas 
        gameState={gameStateRef.current} 
        onMouseMove={handleMouseMove} 
      />
      
      <UIOverlay 
        gameState={uiState} 
        onStart={startGame}
        onEvolve={handleEvolve}
        onRestart={startGame}
        onRevive={handleRevive}
        onToggleGodMode={handleToggleGodMode}
      />
    </div>
  );
};

export default App;