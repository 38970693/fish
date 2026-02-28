
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
  onUpdateCosmetics?: (cosmetics: Cosmetics) => void;
  setGameStatus?: (status: GameStatus) => void;
  onExitShop?: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onRestart, setGameStatus, onUpdateCosmetics, onExitShop }) => {
  const { player, status, entities } = gameState;
  const opponent = entities.find(e => e.id !== 'player' && e.type === CreatureType.ORCA);

  if (status === GameStatus.MENU) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
        <div className="flex flex-col items-center gap-12 text-center">
            <div className="bg-slate-900/80 p-12 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-8">欢乐鱼塘</h1>
                
                <div className="flex flex-col gap-6">
                    <button onClick={() => onStart()} className="px-24 py-8 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-4xl rounded-full transition-all shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4">
                        <Play size={48} fill="white" /> 开始进化
                    </button>
                    
                    <div className="flex gap-4">
                        <button onClick={() => setGameStatus && setGameStatus(GameStatus.SHOP)} className="flex-1 py-6 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-2xl rounded-full transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4 border-b-4 border-pink-900">
                            <Palette size={32} /> 装扮房间
                        </button>
                        
                        <button onClick={() => onStartBattleTest && onStartBattleTest()} className="flex-1 py-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-2xl rounded-full transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4 border-b-4 border-red-900">
                            <Sword size={32} /> 战斗测试
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.BATTLE_TEST || status === GameStatus.PLAYING) {
    return (
      <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
        <div className="flex justify-between items-start">
            {/* 玩家血条 */}
            <div className="w-80 bg-slate-900/80 p-4 rounded-2xl border-2 border-cyan-500 shadow-2xl pointer-events-auto">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-cyan-400 font-black text-xl">玩家 ({player.config.name})</span>
                    <span className="text-white font-mono">{Math.max(0, Math.floor(player.health))} / {player.maxHealth}</span>
                </div>
                <div className="h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300" style={{ width: `${(player.health / player.maxHealth) * 100}%` }}></div>
                </div>
            </div>

            {status === GameStatus.BATTLE_TEST && opponent && (
                <div className="w-80 bg-slate-900/80 p-4 rounded-2xl border-2 border-red-500 shadow-2xl pointer-events-auto">
                    <div className="flex justify-between items-end mb-2 text-right">
                        <span className="text-white font-mono">{Math.max(0, Math.floor(opponent.health))} / {opponent.maxHealth}</span>
                        <span className="text-red-400 font-black text-xl">AI ({opponent.config.name})</span>
                    </div>
                    <div className="h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                        <div className="h-full bg-gradient-to-l from-red-600 to-orange-400 transition-all duration-300" style={{ width: `${(opponent.health / opponent.maxHealth) * 100}%` }}></div>
                    </div>
                </div>
            )}
        </div>

        <div className="flex flex-col items-end gap-4 pointer-events-auto">
            <button onClick={() => onRestart()} className="bg-slate-800/90 hover:bg-slate-700 text-white px-6 py-3 rounded-xl border border-slate-600 flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95">
                <RefreshCw size={20}/> 返回主界面
            </button>
        </div>
      </div>
    );
  }

  if (status === GameStatus.SHOP) {
    const isFromMenu = !player.weight || player.weight <= 5;
    
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-[100] backdrop-blur-md">
        <div className="bg-slate-900 p-8 rounded-[40px] border-4 border-pink-500 shadow-[0_0_50px_rgba(219,39,119,0.3)] w-[900px] max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-300">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-pink-600 rounded-2xl shadow-lg shadow-pink-900/20">
                    <Palette size={32} className="text-white" />
                </div>
                <div>
                    <h2 className="text-4xl font-black text-white tracking-tight">装扮房间</h2>
                    <p className="text-pink-400 font-bold text-sm uppercase tracking-widest">Cosmetic Studio</p>
                </div>
            </div>
            <button onClick={() => onExitShop && onExitShop()} className="text-slate-400 hover:text-white transition-all bg-slate-800 p-3 rounded-2xl hover:bg-red-600 hover:rotate-90">
              <X size={28} />
            </button>
          </div>
          
          <div className="flex-1 flex gap-10 overflow-hidden">
            {/* 左侧：预览区域 */}
            <div className="flex-1 bg-slate-950/50 rounded-[32px] border-2 border-slate-800 flex flex-col items-center justify-center relative overflow-hidden p-8 group">
               <div className="absolute inset-0 bg-gradient-to-b from-pink-500/5 to-transparent pointer-events-none"></div>
               <Sparkles size={64} className="text-pink-500/20 mb-6 group-hover:scale-110 transition-transform duration-500" />
               <h3 className="text-2xl font-black text-white mb-3">实时预览</h3>
               <p className="text-slate-400 leading-relaxed">
                 在这里调整外观，<br/>
                 <span className="text-pink-400 font-bold">点击下方按钮</span> 即可立即进入深海！
               </p>
               
               <div className="mt-12 p-4 bg-slate-900/80 rounded-2xl border border-slate-700 text-xs text-slate-500 font-mono">
                 PREVIEW MODE ACTIVE
               </div>
            </div>
            
            {/* 右侧：选项区 */}
            <div className="w-[400px] flex flex-col gap-8 overflow-y-auto pr-4 custom-scrollbar">
               
               {/* 皮肤颜色 */}
               <section>
                 <div className="text-slate-400 text-xs font-black mb-4 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-4 bg-cyan-500 rounded-full"></div>
                    皮肤颜色 / Skin Color
                 </div>
                 <div className="grid grid-cols-4 gap-3">
                   {['#fb923c', '#2563eb', '#166534', '#d946ef', '#fde047', '#b91c1c', '#e5e7eb', '#020617'].map(color => (
                     <button 
                       key={color} 
                       onClick={() => onUpdateCosmetics && onUpdateCosmetics({...player.cosmetics, skinColor: color})}
                       className={`aspect-square rounded-2xl border-4 transition-all ${player.cosmetics.skinColor === color ? 'border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.3)] z-10' : 'border-slate-800 hover:border-slate-600 hover:scale-105'}`}
                       style={{ backgroundColor: color }}
                     />
                   ))}
                 </div>
               </section>
               
               {/* 牙齿样式 */}
               <section>
                 <div className="text-slate-400 text-xs font-black mb-4 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-4 bg-red-500 rounded-full"></div>
                    牙齿样式 / Teeth Style
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   {['NORMAL', 'SHARP', 'VAMPIRE', 'GOLD', 'DIAMOND'].map(teeth => (
                     <button 
                       key={teeth}
                       onClick={() => onUpdateCosmetics && onUpdateCosmetics({...player.cosmetics, teeth: teeth as TeethType})}
                       className={`py-3 rounded-xl text-sm font-black transition-all ${player.cosmetics.teeth === teeth ? 'bg-pink-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                     >
                       {teeth}
                     </button>
                   ))}
                 </div>
               </section>

               {/* 眼睛样式 */}
               <section>
                 <div className="text-slate-400 text-xs font-black mb-4 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-4 bg-green-500 rounded-full"></div>
                    眼睛样式 / Eye Type
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   {['NORMAL', 'ANIME', 'MAD', 'DERP', 'CYBORG', 'LOVE'].map(eye => (
                     <button 
                       key={eye}
                       onClick={() => onUpdateCosmetics && onUpdateCosmetics({...player.cosmetics, eyeType: eye as EyeType})}
                       className={`py-3 rounded-xl text-sm font-black transition-all ${player.cosmetics.eyeType === eye ? 'bg-pink-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                     >
                       {eye}
                     </button>
                   ))}
                 </div>
               </section>
               
               {/* 配饰 */}
               <section>
                 <div className="text-slate-400 text-xs font-black mb-4 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-4 bg-yellow-500 rounded-full"></div>
                    头部配饰 / Accessory
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   {['NONE', 'CROWN', 'SUNGLASSES', 'GOLD_CHAIN', 'BOW_TIE', 'HALO'].map(acc => (
                     <button 
                       key={acc}
                       onClick={() => onUpdateCosmetics && onUpdateCosmetics({...player.cosmetics, accessory: acc as AccessoryType})}
                       className={`py-3 rounded-xl text-sm font-black transition-all ${player.cosmetics.accessory === acc ? 'bg-pink-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                     >
                       {acc}
                     </button>
                   ))}
                 </div>
               </section>
               
            </div>
          </div>
          
          <div className="mt-10 pt-8 border-t border-slate-800 flex justify-center">
             <button 
                onClick={() => onExitShop && onExitShop()} 
                className="group relative px-16 py-6 bg-pink-600 hover:bg-pink-500 text-white font-black text-3xl rounded-[32px] transition-all shadow-[0_20px_40px_rgba(219,39,119,0.4)] hover:shadow-[0_25px_50px_rgba(219,39,119,0.6)] hover:-translate-y-1 active:translate-y-1 flex items-center gap-4 overflow-hidden"
             >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <Check size={40} className="group-hover:scale-125 transition-transform" /> 
                <span>{isFromMenu ? '开启进化之旅' : '重返深海战场'}</span>
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.GAME_OVER) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/60 backdrop-blur-md z-50">
            <div className="bg-slate-900 p-12 rounded-3xl border-4 border-red-600 shadow-2xl text-center">
                <Skull size={100} className="text-red-500 mx-auto mb-6" />
                <h2 className="text-6xl font-black text-white mb-8">战斗失败</h2>
                <button onClick={() => onRestart()} className="px-16 py-6 bg-white text-red-600 font-black text-2xl rounded-full hover:bg-slate-200 transition-all">重试</button>
            </div>
        </div>
    );
  }

  return null;
};

export default UIOverlay;
