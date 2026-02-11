
import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType, Cosmetics, TeethType, PatternType, ScaleType, Entity, AccessoryType, TailType, BodyType, EyeType, EyebrowType, TrailType } from '../types';
import { CREATURES, GAME_MECHANICS, BIOME_CONFIGS, WORLD_SIZE, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { drawCuteFish } from './GameCanvas';
import { Shield, Zap, Wind, Skull, Crown, Play, RefreshCw, AlertTriangle, ChevronRight, Bot, Target, Users, Shuffle, Fish, Utensils, MapPin, ShoppingBag, X, Check, Palette, Gem, Box, Sparkles, Frown, BookOpen, Clock, Gift, Star, Eye, Diamond, Sword } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  onStart: (selectedType?: CreatureType) => void;
  onStartBattleTest?: () => void;
  onEvolve: (trait: string, statBonus: Partial<PlayerState['stats']>) => void;
  onRestart: () => void;
  onRevive?: (useAd: boolean) => void;
  onToggleGodMode?: () => void;
  onToggleAutoMode?: () => void;
  onSwitchSquad?: () => void;
  onDigest?: () => void;
  onUpdateCosmetics?: (cosmetics: Cosmetics) => void;
  setGameStatus?: (status: GameStatus) => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onEvolve, onRestart, onRevive, onToggleGodMode, onToggleAutoMode, onSwitchSquad, onDigest, onUpdateCosmetics, setGameStatus }) => {
  const { player, status, score, hazards, entities, buildings, portals, treasures, time } = gameState;
  const [showRules, setShowRules] = useState(false);
  const [shopTab, setShopTab] = useState<'TEETH' | 'SKIN' | 'PATTERN' | 'SCALE' | 'ACCESSORY' | 'TAIL' | 'BODY' | 'EYE' | 'EYEBROW' | 'TRAIL'>('TEETH');
  const miniMapRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 战斗测试模式下的对手
  const opponent = entities.find(e => e.id !== 'player' && e.id !== player.id);

  useEffect(() => {
    if (status !== GameStatus.PLAYING && status !== GameStatus.BATTLE_TEST) return;
    const canvas = miniMapRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const SIZE = 180; const RENDER_SIZE = WORLD_SIZE + 2000; const OFFSET = 1000; const SCALE = SIZE / RENDER_SIZE;
    canvas.width = SIZE; canvas.height = SIZE;
    
    const renderMiniMap = () => {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)"; ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.save(); ctx.scale(SCALE, SCALE); ctx.translate(OFFSET, OFFSET);
        ctx.beginPath(); const stps = 100; for(let i=0; i<=stps; i++) { const a = (Math.PI * 2 * i) / stps; const r = getMapBoundaryRadius(a); const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(a) * r; const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(a) * r; if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = "#64748b"; ctx.lineWidth = 40; ctx.stroke(); ctx.fillStyle = "rgba(30, 41, 59, 0.5)"; ctx.fill();
        if (buildings) { buildings.forEach(b => { ctx.fillStyle = BUILDING_CONFIGS[b.type].color; ctx.fillRect(b.x - 100, b.y - 100, 200, 200); }); }
        if (portals) { ctx.fillStyle = '#d8b4fe'; portals.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 120, 0, Math.PI * 2); ctx.fill(); }); }
        entities.forEach(e => {
            if (e.isHidden) return;
            ctx.fillStyle = e.ownerId === 'player' ? "#3b82f6" : (e.radius > player.radius * 1.5 ? "#ef4444" : "#94a3b8");
            if (e.type !== CreatureType.PLANKTON) { ctx.beginPath(); ctx.arc(e.x, e.y, 60, 0, Math.PI*2); ctx.fill(); }
        });
        ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.arc(player.x, player.y, 150, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    };
    let frameId: number; const loop = () => { renderMiniMap(); frameId = requestAnimationFrame(loop); }; loop();
    return () => cancelAnimationFrame(frameId);
  }, [status, gameState.entities, player.x, player.y]);

  useEffect(() => {
    if (status !== GameStatus.SHOP) return;
    const canvas = previewCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    canvas.width = 400; canvas.height = 400;
    let frameId: number;
    const loop = () => {
        const visualTime = performance.now() / 16;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const dummy: Entity = { ...player, x: canvas.width / 2, y: canvas.height / 2, radius: 80, angle: Math.sin(visualTime * 0.05) * 0.1, vx: 0, vy: 0, cosmetics: player.cosmetics, animOffset: 0, renderScale: 1.0, isHidden: false, camoActive: false, isIdle: false, lureActive: false, ambushTimer: 0, mouthOpenValue: 0, fearTimer: 0, happyTimer: 0, speedBoostTimer: 0, evolutionVisualTimer: 0 };
        drawCuteFish(ctx, dummy, visualTime, true);
        frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [status, player.cosmetics]); 

  if (status === GameStatus.SHOP) {
      const cosmetics = player.cosmetics; const updateCosmetic = (key: keyof Cosmetics, value: any) => { if (onUpdateCosmetics) onUpdateCosmetics({ ...cosmetics, [key]: value }); };
      const TEETH_OPTIONS: {label: string, value: TeethType, icon: string}[] = [ {label: '普通', value: 'NORMAL', icon: '🦷'}, {label: '大金牙', value: 'GOLD', icon: '💰'}, {label: '锯齿', value: 'SHARP', icon: '🔪'}, {label: '吸血鬼', value: 'VAMPIRE', icon: '🧛'}, {label: '牙套', value: 'BRACES', icon: '😬'}, {label: '倒钩', value: 'CURVED', icon: '🪝'}, {label: '双排', value: 'DOUBLE_ROW', icon: '🦈'}, {label: '剑齿', value: 'SABER', icon: '🗡️'}, {label: '缺牙', value: 'GAPPED', icon: '🥴'}, {label: '钻石', value: 'DIAMOND', icon: '💎'}, {label: '彩虹', value: 'RAINBOW', icon: '🌈'}, {label: '兔牙', value: 'BUGS', icon: '🐰'}, {label: '方块', value: 'BLOCKY', icon: '🧱'} ];
      const SKIN_OPTIONS = [ {label: '黑金', value: 'GRADIENT_GOLD_3', style: 'linear-gradient(135deg, #1c1917, #facc15)'}, {label: '土豪金', value: 'GRADIENT_GOLD_1', style: 'linear-gradient(135deg, #fef08a, #a16207)'}, {label: '烈火', value: 'GRADIENT_FIRE', style: 'linear-gradient(135deg, #7f1d1d, #ef4444, #fcd34d)'}, {label: '炫彩', value: 'GRADIENT_RAINBOW', style: 'linear-gradient(135deg, red, orange, yellow, green, blue, purple)'}, {label: '海洋', value: 'GRADIENT_OCEAN', style: 'linear-gradient(135deg, #1e3a8a, #06b6d4, #a5f3fc)'}, {label: '烈焰红', value: '#ef4444', color: '#ef4444'}, {label: '深海蓝', value: '#3b82f6', color: '#3b82f6'}, {label: '暗影黑', value: '#1e293b', color: '#1e293b'}, {label: '默认', value: 'DEFAULT', color: '#94a3b8'} ];
      const EYE_OPTIONS: {label: string, value: EyeType, icon: string}[] = [ {label: '普通', value: 'NORMAL', icon: '👀'}, {label: '动漫', value: 'ANIME', icon: '🥺'}, {label: '愤怒', value: 'MAD', icon: '😠'}, {label: '滑稽', value: 'DERP', icon: '🤪'}, {label: '生化', value: 'CYBORG', icon: '🤖'}, {label: '纽扣', value: 'BUTTON', icon: '🔘'} ];
      const TRAIL_OPTIONS: {label: string, value: TrailType, icon: string}[] = [ {label: '无', value: 'NONE', icon: '❌'}, {label: '气泡', value: 'BUBBLES', icon: '🫧'}, {label: '彩虹', value: 'RAINBOW', icon: '🌈'}, {label: '火焰', value: 'FIRE', icon: '🔥'}, {label: '闪光', value: 'GLITTER', icon: '✨'} ];

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-50">
           <div className="w-full max-w-5xl h-[80vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
               <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                   <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">深海商场</h2>
                   <button onClick={() => setGameStatus && setGameStatus(GameStatus.MENU)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white"><X size={28} /></button>
               </div>
               <div className="flex flex-1 overflow-hidden">
                   <div className="w-48 bg-slate-800/50 flex flex-col border-r border-slate-700">
                       <button onClick={() => setShopTab('TEETH')} className={`p-4 font-bold ${shopTab === 'TEETH' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>牙齿</button>
                       <button onClick={() => setShopTab('EYE')} className={`p-4 font-bold ${shopTab === 'EYE' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>眼睛</button>
                       <button onClick={() => setShopTab('SKIN')} className={`p-4 font-bold ${shopTab === 'SKIN' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>皮肤</button>
                       <button onClick={() => setShopTab('TRAIL')} className={`p-4 font-bold ${shopTab === 'TRAIL' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>拖尾</button>
                   </div>
                   <div className="flex-1 p-8 overflow-y-auto grid grid-cols-3 gap-4">
                       {shopTab === 'TEETH' && TEETH_OPTIONS.map(opt => <button key={opt.value} onClick={() => updateCosmetic('teeth', opt.value)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${cosmetics.teeth === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800'}`}><div className="text-4xl">{opt.icon}</div><div className="font-bold text-slate-200">{opt.label}</div></button>)}
                       {shopTab === 'EYE' && EYE_OPTIONS.map(opt => <button key={opt.value} onClick={() => updateCosmetic('eyeType', opt.value)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${cosmetics.eyeType === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800'}`}><div className="text-4xl">{opt.icon}</div><div className="font-bold text-slate-200">{opt.label}</div></button>)}
                       {shopTab === 'SKIN' && SKIN_OPTIONS.map(opt => <button key={opt.value} onClick={() => updateCosmetic('skinColor', opt.value)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${cosmetics.skinColor === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800'}`}><div className="w-12 h-12 rounded-full" style={{ background: opt.style || opt.color }}></div><div className="font-bold text-slate-200">{opt.label}</div></button>)}
                       {shopTab === 'TRAIL' && TRAIL_OPTIONS.map(opt => <button key={opt.value} onClick={() => updateCosmetic('trailType', opt.value)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${cosmetics.trailType === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800'}`}><div className="text-4xl">{opt.icon}</div><div className="font-bold text-slate-200">{opt.label}</div></button>)}
                   </div>
                   <div className="w-64 bg-slate-800 p-4 border-l border-slate-700 flex flex-col items-center justify-center">
                       <canvas ref={previewCanvasRef} className="w-full aspect-square" />
                       <p className="text-slate-400 mt-4">效果预览</p>
                   </div>
               </div>
               <div className="p-4 bg-slate-800 text-center"><button onClick={() => setGameStatus && setGameStatus(GameStatus.MENU)} className="px-12 py-3 bg-green-600 text-white rounded-lg font-bold">确认</button></div>
           </div>
        </div>
      );
  }

  if (status === GameStatus.PLAYING || status === GameStatus.BATTLE_TEST) {
    const nextSpawnInFrames = TREASURE_CONFIG.SPAWN_INTERVAL - (time % TREASURE_CONFIG.SPAWN_INTERVAL);
    const secondsRemaining = Math.ceil(nextSpawnInFrames / 60);
    const isTreasureActive = treasures && treasures.length > 0;

    return (
      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
        <div className="flex flex-col gap-4 items-center">
          {/* 顶部的标题或倒计时 */}
          <div className="pointer-events-auto">
             {status === GameStatus.PLAYING ? (
                 <div className={`flex items-center gap-3 px-6 py-2 rounded-full border shadow-2xl backdrop-blur-md ${isTreasureActive ? 'bg-amber-500/20 border-amber-400 scale-110' : 'bg-slate-900/60 border-slate-700'}`}>
                    {isTreasureActive ? <><Gift className="text-amber-400 animate-bounce" size={20} /><span className="text-amber-100 font-black text-sm animate-pulse">宝贝降临!</span></> : <><Clock className="text-cyan-400" size={18} /><span className="text-white font-black text-lg">{secondsRemaining}s</span></>}
                 </div>
             ) : (
                 <div className="bg-red-600/80 text-white px-8 py-2 rounded-full font-black text-xl shadow-2xl flex items-center gap-3 animate-pulse border-2 border-red-400">
                    <Sword size={24} /> 决斗进行中 <Sword size={24} className="scale-x-[-1]" />
                 </div>
             )}
          </div>

          <div className="flex w-full justify-between items-start px-4">
              {/* 玩家血条 */}
              <div className="bg-slate-900/80 backdrop-blur p-4 rounded-xl border-2 border-cyan-500 w-80 shadow-2xl pointer-events-auto">
                 <div className="flex justify-between items-end mb-1">
                    <span className="text-cyan-400 font-bold text-lg">{player.config.name} (玩家)</span>
                    <span className="text-white text-xs font-mono">{Math.floor(player.health)} HP</span>
                 </div>
                 <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300" style={{ width: `${Math.min(100, (player.health/player.maxHealth)*100)}%` }}></div>
                 </div>
              </div>

              {/* 战斗测试专属：对手血条 */}
              {status === GameStatus.BATTLE_TEST && opponent && (
                <div className="bg-slate-900/80 backdrop-blur p-4 rounded-xl border-2 border-red-500 w-80 shadow-2xl pointer-events-auto">
                    <div className="flex justify-between items-end mb-1 text-right">
                        <span className="text-white text-xs font-mono">{Math.floor(opponent.health)} HP</span>
                        <span className="text-red-400 font-bold text-lg">{opponent.config.name} (对手)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden border border-slate-700">
                        <div className="h-full bg-gradient-to-l from-red-600 to-orange-400 transition-all duration-300" style={{ width: `${Math.min(100, (opponent.health/opponent.maxHealth)*100)}%` }}></div>
                    </div>
                </div>
              )}
          </div>
        </div>

        <div className="flex justify-between items-end">
            <div className="flex flex-col items-start gap-4">
                <canvas ref={miniMapRef} className="rounded-full shadow-2xl border-4 border-slate-600 bg-slate-900/90" />
            </div>
            
            <div className="pointer-events-auto flex flex-col gap-4 items-end">
                <button onClick={() => onRestart()} className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl border-2 border-slate-600 shadow-2xl flex items-center gap-3">
                    <RefreshCw size={24} /> 返回大厅
                </button>
            </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.MENU) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
        <div className="max-w-4xl w-full flex flex-col items-center justify-center gap-12 p-8 text-center">
            <div className="bg-slate-900/80 p-12 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-center gap-6 mb-4">
                    <Fish size={64} className="text-orange-400 animate-bounce" />
                    <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 py-2">欢乐鱼塘</h1>
                    <Fish size={64} className="text-cyan-400 animate-bounce delay-75 scale-x-[-1]" />
                </div>
                
                <div className="flex flex-col gap-8 items-center mt-12">
                    <button onClick={() => onStart()} className="group px-24 py-8 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-5xl rounded-full transition-all shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-6 border-b-8 border-blue-900">
                        <Play size={64} fill="white" /> 开 始 游 戏
                    </button>

                    <div className="flex gap-6 mt-4">
                        <button onClick={() => onStartBattleTest && onStartBattleTest()} className="px-12 py-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-2xl rounded-3xl transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4 border-b-6 border-red-900">
                            <Sword size={32} /> 战斗测试场景
                        </button>

                        <button onClick={() => setGameStatus && setGameStatus(GameStatus.SHOP)} className="px-12 py-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-2xl rounded-3xl transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4 border-b-6 border-purple-900">
                            <ShoppingBag size={32} /> 海岛换装
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.GAME_OVER) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-red-950/60 backdrop-blur-md z-50">
        <div className="max-w-xl w-full p-12 bg-slate-900 border-4 border-red-600 rounded-3xl shadow-2xl text-center">
            <Skull size={120} className="text-red-500 mx-auto mb-8" />
            <h2 className="text-6xl font-black text-white mb-8">战斗失败</h2>
            <button onClick={() => onRestart()} className="w-full py-6 bg-white text-red-600 font-black text-3xl rounded-full hover:bg-slate-100 transition-all shadow-xl">返回大厅</button>
        </div>
      </div>
    );
  }
  
  return null;
};

export default UIOverlay;
