
import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType, Cosmetics, TeethType, PatternType, ScaleType, Entity, AccessoryType, TailType, BodyType, EyeType, EyebrowType, TrailType, Treasure } from '../types';
import { CREATURES, GAME_MECHANICS, BIOME_CONFIGS, WORLD_SIZE, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { drawCuteFish } from './GameCanvas';
import { Shield, Zap, Wind, Skull, Crown, Play, RefreshCw, AlertTriangle, ChevronRight, Bot, Target, Users, Shuffle, Fish, Utensils, MapPin, ShoppingBag, X, Check, Palette, Gem, Box, Sparkles, Frown, BookOpen, Clock, Gift, Star, Eye, Diamond, Sword } from 'lucide-react';
import MiniMap from './MiniMap';

// 宝物倒计时组件
interface TreasureCountdownProps {
  gameState: GameState;
}

const TreasureCountdown: React.FC<TreasureCountdownProps> = ({ gameState }) => {
  const [countdown, setCountdown] = useState<number>(60);
  const [hasUpcomingTreasure, setHasUpcomingTreasure] = useState<boolean>(false);

  useEffect(() => {
    // 计算距离下一个宝藏的倒计时
    const timeSinceLastSpawn = gameState.time % TREASURE_CONFIG.SPAWN_INTERVAL;
    const secondsUntilTreasure = Math.ceil((TREASURE_CONFIG.SPAWN_INTERVAL - timeSinceLastSpawn) / 60);

    setCountdown(secondsUntilTreasure > 0 ? secondsUntilTreasure : 60);

    // 检查是否有即将出现的宝藏（3秒预告）
    const hasWarning = gameState.treasures.some(t => t.status === 'WARNING');
    setHasUpcomingTreasure(hasWarning);
  }, [gameState.time, gameState.treasures]);

  // 计算进度条百分比
  const progressPercent = ((TREASURE_CONFIG.SPAWN_INTERVAL - countdown * 60) / TREASURE_CONFIG.SPAWN_INTERVAL) * 100;

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40">
      <div className={`
        bg-slate-900/90 px-6 py-3 rounded-2xl border-2 shadow-xl backdrop-blur-sm
        ${hasUpcomingTreasure ? 'border-yellow-400 animate-pulse' : 'border-cyan-500'}
      `}>
        <div className="flex items-center gap-4">
          {/* 宝贝图标 */}
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center
            ${hasUpcomingTreasure ? 'bg-yellow-400 animate-bounce' : 'bg-cyan-600'}
          `}>
            <Gift size={24} className={hasUpcomingTreasure ? 'text-slate-900' : 'text-white'} />
          </div>

          {/* 倒计时文字 */}
          <div className="flex flex-col">
            <span className={`
              font-bold text-lg
              ${hasUpcomingTreasure ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}
            `}>
              {hasUpcomingTreasure ? '宝贝出现!' : '宝贝倒计时'}
            </span>
            <span className="text-2xl font-black text-white">
              {countdown}s
            </span>
          </div>

          {/* 进度条 */}
          <div className="w-32 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div
              className={`
                h-full transition-all duration-1000 rounded-full
                ${hasUpcomingTreasure ? 'bg-yellow-400' : 'bg-gradient-to-r from-cyan-600 to-blue-400'}
              `}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// 宝藏类型对应的图标和颜色
const getTreasureIcon = (type: Treasure['type'], status: Treasure['status']) => {
  const isWarning = status === 'WARNING';
  switch (type) {
    case 'FEAST':
      return { icon: <Utensils size={20} />, color: '#fcd34d', label: '盛宴' };
    case 'CHEST':
      return { icon: <Box size={20} />, color: '#f59e0b', label: '宝箱' };
    case 'GEM':
      return { icon: <Gem size={20} />, color: '#a855f7', label: '宝石' };
    case 'FOOD':
      return { icon: <Star size={20} />, color: '#10b981', label: '食物' };
    default:
      return { icon: <Gift size={20} />, color: '#6366f1', label: '宝贝' };
  }
};

// 宝藏提示组件（用于小地图上方显示即将出现的宝藏位置提示）
const TreasureAlert: React.FC<{ treasures: Treasure[] }> = ({ treasures }) => {
  const warnings = treasures.filter(t => t.status === 'WARNING');

  if (warnings.length === 0) return null;

  return (
    <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-40">
      {warnings.map((treasure, index) => {
        const { icon, color, label } = getTreasureIcon(treasure.type, treasure.status);
        return (
          <div
            key={treasure.id}
            className="bg-slate-900/90 px-4 py-2 rounded-xl border-2 border-yellow-400 shadow-xl animate-bounce"
            style={{
              animationDelay: `${index * 0.2}s`,
              borderColor: color
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color }}>{icon}</span>
              <span className="text-yellow-400 font-bold">
                {label}即将出现！
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface UIOverlayProps {
  gameState: GameState;
  onStart: (selectedType?: CreatureType) => void;
  onStartBattleTest?: () => void;
  onEvolve: (type: CreatureType) => void;
  onRestart: () => void;
  onRevive?: (useAd: boolean) => void;
  onToggleGodMode?: () => void;
  onToggleAutoMode?: () => void;
  onSwitchSquad?: () => void;
  onDigest?: () => void;
  onUpdateCosmetics?: (cosmetics: Cosmetics) => void;
  setGameStatus?: (status: GameStatus) => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onEvolve, onRestart, setGameStatus }) => {
  const { player, status, entities } = gameState;
  const opponent = entities.find(e => e.id !== 'player' && e.type === CreatureType.ORCA);
  const [selectedStarter, setSelectedStarter] = useState<CreatureType>(CreatureType.CLOWN_FISH);

  if (status === GameStatus.MENU) {
    const startOptions = [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.PUFFER_FISH, CreatureType.CRAB, CreatureType.JELLYFISH];
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
        <div className="flex flex-col items-center gap-12 text-center">
            <div className="bg-slate-900/80 p-12 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-8">欢乐鱼塘</h1>
                
                <div className="flex flex-col gap-6">
                    <h2 className="text-2xl text-white font-bold mb-4">选择你的初始鱼类</h2>
                    <div className="flex gap-4 justify-center mb-8 flex-wrap max-w-2xl">
                        {startOptions.map(type => {
                            const config = CREATURES[type];
                            const isSelected = selectedStarter === type;
                            return (
                                <button 
                                    key={type} 
                                    onClick={() => setSelectedStarter(type)} 
                                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${isSelected ? 'bg-cyan-900 border-cyan-400 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'bg-slate-800 border-slate-700 hover:border-cyan-400 hover:bg-slate-700'}`}
                                >
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: config.color }}>
                                        <Fish size={32} color="white" />
                                    </div>
                                    <span className="text-white font-bold">{config.name}</span>
                                </button>
                            );
                        })}
                    </div>
                    
                    <button onClick={() => onStart(selectedStarter)} className="px-24 py-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-4xl rounded-full transition-all shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4">
                        <Play size={48} fill="white" /> 开始游戏
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
        {/* 宝物倒计时显示 */}
        <TreasureCountdown gameState={gameState} />

        {/* 宝藏预警提示 */}
        <TreasureAlert treasures={gameState.treasures} />

        <div className="flex justify-between items-start">
            {/* 玩家血条 */}
            <div className="w-80 bg-slate-900/80 p-4 rounded-2xl border-2 border-cyan-500 shadow-2xl pointer-events-auto">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-cyan-400 font-black text-xl">玩家 ({player.config.name}) Lv.{player.level}</span>
                    <span className="text-purple-400 font-bold ml-4">进化点数: {Math.floor(player.evolutionPoints)}</span>
                    <span className="text-white font-mono ml-auto">{Math.max(0, Math.floor(player.health))} / {player.maxHealth}</span>
                </div>
                <div className="h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700 mb-2">
                    <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300" style={{ width: `${(player.health / player.maxHealth) * 100}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="text-yellow-400 font-bold">技能: {player.config.skillName || '无'} (系统Lv.{player.skillLevel})</span>
                    {player.level < 3 ? (
                        <span className="text-red-400">未解锁 (需鱼群Lv.3)</span>
                    ) : (
                        <span className={player.skillCooldown <= 0 ? "text-green-400" : "text-slate-400"}>
                            {player.skillCooldown <= 0 ? '就绪 (右键)' : `冷却中 (${Math.ceil(player.skillCooldown / 60)}s)`}
                        </span>
                    )}
                </div>
                <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-orange-400">背后偷袭伤害: +{Math.round((AMBUSH_CONFIG.BACK_DAMAGE_MULT - 1) * 100)}%</span>
                    <span className="text-slate-500">检测范围: {AMBUSH_CONFIG.DETECTION_RANGE_MAX}px</span>
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

        {/* 小地图 */}
        <MiniMap gameState={gameState} />
      </div>
    );
  }

  if (status === GameStatus.EVOLVING) {
      const nextTier = player.config.tier + 1;
      let options = Object.values(CREATURES).filter(c => c.tier === nextTier);

      if (options.length > 3) {
          const biomeCounts: Record<string, number> = {};
          Object.entries(player.eatenHistory || {}).forEach(([type, count]) => {
              const biome = CREATURES[type as CreatureType]?.nativeBiome;
              if (biome) biomeCounts[biome] = (biomeCounts[biome] || 0) + (count as number);
          });
          
          const sortedBiomes = Object.keys(biomeCounts).sort((a, b) => biomeCounts[b] - biomeCounts[a]);
          const favoriteBiome = sortedBiomes[0] || player.config.nativeBiome;

          let selectedOptions: any[] = [];
          const getOptionByBiome = (biome: string, exclude: any[]) => options.find(o => o.nativeBiome === biome && !exclude.includes(o));
          
          let favOpt = getOptionByBiome(favoriteBiome, selectedOptions);
          if (favOpt) selectedOptions.push(favOpt);
          
          let currentBiomeOpt = getOptionByBiome(player.currentBiome, selectedOptions);
          if (currentBiomeOpt) selectedOptions.push(currentBiomeOpt);
          
          const remainingOptions = options.filter(o => !selectedOptions.includes(o)).sort(() => Math.random() - 0.5);
          selectedOptions = [...selectedOptions, ...remainingOptions].slice(0, 3);
          
          options = selectedOptions;
      }

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50">
            <div className="bg-slate-900 p-8 rounded-3xl border border-cyan-500 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-8 text-center">选择进化方向</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {options.map(opt => (
                        <button 
                            key={opt.type}
                            onClick={() => onEvolve(opt.type as CreatureType)}
                            className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-cyan-400 hover:bg-slate-700 transition-all text-left flex flex-col gap-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: opt.color }}>
                                    <Fish size={32} color="white" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{opt.name}</h3>
                                    <span className="text-cyan-400 text-sm font-bold">{opt.skillName || '无技能'}</span>
                                </div>
                            </div>
                            <p className="text-slate-400 text-sm h-10">{opt.description || '神秘的海洋生物'}</p>
                            {opt.skillDescription && (
                                <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 mt-auto">
                                    <p className="text-yellow-400 text-xs font-bold mb-1">右键技能: {opt.skillName}</p>
                                    <p className="text-slate-300 text-xs">{opt.skillDescription}</p>
                                </div>
                            )}
                        </button>
                    ))}
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
