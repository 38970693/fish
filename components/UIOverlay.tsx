
import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType, Cosmetics, TeethType, PatternType, ScaleType, Entity, AccessoryType, TailType, BodyType, EyeType, EyebrowType, TrailType } from '../types';
import { CREATURES, GAME_MECHANICS, BIOME_CONFIGS, WORLD_SIZE, BUILDING_CONFIGS, MAP_SHAPE_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { drawCuteFish } from './GameCanvas';
import { Shield, Zap, Wind, Skull, Crosshair, Crown, Play, RefreshCw, AlertTriangle, Ban, Info, ChevronRight, Bot, Target, Users, Shuffle, Fish, Utensils, MapPin, ShoppingBag, X, Check, Palette, Gem, Box, Ghost, Award, Diamond, Eye, Sparkles, Frown, BookOpen } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  onStart: (selectedType?: CreatureType) => void;
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

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onEvolve, onRestart, onRevive, onToggleGodMode, onToggleAutoMode, onSwitchSquad, onDigest, onUpdateCosmetics, setGameStatus }) => {
  const { player, status, score, hazards, entities, buildings, portals } = gameState;
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [showRules, setShowRules] = useState(false);
  
  // Shop State
  const [shopTab, setShopTab] = useState<'TEETH' | 'SKIN' | 'PATTERN' | 'SCALE' | 'ACCESSORY' | 'TAIL' | 'BODY' | 'EYE' | 'EYEBROW' | 'TRAIL'>('TEETH');
  
  // MiniMap Refs
  const miniMapRef = useRef<HTMLCanvasElement>(null);
  
  // Preview Canvas Ref
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status !== GameStatus.PLAYING) return;
    const canvas = miniMapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Config
    const SIZE = 180;
    const MARGIN = 10;
    const RENDER_SIZE = WORLD_SIZE + 2000;
    const OFFSET = 1000;
    const SCALE = SIZE / RENDER_SIZE;
    
    canvas.width = SIZE;
    canvas.height = SIZE;
    
    const renderMiniMap = () => {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(0, 0, SIZE, SIZE);
        
        ctx.save();
        ctx.scale(SCALE, SCALE);
        ctx.translate(OFFSET, OFFSET);

        ctx.beginPath();
        const steps = 100;
        for(let i=0; i<=steps; i++) {
            const angle = (Math.PI * 2 * i) / steps;
            const r = getMapBoundaryRadius(angle);
            const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * r;
            const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * r;
            if (i===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 40; 
        ctx.stroke();
        ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(WORLD_SIZE/2, 0); ctx.lineTo(WORLD_SIZE/2, WORLD_SIZE);
        ctx.moveTo(0, WORLD_SIZE/2); ctx.lineTo(WORLD_SIZE, WORLD_SIZE/2);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 20;
        ctx.stroke();

        if (buildings) {
            buildings.forEach(b => {
                ctx.fillStyle = BUILDING_CONFIGS[b.type].color;
                ctx.fillRect(b.x - 100, b.y - 100, 200, 200);
            });
        }

        if (portals) {
            ctx.fillStyle = '#d8b4fe';
            portals.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 120, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        
        entities.forEach(e => {
            if (e.isHidden) return;
            if (e.ownerId === 'player') ctx.fillStyle = "#3b82f6";
            else if (e.radius > player.radius * 1.5) ctx.fillStyle = "#ef4444";
            else ctx.fillStyle = "#94a3b8";
            
            if (e.type !== CreatureType.PLANKTON) {
                ctx.beginPath();
                ctx.arc(e.x, e.y, 60, 0, Math.PI*2);
                ctx.fill();
            }
        });
        
        ctx.fillStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 100;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 150, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        const viewW = window.innerWidth / gameState.camera.zoom;
        const viewH = window.innerHeight / gameState.camera.zoom;
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 30;
        ctx.strokeRect(player.x - viewW/2, player.y - viewH/2, viewW, viewH);
        
        ctx.restore();
    };
    
    let frameId: number;
    const loop = () => {
        renderMiniMap();
        frameId = requestAnimationFrame(loop);
    };
    loop();
    
    return () => cancelAnimationFrame(frameId);

  }, [status, gameState.entities, gameState.player, gameState.buildings, gameState.portals, gameState.camera.zoom]);

  // --- PREVIEW CANVAS RENDER LOOP ---
  useEffect(() => {
    if (status !== GameStatus.SHOP) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 400;
    canvas.height = 400;
    
    let frameId: number;
    
    const loop = () => {
        const visualTime = performance.now() / 16;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 50, canvas.width/2, canvas.height/2, 200);
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        const dummy: Entity = {
            ...player,
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 80,
            angle: 0,
            vx: 0, vy: 0,
            cosmetics: player.cosmetics,
            animOffset: 0,
            renderScale: 1.0,
            isHidden: false,
            camoActive: false,
            isIdle: false,
            lureActive: false,
            ambushTimer: 0,
            mouthOpenValue: 0,
            fearTimer: 0,
            happyTimer: 0,
            speedBoostTimer: 0,
            evolutionVisualTimer: 0
        };
        
        dummy.angle = Math.sin(visualTime * 0.05) * 0.1;
        
        drawCuteFish(ctx, dummy, visualTime, true);
        
        frameId = requestAnimationFrame(loop);
    };
    loop();
    
    return () => cancelAnimationFrame(frameId);
  }, [status, player.cosmetics, player.type]); 

  const handleAdReviveClick = () => {
    if (isWatchingAd) return;
    setIsWatchingAd(true);
    setTimeout(() => {
      setIsWatchingAd(false);
      if (onRevive) onRevive(true);
    }, 2000);
  };

  // --- SHOP UI ---
  if (status === GameStatus.SHOP) {
      // ... (keep existing shop UI code - abbreviated for brevity as logic is unchanged)
      // I will include the full SHOP block to ensure no code loss, but logic is same
      const cosmetics = player.cosmetics;
      
      const updateCosmetic = (key: keyof Cosmetics, value: any) => {
          if (onUpdateCosmetics) {
              onUpdateCosmetics({ ...cosmetics, [key]: value });
          }
      };

      const TEETH_OPTIONS: {label: string, value: TeethType, icon: string}[] = [
          {label: '普通', value: 'NORMAL', icon: '🦷'},
          {label: '大金牙', value: 'GOLD', icon: '💰'}, 
          {label: '锯齿', value: 'SHARP', icon: '🔪'},
          {label: '吸血鬼', value: 'VAMPIRE', icon: '🧛'},
          {label: '牙套', value: 'BRACES', icon: '😬'},
          {label: '倒钩', value: 'CURVED', icon: '🪝'},
          {label: '双排', value: 'DOUBLE_ROW', icon: '🦈'},
          {label: '剑齿', value: 'SABER', icon: '🗡️'},
          {label: '缺牙', value: 'GAPPED', icon: '🥴'},
          {label: '钻石', value: 'DIAMOND', icon: '💎'},
          {label: '彩虹', value: 'RAINBOW', icon: '🌈'},
          {label: '兔牙', value: 'BUGS', icon: '🐰'},
          {label: '方块', value: 'BLOCKY', icon: '🧱'},
      ];

      const SKIN_OPTIONS = [
          {label: '黑金', value: 'GRADIENT_GOLD_3', style: 'linear-gradient(135deg, #1c1917, #facc15)'},
          {label: '土豪金', value: 'GRADIENT_GOLD_1', style: 'linear-gradient(135deg, #fef08a, #a16207)'},
          {label: '玫瑰金', value: 'GRADIENT_GOLD_2', style: 'linear-gradient(135deg, #fbcfe8, #ca8a04)'},
          {label: '日落渐变', value: 'GRADIENT_SUNSET', style: 'linear-gradient(135deg, #6d28d9, #db2777, #f59e0b)'},
          {label: '炫彩虹光', value: 'GRADIENT_RAINBOW', style: 'linear-gradient(135deg, red, orange, yellow, green, blue, purple)'},
          {label: '烈火', value: 'GRADIENT_FIRE', style: 'linear-gradient(135deg, #7f1d1d, #ef4444, #fcd34d)'},
          {label: '海洋之心', value: 'GRADIENT_OCEAN', style: 'linear-gradient(135deg, #1e3a8a, #06b6d4, #a5f3fc)'},
          {label: '极光', value: 'GRADIENT_AURORA', style: 'linear-gradient(135deg, #0f172a, #22c55e, #3b82f6)'},
          {label: '剧毒辐射', value: 'GRADIENT_TOXIC', style: 'linear-gradient(135deg, #14532d, #4ade80, #facc15)'},
          {label: '糖果', value: 'GRADIENT_CANDY', style: 'linear-gradient(135deg, #f472b6, #60a5fa)'},
          {label: '烈焰红', value: '#ef4444', color: '#ef4444'},
          {label: '深海蓝', value: '#3b82f6', color: '#3b82f6'},
          {label: '虚空紫', value: '#8b5cf6', color: '#8b5cf6'},
          {label: '柠檬黄', value: '#facc15', color: '#facc15'},
          {label: '幽灵白', value: '#f8fafc', color: '#f8fafc'},
          {label: '暗影黑', value: '#1e293b', color: '#1e293b'},
          {label: '翡翠绿', value: '#10b981', color: '#10b981'},
          {label: '少女粉', value: '#f472b6', color: '#f472b6'},
          {label: '巧克力', value: '#78350f', color: '#78350f'},
          {label: '默认', value: 'DEFAULT', color: '#94a3b8'},
      ];

      const PATTERN_OPTIONS: {label: string, value: PatternType, bg: string}[] = [
          {label: '无', value: 'NONE', bg: 'bg-slate-700'},
          {label: '闪电', value: 'LIGHTNING', bg: 'bg-yellow-900 border-yellow-400'},
          {label: '云朵', value: 'CLOUD', bg: 'bg-sky-300'},
          {label: '棋盘', value: 'CHECKER', bg: 'bg-[conic-gradient(at_top_left,_black_90deg,_transparent_0)_0_0/20px_20px]'},
          {label: '藤蔓', value: 'VINES', bg: 'bg-green-800'},
          {label: '靶心', value: 'TARGET', bg: 'bg-[radial-gradient(circle,red,white,red)]'},
          {label: '星系', value: 'GALAXY', bg: 'bg-slate-900'},
          {label: '笑脸', value: 'SMILEY', bg: 'bg-yellow-400'},
          {label: '火焰', value: 'FIREY', bg: 'bg-gradient-to-t from-red-600 to-yellow-400'},
          {label: '符文', value: 'RUNE', bg: 'bg-cyan-900'},
          {label: '糖果条', value: 'CANDY', bg: 'bg-[repeating-linear-gradient(45deg,#f472b6,#f472b6_10px,white_10px,white_20px)]'},
          {label: '条纹', value: 'STRIPES', bg: 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)]'},
          {label: '斑点', value: 'SPOTS', bg: 'bg-[radial-gradient(circle,black_2px,transparent_2.5px)] bg-[length:10px_10px]'},
          {label: '虎纹', value: 'TIGER', bg: 'bg-orange-500 bg-[linear-gradient(to_right,black_50%,transparent_50%)] bg-[length:20px_100%]'},
          {label: '波点', value: 'DOTS', bg: 'bg-[radial-gradient(#fff_20%,transparent_20%)] bg-[length:10px_10px]'},
          {label: '迷彩', value: 'CAMO', bg: 'bg-green-700'},
          {label: '斑马', value: 'ZEBRA', bg: 'bg-[repeating-linear-gradient(90deg,white,white_10px,black_10px,black_20px)]'},
          {label: '豹纹', value: 'LEOPARD', bg: 'bg-yellow-600'},
          {label: '爱心', value: 'HEART', bg: 'bg-pink-300'},
          {label: '星星', value: 'STAR', bg: 'bg-indigo-900'},
          {label: '电路', value: 'CIRCUIT', bg: 'bg-green-900 border border-green-400'},
          {label: '熔岩', value: 'LAVA', bg: 'bg-red-900 border-red-500'},
          {label: '锦鲤', value: 'KOI', bg: 'bg-orange-200'},
          {label: '骨架', value: 'SKELETON', bg: 'bg-black border-white'},
      ];

      const SCALE_OPTIONS: {label: string, value: ScaleType, style: string}[] = [
          {label: '光滑', value: 'NONE', style: 'bg-slate-700'},
          {label: '高光', value: 'SHINY', style: 'bg-gradient-to-tr from-white/10 to-white/60'},
          {label: '龙鳞', value: 'DRAGON', style: 'bg-green-800 border-green-500'},
          {label: '重甲', value: 'ARMOR', style: 'bg-slate-600 border-2 border-slate-400'},
          {label: '机械', value: 'MECHANICAL', style: 'bg-slate-500 border-2 border-slate-300'},
          {label: '霓虹', value: 'GLOW', style: 'border-2 border-cyan-400 shadow-[0_0_10px_cyan]'},
          {label: '菱形', value: 'DIAMOND_PLATE', style: 'bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.2)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] bg-slate-500'},
          {label: '生化', value: 'BIO_HAZARD', style: 'bg-yellow-400 border border-black'},
          {label: '水晶', value: 'CRYSTAL', style: 'bg-cyan-200/50 backdrop-blur'},
          {label: '岩石', value: 'STONE', style: 'bg-stone-600'},
          {label: '羽毛', value: 'FEATHER', style: 'bg-sky-200'},
          {label: '黏液', value: 'SLIME', style: 'bg-green-500/50 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]'},
          {label: '马赛克', value: 'MOSAIC', style: 'bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-gray-200 via-gray-400 to-gray-600'},
          {label: '虚空', value: 'VOID', style: 'bg-black shadow-inner shadow-purple-900'},
          {label: '像素', value: 'PIXEL', style: 'bg-indigo-500'},
      ];

      const ACCESSORY_OPTIONS: {label: string, value: AccessoryType, icon: string, vip?: boolean}[] = [
          {label: '无', value: 'NONE', icon: '❌'},
          {label: '大金链', value: 'GOLD_CHAIN', icon: '⛓️'},
          {label: '珍珠项链', value: 'PEARL_NECKLACE', icon: '📿'},
          {label: '墨镜', value: 'SUNGLASSES', icon: '😎'},
          {label: '皇冠', value: 'CROWN', icon: '👑', vip: true},
          {label: '蝴蝶结', value: 'BOW_TIE', icon: '🎀'},
          {label: '玉佩', value: 'JADE_PENDANT', icon: '🟢'},
          {label: '钻戒', value: 'DIAMOND_RING', icon: '💍'},
          {label: '勋章', value: 'MEDAL', icon: '🏅'},
          {label: '耳机', value: 'HEADPHONES', icon: '🎧'},
          {label: '光环', value: 'HALO', icon: '😇', vip: true},
          {label: '眼罩', value: 'EYEPATCH', icon: '🏴‍☠️'},
      ];

      const TAIL_OPTIONS: {label: string, value: TailType, icon: string}[] = [
          {label: '默认', value: 'DEFAULT', icon: '🐟'},
          {label: '新月', value: 'CRESCENT', icon: '🌙'},
          {label: '分叉', value: 'FORKED', icon: '✂️'},
          {label: '扇形', value: 'FAN', icon: '🪭'},
          {label: '三叉戟', value: 'TRIDENT', icon: '🔱'},
          {label: '龙虾', value: 'LOBSTER', icon: '🦞'},
          {label: '机械', value: 'MECHANICAL', icon: '🤖'},
          {label: '幽灵', value: 'GHOST', icon: '👻'},
          {label: '飘带', value: 'RIBBON', icon: '🎗️'},
      ];

      const BODY_OPTIONS: {label: string, value: BodyType, icon: string, vip?: boolean}[] = [
          {label: '默认', value: 'DEFAULT', icon: '🔵'},
          {label: '圆形', value: 'ROUND', icon: '⚪'},
          {label: '细长', value: 'SLENDER', icon: '🥒'},
          {label: '敦实', value: 'CHUNKY', icon: '🥔'},
          {label: '方块', value: 'BOX', icon: '⬛'},
          {label: '海星', value: 'STAR', icon: '⭐'},
          {label: '鳐鱼', value: 'RAY', icon: '🛸'},
          {label: '鳗鱼', value: 'EEL', icon: '〰️'},
          {label: '美人鱼', value: 'MERMAID', icon: '🧜‍♀️', vip: true},
      ];

      const EYE_OPTIONS: {label: string, value: EyeType, icon: string}[] = [
          {label: '普通', value: 'NORMAL', icon: '👀'},
          {label: '动漫', value: 'ANIME', icon: '🥺'},
          {label: '愤怒', value: 'MAD', icon: '😠'},
          {label: '滑稽', value: 'DERP', icon: '🤪'},
          {label: '生化', value: 'CYBORG', icon: '🤖'},
          {label: '晕眩', value: 'DEAD', icon: '😵'},
          {label: '花痴', value: 'LOVE', icon: '😍'},
          {label: '催眠', value: 'HYPNO', icon: '😵‍💫'},
          {label: '猫眼', value: 'CAT', icon: '😺'},
          {label: '烈焰', value: 'FIRE', icon: '🔥'},
          {label: '纽扣', value: 'BUTTON', icon: '🔘'},
          {label: '护目镜', value: 'GOGGLES', icon: '🥽'},
      ];

      const EYEBROW_OPTIONS: {label: string, value: EyebrowType, icon: string}[] = [
          {label: '无', value: 'NONE', icon: '😶'},
          {label: '愤怒', value: 'ANGRY', icon: '😠'},
          {label: '悲伤', value: 'SAD', icon: '😢'},
          {label: '困惑', value: 'CONFUSED', icon: '🤨'},
          {label: '粗眉', value: 'THICK', icon: '🥸'},
          {label: '连眉', value: 'UNI', icon: '〰️'},
          {label: '叠层', value: 'TIERED', icon: '📶'},
      ];

      const TRAIL_OPTIONS: {label: string, value: TrailType, icon: string}[] = [
          {label: '无', value: 'NONE', icon: '❌'},
          {label: '气泡', value: 'BUBBLES', icon: '🫧'},
          {label: '彩虹', value: 'RAINBOW', icon: '🌈'},
          {label: '火焰', value: 'FIRE', icon: '🔥'},
          {label: '闪光', value: 'GLITTER', icon: '✨'},
          {label: '爱心', value: 'HEARTS', icon: '❤️'},
          {label: '电流', value: 'ELECTRIC', icon: '⚡'},
          {label: '黏液', value: 'SLIME', icon: '🟢'},
      ];

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-50">
           <div className="w-full max-w-7xl h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
               {/* Header */}
               <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                   <div className="flex items-center gap-4">
                       <div className="bg-purple-500/20 p-3 rounded-xl border border-purple-500/50">
                           <ShoppingBag className="text-purple-400" size={32} />
                       </div>
                       <div>
                           <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">深海商场</h2>
                           <p className="text-slate-400 text-sm">打造你的专属怪兽</p>
                       </div>
                   </div>
                   <button 
                       onClick={() => setGameStatus && setGameStatus(GameStatus.PLAYING)}
                       className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
                   >
                       <X size={28} />
                   </button>
               </div>

               <div className="flex flex-1 overflow-hidden">
                   {/* Sidebar Tabs */}
                   <div className="w-64 bg-slate-800/50 flex flex-col border-r border-slate-700 flex-shrink-0 overflow-y-auto scrollbar-hide">
                       <button onClick={() => setShopTab('TEETH')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'TEETH' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Skull size={20}/> 牙齿造型
                       </button>
                       <button onClick={() => setShopTab('EYE')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'EYE' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Eye size={20}/> 眼部造型
                       </button>
                       <button onClick={() => setShopTab('EYEBROW')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'EYEBROW' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Frown size={20}/> 眉毛造型
                       </button>
                       <button onClick={() => setShopTab('TRAIL')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'TRAIL' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Sparkles size={20}/> 拖尾特效
                       </button>
                       <button onClick={() => setShopTab('SKIN')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'SKIN' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Palette size={20}/> 皮肤颜色
                       </button>
                       <button onClick={() => setShopTab('BODY')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'BODY' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Users size={20}/> 身体形状
                       </button>
                       <button onClick={() => setShopTab('TAIL')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'TAIL' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Wind size={20}/> 尾巴样式
                       </button>
                       <button onClick={() => setShopTab('ACCESSORY')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'ACCESSORY' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Diamond size={20}/> 装饰饰品
                       </button>
                       <button onClick={() => setShopTab('PATTERN')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'PATTERN' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Box size={20}/> 花纹样式
                       </button>
                       <button onClick={() => setShopTab('SCALE')} className={`p-4 flex items-center gap-3 font-bold transition-all ${shopTab === 'SCALE' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700'}`}>
                           <Gem size={20}/> 鱼鳞质感
                       </button>
                   </div>

                   {/* Content Area (Grid) */}
                   <div className="flex-1 p-8 overflow-y-auto bg-slate-900/50 scrollbar-thin scrollbar-thumb-slate-700">
                       <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                           {shopTab === 'TEETH' && TEETH_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('teeth', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.teeth === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {/* ... (render other tabs similar to above) ... */}
                           {shopTab === 'EYE' && EYE_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('eyeType', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.eyeType === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'EYEBROW' && EYEBROW_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('eyebrowType', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.eyebrowType === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'TRAIL' && TRAIL_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('trailType', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.trailType === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'SKIN' && SKIN_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('skinColor', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 ${cosmetics.skinColor === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="w-16 h-16 rounded-full border-4 border-white/10 shadow-xl" style={{ background: opt.style || opt.color }}></div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'BODY' && BODY_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('bodyType', opt.value)}
                                  className={`relative aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.bodyType === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   {opt.vip && <div className="absolute top-2 right-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">VIP</div>}
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'TAIL' && TAIL_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('tailType', opt.value)}
                                  className={`aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.tailType === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'ACCESSORY' && ACCESSORY_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('accessory', opt.value)}
                                  className={`relative aspect-square p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 ${cosmetics.accessory === opt.value ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   {opt.vip && <div className="absolute top-2 right-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">VIP</div>}
                                   <div className="text-5xl mb-2 filter drop-shadow-md">{opt.icon}</div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'PATTERN' && PATTERN_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('pattern', opt.value)}
                                  className={`aspect-square p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 ${cosmetics.pattern === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className={`w-16 h-16 rounded-lg shadow-inner ${opt.bg}`}></div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}

                           {shopTab === 'SCALE' && SCALE_OPTIONS.map(opt => (
                               <button 
                                  key={opt.value}
                                  onClick={() => updateCosmetic('scaleType', opt.value)}
                                  className={`aspect-square p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 ${cosmetics.scaleType === opt.value ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                               >
                                   <div className={`w-16 h-16 rounded-full shadow-lg ${opt.style}`}></div>
                                   <div className="font-bold text-slate-200 text-sm">{opt.label}</div>
                               </button>
                           ))}
                       </div>
                   </div>

                   {/* Preview Panel */}
                   <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col items-center justify-center relative p-4 shadow-2xl flex-shrink-0">
                       <div className="absolute top-4 left-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Live Preview</div>
                       <div className="w-full aspect-square relative flex items-center justify-center">
                           {/* Glow Effect */}
                           <div className="absolute inset-0 bg-purple-500/10 blur-3xl rounded-full"></div>
                           <canvas ref={previewCanvasRef} className="w-full h-full object-contain relative z-10" />
                       </div>
                       <div className="mt-4 text-center">
                           <h3 className="text-xl font-bold text-white">{player.config.name}</h3>
                           <p className="text-slate-400 text-sm">当前预览效果</p>
                       </div>
                   </div>
               </div>
               
               {/* Footer */}
               <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-between items-center px-8">
                   <div className="text-slate-400 text-sm">
                       已选择: <span className="text-purple-400 font-bold">
                           {shopTab === 'TEETH' ? TEETH_OPTIONS.find(o=>o.value===cosmetics.teeth)?.label : 
                            shopTab === 'SKIN' ? SKIN_OPTIONS.find(o=>o.value===cosmetics.skinColor)?.label :
                            shopTab === 'PATTERN' ? PATTERN_OPTIONS.find(o=>o.value===cosmetics.pattern)?.label :
                            shopTab === 'ACCESSORY' ? ACCESSORY_OPTIONS.find(o=>o.value===cosmetics.accessory)?.label :
                            shopTab === 'TAIL' ? TAIL_OPTIONS.find(o=>o.value===cosmetics.tailType)?.label :
                            shopTab === 'BODY' ? BODY_OPTIONS.find(o=>o.value===cosmetics.bodyType)?.label :
                            shopTab === 'EYE' ? EYE_OPTIONS.find(o=>o.value===cosmetics.eyeType)?.label :
                            shopTab === 'EYEBROW' ? EYEBROW_OPTIONS.find(o=>o.value===cosmetics.eyebrowType)?.label :
                            shopTab === 'TRAIL' ? TRAIL_OPTIONS.find(o=>o.value===cosmetics.trailType)?.label :
                            SCALE_OPTIONS.find(o=>o.value===cosmetics.scaleType)?.label}
                       </span>
                   </div>
                   <button 
                       onClick={() => setGameStatus && setGameStatus(GameStatus.PLAYING)}
                       className="px-10 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/30 transition-all hover:-translate-y-0.5"
                   >
                       <Check size={20} /> 完成搭配
                   </button>
               </div>
           </div>
        </div>
      );
  }

  // -- HUD --
  if (status === GameStatus.PLAYING) {
    const hasActiveHazards = hazards.some(h => h.stage !== 'COOLDOWN');
    const squadCount = entities.filter(e => e.ownerId === 'player').length;
    const basketCount = player.basket ? player.basket.reduce((acc, item) => acc + item.count, 0) : 0;
    const basketWeight = player.basket ? player.basket.reduce((acc, item) => acc + item.totalWeight, 0) : 0;
    
    // BIOME INFO
    const biome = BIOME_CONFIGS[player.currentBiome];

    return (
      <div className="absolute inset-0 pointer-events-none p-4">
        {/* Active Hazard Warning */}
        {hasActiveHazards && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 animate-bounce">
              <div className="bg-red-600/90 text-white px-6 py-2 rounded-full font-black text-xl border-2 border-orange-400 shadow-xl flex items-center gap-2">
                 <AlertTriangle size={24} className="animate-pulse text-yellow-300" />
                 警告: 陨石即将撞击! 
              </div>
           </div>
        )}

        {/* Top Left: Stats & Biome */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="bg-slate-900/50 backdrop-blur p-4 rounded-lg border border-slate-700 w-64 shadow-xl">
             <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-black/40 flex items-center justify-center">
                   <div className="w-6 h-6 rounded-full" style={{ backgroundColor: player.config.color }}></div>
                </div>
                <div>
                  <div className="text-white font-bold text-lg leading-none">{player.config.name}</div>
                  <div className="text-slate-400 text-xs">Tier {player.config.tier}</div>
                </div>
             </div>

            <div className="flex justify-between items-center text-sm mb-1">
               <span className="text-slate-300 font-semibold">重量</span>
               <span className="text-white font-mono text-lg">{Math.floor(player.weight)} kg</span>
            </div>
             <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mb-3">
              <div 
                className={`h-full transition-all duration-300 ${player.radius < 10 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, (player.radius / 500) * 100)}%` }}
              ></div>
            </div>

            {/* Squad Count & Switch */}
            <div className="flex justify-between text-xs items-center mt-2 pt-2 border-t border-slate-700/50">
               <div className="flex items-center gap-2">
                   <span className="text-green-300 font-bold flex items-center gap-1"><Users size={12}/> 战队</span>
                   <span className="text-white font-mono">{squadCount} / {GAME_MECHANICS.MAX_SQUAD_SIZE}</span>
               </div>
               
               {onSwitchSquad && squadCount > 0 && (
                 <button 
                    onClick={onSwitchSquad}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow flex items-center gap-1 transition-all active:scale-95"
                 >
                    <Shuffle size={10}/> 切换视角
                 </button>
               )}
            </div>
          </div>
          
          {/* BIOME INDICATOR */}
          <div className="bg-slate-900/60 backdrop-blur border border-slate-600 p-3 rounded-lg shadow-xl w-64">
              <div className="flex items-center gap-2 mb-1" style={{ color: biome.color }}>
                  <MapPin size={18} />
                  <span className="font-black text-lg">{biome.name}</span>
              </div>
              <p className="text-xs text-slate-300 leading-tight">
                  {biome.description}
              </p>
          </div>

          {/* New Item Status Indicators */}
          <div className="flex gap-2 flex-wrap">
             {player.invulnerableTimer > 0 && (
                 <div className="bg-yellow-500/80 text-white px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg animate-pulse border border-yellow-300">
                     <Shield size={16}/> 保护期: {Math.ceil(player.invulnerableTimer / 60)}s
                 </div>
             )}
             {player.shieldTimer > 0 && (
                 <div className="bg-cyan-500/80 text-white px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg animate-pulse border border-cyan-300">
                     <Shield size={16}/> 无敌: {Math.ceil(player.shieldTimer / 60)}s
                 </div>
             )}
             {player.torpedoCount > 0 && (
                 <div className="bg-red-500/80 text-white px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg border border-red-300">
                     <Target size={16}/> 鱼雷: {player.torpedoCount}
                 </div>
             )}
          </div>
        </div>
        
        {/* Bottom Left: Mini Map */}
        <div className="absolute bottom-4 left-4 pointer-events-none flex flex-col items-start gap-1">
            <canvas ref={miniMapRef} className="rounded-full shadow-2xl border-4 border-slate-600 bg-slate-900/90" />
            <div className="bg-slate-900/80 p-2 rounded text-[10px] text-slate-400 font-mono border border-slate-700">
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-sm"></span> 建筑</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400 rounded-full"></span> 传送阵</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan-400 rounded-full"></span> 玩家</div>
            </div>
        </div>
        
        {/* --- FISH BASKET (Bottom Right) --- */}
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
             <div className="bg-slate-900/80 backdrop-blur border border-slate-600 p-3 rounded-xl shadow-2xl w-64 transition-all hover:scale-105">
                 <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
                     <div className="flex items-center gap-2 text-white font-bold">
                         <Fish className="text-orange-400" size={20}/>
                         我的鱼篓
                     </div>
                     <div className="text-xs text-slate-400 font-mono">
                         {basketCount} 条 / +{Math.floor(basketWeight)}kg
                     </div>
                 </div>
                 
                 <div className="max-h-32 overflow-y-auto mb-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                     {player.basket && player.basket.length > 0 ? (
                         player.basket.map((item, idx) => (
                             <div key={idx} className="flex justify-between items-center text-xs bg-slate-800/50 p-1 rounded">
                                 <span className="text-slate-200">{CREATURES[item.type].name}</span>
                                 <div className="flex items-center gap-2">
                                     <span className="text-green-400 font-mono">+{Math.floor(item.totalWeight)}kg</span>
                                     <span className="bg-slate-700 text-white px-1.5 rounded-full text-[10px]">x{item.count}</span>
                                 </div>
                             </div>
                         ))
                     ) : (
                         <div className="text-slate-500 text-xs text-center py-4 italic">
                             空空如也... 去捕点鱼吧!
                         </div>
                     )}
                 </div>
                 
                 <button
                    onClick={onDigest}
                    disabled={basketCount === 0}
                    className={`w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                        basketCount > 0 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/50 animate-pulse' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                 >
                     <Utensils size={16}/>
                     一键吞噬消化
                 </button>
             </div>
        </div>

        {/* Top Right: Buttons & Traits */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-auto">
           {onToggleGodMode && (
             <button 
               onClick={onToggleGodMode}
               className={`${player.isGodMode ? 'bg-amber-500 text-black animate-none' : 'bg-amber-600/80 text-white animate-pulse'} hover:bg-amber-400 px-3 py-1 rounded text-xs font-bold shadow-lg flex items-center gap-1 transition-colors`}
             >
               <Crown size={12}/> {player.isGodMode ? '关闭上帝模式' : '变身深海巨怪'}
             </button>
           )}

           {onToggleAutoMode && (
             <button 
               onClick={onToggleAutoMode}
               className={`px-3 py-1 rounded text-xs font-bold shadow-lg flex items-center gap-1 transition-colors ${player.isAutoMode ? 'bg-green-600 text-white animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
             >
               <Bot size={12}/> {player.isAutoMode ? '自动挂机中' : '开启挂机'}
             </button>
           )}

           <div className="flex gap-1 flex-wrap justify-end max-w-xs">
             {player.traits.map(t => (
               <span key={t} className="px-2 py-1 bg-indigo-600/80 text-xs rounded text-white font-bold shadow-sm">
                 {t}
               </span>
             ))}
           </div>
        </div>
      </div>
    );
  }

  // -- MAIN MENU --
  if (status === GameStatus.MENU) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-50">
        {/* Rules Modal */}
        {showRules && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-4" onClick={() => setShowRules(false)}>
                <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-8 relative" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={32}/></button>
                    
                    <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-6 text-center">
                        🌊 生存指南
                    </h2>

                    <div className="space-y-6 text-slate-300">
                        {/* Section 1: Core */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                                <Fish className="text-yellow-400"/> 核心法则
                            </h3>
                            <p>大鱼吃小鱼，小鱼吃虾米。控制你的鱼吞噬比自己小的生物来增加体重。体重达到一定程度后会自动<strong>进化</strong>成更强大的物种！</p>
                        </div>

                        {/* Section 2: Controls */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                                <Zap className="text-cyan-400"/> 操作说明
                            </h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>移动：</strong> 鼠标移动控制方向。</li>
                                <li><strong>冲刺：</strong> 按住 <span className="bg-slate-700 px-2 py-0.5 rounded text-white font-mono text-sm border border-slate-600">空格键</span> 消耗体力加速冲撞。</li>
                                <li><strong>攻击：</strong> 拾取鱼雷后，点击 <span className="bg-slate-700 px-2 py-0.5 rounded text-white font-mono text-sm border border-slate-600">鼠标左键</span> 发射鱼雷攻击远程敌人。</li>
                            </ul>
                        </div>

                        {/* Section 3: Buildings */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                                <MapPin className="text-green-400"/> 地图与设施
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="flex items-start gap-2">
                                    <span className="text-2xl">🛍️</span>
                                    <div><strong className="text-pink-400">深海商场</strong><br/>位于地图四个角落，进入可更换皮肤和饰品。</div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-2xl">🏥</span>
                                    <div><strong className="text-red-400">急救站</strong><br/>靠近可瞬间回满生命值。</div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-2xl">⚔️</span>
                                    <div><strong className="text-orange-400">军火库</strong><br/>位于深渊区域，补充大量鱼雷弹药。</div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-2xl">⛩️</span>
                                    <div><strong className="text-purple-400">龙王庙</strong><br/>随机获得强力BUFF（护盾、加速或增重）。</div>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Tips */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                                <Crown className="text-amber-400"/> 进阶技巧
                            </h3>
                            <ul className="space-y-2">
                                <li className="flex gap-2"><span className="text-green-400">★</span> <strong>组建战队：</strong> 吞噬比自己小的同类时，有机会将其收编为小弟，死后可复活在小弟身上！</li>
                                <li className="flex gap-2"><span className="text-purple-400">★</span> <strong>时空穿梭：</strong> 利用地图上的紫色传送门快速转移，躲避追杀。</li>
                                <li className="flex gap-2"><span className="text-red-400">★</span> <strong>末日预警：</strong> 留意地面的红色警告圈，陨石撞击可以直接秒杀任何生物！</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div className="mt-8 text-center">
                        <button 
                            onClick={() => setShowRules(false)}
                            className="px-12 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-full shadow-lg hover:shadow-cyan-500/30 transition-all hover:-translate-y-1"
                        >
                            我明白了
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="max-w-4xl w-full flex flex-col items-center justify-center gap-8 p-8">
            
            {/* Centered Content */}
            <div className="text-center w-full max-w-2xl">
                {/* Title Container with Blur Background */}
                <div className="bg-slate-900/60 p-10 rounded-3xl border border-slate-700/50 shadow-2xl backdrop-blur-md mb-8 relative overflow-hidden group">
                    {/* Subtle top shine */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-gradient-to-b from-cyan-500/10 to-transparent blur-xl pointer-events-none"></div>

                    <div className="flex items-center justify-center gap-6 mb-4">
                        <div className="relative">
                           <Fish size={64} className="text-orange-400 animate-bounce drop-shadow-lg" />
                           <div className="absolute -top-2 -right-2 text-xl animate-ping">🫧</div>
                        </div>
                        
                        <h1 className="relative text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 drop-shadow-[0_4px_10px_rgba(34,211,238,0.5)] py-2" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                            欢乐鱼塘
                        </h1>

                         <div className="relative">
                           {/* Flip horizontally to face inwards */}
                           <Fish size={64} className="text-cyan-400 animate-bounce delay-75 drop-shadow-lg scale-x-[-1]" />
                           <div className="absolute -top-4 -left-2 text-xl animate-pulse">🫧</div>
                        </div>
                    </div>
                    
                    <p className="relative text-cyan-100 text-xl tracking-[0.2em] font-bold drop-shadow-sm">四叶草海域 · 生态进化</p>
                </div>
                
                <div className="flex gap-4 justify-center items-center">
                    {/* RULES BUTTON */}
                    <button 
                        onClick={() => setShowRules(true)}
                        className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-bold text-xl transition-all shadow-xl border-2 border-slate-600 flex items-center justify-center hover:-translate-y-1 hover:shadow-emerald-500/20"
                        title="游戏指南"
                    >
                        <BookOpen size={28} />
                    </button>

                    <button 
                        onClick={() => onStart(undefined)}
                        className="group relative px-12 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-2xl rounded-full transition-all shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:shadow-[0_0_50px_rgba(6,182,212,0.8)] hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 border-2 border-white/20"
                    >
                        开始游戏 
                        <ChevronRight size={28} className="group-hover:translate-x-2 transition-transform"/>
                        <div className="absolute inset-0 rounded-full overflow-hidden">
                            <div className="absolute top-0 left-0 w-2/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-30deg] translate-x-[-150%] group-hover:animate-[shimmer_1s_infinite]"></div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setGameStatus && setGameStatus(GameStatus.SHOP)}
                        className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-purple-300 font-bold text-xl transition-all shadow-xl border-2 border-slate-600 flex items-center justify-center hover:-translate-y-1 hover:shadow-purple-500/20"
                        title="商场"
                    >
                        <ShoppingBag size={28} />
                    </button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // -- GAME OVER --
  if (status === GameStatus.GAME_OVER) {
    if (isWatchingAd) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="text-center">
             <div className="text-4xl animate-bounce mb-4">📺</div>
             <h2 className="text-2xl font-bold text-white mb-2">广告播放中...</h2>
             <div className="w-64 h-2 bg-slate-800 rounded mt-4 overflow-hidden">
                <div className="h-full bg-yellow-500 animate-[width_2s_linear_forwards] w-0"></div>
             </div>
          </div>
        </div>
      );
    }
    
    // TEMPORARY: Allow infinite revives for fun/debug
    const canRevive = true; 

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-red-950/40 backdrop-blur-sm z-50">
        <div className="max-w-xl w-full p-8 bg-slate-900/90 border border-red-900 rounded-2xl shadow-2xl text-center backdrop-blur-md">
          <h2 className="text-4xl font-black text-red-500 mb-2">游戏结束</h2>
          <p className="text-slate-300 mb-6">你被陨石击中 (或者被吃光了)...</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">最终重量</div>
              <div className="text-xl font-bold text-white">{Math.floor(player.weight)} kg</div>
            </div>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">物种</div>
              <div className="text-xl font-bold text-white">{player.config.name}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => onRevive && onRevive(false)}
              className="py-4 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg"
            >
              <RefreshCw size={24} className="mx-auto mb-2"/>
              重新开始
            </button>

            {canRevive ? (
              <button 
                onClick={handleAdReviveClick}
                className="py-4 px-2 bg-gradient-to-br from-yellow-600 to-orange-700 hover:from-yellow-500 hover:to-orange-600 text-white font-bold rounded-lg shadow-lg relative overflow-hidden group"
              >
                 <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
                <Play size={24} fill="white" className="mx-auto mb-2"/>
                复活 (无限)
              </button>
            ) : (
               <button 
                disabled
                className="py-4 px-2 bg-slate-800 text-slate-500 font-bold rounded-lg cursor-not-allowed border border-slate-700"
              >
                <Ban size={24} className="mx-auto mb-2"/>
                复活次数已用完
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UIOverlay;
