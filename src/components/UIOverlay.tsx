
import React, { useState, useEffect, useRef } from 'react';
import { GameState, GameStatus, PlayerState, CreatureType, Cosmetics, TeethType, PatternType, ScaleType, Entity, AccessoryType, TailType, BodyType, EyeType, EyebrowType, TrailType, Treasure } from '../types';
import { CREATURES, GAME_MECHANICS, BIOME_CONFIGS, WORLD_SIZE, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG, COMBAT_CONFIG, SQUAD_CONFIG, EVOLVE_OPTION_COUNT, SQUAD_COMMAND_LIST, getSquadCommandConfig, SQUAD_ROLE_CONFIG, getSquadRoleConfig, type SquadCommandId } from '../constants';
import { getMapBoundaryRadius, gameEvents, isConcealed, peekNextSwitchTarget } from '../gameEngine';
import { getAchievementView, getUnlockedCount, type AchievementView } from '../systems/achievements';
import { getLeaderboard, getLastRunRank, clearLeaderboard, type LeaderboardEntry } from '../systems/leaderboard';
import { SCHOOL_DATA, type SchoolId } from '../data/schools';
import { POND_LIST, DEFAULT_POND, getPond, type PondId } from '../data/ponds';
import { getPondSpecialties } from '../data/pondEvents';
import { SKILL_DATA } from '../data/skills';
import { Shield, Zap, Wind, Skull, Crown, Play, RefreshCw, AlertTriangle, ChevronRight, Bot, Target, Users, Shuffle, Fish, Utensils, MapPin, ShoppingBag, X, Check, Palette, Gem, Box, Sparkles, Frown, BookOpen, Clock, Gift, Star, Eye, Diamond, Sword, Heart, Volume2, VolumeX, Repeat, Trophy } from 'lucide-react';
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
  /** 战队指令（FQ-05 §6.2）：集火 / 护卫 / 撤退。目标由系统挑，UI 不做决策 */
  onSquadCommand?: (command: SquadCommandId) => void;
  /** 指定附身：点某个队员头像，只附身到它（找不到就失败，不换错身体） */
  onPossessMember?: (memberId: string) => void;
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
            <p>背刺：绕到鱼身后偷袭，吞噬概率大增；等级比你高的鱼杀不死（只能咬到残血），大鱼也会反制，别贪。</p>
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

          <Section icon={<MapPin size={20} />} title="鱼塘（开局选）">
            {POND_LIST.map(({ id, config }) => (
              <p key={id}>
                <b style={{ color: config.color }}>{config.name}</b>
                <span className="text-amber-300 ml-1">{'★'.repeat(config.difficulty)}</span>：{config.description}
                （主生态区 {BIOME_CONFIGS[config.signatureBiome].name}，得分 ×{config.scoreMult}）
              </p>
            ))}
            <p>越危险的塘得分倍率越高，但刷的大鱼更早、食物更少。</p>
            <p><b className="text-amber-300">每塘有特产</b>：部分鱼、建筑与事件只在特定塘出现 —— 清水塘特产小丑鱼、锦鲤与许愿池；珊瑚塘特产海马、帝王蟹、狮子鱼、珍珠养殖场，还有「珊瑚产卵夜」金币雨；深渊塘特产水母、灯笼鱼、吸血鬼乌贼、哥布林鲨、皇带鱼、吞鳗、星光鱼与沉船残骸，定期有「星光鱼群潮」过境。想集齐图鉴，就得换塘。</p>
            <p><b className="text-amber-300">塘际门</b>（大号虚线环、琥珀描边）：游进去直接换塘，地形与鱼群整套重建；成长与战队跟着走、分数保留，落地有短暂保护。塘内门（小门）只是在本塘里随机传送。</p>
          </Section>

          <Section icon={<ShoppingBag size={20} />} title="建筑与海域">
            <p>商场：换装（进圈后按 <Key>E</Key>）· 医院：回血 · 龙王庙：随机祝福（技能+1 或护盾）</p>
            <p><b className="text-amber-300">塘特产建筑</b>：许愿池（清水塘，游进去稳定得金币）· 珍珠养殖场（珊瑚塘，滚出一圈金币）· 沉船残骸（深渊塘，金币丰厚，但会惊动船里的东西）</p>
            <p>阳光浅滩：安全，小型鱼速度+20% · 五彩珊瑚：伪装/伏击技能冷却减半，巨型鱼转向变慢</p>
            <p>剧毒沼泽：持续腐蚀（硬壳体质免疫）· 深渊海沟：视野受限，发光/感知型攻击+20%</p>
            <p><b className="text-green-300">水草掩体</b>（沼泽区的绿色草丛）：钻进去即进入隐蔽状态 —— HUD 会亮「隐蔽中」，追你的大鱼跟丢并放弃愤怒，视野也大幅下降（要贴到约 80px 才识得破）；就算真被咬到，扑咬命中也只剩五分之一。但被咬过的大鱼会放声呐扫描，约 7 秒内藏不住。</p>
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

