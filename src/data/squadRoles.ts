/**
 * 战队角色与指令注册表（G1 / FQ-05 + FQ-06，《鱼群争霸开发计划》§6.1 / §6.2）。
 *
 * 为什么单开一个文件：计划 §9 的分工表把「队伍角色和指令」划给 `data/squadRoles.ts`。
 * 指令的键位、文案、数值都属于**可调配置**，不该散在 `systems/squad.ts` 的 if 分支里。
 * 指令（FQ-05）与三个核心角色（FQ-06）都在本文件里 —— 别再去开第二个注册表。
 *
 * 数据驱动套路（与 data/ponds.ts、data/moods.ts 一致）：
 *   `as const` 注册表 + `keyof` 取值 + `getXxxConfig(id)` 未知 id 回退默认值。
 */

/* ══════════════ 指令 ══════════════ */

export const SQUAD_COMMAND = {
  FOCUS: 'FOCUS',
  GUARD: 'GUARD',
  RETREAT: 'RETREAT',
} as const;

export type SquadCommandId = keyof typeof SQUAD_COMMAND;

export interface SquadCommandConfig {
  id: SquadCommandId;
  /** HUD 显示名 */
  name: string;
  /** 键盘 code —— `App.tsx` 靠它派发离散指令（`Digit1` 而不是 `'1'`） */
  keyCode: string;
  /** HUD 键帽 */
  keyLabel: string;
  /** 一句话说明（HUD tooltip / 帮助面板） */
  hint: string;
  /** HUD 高亮色 */
  color: string;
  /**
   * 是否需要**选目标**。
   * 集火要（鼠标指向的敌人）；护卫 / 撤退是对「自己人」下令，没有目标。
   * 它同时决定「没选到目标时」的失败分支 —— 见 `issueCommand`。
   */
  needsTarget: boolean;
}

export const SQUAD_COMMANDS: Record<SquadCommandId, SquadCommandConfig> = {
  FOCUS: {
    id: SQUAD_COMMAND.FOCUS,
    name: '集火',
    keyCode: 'Digit1',
    keyLabel: '1',
    hint: '队员扑向鼠标指向的敌人；目标死亡或追不上后自动回到护卫',
    color: '#f97316',
    needsTarget: true,
  },
  GUARD: {
    id: SQUAD_COMMAND.GUARD,
    name: '护卫',
    keyCode: 'Digit2',
    keyLabel: '2',
    hint: '围绕玩家护卫，只为近处的猎物短暂脱队，不为远处目标跑断腿',
    color: '#22d3ee',
    needsTarget: false,
  },
  RETREAT: {
    id: SQUAD_COMMAND.RETREAT,
    name: '撤退',
    keyCode: 'Digit3',
    keyLabel: '3',
    hint: '停止主动追击，向玩家收紧集结；再次下令前一直保持',
    color: '#a78bfa',
    needsTarget: false,
  },
};

/**
 * 缺省指令 —— 没下过令时就是**护卫**。
 *
 * 这是「新默认值 == 旧硬编码」铁律的落点：FQ-05 之前成员的行为就是围着玩家转圈，
 * 所以 GUARD 必须复刻那套队形，老存档 / 老测试才不会因为多了个字段就变行为。
 */
export const DEFAULT_SQUAD_COMMAND: SquadCommandId = SQUAD_COMMAND.GUARD;

/** HUD 上的排列顺序（集火 / 护卫 / 撤退，与键位 1/2/3 对齐） */
export const SQUAD_COMMAND_LIST: readonly SquadCommandConfig[] = [
  SQUAD_COMMANDS.FOCUS,
  SQUAD_COMMANDS.GUARD,
  SQUAD_COMMANDS.RETREAT,
];

/** 未知 id 回退默认 —— 与 data/ponds.ts / data/moods.ts 的取值函数同一套路 */
export const getSquadCommandConfig = (id?: SquadCommandId): SquadCommandConfig =>
  (id && SQUAD_COMMANDS[id]) || SQUAD_COMMANDS[DEFAULT_SQUAD_COMMAND];

/* ══════════════ 指令数值 ══════════════ */

