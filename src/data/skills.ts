/**
 * 技能注册表（元数据部分）—— 纯数据，零依赖。
 *
 * 技能分两层：
 *   1. 元数据在这里：名字、描述、基础冷却。给 UI 和「加鱼时挑技能」用。
 *   2. 执行逻辑在 systems/skills.ts 的 SKILL_HANDLERS 里。
 *
 * 为什么要分：这样给一条鱼配技能只需在 data/creatures.ts 写 `skill: 'DASH'`，
 * 不用关心逻辑；只有新增一个全新技能时，才需要同时改这两个文件。
 *
 * 启动时 validateSkills() 会检查「声明了但没实现」的技能并明确报警，
 * 不会再出现魔鬼鱼「毒刺」那种按下去毫无反应的静默失效。
 */

export const SKILL_DATA = {
  DASH: { name: '逃跑', desc: '极速逃跑，短时间内大幅提升移动速度' },
  DODGE: { name: '闪避', desc: '瞬间无敌0.5秒' },
  SHELL: { name: '缩壳', desc: '获得一个吸收伤害的护盾' },
  SHOCK: { name: '电击', desc: '麻痹周围的敌人' },
  THUNDER: { name: '雷霆', desc: '释放强大的电流攻击周围敌人' },
  CAMO: { name: '伪装', desc: '短时间内隐身，敌人无法发现' },
  LURE: { name: '诱惑', desc: '变成大肉块吸引小鱼，遇到大鱼自动逃跑' },
  SLAM: { name: '重击', desc: '对前方造成大量近战伤害' },
  INFLATE: { name: '膨胀', desc: '体型变大并反弹伤害' },
  INK: { name: '喷墨', desc: '向后喷射墨汁并快速后退' },
  PIERCE: { name: '穿刺', desc: '极速向前突进，对路径上的敌人造成巨额伤害' },
  VENOM: { name: '毒刺', desc: '发射带毒的尖刺，造成持续伤害' },
  SONAR: { name: '声波探测', desc: '暴露周围所有隐藏的敌人并减速他们' },
  AWE: { name: '龙威', desc: '震慑周围敌人，使其无法移动' },
  ROLL: { name: '翻滚', desc: '快速翻滚躲避攻击并回复少量生命' },
  DEVOUR: { name: '鲨吞', desc: '把周围等级比自己低的小鱼吸到肚子里' },
  SONIC: { name: '声波冲击', desc: '发射毁灭性的声波，造成大范围伤害' },
  UNICORN: { name: '独角贯穿', desc: '无视防御的致命一击' },
  SIREN: { name: '海妖之歌', desc: '魅惑周围敌人，使其互相攻击' },
  TENTACLE: { name: '触手绞杀', desc: '伸出触手将全屏敌人拉向自己' },

  /* ── 暗杀流 ── */
  SHADOW_RUSH: { name: '影冲', desc: '朝最近的猎物尾部瞬移式冲刺' },
  DEADLY_TEAR: { name: '致命撕裂', desc: '对最近目标连续撕咬三段' },
  ABYSS_MIST: { name: '深海迷雾', desc: '隐身并降低周围敌人的警觉' },
  WEAKNESS_MARK: { name: '弱点标记', desc: '标记目标弱点，其受到的伤害翻倍' },

  /* ── 机动流 ── */
  TORRENT_GLIDE: { name: '激流滑行', desc: '高速游走，不会引起敌人警觉' },
  HYDRO_BOUNCE: { name: '水流弹射', desc: '借水流弹射，瞬间位移一大段距离' },
  WHIRL_SLASH: { name: '回旋切割', desc: '回旋一圈，切割周围所有敌人' },
  BLINK_OUT: { name: '瞬撤', desc: '瞬间脱离战斗，并获得短暂无敌' },

  /* ── 控制流 ── */
  PRESSURE_BIND: { name: '水压束缚', desc: '大幅减速周围敌人' },
  VORTEX_TRAP: { name: '旋涡陷阱', desc: '制造旋涡，把敌人吸向自己' },
  DEEP_FROST: { name: '深寒水域', desc: '范围内敌人转向与移动变慢' },
  BUBBLE_LOCK: { name: '气泡困锁', desc: '气泡包裹敌人，使其无法出手' },

  /* ── 成长爆发流 ── */
  DEATH_FRENZY: { name: '濒死狂暴', desc: '血量越低速度越快' },
  BLOOD_SENSE: { name: '血腥嗅觉', desc: '锁定最虚弱的大鱼，使其受到额外伤害' },
  FATAL_PIERCE: { name: '绝命穿刺', desc: '血量越低伤害越高，孤注一掷的一击' },
  ENERGY_DRAIN: { name: '吸能回复', desc: '汲取周围生命回复自己' },

  /* ── 大鱼反制（AI 自动释放） ── */
  TAIL_WAVE: { name: '尾浪震荡', desc: '在弱点区域释放冲击波，击退周围敌人' },
  SONAR_SCAN: { name: '声呐扫描', desc: '扫描出所有隐身的小鱼' },
  HARD_SCALE: { name: '硬鳞展开', desc: '展开硬鳞，短时间内没有弱点' },
} as const;

export type SkillId = keyof typeof SKILL_DATA;

export const SkillId = Object.freeze(
  Object.fromEntries(Object.keys(SKILL_DATA).map((k) => [k, k]))
) as { readonly [K in SkillId]: K };

/** 技能基础冷却（帧）。实际冷却 = BASE_SKILL_COOLDOWN - skillLevel * 10，下限 MIN_SKILL_COOLDOWN */
export const SKILL_COOLDOWN = {
  BASE: 180,
  MIN: 60,
  PER_LEVEL_REDUCTION: 10,
  /** 技能等级带来的强度加成：每级 +10% */
  POWER_PER_LEVEL: 0.1,
  /** 解锁技能所需玩家等级 */
  UNLOCK_LEVEL: 3,
};
