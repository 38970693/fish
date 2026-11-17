/**
 * 技能系统 —— 用 ID 注册表取代原来 20 个中文字符串 if-else。
 *
 * 重构前的问题：
 *   `if (player.config.skillName === "逃跑")` 这种写法，改一个字全盘失效；
 *   而且魔鬼鱼的「毒刺」在 if-else 里根本没有对应分支，按右键毫无反应，
 *   属于典型的静默失效 —— 不报错，就是没效果。
 *
 * 重构后：
 *   - 数据层 data/skills.ts 管名字与描述
 *   - 这里管实现，key 就是技能 ID
 *   - 启动时 validateSkills() 会列出「声明了但没实现」的技能并明确报警
 *
 * 加新技能：data/skills.ts 加一条 → 这里加一个 handler → data/creatures.ts 里给鱼配上。
 */

import { SKILL_DATA, SKILL_COOLDOWN, type SkillId } from '../data/skills';
import {
  SCHOOL_DATA,
  SCHOOL_SKILL_COOLDOWN,
  SCHOOL_UNLOCK_LEVEL_STEP,
} from '../data/schools';
import { BIOME_EFFECTS, BiomeType } from '../data/biomes';
import type { Entity, GameState, FrameContext, PlayerState } from '../types';
import { dist } from '../core/math';
import { createParticle, dealDamage } from './combat';
import { canHarm } from './factions';
import { hasObstacleOcclusion } from '../core/obstacleGeometry';
import { resolveObstacles } from './terrain';

// 用 Entity 而不是 PlayerState：AI 也会放技能（大鱼反制），签名必须兼容两者
type SkillHandler = (caster: Entity, state: GameState, power: number) => void;

/**
 * 范围内**敌对**目标统一处理（排除吉祥物和友军）。
 *
 * ⚠️ 2026-09-14 实测（G1 / FQ-03）：注释早就写了「排除友军」，代码却只排了吉祥物 ——
 *    玩家一个 SHOCK / THUNDER / SONIC / WHIRL_SLASH 下去，先躺下的是自己的战队成员。
 *    现在统一走 `factions.canHarm`：同阵营不打，野鱼照打（生态链不受影响）。
 */
const forEachNearby = (
  caster: Entity,
  state: GameState,
  range: number,
  fn: (target: Entity) => void
): void => {
  for (const e of state.arena ? [state.player, ...state.entities] : state.entities) {
    if (e.health <= 0) continue;
    if (e.config.behavior === 'MASCOT') continue;
    if (!canHarm(caster, e)) continue;
    if (hasObstacleOcclusion(caster, e, state.obstacles)) continue;
    if (dist(caster, e) <= range) fn(e);
  }
};

/**
 * 技能命中结算：伤害统一走 `dealDamage`（无敌模式 / 无敌帧 / 护盾 / 易伤全部生效）。
 *
 * 传 `caster` 是为了记**致死归属**（FQ-03）：技能打死的鱼也要有凶手，
 * 否则死亡结算只能当环境伤害处理，玩家什么都拿不到。
 *
 * ⚠️ 历史遗漏：这里原来是对 `health` 直接做减法赋值，绕过了统一伤害入口 ——
 *    后果是 AI 的无敌帧（闪避 / 翻滚）与护盾对技能完全无效；
 *    将来技能若能打到玩家，玩家开无敌也拦不住（combat.ts 注释声称的契约被打破）。
 */
const hitTarget = (caster: Entity, target: Entity, amount: number): boolean =>
  dealDamage(target, amount, caster) > 0;

const burst = (state: GameState, x: number, y: number, color: string, count = 5): void => {
  for (let i = 0; i < count; i += 1) state.particles.push(createParticle(x, y, color));
};

/**
 * 「看穿隐蔽」持续帧数（约 7 秒），与大鱼反制的冷却（`ai.ts` 的 COUNTER_COOLDOWN）对齐。
 * 由 skills 写入施法者的 `sonarTimer`，由 `ai.ts` 的 `canPerceive` 读取。
 */
const SONAR_REVEAL_FRAMES = 420;

/**
 * 找最近的一个敌人，流派技能里的「锁定目标」都用它。
 *
 * ⚠️ 2026-09-14 实测（G1 / FQ-03）：函数名叫 nearestEnemy，实际只按距离取最近的实体 ——
 *    SHADOW_RUSH / DEADLY_TEAR / WEAKNESS_MARK 都会「锁定」身边的队友。
 *    现在按阵营过滤（野鱼仍是合法目标）。
 */