/**
 * 指令参数集中配置。计划 §5.2 末句要求「先验证『能创造机会，也存在反制』」——
 * 所以这几个数都是**能被玩家的相反操作抵消**的：集火追得远就会把阵形拉散，
 * 追击范围上限就是那道「不能无限追」的反制。
 */
export const SQUAD_COMMAND_CONFIG = {
  /** 集火：可点选敌人的最大距离（相对玩家） */
  FOCUS_PICK_RANGE: 900,
  /** 集火：鼠标容差半径 —— 落点圈内没有敌人就退回「离玩家最近的那个」 */
  FOCUS_CURSOR_TOLERANCE: 170,
  /** 集火：队员与目标超出这个距离就算追不上 → 判失靶、回护卫 */
  FOCUS_CHASE_RANGE: 1400,
  /**
   * 集火的停止距离倍率：队员追到 `(队员半径 + 目标半径) × 该值` 就停。
   *
   * 必须 < 1：碰撞判定的门闸是 `d ≤ r1 + r2`，停在正正好好的半径和上会因为浮点误差
   * 咬不到（集火变成了「贴着敌人干瞪眼」）。留 5% 重叠量，队员会一直压着目标打。
   */
  FOCUS_CONTACT_MULT: 0.95,
  /**
   * 失靶宽限（帧）：目标死亡 / 不可感知后先等一会再回护卫。
   * 取 0 的话，被水草挡一帧就整队散掉，指令形同虚设。
   */
  TARGET_LOST_GRACE: 30,
  /** 护卫：只为这个距离内的猎物脱队（超过就无视，即「不为远处猎物脱队」） */
  GUARD_CHASE_RANGE: 520,
  /** 撤退：集结队形比常规护卫更紧（成员半径 + 玩家半径 + 这个值） */
  RETREAT_RALLY_GAP: 40,
  /**
   * 撤退的归队死区。刻意比常规的 `SQUAD_CONFIG.FOLLOW_DEADZONE`(260) 小得多 ——
   * 撤退要的是**真的收拢**，用 260 的话成员在 260px 外就停下不动了，
   * 「向玩家集结」变成一句空话（还测不出区别）。
   */
  RETREAT_DEADZONE: 110,
  /** 指令提示停留帧数 */
  NOTICE_FRAMES: 150,
  /** 一次最多堆多少条离散指令 —— 防连点把队列撑爆（AR-03：重复输入不多次换身） */
  ACTION_QUEUE_MAX: 8,
} as const;

/* ══════════════ 核心角色（G1 / FQ-06 · 计划 §6.1） ══════════════ */

export const SQUAD_ROLE = {
  /** 河豚护卫：贴身保护受威胁的自己人，冷却允许时给盾 */
  GUARD: 'GUARD',
  /** 电鳗控制：对集火目标 / 贴近队伍的威胁释放短控制 */
  CONTROL: 'CONTROL',
  /** 机动鱼：快速接近争夺点，撤退时优先脱离包围 */
  SCOUT: 'SCOUT',
} as const;

export type SquadRoleId = keyof typeof SQUAD_ROLE;

export interface SquadRoleConfig {
  id: SquadRoleId;
  /** HUD 显示名 */
  name: string;
  /** 一句话定位（HUD / 帮助面板） */
  desc: string;
  /** **弱点**（计划 §6.1 表格第三列）：角色必须各有一条代价，否则选谁都一样 */
  weakness: string;
  /** HUD 角色色 */
  color: string;
  /**
   * 首选物种（收编到这些鱼时优先占核心位）。
   * 角色是**行为配置**，不新增物种 —— 河豚 / 电鳗 / 剑鱼本来就在池子里。
   */
  species: readonly string[];
  /** 移动速度倍率（河豚慢、机动鱼更快的来源） */
  speedMult: number;
  /** 入队时按此比例改最大生命（电鳗「血量低」的来源） */
  healthMult: number;
  /** 入队时按此比例改伤害（机动鱼「正面输出低」的来源，克隆 config 实现，不污染数据表） */
  damageMult: number;
}

