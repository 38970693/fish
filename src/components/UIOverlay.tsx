
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

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onRestart, setGameStatus }) => {
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
                    
                    <button onClick={() => onStartBattleTest && onStartBattleTest()} className="px-16 py-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-2xl rounded-full transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4 border-b-4 border-red-900">
                        <Sword size={32} /> 战斗测试
                    </button>
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

        <div className="pointer-events-auto">
            <button onClick={() => onRestart()} className="bg-slate-800/80 hover:bg-slate-700 text-white px-6 py-3 rounded-xl border border-slate-600 flex items-center gap-2 transition-all">
                <RefreshCw size={20}/> 返回主界面
            </button>
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
