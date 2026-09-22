
import React, { useState, useEffect, useRef } from 'react';
import RendererSurface from './rendering/RendererSurface';
import UIOverlay from './components/UIOverlay';
import { GameState, GameStatus, CreatureType, DEFAULT_COSMETICS } from './types';
import { CREATURES, CREATURE_DATA, MAP_SHAPE_CONFIG, PROTECTION_CONFIG, SQUAD_COMMAND_LIST } from './constants';
import { applyEvolutionChoice } from './systems/progression';
import { updateGame, queueSquadAction, createEntity, getSquadMembers, peekNextSwitchTarget } from './gameEngine';
import { screenToWorld } from './core/math';
// 性能剖析挂钩：只有 DEV 下的 __FISH_DEBUG__.profile() 会用到（见文件末尾的调试钩子）
import { setProfileSink } from './systems';
import { createInitialState } from './factories/initialState';
import { markRunPractice } from './systems/runFlow';
import { subscribeAudio, initAudio, toggleMute, isMuted } from './audio';
import { subscribeAchievements } from './systems/achievements';
import { selectBrowserRenderer } from './rendering/rendererSelection';
import { createRivalSquads } from './data/rivalSquads';

// 音效只订阅一次：逻辑层发事件，音频层负责发声，两边互不知情（P1-4）
subscribeAudio();
// 成就统计同样只订阅一次：逻辑层发事件，成就层负责计数，两边互不知情（待办③）
subscribeAchievements();

