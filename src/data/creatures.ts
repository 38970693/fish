/**
 * ★ 生物注册表 —— 整个项目加内容的唯一入口 ★
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  加一条新鱼，只需要：                                     │
 * │    1. 在下面的 CREATURE_DATA 里加一行                      │
 * │  引擎会自动完成：类型推导、等级、技能挂载、生成池、校验     │
 * └──────────────────────────────────────────────────────────┘
 *
 * 示例 —— 加一条「小飞象章鱼」：
 *
 *   DUMBO_OCTOPUS: {
 *     name: '小飞象章鱼', tier: 2, radius: 28, color: '#f9a8d4',
 *     speed: 1.0, health: 55, damage: 7, weight: 22,
 *     behavior: 'FLEE', biome: 'ABYSS', skill: 'INK',
 *     shape: 'OCTOPUS',
 *     desc: '深渊居民，靠耳朵状的鳍缓缓滑行。',
 *   },
 *
 * 加完就能用：类型系统认得它、生成池会刷它、进化界面会列出它、UI 会显示技能。
 * 只有当你发明一个 SKILL_DATA 里没有的全新技能时，才需要再去 systems/skills.ts 补实现
 * （启动时校验会明确告诉你缺哪个，不会静默失效）。
 *
 * 字段速查：
 *   tier     0=食物 1=初级 2=中级 3=大型 4=顶级
 *   radius   基础半径(px)，越大越难转向
 *   speed    速度倍率，1.0 = 基准速度(1.5)，写 1.2 就是基准的 1.2 倍
 *   weight   被吞掉时提供的体重（也是进化点数）
 *   behavior PASSIVE 温顺 / FLEE 逃跑 / AGGRESSIVE 主动 / AMBUSH 埋伏 / BOSS 首领 / MASCOT 吉祥物
 *   special  POISON 毒 / SHOCK 电 / SPIKE 刺 / LURE 诱饵 / CAMO 伪装 / SHELL 硬壳
 *   biome    原生生态区，影响进化推荐与生成分布
 *   skill    技能 ID，见 data/skills.ts
 *   shape    形状模板 ID，见 data/creatureShapes.ts（缺省 'FISH' 传统鱼形）
 */

import { BASE_SWIM_SPEED } from './world';
import type { BiomeType } from './biomes';
import type { SkillId } from './skills';
import type { SchoolId } from './schools';
import type { CreatureShapeId } from './creatureShapes';
import { SHAPE_DATA } from './creatureShapes';

/** 行为 ID：对应 systems/ai.ts 里的 AI_HANDLERS */
export type BehaviorId = 'PASSIVE' | 'FLEE' | 'AGGRESSIVE' | 'AMBUSH' | 'BOSS' | 'MASCOT';

/** 特殊体质 ID */
export type SpecialId = 'NONE' | 'POISON' | 'SHOCK' | 'SPIKE' | 'LURE' | 'CAMO' | 'SHELL';

/** 加鱼时要填的字段（引擎会自动补默认值） */
export interface CreatureSpec {
  name: string;
  tier: 0 | 1 | 2 | 3 | 4;
  radius: number;
  color: string;
  speed: number;
  health: number;
  damage: number;
  weight: number;
  behavior: BehaviorId;
  special?: SpecialId;
  biome?: BiomeType;
  skill?: SkillId;
  /** 所属战斗流派，决定玩家的流派技能（也可以在下面的 CREATURE_SCHOOLS 里统一配） */
  school?: SchoolId;
  /** 形状模板：缺省 'FISH' 传统鱼形 */
  shape?: CreatureShapeId;
  desc?: string;
}

