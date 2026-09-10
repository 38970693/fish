/**
 * 战斗流派注册表 —— 纯数据。
 *
 * 四大流派，每派 4 个技能。玩家所属流派由当前生物决定（data/creatures.ts 里的 school 字段），
 * 技能按等级逐档解锁：Lv3→第 1 个，Lv6→第 2 个，Lv9→第 3 个，Lv12→第 4 个，用 Q 键释放。
 *
 * 加一个流派：在这里加一条 + 在 systems/skills.ts 补上对应技能实现。
 */

export const SCHOOL_DATA = {
  ASSASSIN: {
    name: '暗杀流',
    color: '#ef4444',
    desc: '背刺 + 爆发 + 走位',
    skills: ['SHADOW_RUSH', 'DEADLY_TEAR', 'ABYSS_MIST', 'WEAKNESS_MARK'],
  },
  MOBILITY: {
    name: '机动流',
    color: '#38bdf8',
    desc: '速度 + 拉扯 + 连击',
    skills: ['TORRENT_GLIDE', 'HYDRO_BOUNCE', 'WHIRL_SLASH', 'BLINK_OUT'],
  },
  CONTROL: {
    name: '控制流',
    color: '#a855f7',
    desc: '减速 + 限位 + 创造偷袭机会',
    skills: ['PRESSURE_BIND', 'VORTEX_TRAP', 'DEEP_FROST', 'BUBBLE_LOCK'],
  },
  SURVIVAL: {
    name: '成长爆发流',
    color: '#f59e0b',
    desc: '受伤变强 + 极限反杀',
    skills: ['DEATH_FRENZY', 'BLOOD_SENSE', 'FATAL_PIERCE', 'ENERGY_DRAIN'],
  },
} as const;

export type SchoolId = keyof typeof SCHOOL_DATA;

export const SchoolId = Object.freeze(
  Object.fromEntries(Object.keys(SCHOOL_DATA).map((k) => [k, k]))
) as { readonly [K in SchoolId]: K };

/** 大鱼反制技能：由 AI 在愤怒时自动释放，玩家不使用 */
export const BIG_FISH_COUNTER_SKILLS = ['TAIL_WAVE', 'SONAR_SCAN', 'HARD_SCALE'] as const;

/** 玩家等级每提高 3 级，解锁下一档流派技能 */
export const SCHOOL_UNLOCK_LEVEL_STEP = 3;
export const SCHOOL_UNLOCK_MIN_LEVEL = 3;
/** 流派技能冷却（帧）——比主技能长，避免两套技能轮流刷 */
export const SCHOOL_SKILL_COOLDOWN = 300;