export const SQUAD_ROLES: Record<SquadRoleId, SquadRoleConfig> = {
  GUARD: {
    id: SQUAD_ROLE.GUARD,
    name: '河豚护卫',
    desc: '靠近受威胁的自己人，冷却好了就给它套一层护盾',
    weakness: '速度慢，不擅长追击',
    color: '#22c55e',
    species: ['PUFFER_FISH'],
    speedMult: 0.85,
    healthMult: 1,
    damageMult: 1,
  },
  CONTROL: {
    id: SQUAD_ROLE.CONTROL,
    name: '电鳗控制',
    desc: '对集火目标或贴近队伍的威胁释放短控制',
    weakness: '血量低，控制有冷却',
    color: '#eab308',
    species: ['ELECTRIC_EEL'],
    speedMult: 1,
    healthMult: 0.7,
    damageMult: 1,
  },
  SCOUT: {
    id: SQUAD_ROLE.SCOUT,
    name: '机动鱼',
    desc: '快速接近争夺点，撤退时优先脱离包围',
    weakness: '正面输出低',
    color: '#38bdf8',
    species: ['SWORD_FISH'],
    speedMult: 1.1,
    healthMult: 1,
    damageMult: 0.6,
  },
};

/** HUD 上的角色顺序（与计划 §6.1 表格一致） */
export const SQUAD_ROLE_LIST: readonly SquadRoleConfig[] = [
  SQUAD_ROLES.GUARD,
  SQUAD_ROLES.CONTROL,
  SQUAD_ROLES.SCOUT,
];

/**
 * 取角色配置。**没有角色返回 undefined** —— 大多数队员本来就是普通成员，
 * 「没角色」是常态而不是异常，别给它塞一个默认角色（那会让所有鱼都变成核心）。
 */
export const getSquadRoleConfig = (id?: SquadRoleId): SquadRoleConfig | undefined =>
  (id && SQUAD_ROLES[id]) || undefined;

/** 按物种查角色：收编时用它决定这条鱼能不能占核心位 */
export const findRoleBySpecies = (type: string): SquadRoleConfig | undefined =>
  SQUAD_ROLE_LIST.find((r) => r.species.includes(type));

/* ══════════════ 角色数值 ══════════════ */

/**
 * 核心位与专属能力参数。
 *
 * ⚠️ 计划 §6.1 首版：**普通鱼不能触发核心专属能力** —— 否则收满 10 条控制鱼
 *    就是「同时放十个控制」，队伍越大越无脑（计划 §12 的头号风险）。
 *    能力的开关只有 `entity.coreRole` 一个，普通成员永远是 undefined。
 */
export const SQUAD_ROLE_CONFIG = {
  /** 核心成员位（总人数上限仍是 `SQUAD_CONFIG.MAX_SIZE` = 10） */
  CORE_SLOTS: 3,

  /** 河豚：被保护者身边多近算「受威胁」 */
  GUARD_THREAT_RANGE: 420,
  /** 河豚：自己要贴到被保护者多近才给得起盾 */
  GUARD_PROTECT_RANGE: 260,
  /** 河豚：护盾持续帧（3 秒） */
  GUARD_SHIELD_FRAMES: 180,
  /** 河豚：给盾冷却（10 秒）—— 不给冷却就成了无限护盾 */
  GUARD_COOLDOWN: 600,

  /** 电鳗：集火目标在这个距离内才值得控（超出就打别的主意） */
  CONTROL_RANGE: 520,
  /** 电鳗：没有集火目标时，找玩家周围这个范围内的威胁 */
  CONTROL_THREAT_RANGE: 380,
  /** 电鳗：控制持续帧（1.5 秒，短控制 —— 与「无限控死」划清界限） */
  CONTROL_SLOW_FRAMES: 90,
  /** 电鳗：控制冷却（7 秒） */
  CONTROL_COOLDOWN: 420,

  /** 机动鱼：集火时的额外追击速度倍率（乘在角色速度倍率之上） */
  SCOUT_FOCUS_SPEED_MULT: 1.25,
  /** 机动鱼：撤退时从「敌人质心」反方向拉开的距离 */
  SCOUT_BREAKOUT_OFFSET: 260,
} as const;