/** 引擎生成的完整配置 —— UI 和渲染层读的是这个 */
export interface CreatureConfig {
  type: string;
  name: string;
  baseRadius: number;
  color: string;
  speed: number;
  health: number;
  damage: number;
  weightValue: number;
  behavior: BehaviorId;
  /** 可选：引擎会自动补 'NONE'，手工构造配置时不必填 */
  special?: SpecialId;
  tier: 0 | 1 | 2 | 3 | 4;
  /** 可选：UI 取不到时会显示兜底文案 */
  description?: string;
  nativeBiome?: BiomeType;
  /** 技能 ID：逻辑层用 */
  skillId?: SkillId;
  /** 技能显示名：UI 用（兼容旧字段） */
  skillName?: string;
  skillDescription?: string;
  /** 所属战斗流派 */
  school?: SchoolId;
  /**
   * 形状模板（可选：手工构造的配置没有它 = 传统鱼形，
   * 渲染层按 `config.shape ?? 'FISH'` 读取 —— 旧调用点零变化）
   */
  shape?: CreatureShapeId;
}

export const CREATURE_DATA = {
  /* ─────────────── TIER 0 · 食物 ─────────────── */
  PLANKTON: {
    name: '磷虾', tier: 0, radius: 6, color: '#fbbf24',
    speed: 0.33, health: 1, damage: 0, weight: 1,
    behavior: 'PASSIVE', biome: 'SHALLOWS',
  },

  /* ─────────────── TIER 1 · 初始鱼 ─────────────── */
  CLOWN_FISH: {
    name: '小丑鱼', tier: 1, radius: 15, color: '#fb923c',
    speed: 1.1, health: 30, damage: 2, weight: 5,
    behavior: 'FLEE', biome: 'SHALLOWS', skill: 'DASH',
    desc: '浅滩特产。在阳光区域非常灵活。',
  },
  BLUE_TANG: {
    name: '蓝唐王鱼', tier: 1, radius: 14, color: '#2563eb',
    speed: 1.3, health: 20, damage: 1, weight: 5,
    behavior: 'FLEE', biome: 'SHALLOWS', skill: 'DODGE',
    desc: '速度型。游得非常快，容易躲避危险。',
  },
  TURTLE: {
    name: '绿海龟', tier: 1, radius: 18, color: '#166534',
    speed: 0.9, health: 60, damage: 3, weight: 8,
    behavior: 'PASSIVE', special: 'SHELL', biome: 'SWAMP', skill: 'SHELL',
    shape: 'TURTLE',
    desc: '防御型。适应沼泽环境，抗毒回血。',
  },
  JELLYFISH: {
    name: '水母', tier: 1, radius: 20, color: '#d946ef',
    speed: 0.8, health: 30, damage: 5, weight: 6,
    behavior: 'PASSIVE', special: 'SHOCK', biome: 'ABYSS', skill: 'SHOCK',
    shape: 'JELLY',
    desc: '轻微反伤，碰它要小心。',
  },

  /* ─────────────── TIER 2 · 中级 ─────────────── */
  SEAHORSE: {
    name: '海马', tier: 2, radius: 22, color: '#fde047',
    speed: 1.2, health: 40, damage: 4, weight: 15,
    behavior: 'FLEE', biome: 'REEF', skill: 'CAMO',
    shape: 'SEAHORSE',
    desc: '珊瑚区的伪装大师。',
  },
  CRAB: {
    name: '帝王蟹', tier: 2, radius: 25, color: '#b91c1c',
    speed: 1.0, health: 80, damage: 8, weight: 20,
    behavior: 'AGGRESSIVE', special: 'SPIKE', biome: 'REEF', skill: 'SLAM',
    shape: 'CRAB',
    desc: '横行霸道，钳子威力惊人。',
  },
  PUFFER_FISH: {
    name: '河豚', tier: 2, radius: 24, color: '#84cc16',
    speed: 1.0, health: 50, damage: 10, weight: 18,
    behavior: 'PASSIVE', special: 'POISON', biome: 'SWAMP', skill: 'INFLATE',
    shape: 'PUFFER',
    desc: '膨胀后反弹伤害，别乱咬。',
  },
  SQUID: {
    name: '乌贼', tier: 2, radius: 26, color: '#a855f7',
    speed: 1.2, health: 60, damage: 6, weight: 25,
    behavior: 'AMBUSH', special: 'CAMO', biome: 'REEF', skill: 'INK',
    shape: 'CEPHALOPOD',
    desc: '静止时伪装成障碍物，伺机而动。',
  },
  VAMPIRE_SQUID: {
    name: '吸血鬼乌贼', tier: 2, radius: 27, color: '#9f1239',
    speed: 1.05, health: 60, damage: 8, weight: 24,
    behavior: 'AMBUSH', special: 'CAMO', biome: 'ABYSS', skill: 'INK',
    shape: 'CEPHALOPOD',
    desc: '深渊幽影。暗红斗篷般的套膜，静止时像一抹血雾。',
  },
  DUMBO_OCTOPUS: {
    name: '小飞象章鱼', tier: 2, radius: 28, color: '#f9a8d4',
    speed: 1.0, health: 55, damage: 7, weight: 22,
    behavior: 'FLEE', biome: 'ABYSS', skill: 'INK',
    shape: 'OCTOPUS',
    desc: '深渊居民，靠耳朵状的鳍缓缓滑行。',
  },
  ELECTRIC_EEL: {
    name: '电鳗', tier: 2, radius: 30, color: '#ca8a04',
    speed: 1.25, health: 70, damage: 15, weight: 35,
    behavior: 'AGGRESSIVE', special: 'SHOCK', biome: 'SWAMP', skill: 'THUNDER',
    shape: 'EEL',
    desc: '释放高压电流，麻翻一片。',
  },

  /* ─────────────── TIER 3 · 大型 ─────────────── */
  STINGRAY: {
    name: '魔鬼鱼', tier: 3, radius: 40, color: '#475569',
    speed: 1.1, health: 120, damage: 12, weight: 50,
    behavior: 'PASSIVE', special: 'POISON', biome: 'SWAMP', skill: 'VENOM',
    shape: 'RAY',
    desc: '尾刺带毒，被蜇到会持续掉血。',
  },
  SWORD_FISH: {
    name: '剑鱼', tier: 3, radius: 38, color: '#3b82f6',
    speed: 1.3, health: 100, damage: 15, weight: 55,
    behavior: 'AGGRESSIVE', biome: 'SHALLOWS', skill: 'PIERCE',
    shape: 'BILLFISH',
    desc: '极速突进，一击穿心。',
  },
  ANGLER_FISH: {
    name: '灯笼鱼', tier: 3, radius: 45, color: '#3f3f46',
    speed: 0.9, health: 150, damage: 18, weight: 60,
    behavior: 'AMBUSH', special: 'LURE', biome: 'ABYSS', skill: 'LURE',
    shape: 'ANGLER',
    desc: '头顶灯笼的深海鮟鱇。右键变成大肉块：小鱼扑上来送死，大鱼来了就快跑。',
  },
  HAMMERHEAD: {
    name: '双髻鲨', tier: 3, radius: 50, color: '#9ca3af',
    speed: 1.1, health: 180, damage: 20, weight: 70,
    behavior: 'AGGRESSIVE', biome: 'ABYSS', skill: 'SONAR',
    shape: 'HAMMERHEAD',
    desc: '声呐扫描，隐身也躲不掉。',
  },
  GOBLIN_SHARK: {
    name: '哥布林鲨', tier: 3, radius: 48, color: '#e8a0a0',
    speed: 1.15, health: 170, damage: 22, weight: 72,
    behavior: 'AGGRESSIVE', biome: 'ABYSS', skill: 'PIERCE',
    shape: 'SHARK',
    desc: '深海活化石。粉灰皮肤，突出的长吻一击穿刺。',
  },
  OARFISH: {
    name: '皇带鱼', tier: 3, radius: 55, color: '#cbd5e1',
    speed: 0.95, health: 160, damage: 14, weight: 75,
    behavior: 'PASSIVE', biome: 'ABYSS', skill: 'DODGE',
    shape: 'OARFISH',
    desc: '深海传说「龙宫使者」。银白长带身，红冠如鬃，飘忽难测。',
  },
  AROWANA: {
    name: '金龙鱼', tier: 3, radius: 42, color: '#f59e0b',
    speed: 1.2, health: 130, damage: 16, weight: 65,
    behavior: 'AGGRESSIVE', biome: 'SHALLOWS', skill: 'AWE',
    desc: '龙威震慑，让猎物动弹不得。',
  },
  FUR_SEAL: {
    name: '海狗', tier: 3, radius: 46, color: '#3f2c22',
    speed: 1.15, health: 140, damage: 14, weight: 60,
    behavior: 'FLEE', biome: 'REEF', skill: 'ROLL',
    shape: 'SEAL',
    desc: '圆润灵活，翻滚躲避攻击。',
  },

  /* ─────────────── TIER 4 · 顶级 ─────────────── */
  GREAT_WHITE: {
    name: '大白鲨', tier: 4, radius: 80, color: '#e5e7eb',
    speed: 1.1, health: 400, damage: 40, weight: 200,
    behavior: 'AGGRESSIVE', biome: 'SHALLOWS', skill: 'DEVOUR',
    shape: 'SHARK',
    desc: '海洋霸主，张大嘴就是一口吞。',
  },
  ORCA: {
    name: '虎鲸', tier: 4, radius: 100, color: '#020617',
    speed: 1.15, health: 600, damage: 50, weight: 300,
    behavior: 'BOSS', biome: 'ABYSS', skill: 'SONIC',
    shape: 'ORCA',
    desc: '声波冲击，范围毁灭。',
  },
  NARWHAL: {
    name: '独角鲸', tier: 4, radius: 90, color: '#64748b',
    speed: 1.1, health: 500, damage: 60, weight: 250,
    behavior: 'AGGRESSIVE', special: 'SPIKE', biome: 'REEF', skill: 'UNICORN',
    shape: 'NARWHAL',
    desc: '独角贯穿，无视防御。',
  },
  MERMAID: {
    name: '美人鱼', tier: 4, radius: 75, color: '#22d3ee',
    speed: 1.25, health: 350, damage: 30, weight: 500,
    behavior: 'BOSS', biome: 'REEF', skill: 'SIREN',
    shape: 'MERMAID',
    desc: '海妖之歌，让敌人自相残杀。',
  },
  KRAKEN: {
    name: '深海巨怪', tier: 4, radius: 180, color: '#7f1d1d',
    speed: 0.9, health: 2000, damage: 80, weight: 1000,
    behavior: 'BOSS', biome: 'ABYSS', skill: 'TENTACLE',
    shape: 'KRAKEN',
    desc: '触手绞杀，把整个鱼塘拉向深渊。',
  },

  /* ─────────────── 特殊 ─────────────── */
  MASCOT: {
    name: '新春吉祥物', tier: 0, radius: 40, color: '#f59e0b',
    speed: 0.67, health: 9999, damage: 0, weight: 0,
    behavior: 'MASCOT', biome: 'SHALLOWS',
    desc: '庆祝新年的吉祥物！',
  },
} satisfies Record<string, CreatureSpec>;

