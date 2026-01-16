import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, PlayerState, CreatureType } from './types';
import { INITIAL_PLAYER_STATS, WORLD_SIZE, CREATURES, BOOST_CONFIG } from './constants';
import { updateGame, createEntity, createObstacles } from './gameEngine';

// Initial state factory
const createInitialState = (options: { isPremium?: boolean, startType?: CreatureType } = {}): GameState => {
  const isPremium = options.isPremium || false;
  
  // Default Start
  let startType = options.startType || CreatureType.CLOWN_FISH;
  let startRadius = CREATURES[startType].baseRadius;
  let startHealth = CREATURES[startType].health;
  let startWeight = 5;
  
  // Premium Start (Ad Revive / Debug)
  if (isPremium) {
    startType = CreatureType.SWORD_FISH;
    startRadius = CREATURES[CreatureType.SWORD_FISH].baseRadius * 1.5; 
    startHealth = 300;
    startWeight = 500; 
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
      // Player gets slight speed advantage
      speed: baseConfig.speed * 1.2,
      config: baseConfig,
      weight: startWeight,
      evolutionPoints: 0, 
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
      renderScale: 1.0,
      isInvulnerable: false,
      boost: {
        current: BOOST_CONFIG.MAX_ENERGY,
        max: BOOST_CONFIG.MAX_ENERGY,
        active: false
      },
      isGodMode: false,
      isAutoMode: false,
      reviveCount: 0,
      isIdle: false,
      lureActive: false,
      camoActive: false,
      ambushTimer: 0
    },
    entities: [],
    particles: [],
    obstacles: createObstacles(),
    powerUps: [],
    hazards: [],
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    camera: { x: 0, y: 0, zoom: 1 },
    score: 0,
    genePoints: 0,
    time: 0
  };
};

const App: React.FC = () => {
  const gameStateRef = useRef<GameState>(createInitialState());
  const [uiState, setUiState] = useState<GameState>(gameStateRef.current);
  
  const mouseRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<{ space: boolean }>({ space: false });
  const isMouseDownRef = useRef(false);
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
    // Initial Spawn - Reduced count
    for(let i=0; i<100; i++) {
        const x = Math.random() * WORLD_SIZE;
        const y = Math.random() * WORLD_SIZE;
        state.entities.push(
            createEntity(Math.random() > 0.5 ? CreatureType.PLANKTON : CreatureType.CLOWN_FISH, x, y)
        );
    }
  };

  const startGame = (selectedType?: CreatureType) => {
    gameStateRef.current = createInitialState({ startType: selectedType });
    spawnInitialEntities(gameStateRef.current);
    gameStateRef.current.status = GameStatus.PLAYING;
  };

  const handleRevive = (useAd: boolean) => {
    if (useAd) {
      const deadPlayer = gameStateRef.current.player;
      gameStateRef.current.status = GameStatus.PLAYING;
      gameStateRef.current.player.health = deadPlayer.maxHealth;
      gameStateRef.current.player.x = Math.random() * WORLD_SIZE; 
      gameStateRef.current.player.y = Math.random() * WORLD_SIZE;
      gameStateRef.current.player.isInvulnerable = true;
      gameStateRef.current.player.boost.current = gameStateRef.current.player.boost.max;
      gameStateRef.current.player.reviveCount = (gameStateRef.current.player.reviveCount || 0) + 1;
      
      setTimeout(() => {
         gameStateRef.current.player.isInvulnerable = false;
      }, 3000);
      
    } else {
      gameStateRef.current = createInitialState(); // Reset to default menu logic if declining ad
      // But actually we want to return to menu or just restart with default?
      // Simple restart logic:
      gameStateRef.current.status = GameStatus.MENU;
    }
  };

  const handleMouseMove = (x: number, y: number) => {
    mouseRef.current = { x, y };
  };

  const handleMouseDown = () => { isMouseDownRef.current = true; };
  const handleMouseUp = () => { isMouseDownRef.current = false; };

  const handleEvolve = (trait: string, statBonus: Partial<PlayerState['stats']>) => {
    const state = gameStateRef.current;
    state.player.traits.push(trait);
    state.status = GameStatus.PLAYING;
  };

  const handleToggleGodMode = () => {
    const p = gameStateRef.current.player;
    if (!p.isGodMode) {
      p.isGodMode = true;
      p.type = CreatureType.KRAKEN;
      p.config = CREATURES[CreatureType.KRAKEN];
      p.radius = 180;
      p.maxHealth = 99999;
      p.health = 99999;
      p.speed = 5; 
      p.weight = 9999;
      p.stats.sizeMult = 2.0;
      p.traits.push("深海之神");
    }
  };
  
  const handleToggleAutoMode = () => {
      gameStateRef.current.player.isAutoMode = !gameStateRef.current.player.isAutoMode;
  };

  const gameLoop = useCallback(() => {
    if (gameStateRef.current.status === GameStatus.PLAYING) {
      gameStateRef.current = updateGame(
        gameStateRef.current,
        mouseRef.current,
        keysRef.current.space, // Boost
        isMouseDownRef.current, // Taunt
        window.innerWidth,
        window.innerHeight
      );
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
      
      <UIOverlay 
        gameState={uiState} 
        onStart={startGame}
        onEvolve={handleEvolve}
        onRestart={() => { gameStateRef.current.status = GameStatus.MENU; }}
        onRevive={handleRevive}
        onToggleGodMode={handleToggleGodMode}
        onToggleAutoMode={handleToggleAutoMode}
      />
    </div>
  );
};

export default App;