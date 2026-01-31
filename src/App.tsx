
import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, CreatureType, BiomeType, Cosmetics } from './types';
import { WORLD_SIZE, CREATURES, BOOST_CONFIG, PROTECTION_CONFIG } from './constants';
import { updateGame, createObstacles, createBuildings, createPortals, manualSquadSwitch, digestBasket } from './gameEngine';

const createInitialState = (options: { isPremium?: boolean, startType?: CreatureType, cosmetics?: Cosmetics } = {}): GameState => {
  let startType = options.startType || CreatureType.CLOWN_FISH;
  const baseConfig = CREATURES[startType];
  const startX = WORLD_SIZE / 2;
  const startY = WORLD_SIZE / 2;

  return {
    status: GameStatus.MENU,
    player: {
      id: 'player', type: startType, x: startX, y: startY, vx: 0, vy: 0,
      radius: baseConfig.baseRadius, angle: 0, health: baseConfig.health, maxHealth: baseConfig.health,
      speed: baseConfig.speed * 1.2, config: baseConfig, weight: 5, evolutionPoints: 0,
      traits: options.isPremium ? ['复仇者'] : [],
      stats: { speedMult: 1, sizeMult: 1, defenseMult: 1, visionRadius: 1 },
      eatenHistory: {} as Record<CreatureType, number>,
      basket: [], mouthOpenValue: 0, animOffset: 0, renderScale: 1.0, isInvulnerable: false,
      boost: { current: BOOST_CONFIG.MAX_ENERGY, max: BOOST_CONFIG.MAX_ENERGY, active: false },
      isGodMode: false, isAutoMode: false, reviveCount: 0, isIdle: false, lureActive: false,
      camoActive: false, ambushTimer: 0, shieldTimer: 0, invulnerableTimer: 0, evolutionVisualTimer: 0,
      torpedoCount: 0, torpedoCooldown: 0, isOverdrive: false, currentBiome: BiomeType.SHALLOWS,
      biomeDebuffTimer: 0,
      cosmetics: options.cosmetics || {
          teeth: 'NORMAL', skinColor: 'DEFAULT', pattern: 'NONE', scaleType: 'NONE', accessory: 'NONE',
          tailType: 'DEFAULT', bodyType: 'DEFAULT', eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE'    
      }
    },
    entities: [], particles: [], obstacles: createObstacles(), powerUps: [], hazards: [], projectiles: [],
    portals: createPortals(), buildings: createBuildings(), treasures: [], labels: [],
    worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, camera: { x: startX, y: startY, zoom: 0.8 },
    score: 0, genePoints: 0, time: 0
  };
};

const App: React.FC = () => {
  const gameStateRef = useRef<GameState>(createInitialState());
  const [uiState, setUiState] = useState<GameState>(gameStateRef.current);
  const mouseRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef({ space: false });
  const isMouseDownRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setUiState({ ...gameStateRef.current }), 100);
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

  const gameLoop = useCallback(() => {
    gameStateRef.current = updateGame(
      gameStateRef.current, mouseRef.current, keysRef.current.space, 
      isMouseDownRef.current, window.innerWidth, window.innerHeight
    );
    requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(id);
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
        onStart={(type) => {
            const currentCos = gameStateRef.current.player.cosmetics;
            gameStateRef.current = createInitialState({ startType: type, cosmetics: currentCos });
            gameStateRef.current.status = GameStatus.PLAYING;
            gameStateRef.current.player.invulnerableTimer = PROTECTION_CONFIG.NEWBIE_DURATION;
        }}
        onRestart={() => { gameStateRef.current = createInitialState(); }}
        onRevive={(ad) => {
            if (ad) {
                gameStateRef.current.player.health = gameStateRef.current.player.maxHealth;
                gameStateRef.current.status = GameStatus.PLAYING;
            } else {
                gameStateRef.current = createInitialState();
            }
        }}
        onToggleGodMode={() => { gameStateRef.current.player.isGodMode = !gameStateRef.current.player.isGodMode; }}
        onToggleAutoMode={() => { gameStateRef.current.player.isAutoMode = !gameStateRef.current.player.isAutoMode; }}
        onSwitchSquad={() => { manualSquadSwitch(gameStateRef.current); }}
        onDigest={() => { digestBasket(gameStateRef.current); }}
        onUpdateCosmetics={(cos) => { gameStateRef.current.player.cosmetics = cos; }}
        setGameStatus={(s) => { gameStateRef.current.status = s; }}
        onEvolve={() => {}}
      />
    </div>
  );
};

export default App;