const nearestEnemy = (caster: Entity, state: GameState, range: number): Entity | null => {
  let best: Entity | null = null;
  let bestDist = range;
  for (const e of state.arena ? [state.player, ...state.entities] : state.entities) {
    if (e.health <= 0) continue;
    if (e.config.behavior === 'MASCOT') continue;
    if (!canHarm(caster, e)) continue;
    if (hasObstacleOcclusion(caster, e, state.obstacles)) continue;
    const d = dist(caster, e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
};

const displaceCaster = (caster: Entity, state: GameState, x: number, y: number): void => {
  const origin = { x: caster.x, y: caster.y };
  caster.x = x; caster.y = y;
  resolveObstacles(caster, state.obstacles, undefined, origin);
};

/* ══════════════ 技能实现 ══════════════ */

export const SKILL_HANDLERS: Record<SkillId, SkillHandler> = {
  /** 逃跑 / 冲刺：短时间内大幅提速 */
  DASH: (caster, state, power) => {
    caster.speedBoostTimer = 60 * power;
    caster.vx += Math.cos(caster.angle) * 20 * power;
    caster.vy += Math.sin(caster.angle) * 20 * power;
    burst(state, caster.x, caster.y, '#38bdf8', 8);
  },

  /** 闪避：短暂无敌 */
  DODGE: (caster, _state, power) => {
    caster.invulnerableTimer = 30 * power;
  },

  /** 缩壳：获得护盾 */
  SHELL: (caster, _state, power) => {
    caster.shieldTimer = 120 * power;
  },

  /** 电击：小范围麻痹 */
  SHOCK: (caster, state, power) => {
    const range = 150 * power;
    forEachNearby(caster, state, range, (e) => {
      hitTarget(caster, e, caster.config.damage * 2 * power);
      e.speedBoostTimer = -60;
      burst(state, e.x, e.y, '#fde047', 5);
    });
  },

  /** 雷霆：大范围强电流 */
  THUNDER: (caster, state, power) => {
    const range = 300 * power;
    forEachNearby(caster, state, range, (e) => {
      hitTarget(caster, e, caster.config.damage * 2 * power);
      e.speedBoostTimer = -60;
      burst(state, e.x, e.y, '#fde047', 5);
    });
  },

  /** 伪装：进入隐身 */
  CAMO: (caster, _state, power) => {
    caster.camoActive = true;
    caster.ambushTimer = 180 * power;
  },

  /** 诱惑：变成肉块吸引小鱼 */
  LURE: (caster, _state, power) => {
    caster.lureActive = true;
    caster.ambushTimer = 180 * power;
  },

  /** 重击：前方近战高伤 */
  SLAM: (caster, state, power) => {
    const hitX = caster.x + Math.cos(caster.angle) * caster.radius * 2;
    const hitY = caster.y + Math.sin(caster.angle) * caster.radius * 2;
    forEachNearby(caster, state, caster.radius * 4 * power, (e) => {
      if (dist({ x: hitX, y: hitY }, e) > caster.radius * 2 * power) return;
      hitTarget(caster, e, caster.config.damage * 3 * power);
      burst(state, e.x, e.y, '#ef4444', 5);
    });
  },

  /** 膨胀：变大并获得护盾 */
  INFLATE: (caster, _state, power) => {
    // 技能等级跨局累积，视觉膨胀不能无限放大；护盾强度仍按技能等级结算。
    caster.renderScale = Math.min(2, 1.5 + (power - 1) * 0.5);
    caster.shieldTimer = 120 * power;
  },

  /** 喷墨：向后撤退并留下墨云 */
  INK: (caster, state, power) => {
    displaceCaster(caster, state, caster.x - Math.cos(caster.angle) * 100 * power, caster.y - Math.sin(caster.angle) * 100 * power);
    burst(state, caster.x + Math.cos(caster.angle) * 50, caster.y + Math.sin(caster.angle) * 50, '#1e293b', 20);
  },

  /** 穿刺：向前突进并伤害路径上的敌人 */
  PIERCE: (caster, state, power) => {
    displaceCaster(caster, state, caster.x + Math.cos(caster.angle) * 300 * power, caster.y + Math.sin(caster.angle) * 300 * power);
    forEachNearby(caster, state, caster.radius * 2 * power, (e) => {
      hitTarget(caster, e, caster.config.damage * 4 * power);
      burst(state, e.x, e.y, '#ef4444', 5);
    });
  },

  /** 毒刺：前方扇形攻击并附加中毒（魔鬼鱼专属，重构前缺失实现） */
  VENOM: (caster, state, power) => {
    const hitX = caster.x + Math.cos(caster.angle) * caster.radius * 2;
    const hitY = caster.y + Math.sin(caster.angle) * caster.radius * 2;
    forEachNearby(caster, state, caster.radius * 3 * power, (e) => {
      if (dist({ x: hitX, y: hitY }, e) > caster.radius * 1.5 * power) return;
      hitTarget(caster, e, caster.config.damage * power);
      e.poisonTimer = 300;
      // 记下施毒者：持续伤害是独立的致死路径，没有它毒死的人只能算环境伤害（无归属）
      e.poisonSourceId = caster.id;
      burst(state, e.x, e.y, '#84cc16', 6);
    });
  },

  /** 声波探测：暴露隐身单位并减速 */
  SONAR: (caster, state, power) => {
    forEachNearby(caster, state, 600 * power, (e) => {
      e.isHidden = false;
      e.camoActive = false;
      e.speedBoostTimer = -60;
      burst(state, e.x, e.y, '#9ca3af', 3);
    });
  },

  /** 龙威：强制定身 */
  AWE: (caster, state, power) => {
    forEachNearby(caster, state, 300 * power, (e) => {
      e.speedBoostTimer = -120;
      burst(state, e.x, e.y, '#f59e0b', 4);
    });
  },

  /** 翻滚：无敌 + 回血 */
  ROLL: (caster, _state, power) => {
    caster.invulnerableTimer = 45 * power;
    caster.health = Math.min(caster.maxHealth, caster.health + 20 * power);
    caster.angle += Math.PI * 2;
  },

  /** 鲨吞：把低等级小鱼吸过来吃掉 */
  DEVOUR: (caster, state, power) => {
    forEachNearby(caster, state, caster.radius * 4 * power, (e) => {
      if (e.level >= caster.level) return;
      e.x += (caster.x - e.x) * 0.8;
      e.y += (caster.y - e.y) * 0.8;
      if (dist(caster, e) < caster.radius) {
        hitTarget(caster, e, caster.config.damage * power);
        burst(state, e.x, e.y, '#ef4444', 5);
      }
    });
  },

  /** 声波冲击：大范围伤害 */
  SONIC: (caster, state, power) => {
    forEachNearby(caster, state, 500 * power, (e) => {
      hitTarget(caster, e, caster.config.damage * 2 * power);
      burst(state, e.x, e.y, '#38bdf8', 5);
    });
  },

  /** 独角贯穿：无视防御的巨额单体伤害 */
  UNICORN: (caster, state, power) => {
    const hitX = caster.x + Math.cos(caster.angle) * caster.radius * 3;
    const hitY = caster.y + Math.sin(caster.angle) * caster.radius * 3;
    forEachNearby(caster, state, caster.radius * 4 * power, (e) => {
      if (dist({ x: hitX, y: hitY }, e) > caster.radius * 1.5 * power) return;
      hitTarget(caster, e, caster.config.damage * 5 * power);
      burst(state, e.x, e.y, '#cbd5e1', 10);
    });
  },

  /** 海妖之歌：魅惑敌人互相攻击 */
  SIREN: (caster, state, power) => {
    forEachNearby(caster, state, 400 * power, (e) => {
      e.aggroTimer = 180;
      // 只把敌人推向敌人：魅惑到队友头上会变成「自己人互殴」
      const others = state.entities.filter(
        (o) => o.id !== e.id && o.health > 0 && canHarm(e, o)
      );
      e.targetId = others.length ? others[Math.floor(Math.random() * others.length)].id : null;
      burst(state, e.x, e.y, '#f472b6', 3);
    });
  },

  /** 触手绞杀：全屏拉近并持续伤害 */
  TENTACLE: (caster, state, power) => {
    forEachNearby(caster, state, 800 * power, (e) => {
      e.x += (caster.x - e.x) * 0.8;
      e.y += (caster.y - e.y) * 0.8;
      hitTarget(caster, e, caster.config.damage * power);
      burst(state, e.x, e.y, '#7f1d1d', 5);
    });
  },

  /* ══════════ 暗杀流 ══════════ */

  /** 影冲：瞬移到猎物身后，落地即可咬 */
  SHADOW_RUSH: (caster, state, power) => {
    const target = nearestEnemy(caster, state, 700 * power);
    if (!target) return;
    const behind = target.angle + Math.PI;
    displaceCaster(caster, state, target.x + Math.cos(behind) * (target.radius + caster.radius + 5), target.y + Math.sin(behind) * (target.radius + caster.radius + 5));
    caster.angle = Math.atan2(target.y - caster.y, target.x - caster.x);
    caster.biteCooldown = 0;
    burst(state, caster.x, caster.y, '#7f1d1d', 12);
  },

  /** 致命撕裂：三段撕咬并留下易伤 */
  DEADLY_TEAR: (caster, state, power) => {
    const target = nearestEnemy(caster, state, caster.radius * 3 * power);
    if (!target) return;
    for (let i = 0; i < 3; i += 1) {
      hitTarget(caster, target, caster.config.damage * 1.2 * power);
      burst(state, target.x, target.y, '#ef4444', 4);
    }
    target.vulnerableTimer = 120;
  },

  /** 深海迷雾：自身隐身，同时让周围敌人放松警惕 */
  ABYSS_MIST: (caster, state, power) => {
    caster.camoActive = true;
    caster.ambushTimer = 240 * power;
    forEachNearby(caster, state, 500 * power, (e) => {
      e.aggroTimer = 0;
      e.speedBoostTimer = -60;
      burst(state, e.x, e.y, '#1e293b', 2);
    });
  },

  /** 弱点标记：点名一个目标，它受到的伤害翻倍 */
  WEAKNESS_MARK: (caster, state, power) => {
    const target = nearestEnemy(caster, state, 600 * power);
    if (!target) return;
    target.vulnerableTimer = 300 * power;
    burst(state, target.x, target.y, '#facc15', 8);
  },

  /* ══════════ 机动流 ══════════ */

  /** 激流滑行：提速且贴近敌人不触发警觉 */
  TORRENT_GLIDE: (caster, state, power) => {
    caster.speedBoostTimer = 180 * power;
    forEachNearby(caster, state, 400 * power, (e) => {
      e.aggroTimer = 0;
    });
    burst(state, caster.x, caster.y, '#38bdf8', 8);
  },

  /** 水流弹射：朝当前方向弹射一大段 */
  HYDRO_BOUNCE: (caster, state, power) => {
    displaceCaster(caster, state, caster.x + Math.cos(caster.angle) * 400 * power, caster.y + Math.sin(caster.angle) * 400 * power);
    burst(state, caster.x, caster.y, '#38bdf8', 10);
  },

  /** 回旋切割：原地转一圈，切割四周 */
  WHIRL_SLASH: (caster, state, power) => {
    for (let i = 0; i < 2; i += 1) {
      forEachNearby(caster, state, 250 * power, (e) => {
        hitTarget(caster, e, caster.config.damage * 1.5 * power);
      });
    }
    caster.angle += Math.PI * 2;
    burst(state, caster.x, caster.y, '#38bdf8', 14);
  },

  /** 瞬撤：向后脱离战斗并短暂无敌 */
  BLINK_OUT: (caster, state, power) => {
    displaceCaster(caster, state, caster.x - Math.cos(caster.angle) * 500 * power, caster.y - Math.sin(caster.angle) * 500 * power);
    caster.invulnerableTimer = 45 * power;
    caster.angerTimer = 0;
    burst(state, caster.x, caster.y, '#38bdf8', 10);
  },

  /* ══════════ 控制流 ══════════ */

  /** 水压束缚：大幅减速 */
  PRESSURE_BIND: (caster, state, power) => {
    forEachNearby(caster, state, 350 * power, (e) => {
      e.speedBoostTimer = -120;
      burst(state, e.x, e.y, '#a855f7', 3);
    });
  },

  /** 旋涡陷阱：把敌人吸过来 */
  VORTEX_TRAP: (caster, state, power) => {
    forEachNearby(caster, state, 500 * power, (e) => {
      e.x += (caster.x - e.x) * 0.5;
      e.y += (caster.y - e.y) * 0.5;
      e.speedBoostTimer = -90;
      burst(state, e.x, e.y, '#a855f7', 3);
    });
  },

  /** 深寒水域：范围内敌人移动与警觉都变迟钝 */
  DEEP_FROST: (caster, state, power) => {
    forEachNearby(caster, state, 400 * power, (e) => {
      e.speedBoostTimer = -180;
      e.ambushTimer = 0;
      burst(state, e.x, e.y, '#67e8f9', 3);
    });
  },

  /** 气泡困锁：被包裹的敌人无法出手 */
  BUBBLE_LOCK: (caster, state, power) => {
    forEachNearby(caster, state, 300 * power, (e) => {
      e.biteCooldown = 240 * power;
      e.speedBoostTimer = -150;
      burst(state, e.x, e.y, '#bae6fd', 5);
    });
  },

  /* ══════════ 成长爆发流 ══════════ */

  /** 濒死狂暴：血越少越快，满血时用不出来 */
  DEATH_FRENZY: (caster, state, power) => {
    if (caster.health / caster.maxHealth > 0.6) {
      caster.speechBubble = { text: '血量还不够低', timer: 45, color: '#94a3b8' };
      return;
    }
    caster.speedBoostTimer = 240 * power;
    caster.renderScale = 1.2;
    burst(state, caster.x, caster.y, '#f59e0b', 12);
  },

  /** 血腥嗅觉：锁定最虚弱的大鱼并标记它 */
  BLOOD_SENSE: (caster, state, power) => {
    let weakest: Entity | null = null;
    let lowest = Infinity;
    for (const e of state.entities) {
      if (e.health <= 0) continue;
      if (!canHarm(caster, e)) continue; // 不标记自己人
      if (e.radius <= caster.radius) continue; // 只盯比自己大的
      if (dist(caster, e) > 800 * power) continue;
      const ratio = e.health / e.maxHealth;
      if (ratio < lowest) {
        lowest = ratio;
        weakest = e;
      }
    }
    if (!weakest) return;
    weakest.vulnerableTimer = 300 * power;
    weakest.isHidden = false;
    weakest.camoActive = false;
    burst(state, weakest.x, weakest.y, '#dc2626', 8);
  },

  /** 绝命穿刺：残血时孤注一掷，最高 5 倍伤害 */
  FATAL_PIERCE: (caster, state, power) => {
    const hpRatio = Math.max(0, Math.min(1, caster.health / caster.maxHealth));
    const multiplier = 1 + (1 - hpRatio) * 4;
    forEachNearby(caster, state, caster.radius * 4 * power, (e) => {
      hitTarget(caster, e, caster.config.damage * multiplier * power);
      burst(state, e.x, e.y, '#f59e0b', 6);
    });
  },

  /** 吸能回复：汲取周围生命回血 */
  ENERGY_DRAIN: (caster, state, power) => {
    let drained = 0;
    forEachNearby(caster, state, 350 * power, (e) => {
      const amount = caster.config.damage * power;
      drained += dealDamage(e, amount, state.arena ? caster : undefined);
      burst(state, e.x, e.y, '#22c55e', 3);
    });
    if (drained > 0) {
      caster.health = Math.min(caster.maxHealth, caster.health + drained * 0.8);
    }
  },

  /* ══════════ 大鱼反制（AI 自动释放） ══════════ */

  /** 尾浪震荡：冲击波伤害并击退 */
  TAIL_WAVE: (caster, state, power) => {
    forEachNearby(caster, state, 400 * power, (e) => {
      hitTarget(caster, e, caster.config.damage * power);
      const a = Math.atan2(e.y - caster.y, e.x - caster.x);
      e.x += Math.cos(a) * 120;
      e.y += Math.sin(a) * 120;
      burst(state, e.x, e.y, '#94a3b8', 4);
    });
  },

  /**
   * 声呐扫描：照出周围的隐蔽单位（水草掩体 / 隐身技能）。
   *
   * `sonarTimer` 是加给**施法者自己**的 —— 一段时间内看穿隐蔽（见 `ai.ts` 的 `canPerceive`）。
   * 没有它，这条技能只是个「清标志位」的空动作：水草掩体每帧都会重算 `inCover`，
   * 这一帧清掉、下一帧就回来了，隐蔽照样生效。
   */
  SONAR_SCAN: (caster, state, power) => {
    caster.sonarTimer = SONAR_REVEAL_FRAMES;
    forEachNearby(caster, state, 700 * power, (e) => {
      e.isHidden = false;
      e.camoActive = false;
      burst(state, e.x, e.y, '#9ca3af', 2);
    });
  },

  /** 硬鳞展开：短时间内没有弱点 */
  HARD_SCALE: (caster, _state, power) => {
    caster.invulnerableTimer = 90 * power;
    caster.vulnerableTimer = 0;
  },
};

/**
 * 启动自检：列出「数据里声明了、但这里没实现」的技能。
 * 这类问题以前只能靠玩家发现（按了没反应），现在开发期就会报警。
 */
export function validateSkills(): string[] {
  const problems: string[] = [];
  for (const id of Object.keys(SKILL_DATA) as SkillId[]) {
    if (typeof SKILL_HANDLERS[id] !== 'function') {
      problems.push(`技能 ${id}（${SKILL_DATA[id].name}）没有实现`);
    }
  }
  return problems;
}

/**
 * 玩家当前可用的流派技能：按等级逐档解锁。
 * Lv3 解锁第 1 个，Lv6 第 2 个，Lv9 第 3 个，Lv12 第 4 个。
 */
export const getSchoolSkill = (player: PlayerState): SkillId | undefined => {
  const school = player.config.school;
  if (!school) return undefined;
  const list = SCHOOL_DATA[school]?.skills ?? [];
  if (list.length === 0) return undefined;
  const index = Math.floor(player.level / SCHOOL_UNLOCK_LEVEL_STEP) - 1;
  if (index < 0) return undefined;
  return list[Math.min(index, list.length - 1)] as SkillId;
};

/** 统一施法入口：查表 → 执行 → 发事件。缺实现会明确报警而不是静默失败 */
export const castSkill = (
  state: GameState,
  ctx: FrameContext,
  caster: Entity,
  skillId: SkillId,
  power: number
): boolean => {
  const handler = SKILL_HANDLERS[skillId];
  if (!handler) {
    console.warn(`[技能] ${skillId} 未实现，已跳过（请在 systems/skills.ts 补上）`);
    return false;
  }
  handler(caster, state, power);
  ctx.events.emit('skill', {
    entity: caster,
    skillId,
    skillName: SKILL_DATA[skillId]?.name ?? skillId,
  });
  return true;
};

/** 技能释放主逻辑：主技能（右键）+ 流派技能（Q），含冷却、解锁与生态区加成 */
export const skillsSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;
  const power = 1 + player.skillLevel * SKILL_COOLDOWN.POWER_PER_LEVEL;

  /* ── 主技能：右键 ── */
  if (player.skillCooldown > 0) player.skillCooldown--;

  const skillId = player.config.skillId;
  if (
    skillId &&
    ctx.input.rightMouseDown &&
    player.skillCooldown <= 0 &&
    player.level >= SKILL_COOLDOWN.UNLOCK_LEVEL
  ) {
    if (castSkill(state, ctx, player, skillId, power)) {
      // 珊瑚区：技能冷却减半
      const biome = (player.currentBiome ?? BiomeType.SHALLOWS) as BiomeType;
      const cooldownMult = BIOME_EFFECTS[biome]?.skillCooldownMult ?? 1;
      const baseCooldown = Math.max(
        SKILL_COOLDOWN.MIN,
        SKILL_COOLDOWN.BASE - player.skillLevel * SKILL_COOLDOWN.PER_LEVEL_REDUCTION
      );
      player.skillCooldown = Math.round(baseCooldown * cooldownMult);
      player.skillMaxCooldown = player.skillCooldown;
    }
  }

  /* ── 流派技能：Q 键 ── */
  if (player.schoolSkillCooldown > 0) player.schoolSkillCooldown--;

  const schoolSkill = getSchoolSkill(player);
  // 写回状态，UI 直接读它显示「当前流派技能」
  player.schoolSkillId = schoolSkill;

  if (schoolSkill && ctx.input.q && player.schoolSkillCooldown <= 0) {
    if (castSkill(state, ctx, player, schoolSkill, power)) {
      player.schoolSkillCooldown = SCHOOL_SKILL_COOLDOWN;
    }
  }
};
