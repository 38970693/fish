
import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType, Cosmetics, TeethType, PatternType, ScaleType, Entity, AccessoryType, TailType, BodyType, EyeType, EyebrowType, TrailType, Treasure } from '../types';
import { CREATURES, GAME_MECHANICS, BIOME_CONFIGS, WORLD_SIZE, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG, SQUAD_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { SCHOOL_DATA, type SchoolId } from '../data/schools';
import { SKILL_DATA } from '../data/skills';
import { drawCuteFish } from './GameCanvas';
import { Shield, Zap, Wind, Skull, Crown, Play, RefreshCw, AlertTriangle, ChevronRight, Bot, Target, Users, Shuffle, Fish, Utensils, MapPin, ShoppingBag, X, Check, Palette, Gem, Box, Sparkles, Frown, BookOpen, Clock, Gift, Star, Eye, Diamond, Sword, Heart, Volume2, VolumeX, Repeat } from 'lucide-react';
import MiniMap from './MiniMap';
import CosmeticsPanel from './CosmeticsPanel';

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

/**
 * 流派技能槽（P1-3）。
 * 流派由当前生物决定，技能按等级逐档解锁（Lv3 / 6 / 9 / 12），Q 键释放。
 * 没到等级时明确写出「Lv.X 解锁」，避免玩家按了没反应却不知道为什么。
 */
const SchoolSkillBar: React.FC<{ player: PlayerState }> = ({ player }) => {
  const school = player.config.school as SchoolId | undefined;
  if (!school || !SCHOOL_DATA[school]) return null;

  const info = SCHOOL_DATA[school];
  const skillId = player.schoolSkillId;
  const skill = skillId ? SKILL_DATA[skillId as keyof typeof SKILL_DATA] : undefined;
  const ready = player.schoolSkillCooldown <= 0;
  const nextUnlockLevel = Math.floor(player.level / 3) * 3 + 3;

  return (
    <div className="mt-2 pt-2 border-t border-slate-700">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold" style={{ color: info.color }}>
          {info.name}
        </span>
        {skill ? (
          <span className="text-slate-200">{skill.name}</span>
        ) : (
          <span className="text-slate-500">Lv.{nextUnlockLevel} 解锁</span>
        )}
      </div>
      {skill && (
        <>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 border border-slate-700">
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${ready ? 100 : 100 - (player.schoolSkillCooldown / 300) * 100}%`,
                backgroundColor: info.color,
              }}
            />
          </div>
          <div className="text-right text-xs mt-0.5">
            <span className={ready ? 'text-green-400' : 'text-slate-500'}>
              {ready ? '就绪 (Q)' : `冷却 ${Math.ceil(player.schoolSkillCooldown / 60)}s`}
            </span>
          </div>
        </>
      )}
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
  /** 无敌模式开关（G 键 / 调试用） */
  onToggleGodMode?: () => void;
  onUpdateCosmetics?: (cosmetics: Cosmetics) => void;
  setGameStatus?: (status: GameStatus) => void;
  /** 战队：主动切换成员（提示词 #234）。没成员时按钮置灰 */
  onSwitchSquad?: () => void;
  /** P1-4 音效开关 */
  muted?: boolean;
  onToggleMute?: () => void;
};

/**
 * 游戏规则弹窗（待办②）。文案全部按真实机制写，不写没做的功能。
 * 放在主菜单 —— 对局中不开：世界不会因为看规则暂停，弹窗一开鱼就在裸奔。
 */
const RulesPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> =
    ({ icon, title, children }) => (
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 text-cyan-400">{icon}</div>
        <div>
          <h3 className="text-cyan-300 font-bold mb-1">{title}</h3>
          <div className="text-slate-300 text-sm leading-relaxed space-y-1">{children}</div>
        </div>
      </div>
    );

  const Key = ({ children }: { children: React.ReactNode }) => (
    <kbd className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-slate-700 border border-slate-500 text-white text-xs font-bold align-middle">
      {children}
    </kbd>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-600 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-slate-700">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">游戏规则</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="关闭规则">
            <X size={26} />
          </button>
        </div>

        <div className="px-8 py-5 overflow-y-auto space-y-5">
          <Section icon={<Fish size={20} />} title="目标">
            <p>吃比自己小的鱼成长，攒进化点数进化，最终成为海洋霸主。被大鱼吃掉会结算，能用复活机会续命。</p>
          </Section>

          <Section icon={<Zap size={20} />} title="操作">
            <p><Key>鼠标</Key>游动方向（鱼永远朝鼠标游）· <Key>Space</Key>/<Key>左键</Key>加速冲刺（耗体力）</p>
            <p><Key>Q</Key>流派技能（Lv3/Lv6/Lv9/Lv12 逐档解锁）· <Key>右键</Key>本体技能</p>
            <p><Key>E</Key>交互（进商场）· <Key>R</Key>切换战队成员 · <Key>G</Key>无敌模式（调试用）</p>
          </Section>

          <Section icon={<Sword size={20} />} title="战斗">
            <p>背刺：绕到大鱼身后偷袭，吞噬概率大增；但大鱼也会反制，别贪。</p>
            <p>同等级比体型，等级压制加成吞噬概率。</p>
          </Section>

          <Section icon={<Users size={20} />} title={`战队（上限 ${SQUAD_CONFIG.MAX_SIZE}）`}>
            <p>吃掉的鱼（浮游生物除外）会倒戈入队，护卫跟随，自己人不打自己人。</p>
            <p><Key>R</Key>灵魂附身下一位成员：身体和位置对调，<b className="text-cyan-300">等级/体重/进化点数都跟着灵魂走</b>，放心换。</p>
            <p>本体阵亡时自动夺舍<b className="text-cyan-300">体型最大</b>的小弟满血续命；队里没人了才结算。</p>
          </Section>

          <Section icon={<Sparkles size={20} />} title="进化">
            <p>进化点数攒够当前阶段的阈值，弹出三选一进化方向，世界暂停随便想。</p>
          </Section>

          <Section icon={<ShoppingBag size={20} />} title="建筑与海域">
            <p>商场：换装（进圈后按 <Key>E</Key>）· 医院：回血 · 龙王庙：随机祝福（技能+1 或护盾）</p>
            <p>阳光浅滩：安全，小型鱼速度+20% · 五彩珊瑚：伪装/伏击技能冷却减半，巨型鱼转向变慢</p>
            <p>剧毒沼泽：持续腐蚀（硬壳体质免疫）· 深渊海沟：视野受限，发光/感知型攻击+20%</p>
          </Section>

          <Section icon={<Gift size={20} />} title="宝藏与道具">
            <p>宝藏定时刷新，出现前 3 秒有预警倒计时；漂流瓶、贝壳等道具各有效果。</p>
          </Section>
        </div>

        <div className="px-8 py-4 border-t border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-full transition-colors">
            明白了，开鱼！
          </button>
        </div>
      </div>
    </div>
  );
};

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onEvolve, onRestart, onRevive, onToggleGodMode, onUpdateCosmetics, setGameStatus, onSwitchSquad, muted, onToggleMute }) => {
  const { player, status, entities } = gameState;
  const opponent = entities.find(e => e.id !== 'player' && e.type === CreatureType.ORCA);
  // 战队成员 = ownerId 指向玩家的活体（与 systems/squad.ts 的判定保持一致）
  const squadMembers = entities.filter(e => e.ownerId === 'player' && e.health > 0);
  const [selectedStarter, setSelectedStarter] = useState<CreatureType>(CreatureType.CLOWN_FISH);
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showRules, setShowRules] = useState(false);

  if (status === GameStatus.MENU) {
    const startOptions = [
      CreatureType.CLOWN_FISH,   // t1 · 逃跑
      CreatureType.BLUE_TANG,    // t1 · 闪避
      CreatureType.JELLYFISH,    // t1 · 电击
      CreatureType.PUFFER_FISH,  // t2 · 膨胀
      CreatureType.CRAB,         // t2 · 重击
      CreatureType.SQUID,        // t2 · 喷墨
      CreatureType.SEAHORSE,     // t2 · 伪装
      CreatureType.STINGRAY,     // t3 · 毒刺
      CreatureType.SWORD_FISH,   // t3 · 穿刺
      CreatureType.HAMMERHEAD,   // t3 · 声呐
      CreatureType.ANGLER_FISH,  // t3 · 诱惑（灯笼鱼）
    ];
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
                                    <span className="text-slate-400 text-xs">{config.skillName ? `技能: ${config.skillName}` : '无技能'}</span>
                                </button>
                            );
                        })}
                    </div>
                    
                    <button onClick={() => onStart(selectedStarter)} className="px-24 py-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-4xl rounded-full transition-all shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-4">
                        <Play size={48} fill="white" /> 开始游戏
                    </button>

                    <button onClick={() => setShowCosmetics(true)} className="px-10 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl rounded-full border border-slate-600 hover:border-cyan-400 transition-all flex items-center justify-center gap-3 mx-auto">
                        <Palette size={24} /> 装扮我的鱼
                    </button>

                    <button onClick={() => setShowRules(true)} className="px-10 py-3 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-lg rounded-full border border-slate-700 hover:border-cyan-400 transition-all flex items-center justify-center gap-3 mx-auto">
                        <BookOpen size={20} /> 游戏规则
                    </button>
                </div>
            </div>
        </div>

        {showCosmetics && (
            <CosmeticsPanel
                cosmetics={player.cosmetics}
                onChange={(cos) => onUpdateCosmetics?.(cos)}
                onClose={() => setShowCosmetics(false)}
                mode="player"
            />
        )}

        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
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
                {/* P1-3 流派技能槽（Q 键） */}
                <SchoolSkillBar player={player} />
                <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-orange-400">背后偷袭伤害: +{Math.round((AMBUSH_CONFIG.BACK_DAMAGE_MULT - 1) * 100)}%</span>
                    <span className="text-slate-500">检测范围: {AMBUSH_CONFIG.DETECTION_RANGE_MAX}px</span>
                </div>
                {player.invulnerableTimer > 0 && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-cyan-300 font-bold text-sm animate-pulse">
                        <Shield size={16} /> {player.reviveCount > 0 ? '复活保护' : '新手保护'} · {Math.ceil(player.invulnerableTimer / 60)}s
                    </div>
                )}
                {player.isGodMode && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-yellow-300 font-bold text-sm">
                        <Crown size={16} /> 无敌模式 · 按 G 关闭
                    </div>
                )}
                {/* 战队面板（提示词 #70 / #234）：吃掉的鱼会倒戈入队，死了能夺舍续命 */}
                <div className="mt-2 pt-2 border-t border-slate-700/60">
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-cyan-300 font-bold text-sm">
                            <Users size={15} /> 战队
                            <span className="text-white">{squadMembers.length}</span>
                            <span className="text-slate-500 text-xs">/ {SQUAD_CONFIG.MAX_SIZE}</span>
                        </span>
                        <button
                            onClick={() => onSwitchSquad?.()}
                            disabled={squadMembers.length === 0}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
                            title="灵魂附身到下一条小弟身上（原身体变成小弟）"
                        >
                            <Repeat size={13} /> 切换 (R)
                        </button>
                    </div>
                    {squadMembers.length > 0 && (
                        <div className="mt-1 text-[11px] text-slate-500 text-center">
                            阵亡可夺舍体型最大的成员续命
                        </div>
                    )}
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

        <div className="pointer-events-auto flex items-center gap-3">
            <button onClick={() => onRestart()} className="bg-slate-800/80 hover:bg-slate-700 text-white px-6 py-3 rounded-xl border border-slate-600 flex items-center gap-2 transition-all">
                <RefreshCw size={20}/> 返回主界面
            </button>
            {/* P1-4 音效开关 */}
            <button
                onClick={() => onToggleMute?.()}
                title={muted ? '开启音效' : '关闭音效'}
                className="bg-slate-800/80 hover:bg-slate-700 text-white px-4 py-3 rounded-xl border border-slate-600 flex items-center gap-2 transition-all"
            >
                {muted ? <VolumeX size={20} className="text-slate-500" /> : <Volume2 size={20} className="text-cyan-400" />}
            </button>
        </div>

        {/* 小地图 */}
        <MiniMap gameState={gameState} />
      </div>
    );
  }

  /* 深海商场：游进商场建筑触发，世界暂停，专心换装 */
  if (status === GameStatus.SHOP) {
    return (
      <CosmeticsPanel
        cosmetics={player.cosmetics}
        onChange={(cos) => onUpdateCosmetics?.(cos)}
        onClose={() => setGameStatus?.(GameStatus.PLAYING)}
        mode="player"
      />
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
                <h2 className="text-6xl font-black text-white mb-4">战斗失败</h2>
                <p className="text-slate-300 mb-8">
                    体重 <span className="text-cyan-400 font-bold">{Math.floor(player.weight)}</span>
                    · 得分 <span className="text-yellow-400 font-bold">{gameState.score}</span>
                    · 已复活 <span className="text-white font-bold">{player.reviveCount}</span> 次
                </p>
                <div className="flex gap-6 justify-center">
                    <button
                        onClick={() => onRevive?.(false)}
                        className="px-12 py-5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-2xl rounded-full hover:scale-105 transition-all flex items-center gap-3"
                    >
                        <Heart size={26} fill="white" /> 复活
                    </button>
                    <button onClick={() => onRestart()} className="px-12 py-5 bg-white text-red-600 font-black text-2xl rounded-full hover:bg-slate-200 transition-all">重试</button>
                </div>
            </div>
        </div>
    );
  }

  if (status === GameStatus.VICTORY) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-950/60 backdrop-blur-md z-50">
            <div className="bg-slate-900 p-12 rounded-3xl border-4 border-amber-400 shadow-2xl text-center max-w-xl">
                <Crown size={110} className="text-amber-400 mx-auto mb-6" />
                <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-500 mb-4">称霸鱼塘！</h2>
                <p className="text-slate-200 text-xl mb-2">你击败了深海霸主</p>
                <p className="text-slate-400 mb-8">
                    最终体重 <span className="text-cyan-400 font-bold">{Math.floor(player.weight)}</span>
                    · 得分 <span className="text-yellow-400 font-bold">{gameState.score}</span>
                    · 存活 <span className="text-white font-bold">{Math.floor(gameState.time / 60)}s</span>
                </p>
                <button onClick={() => onRestart()} className="px-16 py-6 bg-white text-amber-600 font-black text-2xl rounded-full hover:bg-slate-200 transition-all">再来一局</button>
            </div>
        </div>
    );
  }

  return null;
};

export default UIOverlay;
