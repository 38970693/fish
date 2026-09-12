/**
 * ★ 生物形状注册表 —— 「别让水母长得像鱼」★
 *
 * 以前 23 种生物里只有磷虾和吉祥物有专属画法，其余全走同一个
 * 「差口圆 + 三角尾」的鱼形模板，只靠颜色/大小区分 —— 水母没伞、
 * 蟹没钳、剑鱼没剑、独角鲸没角，深海感立不住。
 *
 * 现在每条生物通过 `CREATURE_DATA` 里的 `shape` 字段认领一个形状模板，
 * 渲染层（components/fishShapes.ts）按模板画专属的轮廓与部件。
 * 缺省 'FISH' = 传统鱼形，历史行为零变化（向后兼容铁律）。
 *
 * 加新形状：这里注册 id → fishShapes.ts 补三件套（轮廓/背景件/前景件）
 * → creature-shapes.test.ts 自动把新 id 拉进「两两不同」指纹测试。
 */

export const SHAPE_DATA = {
  /** 传统鱼形：轮廓缺口嘴 + 装扮尾巴 + 装扮牙齿（历史行为） */
  FISH: { name: '标准鱼形' },
  /** 龟壳形：椭圆壳 + 壳纹 + 四桨鳍 */
  TURTLE: { name: '龟壳形' },
  /** 水母伞形：半圆伞 + 波浪裙边 + 飘动触须 */
  JELLY: { name: '水母伞形' },
  /** 海马：管嘴 + 背鳍锯齿 + 螺旋卷尾 */
  SEAHORSE: { name: '海马形' },
  /** 蟹形：横壳 + 六条腿 + 两只大钳 */
  CRAB: { name: '蟹形' },
  /** 河豚刺球：圆球 + 满身短刺 */
  PUFFER: { name: '河豚刺球' },
  /** 头足纲：泪滴套膜 + 前伸触腕 + 后端三角鳍（乌贼/吸血鬼乌贼） */
  CEPHALOPOD: { name: '头足形' },
  /** 章鱼：圆头 + 耳鳍 + 裙状短触手（小飞象） */
  OCTOPUS: { name: '章鱼形' },
  /** 鳗形：细长波带 + 背鳍长浪 */
  EEL: { name: '鳗形' },
  /** 鳐形：菱形翼 + 细长尾刺 */
  RAY: { name: '鳐形' },
  /** 剑鱼：纺锤身 + 上颌长剑 + 背旗 */
  BILLFISH: { name: '剑鱼形' },
  /** 鮟鱇：头顶灯笼杆 + 发光灯泡 + 獠牙 */
  ANGLER: { name: '鮟鱇形' },
  /** 双髻鲨：锤形头 + 背鳍 + 月牙尾 */
  HAMMERHEAD: { name: '锤头鲨形' },
  /** 海狗：纺锤身 + 前鳍桨 + 胡须 */
  SEAL: { name: '海豹形' },
  /** 鲨形：背鳍 + 月牙尾 + 鳃裂 + 灰白腹 */
  SHARK: { name: '鲨形' },
  /** 虎鲸：高耸背鳍 + 白眼斑 + 白腹 */
  ORCA: { name: '虎鲸形' },
  /** 独角鲸：螺旋长角 + 月牙尾 */
  NARWHAL: { name: '独角鲸形' },
  /** 人鱼：鱼身 + 发束 + 双叶尾鳍 */
  MERMAID: { name: '人鱼形' },
  /** 海怪：大圆头 + 粗壮触手 */
  KRAKEN: { name: '海怪形' },
  /** 皇带鱼：银白长带身 + 红色背鳍冠 */
  OARFISH: { name: '皇带鱼形' },
} as const;

/** 生物形状 ID —— CREATURE_DATA 的 shape 字段取值范围 */
export type CreatureShapeId = keyof typeof SHAPE_DATA;

/** 形状 id 合法性校验用 */
export const CREATURE_SHAPE_IDS = Object.keys(SHAPE_DATA) as CreatureShapeId[];

/**
 * 非 FISH 形状的渲染公约（主流程按它裁剪管线）：
 *   · 身体轮廓由形状模板给出（完整闭合 path，无嘴部缺口）
 *   · 嘴画成「表面五官」（小图形贴在头部前缘），不画口腔内壁、不画装扮牙齿
 *   · 不使用装扮尾巴（drawTail）—— 尾/触须/鳍由模板自带
 *   · 眼睛/眉毛/皮肤色/花纹/鳞片/配饰照常生效（花纹与鳞片 clip 在模板轮廓内）
 */
export const isStandardFishShape = (shape: string | undefined): boolean =>
  (shape ?? 'FISH') === 'FISH';
