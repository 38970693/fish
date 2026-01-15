import React, { useState } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType } from '../types';
import { LEVEL_THRESHOLDS } from '../constants';
import { Shield, Zap, Wind, Skull, Crosshair, Crown, Play, RefreshCw, AlertTriangle } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  onStart: () => void;
  onEvolve: (trait: string, statBonus: Partial<PlayerState['stats']>) => void;
  onRestart: () => void;
  onRevive?: (useAd: boolean) => void;
  onToggleGodMode?: () => void;
}

// Evolution Card Component
const EvolutionCard: React.FC<{
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}> = ({ title, desc, icon, color, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center p-6 bg-slate-800/80 border-2 border-${color}-500 rounded-xl hover:scale-105 transition-transform cursor-pointer shadow-lg shadow-${color}-500/20`}
  >
    <div className={`p-4 rounded-full bg-${color}-500/20 mb-4 text-${color}-400`}>
      {icon}
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-sm text-slate-300 text-center">{desc}</p>
  </button>
);

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onEvolve, onRestart, onRevive, onToggleGodMode }) => {
  const { player, status, score, genePoints } = gameState;
  const [isWatchingAd, setIsWatchingAd] = useState(false);

  const handleAdReviveClick = () => {
    if (isWatchingAd) return;
    setIsWatchingAd(true);
    // Simulate Ad duration
    setTimeout(() => {
      setIsWatchingAd(false);
      if (onRevive) onRevive(true);
    }, 2000);
  };

  // -- HUD --
  if (status === GameStatus.PLAYING) {
    const nextXp = LEVEL_THRESHOLDS[player.level] || 999999;
    const progress = Math.min(100, (player.xp / nextXp) * 100);

    const boostRatio = player.boost.current / player.boost.max;
    let boostColor = 'bg-yellow-500';
    let boostText = '充能中';
    let boostTextColor = 'text-yellow-200';

    if (boostRatio >= 0.95) {
      boostColor = 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]';
      boostText = '就绪';
      boostTextColor = 'text-cyan-200';
    } else if (boostRatio < 0.2) {
      boostColor = 'bg-red-500';
      boostText = '耗尽';
      boostTextColor = 'text-red-300';
    }

    return (
      <div className="absolute inset-0 pointer-events-none p-4">
        {/* Top Left: Stats */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="bg-slate-900/50 backdrop-blur p-3 rounded-lg border border-slate-700 w-64">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-200 font-bold">等级 {player.level}</span>
              <span className="text-xs text-slate-400">{player.xp} / {nextXp} XP</span>
            </div>
            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-yellow-400 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <div className="mt-2 flex justify-between text-xs text-slate-300">
               <span>生命值</span>
               <span>{Math.ceil(player.health)}/{player.maxHealth}</span>
            </div>
             <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
              <div 
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
              ></div>
            </div>

            <div className="mt-2 flex justify-between text-xs items-center">
               <span className="text-slate-300">加速 (空格键)</span>
               <span className={`text-[10px] font-bold ${boostTextColor} animate-pulse`}>{boostText}</span>
            </div>
             <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-1 border border-slate-600">
              <div 
                className={`${boostColor} h-full transition-all duration-100`}
                style={{ width: `${boostRatio * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Top Right: Traits & Score */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-auto">
           {onToggleGodMode && !player.isGodMode && (
             <button 
               onClick={onToggleGodMode}
               className="bg-amber-600/80 hover:bg-amber-500 text-white px-3 py-1 rounded text-xs font-bold shadow-lg animate-pulse flex items-center gap-1"
             >
               <Crown size={12}/> 变身无敌巨兽
             </button>
           )}
           {player.isGodMode && (
             <div className="bg-amber-500 text-black px-3 py-1 rounded text-xs font-black shadow-lg">
                👑 上帝模式已开启
             </div>
           )}

           <div className="bg-slate-900/50 backdrop-blur px-4 py-2 rounded-lg border border-slate-700 text-white font-mono">
             分数: {Math.floor(score)}
           </div>
           <div className="flex gap-1 flex-wrap justify-end max-w-xs">
             {player.traits.map(t => (
               <span key={t} className="px-2 py-1 bg-indigo-600/80 text-xs rounded text-white font-bold shadow-sm">
                 {t}
               </span>
             ))}
           </div>
        </div>
        
        {/* Tutorial Hint */}
        {player.level === 1 && player.xp < 20 && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/50 text-sm animate-pulse flex flex-col items-center">
            <span>使用 鼠标/触摸 移动 • 吞噬比你小的鱼 (绿色)</span>
            <span className="text-yellow-400 text-xs mt-1">按住 空格键 加速 • 躲在岩石下避难</span>
          </div>
        )}
      </div>
    );
  }

  // -- MAIN MENU --
  if (status === GameStatus.MENU) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-50">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-center">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2">
            深海进化
          </h1>
          <p className="text-slate-400 mb-8">吞噬 • 进化 • 主宰</p>
          
          <div className="space-y-4">
            <button 
              onClick={onStart}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xl transition-colors shadow-lg shadow-blue-500/30"
            >
              开始进化
            </button>
            <div className="p-4 bg-slate-800 rounded-lg text-left text-sm text-slate-300">
               <p className="mb-2 font-bold text-slate-200">生存指南:</p>
               <ul className="list-disc pl-5 space-y-1">
                 <li>吃掉比你 <span className="text-green-400">小</span> 的生物。</li>
                 <li>远离比你 <span className="text-red-400">大</span> 的生物。</li>
                 <li>按住 <span className="text-yellow-400">空格键</span> 加速。</li>
                 <li>利用 <span className="text-slate-400">岩石/珊瑚</span> 躲避追击。</li>
               </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -- EVOLUTION MENU --
  if (status === GameStatus.EVOLVING) {
    type EvolutionOption = {
      id: string;
      title: string;
      desc: string;
      icon: React.ReactNode;
      color: string;
      trait: string;
      bonus: Partial<PlayerState['stats']>;
    };

    // Default options
    const options: EvolutionOption[] = [
      {
        id: 'bulk',
        title: "深海巨兽",
        desc: "大幅增加体型和生命值。",
        icon: <Shield size={32} />,
        color: 'blue',
        trait: '巨型化',
        bonus: { sizeMult: 1.3, defenseMult: 1.2 }
      },
      {
        id: 'speed',
        title: "流体身躯",
        desc: "显著提升移动速度。",
        icon: <Wind size={32} />,
        color: 'cyan',
        trait: '极速',
        bonus: { speedMult: 1.4 }
      }
    ];

    // Dynamic Option based on diet
    const { eatenHistory } = player;
    const poisonEaten = eatenHistory[CreatureType.POISON_FISH] || 0;
    const aggressiveEaten = (eatenHistory[CreatureType.SWORD_FISH] || 0) + (eatenHistory[CreatureType.NEEDLE_FISH] || 0);

    if (poisonEaten > 2) {
      options.push({
        id: 'poison',
        title: "毒素合成",
        desc: "免疫毒素 + 剧毒攻击。",
        icon: <Skull size={32} />,
        color: 'lime',
        trait: '毒血',
        bonus: { defenseMult: 1.1 }
      });
    } else if (aggressiveEaten > 3) {
      options.push({
        id: 'hunter',
        title: "猎手本能",
        desc: "视野范围提升 + 伤害提升。",
        icon: <Crosshair size={32} />,
        color: 'red',
        trait: '掠食者',
        bonus: { visionRadius: 1.5, speedMult: 1.1 }
      });
    } else {
      // Filler if no specific path
      options.push({
        id: 'hybrid',
        title: "混合强化",
        desc: "全属性均衡提升。",
        icon: <Zap size={32} />,
        color: 'purple',
        trait: '适应性',
        bonus: { speedMult: 1.15, sizeMult: 1.15, defenseMult: 1.15 }
      });
    }

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-50">
        <h2 className="text-4xl font-bold text-white mb-2">进化就绪</h2>
        <p className="text-slate-400 mb-10">选择你的进化路径</p>
        
        <div className="flex flex-col md:flex-row gap-6">
          {options.slice(0, 3).map((opt) => (
            <EvolutionCard 
              key={opt.id}
              title={opt.title}
              desc={opt.desc}
              icon={opt.icon}
              color={opt.color}
              onClick={() => onEvolve(opt.trait, opt.bonus)}
            />
          ))}
        </div>
      </div>
    );
  }

  // -- GAME OVER --
  if (status === GameStatus.GAME_OVER) {
    if (isWatchingAd) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-center">
             <div className="text-4xl animate-bounce mb-4">📺</div>
             <h2 className="text-2xl font-bold text-white mb-2">广告播放中...</h2>
             <p className="text-slate-400">正在获取神之力量...</p>
             <div className="w-64 h-2 bg-slate-800 rounded mt-4 overflow-hidden">
                <div className="h-full bg-yellow-500 animate-[width_2s_linear_forwards] w-0"></div>
             </div>
          </div>
        </div>
      );
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 backdrop-blur-md z-50">
        <div className="max-w-xl w-full p-8 bg-slate-900 border border-red-900 rounded-2xl shadow-2xl text-center">
          <h2 className="text-4xl font-black text-red-500 mb-2">被吞噬</h2>
          <p className="text-slate-300 mb-6">生存残酷，唯有适者生存。</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">最终等级</div>
              <div className="text-xl font-bold text-white">{player.level}</div>
            </div>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">得分</div>
              <div className="text-xl font-bold text-white">{Math.floor(score)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => onRevive && onRevive(false)}
              className="py-4 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg border border-slate-600 flex flex-col items-center justify-center gap-2 group"
            >
              <RefreshCw size={24} className="group-hover:-rotate-180 transition-transform duration-500"/>
              <span>普通复活</span>
              <span className="text-xs font-normal text-slate-400">从头开始 (Lv.1)</span>
            </button>

            <button 
              onClick={handleAdReviveClick}
              className="py-4 px-2 bg-gradient-to-br from-yellow-600 to-orange-700 hover:from-yellow-500 hover:to-orange-600 text-white font-bold rounded-lg border border-yellow-500/50 flex flex-col items-center justify-center gap-2 shadow-lg shadow-orange-900/50 group relative overflow-hidden"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
              
              <Play size={24} fill="white" className="group-hover:scale-110 transition-transform"/>
              <span>看广告复活</span>
              <span className="text-xs font-normal text-yellow-100">强力开局 (Lv.10 剑鱼)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UIOverlay;