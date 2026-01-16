import React, { useState } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType } from '../types';
import { CREATURES } from '../constants';
import { Shield, Zap, Wind, Skull, Crosshair, Crown, Play, RefreshCw, AlertTriangle, Ban, Info, ChevronRight } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  onStart: (selectedType?: CreatureType) => void;
  onEvolve: (trait: string, statBonus: Partial<PlayerState['stats']>) => void;
  onRestart: () => void;
  onRevive?: (useAd: boolean) => void;
  onToggleGodMode?: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onEvolve, onRestart, onRevive, onToggleGodMode }) => {
  const { player, status, score, hazards } = gameState;
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [selectedStarter, setSelectedStarter] = useState<CreatureType>(CreatureType.CLOWN_FISH);

  const starters = [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.TURTLE];

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

            <div className="flex justify-between text-xs items-center mb-1">
               <span className="text-slate-300">加速 (空格键)</span>
               <span className={`text-[10px] font-bold ${boostTextColor} animate-pulse`}>{boostText}</span>
            </div>
             <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden border border-slate-600">
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
               <Crown size={12}/> 变身深海巨怪
             </button>
           )}
           {player.isGodMode && (
             <div className="bg-amber-500 text-black px-3 py-1 rounded text-xs font-black shadow-lg">
                👑 上帝模式已开启
             </div>
           )}

           <div className="flex gap-1 flex-wrap justify-end max-w-xs">
             {player.traits.map(t => (
               <span key={t} className="px-2 py-1 bg-indigo-600/80 text-xs rounded text-white font-bold shadow-sm">
                 {t}
               </span>
             ))}
           </div>
        </div>
        
        {/* Tutorial Hint */}
        {player.weight < 50 && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/50 text-sm animate-pulse flex flex-col items-center text-center">
            <span>咬大鱼的<span className="text-yellow-300 font-bold">尾巴</span>可以快速增重!</span>
            <span className="text-yellow-400 text-xs mt-1">但是小心! 大鱼可以一口吞掉你!</span>
            <span className="text-red-400 text-xs mt-1 font-bold">长按屏幕嘲讽 • 小心海鸟袭击!</span>
          </div>
        )}
      </div>
    );
  }

  // -- MAIN MENU --
  if (status === GameStatus.MENU) {
    const starterConfig = CREATURES[selectedStarter];

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm z-50">
        <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 p-8 items-center justify-center">
            
            {/* Left: Title & Info */}
            <div className="flex-1 text-center md:text-left">
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2 drop-shadow-lg">
                    海底世界
                </h1>
                <p className="text-slate-400 text-lg mb-8">自由进化，称霸无尽海域！</p>
                
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 text-left">
                    <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">生存法则</h3>
                     <ul className="space-y-3 text-slate-300">
                        <li className="flex items-start gap-2">
                            <span className="text-yellow-400 font-bold">●</span>
                            <span><b>大鱼吃小鱼</b>: 体型就是一切。</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-red-400 font-bold">●</span>
                            <span><b>进化</b>: 你的食谱决定你的进化路线。</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400 font-bold">●</span>
                            <span><b>技巧</b>: 攻击大鱼尾巴可掠夺重量。</span>
                        </li>
                     </ul>
                </div>
            </div>

            {/* Right: Character Selection */}
            <div className="flex-1 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                <h2 className="text-center text-white font-bold text-xl mb-6">选择你的初始鱼</h2>
                
                <div className="flex justify-center gap-4 mb-6">
                    {starters.map(type => {
                        const cfg = CREATURES[type];
                        const isSelected = selectedStarter === type;
                        return (
                            <button 
                                key={type}
                                onClick={() => setSelectedStarter(type)}
                                className={`relative w-20 h-20 rounded-xl flex items-center justify-center transition-all duration-300 border-2 ${isSelected ? 'border-cyan-400 bg-cyan-900/30 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}
                            >
                                <div 
                                    className="w-10 h-10 rounded-full shadow-lg"
                                    style={{ backgroundColor: cfg.color }}
                                ></div>
                                {isSelected && <div className="absolute -bottom-2 bg-cyan-400 w-2 h-2 rotate-45"></div>}
                            </button>
                        )
                    })}
                </div>

                <div className="bg-slate-800 rounded-lg p-4 mb-6 min-h-[140px] border border-slate-700 transition-all">
                    <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                        {starterConfig.name}
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-normal">Tier 1</span>
                    </h3>
                    <p className="text-slate-400 text-sm mb-3">{starterConfig.description}</p>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-900/50 p-2 rounded flex justify-between">
                            <span className="text-slate-500">速度</span>
                            <span className="text-cyan-300">{'★'.repeat(starterConfig.speed * 2)}</span>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded flex justify-between">
                            <span className="text-slate-500">生命</span>
                            <span className="text-green-300">{'★'.repeat(Math.ceil(starterConfig.health / 20))}</span>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={() => onStart(selectedStarter)}
                    className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg text-xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-2 group"
                >
                    开始游戏 <ChevronRight className="group-hover:translate-x-1 transition-transform"/>
                </button>
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
    
    const currentRevives = player.reviveCount ?? 0;
    const canRevive = currentRevives < 1;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 backdrop-blur-md z-50">
        <div className="max-w-xl w-full p-8 bg-slate-900 border border-red-900 rounded-2xl shadow-2xl text-center">
          <h2 className="text-4xl font-black text-red-500 mb-2">游戏结束</h2>
          <p className="text-slate-300 mb-6">你被海鸟抓走了 (或者被吃光了)...</p>
          
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