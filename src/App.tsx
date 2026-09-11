
import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, CreatureType } from './types';
import { CREATURES, MAP_SHAPE_CONFIG, PROTECTION_CONFIG } from './constants';
import { updateGame, manualSquadSwitch, createEntity, getSquadMembers } from './gameEngine';
import { createInitialState } from './factories/initialState';
import { subscribeAudio, initAudio, toggleMute, isMuted } from './audio';
import { subscribeAchievements } from './systems/achievements';

// 音效只订阅一次：逻辑层发事件，音频层负责发声，两边互不知情（P1-4）
subscribeAudio();
// 成就统计同样只订阅一次：逻辑层发事件，成就层负责计数，两边互不知情（待办③）
subscribeAchievements();

const App: React.FC = () => {
  const gameStateRef = useRef<GameState>(createInitialState());
  const [uiState, setUiState] = useState<GameState>(gameStateRef.current);
  const [muted, setMuted] = useState<boolean>(isMuted());
  // 鼠标初始值取屏幕中心：避免默认 (0,0) 让鱼一开局就自动朝左上角游，
  // 正好撞进出生点旁的深海商场，3 秒就弹出换装面板把世界暂停（"被隔离在外面"的元凶）
  const mouseRef = useRef({ x: window.innerWidth / 2 + 1, y: window.innerHeight / 2 });
  const keysRef = useRef({ space: false, q: false, e: false });
  const isMouseDownRef = useRef(false);
  const isRightMouseDownRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setUiState({ ...gameStateRef.current }), 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Space = 加速，Q = 流派技能（P1-3），E = 交互确认（进商场），G = 无敌模式（调试用）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') keysRef.current.space = true;
      if (e.code === 'KeyQ') keysRef.current.q = true;
      if (e.code === 'KeyE') keysRef.current.e = true;
      if (e.code === 'KeyR') {
        // 切换战队成员（提示词 #234）：一次性动作，走事件不走轮询，
        // 按一次切一次，squad 系统内部有 30 帧冷却防连点
        manualSquadSwitch(gameStateRef.current);
      }
      if (e.code === 'KeyG') {
        const p = gameStateRef.current.player;
        p.isGodMode = !p.isGodMode;
        p.speechBubble = {
          text: p.isGodMode ? '无敌模式 开' : '无敌模式 关',
          timer: 60,
          color: p.isGodMode ? '#facc15' : '#94a3b8',
        };
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') keysRef.current.space = false;
      if (e.code === 'KeyQ') keysRef.current.q = false;
      if (e.code === 'KeyE') keysRef.current.e = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    // ⚠️ 生命标记写法：loop 每帧会自己再排下一帧，cleanup 拿不到新 id，
    //    传统 cancelAnimationFrame 只能取消第一帧 —— HMR / 重挂载一次就泄漏一条循环，
    //    多条链并行 = updateGame 每帧跑 N 次，鱼会离奇加速。
    // ⚠️ 固定步长累加器：游戏逻辑按 60fps 设计（每帧 dt=1），
    //    高刷屏（144Hz）直接每帧跑一步会整体 2.4 倍速，这里按真实时间补偿。
    const STEP_MS = 1000 / 60;
    let alive = true;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      if (!alive) return;
      // 后台切回来一次性补最多 250ms，防止追帧雪崩
      acc += Math.min(now - last, 250);
      last = now;
      while (acc >= STEP_MS) {
        gameStateRef.current = updateGame(
          gameStateRef.current, mouseRef.current, keysRef.current.space,
          isMouseDownRef.current, isRightMouseDownRef.current,
          window.innerWidth, window.innerHeight, keysRef.current.q,
          keysRef.current.e
        );
        acc -= STEP_MS;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { alive = false; };
  }, []);

  // 开发期调试钩子：e2e 探针（scripts/probe-*.mjs）用它直接读真实 gameState。
  // 比解析 HUD 文本可靠得多 —— HUD 每 100ms 才从 gameStateRef 同步一次，
  // 按键后立刻读会拿到上一帧的旧快照（踩过这个坑）。生产构建里 DEV 为 false，整块被摇掉。
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__FISH_DEBUG__ = {
      state: () => gameStateRef.current,
      squad: () => ({
        members: getSquadMembers(gameStateRef.current).map((e) => ({
          id: e.id,
          type: e.type,
          radius: e.radius,
          x: Math.round(e.x),
          y: Math.round(e.y),
        })),
        pending: gameStateRef.current.squad.pending.length,
        recruitedTotal: gameStateRef.current.squad.recruitedTotal,
        possessCount: gameStateRef.current.squad.possessCount,
        cooldown: gameStateRef.current.squad.switchCooldown,
      }),
      player: () => {
        const p = gameStateRef.current.player;
        return {
          type: p.type,
          name: p.config.name,
          radius: Math.round(p.radius),
          level: p.level,
          health: Math.round(p.health),
          x: Math.round(p.x),
          y: Math.round(p.y),
        };
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__FISH_DEBUG__;
    };
  }, []);

  const startBattleTest = () => {
      const state = createInitialState({ startType: CreatureType.GREAT_WHITE });
      state.status = GameStatus.BATTLE_TEST;
      state.camera.zoom = 0.6;
      
      // 创建一个 AI 对手
      const opponent = createEntity(CreatureType.ORCA, MAP_SHAPE_CONFIG.CENTER_X + 400, MAP_SHAPE_CONFIG.CENTER_Y);
      opponent.cosmetics = {
          ...opponent.cosmetics!,
          teeth: 'SHARP',
          skinColor: '#1e293b',
          mouthType: 'TRIANGLE'
      };
      state.entities = [opponent];
      gameStateRef.current = state;
  };

  return (
    <div 
        className="w-full h-screen overflow-hidden bg-slate-900 relative select-none"
        onContextMenu={(e) => {
            e.preventDefault();
            isRightMouseDownRef.current = true;
        }}
    >
      <GameCanvas 
        gameState={gameStateRef.current} 
        onMouseMove={(x, y) => { mouseRef.current = { x, y }; }} 
        onMouseDown={(e) => { 
            if (e.button === 0) isMouseDownRef.current = true; 
            if (e.button === 2) isRightMouseDownRef.current = true;
        }}
        onMouseUp={(e) => { 
            if (e.button === 0) isMouseDownRef.current = false; 
            if (e.button === 2) isRightMouseDownRef.current = false;
        }}
      />
      <UIOverlay 
        gameState={uiState} 
        onStart={(type, pondId) => {
            // 浏览器要求音频上下文在用户手势里创建/恢复，开始按钮正是最合适的位置
            initAudio();
            const currentCos = gameStateRef.current.player.cosmetics;
            gameStateRef.current = createInitialState({ startType: type, cosmetics: currentCos, pondId });
            gameStateRef.current.status = GameStatus.PLAYING;
            // P0-2 新手保护：开局 8 秒不会被吃（自己可以正常捕食）
            gameStateRef.current.player.invulnerableTimer = PROTECTION_CONFIG.NEWBIE_DURATION;
        }}
        onStartBattleTest={startBattleTest}
        onRestart={() => {
            // 重开保留当前塘：在哪翻的车，就在哪爬起来（「多鱼塘」阶段 1）
            const pondId = gameStateRef.current.pondId;
            gameStateRef.current = createInitialState({ pondId });
        }}
        onEvolve={(type: any) => {
            const player = gameStateRef.current.player;
            const newConfig = CREATURES[type as CreatureType];
            player.type = type as CreatureType;
            player.config = newConfig;
            player.radius = newConfig.baseRadius + (player.level - 1) * 2;
            player.maxHealth = newConfig.health;
            player.health = newConfig.health;
            player.speed = newConfig.speed * 1.2;
            gameStateRef.current.status = GameStatus.PLAYING;
            player.speechBubble = { text: "进化完成！", timer: 60, color: '#bef264' };
        }}
        onUpdateCosmetics={(cos) => { gameStateRef.current.player.cosmetics = cos; }}
        onRevive={() => {
            // P0-3 复活：满血、回出生点、带 5 秒保护，避免落地即被守尸
            const p = gameStateRef.current.player;
            p.health = p.maxHealth;
            p.x = MAP_SHAPE_CONFIG.CENTER_X;
            p.y = MAP_SHAPE_CONFIG.CENTER_Y;
            p.vx = 0;
            p.vy = 0;
            p.invulnerableTimer = PROTECTION_CONFIG.REVIVE_DURATION;
            p.reviveCount += 1;
            p.semiGhostTimer = 0;
            p.poisonTimer = 0;
            p.angerTimer = 0;
            gameStateRef.current.status = GameStatus.PLAYING;
            p.speechBubble = { text: '复活成功！', timer: 90, color: '#22d3ee' };
        }}
        setGameStatus={(s) => { gameStateRef.current.status = s; }}
        onSwitchSquad={() => { manualSquadSwitch(gameStateRef.current); }}
        muted={muted}
        onToggleMute={() => { initAudio(); setMuted(toggleMute()); }}
      />
    </div>
  );
};

export default App;