/** 生物 ID 联合类型：加一条数据，类型系统立刻认得 */
export type CreatureType = keyof typeof CREATURE_DATA;

/** 常量对象：让 `CreatureType.CLOWN_FISH` 这种写法继续可用（原来靠 enum） */
export const CreatureType = Object.freeze(
  Object.fromEntries(Object.keys(CREATURE_DATA).map((k) => [k, k]))
) as { readonly [K in CreatureType]: K };

/**
 * 生物 → 流派 映射表。
 * 加鱼时可以直接在 spec 里写 `school: 'ASSASSIN'`，
 * 也可以统一登记在这里 —— 后者适合批量调整流派归属。
 */
const CREATURE_SCHOOLS: Record<string, SchoolId> = {
  CLOWN_FISH: 'MOBILITY',
  BLUE_TANG: 'MOBILITY',
  SEAHORSE: 'MOBILITY',
  SWORD_FISH: 'MOBILITY',
  DUMBO_OCTOPUS: 'MOBILITY',

  SQUID: 'ASSASSIN',
  VAMPIRE_SQUID: 'ASSASSIN',
  ANGLER_FISH: 'ASSASSIN',
  STINGRAY: 'ASSASSIN',
  NARWHAL: 'ASSASSIN',
  GOBLIN_SHARK: 'ASSASSIN',

  JELLYFISH: 'CONTROL',
  CRAB: 'CONTROL',
  ELECTRIC_EEL: 'CONTROL',
  HAMMERHEAD: 'CONTROL',
  AROWANA: 'CONTROL',
  MERMAID: 'CONTROL',

  TURTLE: 'SURVIVAL',
  PUFFER_FISH: 'SURVIVAL',
  OARFISH: 'SURVIVAL',
  FUR_SEAL: 'SURVIVAL',
  GREAT_WHITE: 'SURVIVAL',
  ORCA: 'SURVIVAL',
  KRAKEN: 'SURVIVAL',
};

