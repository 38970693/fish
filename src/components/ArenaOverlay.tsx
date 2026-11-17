import React, { useEffect, useState } from 'react';
import { ARENA_RULES, getArenaCircle, getArenaStandings } from '../data/arena';
import { GameStatus, type GameState } from '../types';
import { SKILL_DATA } from '../data/skills';
import { canPerceive } from '../systems/concealment';
import { getArenaObjective } from '../systems/arenaObjective';
import './ArenaOverlay.css';

interface Props { state: GameState; onReplay: () => void; onMenu: () => void; onMute?: () => void; muted?: boolean }
export const ArenaOverlay: React.FC<Props> = ({ state, onReplay, onMenu, onMute, muted }) => {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const arena = state.arena!;
  const circle = getArenaCircle(state);
  const standings = getArenaStandings(state);
  const alive = arena.contestants.filter(c => c.eliminatedAt === null).length;
  const seconds = Math.ceil(Math.max(0, ARENA_RULES.duration - state.run!.clock) / 60);
  const remaining = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const { player, camera } = state;
  const project = (x: number, y: number) => ({ x: (x - camera.x) * camera.zoom + viewport.width / 2,
    y: (y - camera.y) * camera.zoom + viewport.height / 2 });
  const center = project(arena.center.x, arena.center.y);
  const outside = Math.hypot(player.x - arena.center.x, player.y - arena.center.y) > circle.radius;
  const objective = getArenaObjective(state);
  const rank = standings.find(c => c.body === player)!.rank;
  const target = objective.target ? project(objective.target.x, objective.target.y) : undefined;
  const offscreen = target && (target.x < 70 || target.x > viewport.width - 70 || target.y < 180 || target.y > viewport.height - 140);
  const angle = target ? Math.atan2(target.y - viewport.height / 2, target.x - viewport.width / 2) : 0;
  const arrowDistance = Math.min((viewport.width / 2 - 42) / Math.max(0.01, Math.abs(Math.cos(angle))),
    Math.max(24, viewport.height / 2 - 185) / Math.max(0.01, Math.abs(Math.sin(angle))), 170);
  const arrow = { x: viewport.width / 2 + Math.cos(angle) * arrowDistance, y: viewport.height / 2 + Math.sin(angle) * arrowDistance };
  const finished = state.status === GameStatus.GAME_OVER || state.status === GameStatus.VICTORY;
  const visible = arena.contestants.filter(c => c.body.health > 0 && (c.body === player
    || canPerceive(player, c.body, (c.body.x - player.x) ** 2 + (c.body.y - player.y) ** 2)));
  if (finished) return (
    <section aria-label="短局结算" className="absolute inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-cyan-500/50 bg-slate-900 p-7 text-white shadow-2xl">
        <p className="text-cyan-300 text-sm">短局竞技 · 首轮实验 {state.run?.practice ? '· 练习局' : ''}</p>
        <h1 className="text-3xl font-black my-3">{state.status === GameStatus.VICTORY ? '竞技胜利' : '本局结束'} · 第 {arena.result?.rank} 名</h1>
        <p className="text-slate-300">{arena.result?.reason === 'TIME_LIMIT' ? '四分钟到时，按竞技分与有效伤害排名' : arena.result?.reason === 'LAST_SURVIVOR' ? '成为最后一位存活参赛者' : '已淘汰，本局不复活'} · 游玩 {Math.floor(state.run!.clock / 60)} 秒</p>
        <p className="text-amber-200 mt-2">竞技分 {player.arenaStats?.score} · 淘汰 {player.arenaStats?.kills} · 有效伤害 {Math.floor(player.arenaStats?.damage ?? 0)}</p>
        <ol className="mt-5 space-y-2" aria-label="本局排名">
          {standings.map(c => <li key={c.body.id} className="flex justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm">
            <span style={{ color: c.color }}>{c.rank}. {c.name}</span>
            <span>{c.body.arenaStats?.score} 分 · {c.eliminatedAt === null ? '存活' : `${Math.floor(c.eliminatedAt / 60)} 秒淘汰`}</span>
          </li>)}
        </ol>
        <p className="text-xs text-slate-400 mt-4">存活优先；到时按竞技分、有效伤害排序，相同条件并列。本模式独立于冒险排行榜。</p>
        <div className="flex gap-3 mt-5">
          <button onClick={onReplay} className="bg-cyan-600 hover:bg-cyan-500 px-5 py-3 rounded-xl font-bold">再战一局</button>
          <button onClick={onMenu} className="bg-slate-700 hover:bg-slate-600 px-5 py-3 rounded-xl">返回主界面</button>
        </div>
      </div>
    </section>
  );
  return (
    <div className="absolute inset-0 pointer-events-none" aria-label="短局竞技">
      <svg width={viewport.width} height={viewport.height} className="absolute inset-0" aria-label="安全区边界">
        <defs><mask id="arena-safe-mask"><rect width="100%" height="100%" fill="white" />
          <circle cx={center.x} cy={center.y} r={circle.radius * camera.zoom} fill="black" />
        </mask></defs>
        <rect width="100%" height="100%" fill="#ef4444" opacity="0.12" mask="url(#arena-safe-mask)" />
        <circle cx={center.x} cy={center.y} r={circle.radius * camera.zoom} fill="none" stroke="#67e8f9" strokeWidth="3" />
        {(circle.warning || circle.shrinking) && <circle cx={center.x} cy={center.y} r={circle.targetRadius * camera.zoom}
          fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="10 8" />}
        {target && !offscreen && <circle cx={target.x} cy={target.y} r={18} fill="none" stroke="#a3e635" strokeWidth="2" strokeDasharray="3 5" aria-label="当前目标位置" />}
        {offscreen && <g transform={`translate(${arrow.x}, ${arrow.y}) rotate(${angle * 180 / Math.PI})`} aria-label="目标方向">
          <path d="M -8 -7 L 7 0 L -8 7" fill="none" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" /></g>}
        {visible.filter(c => c.body === player || Math.hypot(c.body.x - player.x, c.body.y - player.y) < 300).map(c => {
          const point = project(c.body.x, c.body.y);
          return <g key={c.body.id}><circle cx={point.x} cy={point.y} r={(c.body.radius + 9) * camera.zoom}
            fill="none" stroke={c.color} strokeWidth="2" />
            <text x={point.x} y={point.y - (c.body.radius + 17) * camera.zoom} textAnchor="middle" fill={c.color}
              fontSize="12" stroke="#0f172a" strokeWidth="3" paintOrder="stroke">{c.name} · Lv.{c.body.level}</text></g>;
        })}
      </svg>
      <section className="arena-match" aria-label="竞技状态">
        <strong data-testid="arena-clock">{remaining}</strong>
        <span data-testid="arena-alive">存活 {alive} / 6</span>
        <span>第 {rank} 名 · {player.arenaStats?.score ?? 0} 分{state.run?.practice ? ' · 练习' : ''}</span>
      </section>
      <section className="arena-objective" aria-label="当前目标">
        <div className="arena-phases">{['成长', '争分', '决赛'].map((name, i) => <span key={name} className={i === objective.stage ? 'active' : ''}>{i + 1} {name}</span>)}</div>
        <h2>{objective.title}</h2><p>{objective.detail}</p>
        {objective.progress !== undefined && <progress aria-label="解锁技能进度" value={objective.progress} max={1} />}
        {(outside || circle.warning || circle.shrinking) && <p className="arena-warning" role="status">{outside ? '圈外持续受伤' : circle.shrinking ? '安全区正在收缩' : `${Math.ceil(circle.nextIn / 60)} 秒后缩圈`}</p>}
      </section>
      <section aria-label="竞技雷达" className="arena-radar">
        <svg width="104" height="104" viewBox="-100 -100 200 200">
          <circle r="95" fill="#164e63" /><circle r={circle.radius / ARENA_RULES.radius * 95} fill="#0f172a" stroke="#67e8f9" strokeWidth="2" />
          {visible.map(c => <circle key={c.body.id}
            cx={(c.body.x - arena.center.x) / ARENA_RULES.radius * 95} cy={(c.body.y - arena.center.y) / ARENA_RULES.radius * 95}
            r={c.body === player ? 5 : 3} fill={c.color} />)}
        </svg>
      </section>
      <div className="arena-controls" aria-label="生命与操作">
        <div className="arena-resources"><span>Lv.{player.level}</span><label>生命 {Math.ceil(Math.max(0, player.health))}<progress value={Math.max(0, player.health)} max={player.maxHealth} /></label><label>体力 {Math.floor(player.boost.current)}<progress value={player.boost.current} max={player.boost.max} /></label></div>
        <p>鼠标转向 · 空格冲刺</p>
        <p>右键 {player.level < 3 ? 'Lv.3 解锁' : `${player.config.skillName} ${player.skillCooldown > 0 ? `${Math.ceil(player.skillCooldown / 60)}s` : '就绪'}`} · Q {player.schoolSkillId ? SKILL_DATA[player.schoolSkillId as keyof typeof SKILL_DATA]?.name : 'Lv.3 解锁'} {player.schoolSkillCooldown > 0 ? `${Math.ceil(player.schoolSkillCooldown / 60)}s` : ''}</p>
      </div>
      <div className="arena-actions pointer-events-auto flex gap-2">
        <button onClick={onMute} className="rounded-lg px-3 py-2 bg-slate-800 text-white text-xs">{muted ? '开启声音' : '静音'}</button>
        <button onClick={onMenu} className="rounded-lg px-3 py-2 bg-slate-800 text-white text-xs">返回主界面</button>
      </div>
    </div>
  );
};
