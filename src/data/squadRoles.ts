/**
 * 战队角色与指令注册表（G1 / FQ-05，《鱼群争霸开发计划》§6.2）。
 *
 * 为什么单开一个文件：计划 §9 的分工表把「队伍角色和指令」划给 `data/squadRoles.ts`。
 * 指令的键位、文案、数值都属于**可调配置**，不该散在 `systems/squad.ts` 的 if 分支里。
 * 本文件先落 FQ-05 需要的**指令**部分；三个核心角色（河豚护卫 / 电鳗控制 / 机动鱼）
 * 是 FQ-06，届时在同一个文件里加 `SQUAD_ROLE`，**别再去开第二个注册表**。
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