/**
 * 把精简的 spec 补全成引擎需要的完整配置：
 * 补默认值、换算速度、挂载技能文案。任何 spec 缺字段都不会崩。
 */
function buildConfig(type: string, spec: CreatureSpec): CreatureConfig {
  return {
    type,
    name: spec.name,
    baseRadius: spec.radius,
    color: spec.color,
    speed: spec.speed * BASE_SWIM_SPEED,
    health: spec.health,
    damage: spec.damage,
    weightValue: spec.weight,
    behavior: spec.behavior,
    special: spec.special ?? 'NONE',
    tier: spec.tier,
    description: spec.desc ?? '神秘的海洋生物',
    nativeBiome: spec.biome,
    skillId: spec.skill,
    school: spec.school ?? CREATURE_SCHOOLS[type],
    shape: spec.shape ?? 'FISH',
  };
}

import { SKILL_DATA } from './skills';

/** 最终注册表：全项目通过它读生物数据 */
export const CREATURES = Object.fromEntries(
  Object.entries(CREATURE_DATA).map(([type, spec]) => {
    const config = buildConfig(type, spec as CreatureSpec);
    if (config.skillId && SKILL_DATA[config.skillId]) {
      config.skillName = SKILL_DATA[config.skillId].name;
      config.skillDescription = SKILL_DATA[config.skillId].desc;
    }
    return [type, config];
  })
) as Record<CreatureType, CreatureConfig>;