const App: React.FC = () => {
  // URL 优先、localStorage 次之；生产版在 Pixi 正式放行前会安全回退 Canvas。
  const [rendererSelection] = useState(() => selectBrowserRenderer(true));
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

  /**
   * 鼠标屏幕坐标 → 世界坐标（FQ-05 集火选靶用）。
   * 相机变换与 GameCanvas 完全一致，反解收在 `core/math.screenToWorld` 一处。
   */
  const mouseWorld = () =>
    screenToWorld(
      gameStateRef.current.camera,
      mouseRef.current.x,
      mouseRef.current.y,
      window.innerWidth,
      window.innerHeight
    );

  useEffect(() => {
    // Space = 加速，Q = 流派技能（P1-3），E = 交互确认（商场/沉船），G = 无敌模式（调试用）
    // 1/2/3 = 战队指令（集火 / 护卫 / 撤退），R = 附身下一条（FQ-05）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') keysRef.current.space = true;
      if (e.code === 'KeyQ') keysRef.current.q = true;
      if (e.code === 'KeyE') keysRef.current.e = true;

      // 指令与附身都是**离散输入**：这里只入队，由 squadSystem 帧内消费一次（AR-03）。
      // 只在正常游玩中受理 —— 进化 / 结算 / 商场这些遮罩态下世界暂停、队列没人消费，
      // 攒着会在恢复的瞬间一次性全炸出来。
      if (gameStateRef.current.status === GameStatus.PLAYING) {
        const command = SQUAD_COMMAND_LIST.find((c) => c.keyCode === e.code);
        if (command) {
          queueSquadAction(gameStateRef.current, {
            kind: 'COMMAND',
            command: command.id,
            // 只有需要选靶的指令才带鼠标世界坐标；护卫 / 撤退是对自己人下令
            worldMouse: command.needsTarget ? mouseWorld() : undefined,
          });
        }
        if (e.code === 'KeyR') {
          // 提示词 #234：按一次切一次；冷却判定与「没有队员」提示都在系统里（不静默失败）
          queueSquadAction(gameStateRef.current, { kind: 'POSSESS_NEXT' });
        }
      }

      if (e.code === 'KeyG') {
        toggleGodMode();
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
      renderer: () => ({ ...rendererSelection }),
      shapeGallery: () => {
        const state = gameStateRef.current;
        const unique = new Map<string, (typeof CREATURES)[keyof typeof CREATURES]>();
        for (const config of Object.values(CREATURES)) {
          const shape = config.shape ?? 'FISH';
          if (!unique.has(shape)) unique.set(shape, config);
        }
        const configs = [...unique.values()];
        state.entities = configs.map((config, index) => {
          const column = index % 5;
          const row = Math.floor(index / 5);
          const entity = createEntity(
            config.type as CreatureType,
            MAP_SHAPE_CONFIG.CENTER_X - 560 + column * 280,
            MAP_SHAPE_CONFIG.CENTER_Y - 420 + row * 280
          );
          entity.radius = Math.min(62, Math.max(28, entity.radius));
          entity.angle = 0;
          entity.vx = 0;
          entity.vy = 0;
          entity.speed = 0;
          entity.isIdle = true;
          return entity;
        });
        state.player.x = MAP_SHAPE_CONFIG.CENTER_X;
        state.player.y = MAP_SHAPE_CONFIG.CENTER_Y;
        state.player.speed = 0;
        state.player.vx = 0;
        state.player.vy = 0;
        state.camera.x = MAP_SHAPE_CONFIG.CENTER_X;
        state.camera.y = MAP_SHAPE_CONFIG.CENTER_Y;
        state.camera.zoom = 0.68;
        return configs.map(config => ({ name: config.name, shape: config.shape ?? 'FISH' }));
      },
      rareFishGallery: () => {
        const state = gameStateRef.current;
        const cx = MAP_SHAPE_CONFIG.CENTER_X;
        const cy = MAP_SHAPE_CONFIG.CENTER_Y;
        const make = (x: number, rare: boolean) => {
          const entity = createEntity(CreatureType.CLOWN_FISH, x, cy + 80);
          entity.id = rare ? 'rare-starry-clown' : 'rare-normal-clown';
          entity.radius = 70;
          entity.angle = 0;
          entity.vx = 0;
          entity.vy = 0;
          entity.speed = 0;
          entity.isIdle = true;
          entity.semiGhostTimer = 0;
          entity.cosmetics = {
            ...DEFAULT_COSMETICS,
            ...(rare ? { rareVariant: 'STARRY_CLOWN' as const, trailType: 'GLITTER' as const } : {}),
          };
          return entity;
        };
        state.entities = [make(cx - 210, false), make(cx + 210, true)];
        state.player.x = cx;
        state.player.y = cy + 300;
        state.player.speed = 0;
        state.player.vx = 0;
        state.player.vy = 0;
        state.player.semiGhostTimer = 0;
        state.camera.x = cx;
        state.camera.y = cy;
        state.camera.zoom = 0.85;
        return { normal: '小丑鱼', rare: '星夜小丑鱼', spawnChance: 0.04 };
      },
      pixiFeedbackGallery: () => {
        const state = gameStateRef.current;
        const cx = MAP_SHAPE_CONFIG.CENTER_X;
        const cy = MAP_SHAPE_CONFIG.CENTER_Y;
        state.camera.x = cx;
        state.camera.y = cy;
        state.camera.zoom = 0.82;
        state.player.x = cx;
        state.player.y = cy + 330;
        state.player.vx = 0;
        state.player.vy = 0;
        state.player.speed = 0;
        state.player.counterWindup = 300;
        state.feedingEvent = {
          id: 'pixi-feedback-event', phase: 'DROPPING', timer: 900, x: cx, y: cy - 120,
          lastX: cx, lastY: cy - 120, nextDropIn: 60, totalSpawned: 5, claims: {},
          drops: Array.from({ length: 5 }, (_, index) => ({
            id: `pixi-drop-${index}`,
            x: cx - 120 + index * 60,
            y: cy - 120 + Math.sin(index) * 55,
            radius: 12,
            value: 8,
          })),
        };
        state.treasures = [
          { id: 'pixi-warning', x: cx - 470, y: cy - 300, type: 'FEAST', status: 'WARNING', timer: 180, radius: 24 },
          { id: 'pixi-feast', x: cx - 470, y: cy + 20, type: 'FEAST', status: 'ACTIVE', timer: 600, radius: 24 },
          { id: 'pixi-chest', x: cx - 270, y: cy + 20, type: 'CHEST', status: 'ACTIVE', timer: 600, radius: 24 },
          { id: 'pixi-gem', x: cx + 270, y: cy + 20, type: 'GEM', status: 'ACTIVE', timer: 600, radius: 24 },
          { id: 'pixi-food', x: cx + 470, y: cy + 20, type: 'FOOD', status: 'ACTIVE', timer: 600, radius: 24 },
        ];
        state.powerUps = ['COIN', 'SHELL', 'BOTTLE', 'SPEED', 'SHIELD'].map((type, index) => ({
          id: `pixi-power-${index}`,
          x: cx - 320 + index * 160,
          y: cy + 210,
          type: type as 'COIN' | 'SHELL' | 'BOTTLE' | 'SPEED' | 'SHIELD',
          radius: 18,
        }));
        const rivalA = createEntity(CreatureType.BLUE_TANG, cx + 400, cy - 300);
        rivalA.ownerId = 'rival-scavengers';
        rivalA.counterWindup = 300;
        const rivalB = createEntity(CreatureType.SQUID, cx + 540, cy - 220);
        rivalB.ownerId = 'rival-ambushers';
        state.entities = [rivalA, rivalB];
        state.rivalSquads = createRivalSquads();
        for (const squad of state.rivalSquads) {
          squad.memberIds = squad.id === rivalA.ownerId ? [rivalA.id] : squad.id === rivalB.ownerId ? [rivalB.id] : [];
          squad.status = 'CONTESTING';
        }
        return { treasures: state.treasures.length, drops: state.feedingEvent.drops.length, powerUps: state.powerUps.length, rivals: 2, telegraphs: 2 };
      },
      pixiLabelsGallery: () => {
        const state = gameStateRef.current;
        const cx = MAP_SHAPE_CONFIG.CENTER_X;
        const cy = MAP_SHAPE_CONFIG.CENTER_Y;
        const teammate = createEntity(CreatureType.PUFFER_FISH, cx - 330, cy + 250);
        teammate.ownerId = 'player';
        teammate.vx = 0;
        teammate.vy = 0;
        teammate.speed = 0;
        teammate.speechBubble = { text: '我来护卫！', timer: 600, color: '#22d3ee' };
        state.entities.push(teammate);
        state.player.speechBubble = { text: '冲向盛宴！', timer: 600, color: '#facc15' };
        if (state.entities[0]) state.entities[0].speechBubble = { text: '宝藏归我们！', timer: 600, color: '#fb923c' };
        state.particles = Array.from({ length: 10 }, (_, index) => ({
          id: `pixi-particle-${index}`,
          x: cx - 160 + index * 36,
          y: cy + 360 + Math.sin(index) * 35,
          vx: 0,
          vy: 0,
          life: 1,
          maxLife: 1,
          color: index % 2 ? '#67e8f9' : '#f472b6',
          size: 6 + index % 3,
          shape: index % 4 === 0 ? 'COOKIE' as const : undefined,
          spin: index,
        }));
        state.labels = [
          { x: cx - 180, y: cy + 80, text: '逆转！', color: '#facc15', timer: 600, size: 34 },
          { x: cx + 180, y: cy + 80, text: '+100 金币', color: '#fde68a', timer: 600, size: 22 },
        ];
        state.hazards = [{
          id: 'pixi-meteor', x: cx + 430, y: cy + 280, radius: 95,
          type: 'METEOR_STRIKE', timer: 180, duration: 240, stage: 'WARNING', countdown: 3.2,
        }];
        state.buildings = [{
          id: 'pixi-prompt-building', x: cx - 500, y: cy + 280, radius: 70,
          type: 'HOSPITAL', cooldown: 0, prompt: { text: '按 E 使用急救站', color: '#fca5a5' },
        }];
        state.screenFlash = { timer: 6, color: '#38bdf8' };
        return { particles: 10, labels: 2, speechBubbles: 3, squadMarkers: 1, hazards: 1 };
      },
      pixiLodStressScene: (contest = false) => {
        const state = gameStateRef.current;
        const cx = MAP_SHAPE_CONFIG.CENTER_X;
        const cy = MAP_SHAPE_CONFIG.CENTER_Y;
        const configs = Object.values(CREATURES);
        state.player.x = cx;
        state.player.y = cy;
        state.player.vx = 0;
        state.player.vy = 0;
        state.player.speed = 0;
        state.player.invulnerableTimer = 1_000_000;
        state.camera.x = cx;
        state.camera.y = cy;
        state.camera.zoom = 0.22;
        state.entities = Array.from({ length: 299 }, (_, index) => {
          const band = index < 4 ? 0 : index < 19 ? 1 : 2;
          const bandIndex = band === 0 ? index : band === 1 ? index - 4 : index - 19;
          const bandCount = band === 0 ? 4 : band === 1 ? 15 : 280;
          const radius = [620, 1320, 2250][band] + (bandIndex % 5) * 45;
          const angle = (bandIndex / bandCount) * Math.PI * 2 + band * 0.07;
          const config = configs[index % configs.length];
          const entity = createEntity(
            config.type as CreatureType,
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius
          );
          entity.id = `pxr05b-${contest ? 'contest' : 'calm'}-${index}`;
          entity.angle = angle + Math.PI / 2;
          entity.vx = 0;
          entity.vy = 0;
          entity.speed = 0;
          entity.health = 1_000_000;
          entity.invulnerableTimer = 1_000_000;
          entity.isIdle = true;
          if (contest && index < 7) entity.ownerId = index % 2 === 0 ? 'rival-scavengers' : 'rival-ambushers';
          return entity;
        });
        state.rivalSquads = contest ? createRivalSquads() : [];
        for (const squad of state.rivalSquads) {
          squad.memberIds = state.entities.filter(entity => entity.ownerId === squad.id).map(entity => entity.id);
          squad.status = 'CONTESTING';
        }
        if (contest) {
          state.feedingEvent = {
            id: 'pxr05b-contest', phase: 'DROPPING', timer: 100_000, x: cx, y: cy,
            lastX: cx, lastY: cy, nextDropIn: 100_000, totalSpawned: 0, claims: {}, drops: [],
          };
        }
        return { entities: state.entities.length + 1, contest, expectedLod: { lod0: 5, lod1: 15, lod2: 280 } };
      },
      // 物种规格取值器：性能探针用固定物种钉工作负载（见 scripts/probe-perf.mjs buildScene）
      spec: (id: string) => (CREATURE_DATA as Record<string, { radius: number } | undefined>)[id],
      defaultCosmetics: () => ({ ...DEFAULT_COSMETICS }),
      squad: () => {
        const s = gameStateRef.current;
        return {
          members: getSquadMembers(s).map((e) => ({
            id: e.id,
            type: e.type,
            radius: e.radius,
            x: Math.round(e.x),
            y: Math.round(e.y),
          })),
          pending: s.squad.pending.length,
          recruitedTotal: s.squad.recruitedTotal,
          possessCount: s.squad.possessCount,
          cooldown: s.squad.switchCooldown,
          // ── FQ-05 指令状态：e2e 断言读这里而不是 HUD 文本
          //    （HUD 每 100ms 才从 gameStateRef 同步一次，按键后立刻读会拿到旧快照）
          command: s.squad.command ?? null,
          targetId: s.squad.commandTargetId ?? null,
          notice: s.squad.notice ? s.squad.notice.text : null,
          queued: s.squad.pendingActions?.length ?? 0,
          nextSwitchTargetId: peekNextSwitchTarget(s)?.id ?? null,
        };
      },
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
      /**
       * 当前世界规模快照 —— 性能对比的**前置条件**。
       *
       * 「改造后快了 30%」这种话只有在两次运行的 workload 一样时才成立。
       * 实体会自然繁殖 / 死亡，粒子和标签每帧都在回收，所以探针必须在
       * 改造前 / 改造后各拍一次这个快照，数字对不上就说明对比无效。
       */
      counts: () => {
        const s = gameStateRef.current;
        let activeAI = 0;
        for (const e of s.entities) {
          const dx = e.x - s.player.x;
          const dy = e.y - s.player.y;
          if (dx * dx + dy * dy <= 2600 * 2600) activeAI += 1;
        }
        return {
          entities: s.entities.length,
          activeAI,
          obstacles: s.obstacles.length,
          buildings: s.buildings.length,
          portals: s.portals.length,
          fountains: s.fountains.length,
          treasures: s.treasures.length,
          powerUps: s.powerUps.length,
          hazards: s.hazards.length,
          particles: s.particles.length,
          labels: s.labels.length,
          status: s.status,
        };
      },
      /**
       * 「鱼群争霸」对局状态快照（G0/FQ-02）。
       * 探针与 e2e 用它断言阶段时钟与练习标记 —— 读 HUD 文本拿不到这些，
       * 而且 HUD 每 100ms 才同步一次。旧模式返回 null。
       */
      run: () => {
        const r = gameStateRef.current.run;
        return r
          ? {
              mode: r.mode,
              ruleVersion: r.ruleVersion,
              phase: r.phase,
              clock: r.clock,
              practice: r.practice,
              practiceReason: r.practiceReason,
              bossId: r.bossId,
            }
          : null;
      },
      /**
       * 逻辑层性能剖析：同步跑 steps 帧 `updateGame`，把耗时**按系统**拆开返回。
       *
       * 和「量 rAF 帧耗时」是两件事：rAF 帧耗时 = 逻辑 + 渲染 + 浏览器合成，
       * 拆不开就不知道该动哪一边。这个函数只量逻辑那一半，且是同步连跑
       * （不掺渲染、不受刷新率影响），是判断「四叉树到底有没有用」的唯一可信信号。
       *
       * 注意：它会真的推进世界 steps 帧（时间和位置都会往前走），
       * 所以要么接受这个副作用，要么跑完重新摆场景 —— 探针里两者都做了。
       */
      profile: (steps = 60) => {
        const totals: Record<string, number> = {};
        setProfileSink((name, ms) => {
          totals[name] = (totals[name] ?? 0) + ms;
        });
        const t0 = performance.now();
        for (let i = 0; i < steps; i += 1) {
          gameStateRef.current = updateGame(
            gameStateRef.current, mouseRef.current, keysRef.current.space,
            isMouseDownRef.current, isRightMouseDownRef.current,
            window.innerWidth, window.innerHeight, keysRef.current.q, keysRef.current.e
          );
        }
        const totalMs = performance.now() - t0;
        setProfileSink(null);
        const systems = Object.entries(totals)
          .map(([name, ms]) => ({
            name,
            msPerFrame: ms / steps,
            share: totalMs > 0 ? ms / totalMs : 0,
          }))
          .sort((a, b) => b.msPerFrame - a.msPerFrame);
        return { steps, totalMs, msPerFrame: totalMs / steps, systems };
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__FISH_DEBUG__;
    };
  }, []);

  // 无敌模式开关（G 键与 HUD 按钮共用一个入口，别各写一份）
  const toggleGodMode = () => {
    const p = gameStateRef.current.player;
    p.isGodMode = !p.isGodMode;
    p.speechBubble = {
      text: p.isGodMode ? '无敌模式 开' : '无敌模式 关',
      timer: 60,
      color: p.isGodMode ? '#facc15' : '#94a3b8',
    };
    // 「鱼群争霸」规则：开过无敌就是练习局，不进正式排行（旧模式无 run，空转）
    if (p.isGodMode) markRunPractice(gameStateRef.current, '无敌模式');
  };

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
      <RendererSurface
        kind={rendererSelection.kind}
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
            // 进化数值只有一份真值（systems/progression.ts）—— 无人值守的 3 分钟切片台架
            // 也走这里，改数值时两边不会各跑一套
            applyEvolutionChoice(gameStateRef.current, type);
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
            // 手动续命是「非正式」路径：鱼群争霸下整局标为练习（旧模式无 run，空转）
            markRunPractice(gameStateRef.current, '手动续命');
            p.semiGhostTimer = 0;
            p.poisonTimer = 0;
            p.angerTimer = 0;
            gameStateRef.current.status = GameStatus.PLAYING;
            p.speechBubble = { text: '复活成功！', timer: 90, color: '#22d3ee' };
        }}
        setGameStatus={(s) => { gameStateRef.current.status = s; }}
        onSwitchSquad={() => { queueSquadAction(gameStateRef.current, { kind: 'POSSESS_NEXT' }); }}
        onSquadCommand={(command) => {
            // HUD 按钮没有鼠标落点：不带世界坐标，系统自己挑「离玩家最近的敌人」
            queueSquadAction(gameStateRef.current, { kind: 'COMMAND', command });
        }}
        onPossessMember={(memberId) => {
            queueSquadAction(gameStateRef.current, { kind: 'POSSESS', memberId });
        }}
        onToggleGodMode={toggleGodMode}
        muted={muted}
        onToggleMute={() => { initAudio(); setMuted(toggleMute()); }}
      />
    </div>
  );
};

export default App;
