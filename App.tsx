
import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, PlayerState, CreatureType, BiomeType, Cosmetics } from './types';
import { INITIAL_PLAYER_STATS, WORLD_SIZE, CREATURES, BOOST_CONFIG, PROTECTION_CONFIG } from './constants';
import { updateGame, createEntity, createObstacles, manualSquadSwitch, digestBasket, createBuildings, createPortals } from './gameEngine';

const createInitialState = (options: { isPremium?: boolean, startType?: CreatureType, cosmetics?: Cosmetics } = {}): GameState => {
  const isPremium = options.isPremium || false;
  
  let startType = options.startType;
  if (!startType) {
      const starters = [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.TURTLE];
      startType = starters[Math.floor(Math.random() * starters.length)];
  }

  const baseConfig = CREATURES[startType];
  const startX = WORLD_SIZE / 2;
  const startY = WORLD_SIZE / 2;

  return {
    status: GameStatus.MENU,
    player: {
      id: 'player',
      type: startType,
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      radius: baseConfig.baseRadius,
      angle: 0,
      health: baseConfig.health,
      maxHealth: baseConfig.health,
      speed: baseConfig.speed * 1.2,
      config: baseConfig,
      weight: 5,
      evolutionPoints: 0, 
      traits: isPremium ? ['复仇者'] : [],
      stats: {
        speedMult: 1,
        sizeMult: 1,
        defenseMult: 1,
        visionRadius: 1
      },
      eatenHistory: {} as Record<CreatureType, number>,
      basket: [], 
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
      ambushTimer: 0,
      shieldTimer: 0,
      invulnerableTimer: 0, 
      evolutionVisualTimer: 0, 
      torpedoCount: 0,
      torpedoCooldown: 0,
      isOverdrive: false,
      currentBiome: BiomeType.SHALLOWS,
      biomeDebuffTimer: 0,
      cosmetics: options.cosmetics || {
          teeth: 'NORMAL',
          skinColor: 'DEFAULT',
          pattern: 'NONE',
          scaleType: 'NONE',
          accessory: 'NONE',
          tailType: 'DEFAULT',
          bodyType: 'DEFAULT',
          eyeType: 'NORMAL',
          eyebrowType: 'NONE', // New Default
          trailType: 'NONE'    // New Default
      }
    },
    entities: [],
    particles: [],
    obstacles: createObstacles(),
    powerUps: [],
    hazards: [],
    projectiles: [],
    portals: createPortals(),
    buildings: createBuildings(), 
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    camera: { x: startX, y: startY, zoom: 0.8 }, 
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
  
  useEffect(() => {
    const interval = setInterval(() => {
      setUiState({ ...gameStateRef.current });
    }, 100); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') keysRef.current.space = true; };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') keysRef.current.space = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = (selectedType?: CreatureType) => {
    // Preserve cosmetics from Shop/Menu
    const currentCosmetics = gameStateRef.current.player.cosmetics;
    const newState = createInitialState({ startType: selectedType, cosmetics: currentCosmetics });
    
    newState.status = GameStatus.PLAYING;
    newState.player.invulnerableTimer = PROTECTION_CONFIG.NEWBIE_DURATION;
    newState.player.isInvulnerable = true;
    gameStateRef.current = newState;
  };

  const handleRevive = (useAd: boolean) => {
    if (useAd) {
      const p = gameStateRef.current.player;
      gameStateRef.current.status = GameStatus.PLAYING;
      p.health = p.maxHealth;
      p.invulnerableTimer = PROTECTION_CONFIG.REVIVE_DURATION;
      p.isInvulnerable = true;
    } else {
      // Restart completely, but maybe keep cosmetics? 
      // User might want to keep cosmetics, let's keep them.
      const currentCosmetics = gameStateRef.current.player.cosmetics;
      gameStateRef.current = createInitialState({ cosmetics: currentCosmetics }); 
    }
  };

  const gameLoop = useCallback(() => {
    // If we are in SHOP, we still update game loop for background animations if we want, 
    // or we can pause. Let's pause logic but keep rendering? 
    // Actually `updateGame` handles status checks.
    
    gameStateRef.current = updateGame(
      gameStateRef.current,
      mouseRef.current,
      keysRef.current.space, 
      isMouseDownRef.current, 
      window.innerWidth,
      window.innerHeight
    );
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
        onMouseMove={(x, y) => { mouseRef.current = { x, y }; }} 
        onMouseDown={() => { isMouseDownRef.current = true; }}
        onMouseUp={() => { isMouseDownRef.current = false; }}
      />
      <UIOverlay 
        gameState={uiState} 
        onStart={startGame}
        onEvolve={() => {}}
        onRestart={() => { 
            const currentCosmetics = gameStateRef.current.player.cosmetics;
            gameStateRef.current = createInitialState({ cosmetics: currentCosmetics }); 
        }}
        onRevive={handleRevive}
        onToggleGodMode={() => {
            const p = gameStateRef.current.player;
            p.isGodMode = !p.isGodMode;
            if (p.isGodMode) p.health = 99999;
        }}
        onToggleAutoMode={() => { gameStateRef.current.player.isAutoMode = !gameStateRef.current.player.isAutoMode; }}
        onSwitchSquad={() => { manualSquadSwitch(gameStateRef.current); }}
        onDigest={() => { digestBasket(gameStateRef.current); }}
        onUpdateCosmetics={(newCosmetics) => {
            gameStateRef.current.player.cosmetics = newCosmetics;
        }}
        setGameStatus={(s) => { gameStateRef.current.status = s; }}
      />
    </div>
  );
};

export default App;