/** 按 tier 分好组的生成池，systems/spawn.ts 直接取用（自动包含新加的鱼） */
export const SPAWN_POOL_BY_TIER: Record<number, CreatureType[]> = (() => {
  const pools: Record<number, CreatureType[]> = {};
  for (const [type, spec] of Object.entries(CREATURE_DATA)) {
    const s = spec as CreatureSpec;
    // 吉祥物不参与随机生成
    if (s.behavior === 'MASCOT') continue;
    if (s.tier === 0) continue;
    (pools[s.tier] ||= []).push(type as CreatureType);
  }
  return pools;
})();

/**
 * 启动自检：把数据错误在开发期就骂出来，而不是让玩家遇到「按右键没反应」。
 * 返回问题列表，空数组 = 全部健康。
 */
export function validateCreatures(knownSkills: readonly string[]): string[] {
  const problems: string[] = [];
  for (const [type, spec] of Object.entries(CREATURE_DATA)) {
    const s = spec as CreatureSpec;
    if (!s.name) problems.push(`${type}: 缺少 name`);
    if (!Number.isFinite(s.radius) || s.radius <= 0) problems.push(`${type}: radius 非法 (${s.radius})`);
    if (!Number.isFinite(s.health) || s.health <= 0) problems.push(`${type}: health 非法 (${s.health})`);
    if (!Number.isFinite(s.speed) || s.speed <= 0) problems.push(`${type}: speed 非法 (${s.speed})`);
    if (s.tier < 0 || s.tier > 4) problems.push(`${type}: tier 超出 0-4 (${s.tier})`);
    if (s.skill && !knownSkills.includes(s.skill)) {
      problems.push(`${type}: 引用了未实现的技能 ${s.skill}`);
    }
    if (s.shape && !(s.shape in SHAPE_DATA)) {
      problems.push(`${type}: 引用了未注册的形状 ${s.shape}`);
    }
  }
  return problems;
}