/**
 * 成就解锁 toast（待办③）。订阅 gameEvents 的 'achievement' 事件，
 * 弹 4 秒自动消失；连续解锁时刷新内容并重置计时。
 */
const AchievementToast: React.FC = () => {
  const [toast, setToast] = useState<{ name: string; icon: string; desc: string } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const off = gameEvents.on('achievement', ({ name, icon, desc }) => {
      setToast({ name, icon, desc });
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 4000);
    });
    return () => {
      off();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
      <div className="flex items-center gap-4 bg-slate-900/95 border-2 border-yellow-400 rounded-2xl px-6 py-3 shadow-[0_0_30px_rgba(250,204,21,0.4)]">
        <span className="text-4xl">{toast.icon}</span>
        <div className="text-left">
          <div className="text-yellow-300 font-black text-lg leading-tight">成就解锁 · {toast.name}</div>
          <div className="text-slate-300 text-sm">{toast.desc}</div>
        </div>
        <Trophy size={28} className="text-yellow-400 ml-2" />
      </div>
    </div>
  );
};

/** 成就面板：已解锁亮着，未解锁灰着 + 进度条 */
const AchievementsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list: AchievementView[] = getAchievementView();
  const done = list.filter((a) => a.unlocked).length;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-600 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-slate-700">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">
            成就 {done}/{list.length}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="关闭成就">
            <X size={26} />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto grid grid-cols-1 gap-3">
          {list.map((a) => {
            const pct = Math.min(100, Math.round((a.progress / a.goal) * 100));
            return (
              <div
                key={a.id}
                className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${
                  a.unlocked ? 'bg-slate-800 border-yellow-500/60' : 'bg-slate-800/40 border-slate-700'
                }`}
              >
                <div className={`text-3xl shrink-0 ${a.unlocked ? '' : 'grayscale opacity-40'}`}>{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${a.unlocked ? 'text-yellow-300' : 'text-slate-300'}`}>{a.name}</span>
                    {a.unlocked && <Check size={16} className="text-green-400" />}
                  </div>
                  <div className="text-slate-400 text-xs mb-1.5">{a.desc}</div>
                  {!a.unlocked && (
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <div className={`text-xs shrink-0 ${a.unlocked ? 'text-green-400' : 'text-slate-500'}`}>
                  {a.unlocked ? '已解锁' : `${a.progress}/${a.goal}`}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-8 py-4 border-t border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-full transition-colors">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * 本地排行榜面板（P3 排行榜的本地版）。数据存 localStorage，前 10 名。
 */
const LeaderboardPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [list, setList] = useState<LeaderboardEntry[]>(getLeaderboard());
  // 分塘筛选（「多鱼塘」阶段 2a）：各塘得分倍率不同，混在一起比不公平
  const [pondFilter, setPondFilter] = useState<string>('ALL');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmtSec = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec}秒`);
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);
  const pondOptions = Array.from(new Set(list.map((e) => e.pond).filter(Boolean))) as string[];
  const shown = pondFilter === 'ALL' ? list : list.filter((e) => e.pond === pondFilter);

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-600 rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-slate-700">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-500">名人堂 · 前 10</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="关闭排行榜">
            <X size={26} />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-2">
          {pondOptions.length > 1 && (
            <div className="flex gap-2 flex-wrap pb-1">
              {['ALL', ...pondOptions].map((p) => (
                <button
                  key={p}
                  onClick={() => setPondFilter(p)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${pondFilter === p ? 'bg-cyan-900 border-cyan-400 text-cyan-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                  {p === 'ALL' ? '全部' : p}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 && (
            <p className="text-slate-400 text-center py-10">还没有记录，去创造第一个传说吧！</p>
          )}
          {shown.map((e, i) => (
            <div
              key={`${e.date}-${e.score}-${i}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
                i === 0 ? 'bg-slate-800 border-yellow-500/60' : 'bg-slate-800/40 border-slate-700'
              }`}
            >
              <span className="w-8 text-center text-xl shrink-0">{medal(i + 1)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-200 font-bold">
                  得分 <span className="text-yellow-300">{e.score}</span>
                  <span className="text-slate-500 text-xs font-normal ml-2">{e.date}</span>
                </div>
                <div className="text-slate-400 text-xs">
                  {e.pond && <span className="text-cyan-300 font-bold mr-1">[{e.pond}]</span>}
                  体重 {e.weight} · Lv.{e.level} · 存活 {fmtSec(e.survivedSec)} · 收编 {e.recruits} 人
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-8 py-4 border-t border-slate-700 flex justify-between items-center">
          <button
            onClick={() => { clearLeaderboard(); setList([]); }}
            className="text-slate-500 hover:text-red-400 text-sm transition-colors"
          >
            清空记录
          </button>
          <button onClick={onClose} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-full transition-colors">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

const UIOverlay: React.FC<UIOverlayProps> = ({ gameState, onStart, onStartBattleTest, onEvolve, onRestart, onRevive, onToggleGodMode, onUpdateCosmetics, setGameStatus, onSwitchSquad, onSquadCommand, onPossessMember, muted, onToggleMute }) => {
  const { player, status, entities } = gameState;
  const opponent = entities.find(e => e.id !== 'player' && e.type === CreatureType.ORCA);
  // 战队成员 = ownerId 指向玩家的活体（与 systems/squad.ts 的判定保持一致）
  const squadMembers = entities.filter(e => e.ownerId === 'player' && e.health > 0);
  // ── FQ-05 战队指令。全部从快照读：渲染期不做任何决策 / 不掷骰子
  //    （command 为 undefined 时 getSquadCommandConfig 会回退到缺省「护卫」）
  const squadCommand = getSquadCommandConfig(gameState.squad.command);
  const squadFocusTarget = gameState.squad.commandTargetId
    ? entities.find(e => e.id === gameState.squad.commandTargetId)
    : undefined;
  const squadNotice = gameState.squad.notice ?? null;
  // R 键下一个会附身到谁（只读，不推进轮转游标）—— 头像上打个描边，玩家才知道会跳到哪
  const squadNextSwitchId = peekNextSwitchTarget(gameState)?.id ?? null;
  // ── FQ-06 核心角色：核心成员 = 身上挂着 coreRole 的活体（与 systems/squad.ts 同一判据）
  const coreMembers = squadMembers.filter(m => !!m.coreRole);
  // 附身冷却（帧）：计划 §6.2 要求「显示目标与冷却」，所以按钮上直接把剩余秒数写出来
  const possessCooldown = gameState.squad.switchCooldown;
  const [selectedStarter, setSelectedStarter] = useState<CreatureType>(CreatureType.CLOWN_FISH);
  const [selectedPond, setSelectedPond] = useState<PondId>(DEFAULT_POND);
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const unlockedCount = getUnlockedCount();

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
      // 菜单比视口高时**必须能滚**：
      // 以前是 `flex items-center justify-center` 且不滚 —— 内容一超出，上下两头直接被裁掉
      // 而且滚不到（居中布局的经典坑：子元素上下同时溢出，父级滚动条只能滚下方那一半）。
      // 现在外层负责滚动，内层用 `min-h-full` 包裹：内容矮时居中，内容高时把容器撑开、交给外层滚。
      <div className="absolute inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40">
        <div className="min-h-full flex items-center justify-center p-3 sm:p-6">
        <div className="flex flex-col items-center text-center">
            <div className="bg-slate-900/80 p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-4 sm:mb-6">欢乐鱼塘</h1>

                <div className="flex flex-col gap-3 sm:gap-4">
                    <h2 className="text-xl sm:text-2xl text-white font-bold">选择鱼塘</h2>
                    <div className="flex gap-2 sm:gap-3 justify-center flex-wrap max-w-3xl">
                        {POND_LIST.map(({ id, config }) => {
                            const isSel = selectedPond === id;
                            const specialties = getPondSpecialties(id);
                            const fishText = specialties.fish.length > 2
                              ? `${specialties.fish.slice(0, 2).join('·')} 等 ${specialties.fish.length} 种`
                              : specialties.fish.join('·');
                            const specialtyLine = [fishText, specialties.building, specialties.event].filter(Boolean).join(' · ');
                            return (
                                <button
                                    key={id}
                                    onClick={() => setSelectedPond(id)}
                                    className={`w-56 p-3 rounded-2xl border text-left transition-all ${isSel ? 'bg-indigo-900 border-indigo-400 scale-105 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-slate-800 border-slate-700 hover:border-indigo-400 hover:bg-slate-700'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                                        <span className="text-white font-bold">{config.name}</span>
                                        <span className="ml-auto text-[11px] font-black text-amber-300">{'★'.repeat(config.difficulty)}</span>
                                    </div>
                                    <p className="text-slate-400 text-xs leading-snug">{config.description}</p>
                                    <p className="text-slate-500 text-[11px] mt-1">
                                        主生态区：{BIOME_CONFIGS[config.signatureBiome].name} · 得分 ×{config.scoreMult}
                                    </p>
                                    <p className="text-[11px] mt-1 text-amber-200/80">特产：{specialtyLine || '——'}</p>
                                </button>
                            );
                        })}
                    </div>

                    <h2 className="text-xl sm:text-2xl text-white font-bold">选择你的初始鱼类</h2>
                    <div className="flex gap-2 sm:gap-3 justify-center flex-wrap max-w-3xl">
                        {startOptions.map(type => {
                            const config = CREATURES[type];
                            const isSelected = selectedStarter === type;
                            return (
                                <button 
                                    key={type} 
                                    onClick={() => setSelectedStarter(type)} 
                                    className={`p-2.5 rounded-2xl border transition-all flex flex-col items-center gap-1.5 ${isSelected ? 'bg-cyan-900 border-cyan-400 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'bg-slate-800 border-slate-700 hover:border-cyan-400 hover:bg-slate-700'}`}
                                >
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: config.color }}>
                                        <Fish size={28} color="white" />
                                    </div>
                                    <span className="text-white font-bold text-sm">{config.name}</span>
                                    <span className="text-slate-400 text-[11px]">{config.skillName ? `技能: ${config.skillName}` : '无技能'}</span>
                                </button>
                            );
                        })}
                    </div>
                    
                    <button onClick={() => onStart(selectedStarter, selectedPond)} className="mt-1 px-14 sm:px-20 py-3.5 sm:py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-2xl sm:text-3xl rounded-full transition-all shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-3 mx-auto">
                        <Play size={32} fill="white" /> 开始游戏
                    </button>

                    <button onClick={() => setShowCosmetics(true)} className="px-6 sm:px-8 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-base sm:text-lg rounded-full border border-slate-600 hover:border-cyan-400 transition-all flex items-center justify-center gap-2 mx-auto">
                        <Palette size={20} /> 装扮我的鱼
                    </button>

                    <div className="flex gap-2 sm:gap-3 justify-center flex-wrap">
                        <button onClick={() => setShowRules(true)} className="px-5 sm:px-7 py-2 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm sm:text-base rounded-full border border-slate-700 hover:border-cyan-400 transition-all flex items-center justify-center gap-2">
                            <BookOpen size={18} /> 游戏规则
                        </button>
                        <button onClick={() => setShowAchievements(true)} className="px-5 sm:px-7 py-2 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm sm:text-base rounded-full border border-slate-700 hover:border-yellow-400 transition-all flex items-center justify-center gap-2 relative">
                            <Trophy size={18} /> 成就
                            {unlockedCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-yellow-500 text-slate-900 text-xs font-black rounded-full px-2 py-0.5">
                                    {unlockedCount}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setShowLeaderboard(true)} className="px-5 sm:px-7 py-2 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm sm:text-base rounded-full border border-slate-700 hover:border-amber-400 transition-all flex items-center justify-center gap-2">
                            <Crown size={18} /> 排行榜
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </div>

        {showCosmetics && (
            <CosmeticsPanel
                cosmetics={player.cosmetics}
                onChange={(cos) => onUpdateCosmetics?.(cos)}
                onClose={() => setShowCosmetics(false)}
                fishType={player.type}
                mode="player"
            />
        )}

        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showLeaderboard && <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />}
      </div>
    );
  }

  if (status === GameStatus.BATTLE_TEST || status === GameStatus.PLAYING) {
    return (
      <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
        {/* 成就解锁 toast（订阅 gameEvents，解锁时弹 4 秒） */}
        <AchievementToast />

        {/* 宝物倒计时显示 */}
        <TreasureCountdown gameState={gameState} />

        {/* 宝藏预警提示 */}
        <TreasureAlert treasures={gameState.treasures} />

        <div className="flex justify-between items-start">
            {/* 玩家血条 */}
            <div className="w-80 bg-slate-900/80 p-4 rounded-2xl border-2 border-cyan-500 shadow-2xl pointer-events-auto">
                {/* 当前鱼塘（「多鱼塘」阶段 1） */}
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className="text-[11px] font-black px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${getPond(gameState.pondId).color}33`, color: getPond(gameState.pondId).color }}
                    >
                        {getPond(gameState.pondId).name}
                    </span>
                    <span className="text-[11px] text-slate-400">得分 ×{getPond(gameState.pondId).scoreMult}</span>
                    {/* 隐蔽提示（藏在水草里 / 开着隐身技能）：告诉玩家「现在追不到我」 */}
                    {isConcealed(player) && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-400/40 animate-pulse">
                            隐蔽中 · 未被发现
                        </span>
                    )}
                </div>
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
                    <span className="text-orange-400">绕后背刺伤害: +{Math.round(COMBAT_CONFIG.BACK_BITE_BONUS * 100)}%</span>
                    <span className="text-slate-500">检测范围: {AMBUSH_CONFIG.DETECTION_RANGE_MAX}px</span>
                </div>
                {player.invulnerableTimer > 0 && (
                    <div className="mt-2 flex items-center justify-center gap-2 text-cyan-300 font-bold text-sm animate-pulse">
                        <Shield size={16} /> {player.reviveCount > 0 ? '复活保护' : '新手保护'} · {Math.ceil(player.invulnerableTimer / 60)}s
                    </div>
                )}
                {/* 无敌模式开关：G 键的可见形态（之前只有按键，玩家根本不知道有这功能） */}
                <button
                    onClick={() => onToggleGodMode?.()}
                    title="无敌模式：免疫一切伤害与捕食（快捷键 G）"
                    className={`mt-2 w-full px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 border ${player.isGodMode
                        ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.35)]'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-yellow-400/60 hover:text-yellow-200'}`}
                >
                    <Crown size={15} /> {player.isGodMode ? '无敌模式：开（点击关闭）' : '无敌模式：关（点击开启）'}
                </button>
                {/* 战队面板（提示词 #70 / #234 + FQ-05 指令）：吃掉的鱼倒戈入队，可下令、可指定附身 */}
                <div className="mt-2 pt-2 border-t border-slate-700/60">
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-cyan-300 font-bold text-sm">
                            <Users size={15} /> 战队
                            <span className="text-white">{squadMembers.length}</span>
                            <span className="text-slate-500 text-xs">/ {SQUAD_CONFIG.MAX_SIZE}</span>
                            {/* 核心位是**有限资源**（FQ-06）：写清楚还剩几个，玩家才知道该挑谁收编 */}
                            <span className="text-slate-500 text-xs">· 核心</span>
                            <span className="text-amber-300 text-xs">{coreMembers.length}/{SQUAD_ROLE_CONFIG.CORE_SLOTS}</span>
                        </span>
                        <button
                            onClick={() => onSwitchSquad?.()}
                            disabled={squadMembers.length === 0 || possessCooldown > 0}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
                            title="灵魂附身到下一条小弟身上（原身体变成小弟，快捷键 R）"
                        >
                            <Repeat size={13} /> {possessCooldown > 0 ? `冷却 ${Math.ceil(possessCooldown / 60)}s` : '切换 (R)'}
                        </button>
                    </div>

                    {/* 三个指令（FQ-05 §6.2）：指令是**状态**不是动作 —— 按一下就一直挂着，
                        直到换下一条；所以高亮「当前那条」比按钮闪一下更有信息量 */}
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                        {SQUAD_COMMAND_LIST.map((cfg) => {
                            const active = squadCommand.id === cfg.id;
                            const Icon = cfg.id === 'FOCUS' ? Target : cfg.id === 'GUARD' ? Shield : Wind;
                            return (
                                <button
                                    key={cfg.id}
                                    onClick={() => onSquadCommand?.(cfg.id)}
                                    disabled={squadMembers.length === 0}
                                    title={cfg.hint}
                                    className={`px-1 py-1 rounded-md text-[11px] font-bold border transition-all flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${active
                                        ? ''
                                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
                                    style={active ? { background: `${cfg.color}22`, borderColor: cfg.color, color: cfg.color } : undefined}
                                >
                                    <Icon size={12} />
                                    {cfg.keyLabel} {cfg.name}
                                </button>
                            );
                        })}
                    </div>

                    {/* 集火目标写出来：不写的话玩家不知道队员在扑谁 */}
                    {squadCommand.id === 'FOCUS' && (
                        <div className="mt-1 text-[11px] text-center" style={{ color: squadCommand.color }}>
                            集火目标：{squadFocusTarget ? squadFocusTarget.config.name : '（已失效，将自动回到护卫）'}
                        </div>
                    )}

                    {/* 队员头像：点谁附身谁（指定附身）。下一个 R 的目标描个边 */}
                    {squadMembers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1 justify-center">
                            {squadMembers.map((m) => {
                                // 核心成员描角色色（FQ-06）：一眼看出「这三条是有角色的」
                                const role = getSquadRoleConfig(m.coreRole);
                                return (
                                <button
                                    key={m.id}
                                    onClick={() => onPossessMember?.(m.id)}
                                    title={`点此附身到 ${m.config.name}（Lv.${m.level}，半径 ${Math.round(m.radius)}）${role ? ` · ${role.name}：${role.desc}；弱点：${role.weakness}` : ''}`}
                                    className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all bg-slate-900/70 ${m.id === squadNextSwitchId
                                        ? 'border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                                        : 'border-slate-600 text-slate-300 hover:border-cyan-400/70 hover:text-white'}`}
                                    style={role && m.id !== squadNextSwitchId ? { borderColor: role.color, color: role.color } : undefined}
                                >
                                    {m.config.name.slice(0, 1)}
                                </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 指令提示（下令回执 / 失败原因）：无法执行时给原因，不静默失败 */}
                    {squadNotice ? (
                        <div className="mt-1 text-[11px] text-center font-bold" style={{ color: squadNotice.color }}>
                            {squadNotice.text}
                        </div>
                    ) : squadMembers.length > 0 ? (
                        <div className="mt-1 text-[11px] text-slate-500 text-center">
                            阵亡可夺舍体型最大的成员续命
                        </div>
                    ) : null}
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
        fishType={player.type}
        mode="player"
      />
    );
  }

  if (status === GameStatus.EVOLVING) {
      const nextTier = player.config.tier + 1;
      // 候选方向是「进化触发那一刻」抽好、存进 state 的快照（systems/progression.ts 写入）。
      // ⚠️ 千万别在这里现算：本组件每 100ms 随状态同步重渲染一次，内部洗牌会被反复重掷，
      //    候选鱼每秒变脸 10 次 —— 2026-09-13 用户反馈「后面两个选项一直在变化」就是这个。
      // 兜底：正常链路下 state 一定有值（EVOLVING 只由 progression 写入）。万一拿到旧 state 或
      // 手工构造的 state，也不能给个空面板，于是退回「按注册表顺序取前 3 条」——确定性的，不会再抖。
      const optionTypes: CreatureType[] = gameState.evolveOptions?.length
          ? gameState.evolveOptions
          : Object.values(CREATURES)
              .filter((c) => c.tier === nextTier)
              .slice(0, EVOLVE_OPTION_COUNT)
              .map((c) => c.type as CreatureType);
      const options = optionTypes.map((t) => CREATURES[t]).filter(Boolean);

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
                <p className="text-slate-300 mb-3">
                    体重 <span className="text-cyan-400 font-bold">{Math.floor(player.weight)}</span>
                    · 得分 <span className="text-yellow-400 font-bold">{gameState.score}</span>
                    · 已复活 <span className="text-white font-bold">{player.reviveCount}</span> 次
                </p>
                {getLastRunRank() > 0 && (
                    <p className="mb-5 text-amber-300 font-bold">
                        <Crown size={18} className="inline mr-1 -mt-1" />
                        本局位列名人堂第 {getLastRunRank()} 名
                    </p>
                )}
                <p className="text-slate-500 text-sm mb-6">名人堂共 {getLeaderboard().length} 条记录</p>
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
