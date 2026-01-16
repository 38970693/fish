import React, { useState } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType } from '../types';
import { LEVEL_THRESHOLDS } from '../constants';
import { Shield, Zap, Wind, Skull, Crosshair, Crown, Play, RefreshCw, AlertTriangle, Ban } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  onStart: () => void;
  onEvolve: (trait: string, statBonus: Partial<PlayerState['stats']>) => void;
  onRestart: () => void;
  onRevive?: (useAd: boolean) => void;
  onToggleGodMode?: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onEvolve, onRestart, onRevive, onToggleGodMode }) => {
  const { player, status, score, genePoints, hazards } = gameState;
  const [isWatchingAd, setIsWatchingAd] = useState(false);

  const handleAdReviveClick = () => {
    if (isWatchingAd) return;
    setIsWatchingAd(true);
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

    const hasActiveHazards = hazards.some(h => h.stage !== 'COOLDOWN');

    return (
      <div className="absolute inset-0 pointer-events-none p-4">
        {/* Active Hazard Warning */}
        {hasActiveHazards && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 animate-bounce">
              <div className="bg-red-500/90 text-white px-6 py-2 rounded-full font-black text-xl border-2 border-yellow-400 shadow-xl flex items-center gap-2">
                 <AlertTriangle size={24} className="animate-pulse text-yellow-300" />
                 海鸟袭击! 快变大!
              </div>
           </div>
        )}

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
               <span>体型 (Max: 400)</span>
               <span>{Math.floor(player.radius)}</span>
            </div>
             <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
              {/* Dynamic color for radius health */}
              <div 
                className={`h-full transition-all duration-300 ${player.radius < 10 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, (player.radius / 100) * 100)}%` }}
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
             分数: {Math.floor(player.xp)}
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
        {player.level === 1 && player.xp < 50 && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/50 text-sm animate-pulse flex flex-col items-center text-center">
            <span>咬大鱼的<span className="text-yellow-300 font-bold">尾巴</span>可以偷取体型!</span>
            <span className="text-yellow-400 text-xs mt-1">但是小心! 大鱼可以一口吞掉你!</span>
            <span className="text-red-400 text-xs mt-1 font-bold">长按屏幕嘲讽 • 小心海鸟袭击!</span>
          </div>
        )}
      </div>
    );
  }

  // -- MAIN MENU --
  if (status === GameStatus.MENU) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-50">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-pink-500 rounded-2xl shadow-2xl text-center">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-yellow-400 mb-2 drop-shadow-lg">
            欢乐鱼塘
          </h1>
          <p className="text-slate-400 mb-8">别被吃光了身体！</p>
          
          <div className="space-y-4">
            <button 
              onClick={onStart}
              className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg text-xl transition-colors shadow-lg shadow-pink-500/30"
            >
              开始捣乱
            </button>
            <div className="p-4 bg-slate-800 rounded-lg text-left text-sm text-slate-300 border border-slate-700">
               <p className="mb-2 font-bold text-slate-200">新规则:</p>
               <ul className="list-disc pl-5 space-y-1">
                 <li><span className="text-green-400">吞噬</span>: 大鱼可以<span className="text-yellow-300 font-bold">一口吞掉</span>小鱼!</li>
                 <li><span className="text-blue-400">偷袭</span>: 小鱼咬大鱼的<span className="text-yellow-300 font-bold">尾巴</span>可以掠夺大量体型!</li>
                 <li><span className="text-red-400">海鸟</span>: 保持移动，不要在阴影里停留!</li>
               </ul>
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
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
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
    
    // Fix: Handle undefined (legacy state) gracefully
    const currentRevives = player.reviveCount ?? 0;
    const canRevive = currentRevives < 1;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 backdrop-blur-md z-50">
        <div className="max-w-xl w-full p-8 bg-slate-900 border border-red-900 rounded-2xl shadow-2xl text-center">
          <h2 className="text-4xl font-black text-red-500 mb-2">游戏结束</h2>
          <p className="text-slate-300 mb-6">你被海鸟抓走了 (或者被吃光了)...</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">等级</div>
              <div className="text-xl font-bold text-white">{player.level}</div>
            </div>
            <div className="bg-slate-800 p-3 rounded">
              <div className="text-xs text-slate-400">分数</div>
              <div className="text-xl font-bold text-white">{Math.floor(score)}</div>
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
                复活 (看广告)
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