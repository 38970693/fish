/**
 * 装扮选项注册表 —— 装扮面板的「货架」。
 *
 * 以前这些清单硬编码在 `components/CosmeticsPanel.tsx` 里，面板和渲染各写各的，
 * 结果出现「面板摆了个按钮、drawCuteFish 里根本没这个分支」的死选项
 * （TIGER / ZEBRA / STAR / GALAXY / LAVA / CLOUD 等）。现在清单收在这里，
 * `cosmetics-render.test.ts` 会拿它逐项去跑真实渲染，断言**每个选项都画得出区别** ——
 * 死选项从「靠肉眼发现」变成「提交前就红」。
 *
 * ⚠️ 这里只列面板**当前暴露**的类别。types.ts 的联合类型比这大得多
 * （PatternType 24 个值、ScaleType 15 个…），没列的那些既没渲染分支也没入口，
 * 想放出来得先补渲染 —— 详见 `开发计划.md` 的待办。
 *
 * 加一个选项：本文件加一条 → 面板与预览缩略图自动出现 → 再补齐渲染分支让测试转绿。
 */

import { DEFAULT_COSMETICS } from '../types';

import type {
  AccessoryType,
  BodyType,
  Cosmetics,
  EyeType,
  EyebrowType,
  MouthType,
  PatternType,
  ScaleType,
  TailType,
  TeethType,
  TrailType,
} from '../types';

/** 一个可选项。色块型选项（皮肤/牙齿）带 `color`，图标型选项（配饰）带 `icon` */
export interface CosmeticOption<T extends string> {
  value: T;
  label: string;
  /** 色块型：按钮上画色块，也用于预览底色 */
  color?: string;
  /** 图标型：按钮上显示的 emoji */
  icon?: string;
}

/** 牙齿类型 */
export const TEETH_OPTIONS: readonly CosmeticOption<TeethType>[] = [
  { value: 'NORMAL', label: '小奶牙', color: '#ffffff' },
  { value: 'SHARP', label: '小虎牙', color: '#ef4444' },
  { value: 'VAMPIRE', label: '兔兔尖牙', color: '#7f1d1d' },
  { value: 'GOLD', label: '奶黄金牙', color: '#fbbf24' },
  { value: 'SABER', label: '长长奶牙', color: '#94a3b8' },
  { value: 'DOUBLE_ROW', label: '双排米牙', color: '#fde047' },
  { value: 'DIAMOND', label: '星钻奶牙', color: '#e0f2fe' },
  { value: 'RAINBOW', label: '糖果彩牙', color: '#f472b6' },
];

/**
 * 皮肤颜色。`DEFAULT` 不是颜色而是「用这条鱼本来的色」——
 * 老玩家的存档里 skinColor 可能就是 DEFAULT，面板必须能选中它。
 */
export const SKIN_COLOR_OPTIONS: readonly CosmeticOption<string>[] = [
  { value: 'DEFAULT', label: '本鱼本色', color: 'DEFAULT' },
  { value: '#ef4444', label: '草莓红', color: '#ef4444' },
  { value: '#f97316', label: '蜜橘橙', color: '#f97316' },
  { value: '#eab308', label: '蜂蜜金', color: '#eab308' },
  { value: '#22c55e', label: '青苹果', color: '#22c55e' },
  { value: '#06b6d4', label: '汽水青', color: '#06b6d4' },
  { value: '#3b82f6', label: '晴空蓝', color: '#3b82f6' },
  { value: '#8b5cf6', label: '葡萄紫', color: '#8b5cf6' },
  { value: '#ec4899', label: '莓果粉', color: '#ec4899' },
  { value: '#a855f7', label: '软糖紫', color: '#a855f7' },
  { value: '#f43f5e', label: '樱桃红', color: '#f43f5e' },
  { value: '#14b8a6', label: '薄荷绿', color: '#14b8a6' },
  { value: '#84cc16', label: '青柠绿', color: '#84cc16' },
  { value: '#fb923c', label: '蜜桃杏', color: '#fb923c' },
  { value: '#f472b6', label: '桃桃粉', color: '#f472b6' },
  { value: '#c084fc', label: '香芋紫', color: '#c084fc' },
  { value: '#a9d9ee', label: '棉花蓝', color: '#a9d9ee' },
  { value: '#ffbfd3', label: '奶泡粉', color: '#ffbfd3' },
  { value: '#b2e3d4', label: '薄荷奶', color: '#b2e3d4' },
  { value: '#b5a0e5', label: '蓝莓奶', color: '#b5a0e5' },
  { value: '#9ec8f1', label: '泡泡蓝', color: '#9ec8f1' },
];

/** 花纹图案 */
export const PATTERN_OPTIONS: readonly CosmeticOption<PatternType>[] = [
  { value: 'NONE', label: '素素的' },
  { value: 'STRIPES', label: '奶油条纹' },
  { value: 'SPOTS', label: '奶糖波点' },
  { value: 'TIGER', label: '奶茶虎纹' },
  { value: 'ZEBRA', label: '紫糖斑马' },
  { value: 'STAR', label: '小星饼' },
  { value: 'GALAXY', label: '蓝莓星空' },
  { value: 'LAVA', label: '蜜桃流心' },
  { value: 'HEART', label: '甜甜爱心' },
  { value: 'CLOUD', label: '棉花云朵' },
];

/** 鳞片效果 */
export const SCALE_OPTIONS: readonly CosmeticOption<ScaleType>[] = [
  { value: 'NONE', label: '软软素肌' },
  { value: 'SHINY', label: '珍珠高光' },
  { value: 'GLOW', label: '萤火奶光' },
  { value: 'CRYSTAL', label: '星糖水晶' },
  { value: 'DRAGON', label: '小龙贝鳞' },
  { value: 'ARMOR', label: '爱心软甲' },
  { value: 'MECHANICAL', label: '玩具面板' },
];

/** 配饰 */
export const ACCESSORY_OPTIONS: readonly CosmeticOption<AccessoryType>[] = [
  { value: 'NONE', label: '不戴配饰', icon: '🫧' },
  { value: 'CROWN', label: '奶糖皇冠', icon: '👑' },
  { value: 'SUNGLASSES', label: '糖果墨镜', icon: '🕶️' },
  { value: 'FLOWER', label: '桃桃花夹', icon: '🌸' },
  { value: 'HALO', label: '小天使环', icon: '👼' },
  { value: 'EYEPATCH', label: '爱心眼罩', icon: '🏴‍☠️' },
  { value: 'BOW_TIE', label: '软绒蝴蝶结', icon: '🎀' },
  { value: 'GOLD_CHAIN', label: '珍珠心链', icon: '📿' },
];

/** 眼睛类型 */
export const EYE_OPTIONS: readonly CosmeticOption<EyeType>[] = [
  { value: 'NORMAL', label: '水汪汪' },
  { value: 'ANIME', label: '星光大眼' },
  { value: 'MAD', label: '气鼓鼓' },
  { value: 'CAT', label: '奶萌猫眼' },
  { value: 'FIRE', label: '小太阳眼' },
  { value: 'CYBORG', label: '机器人宝宝' },
  { value: 'LOVE', label: '爱心眼' },
  { value: 'DEAD', label: '困困眼' },
];

/** 眉毛类型（渲染分支见 drawEyebrows，6 个非 NONE 值全有专属画法） */
export const EYEBROW_OPTIONS: readonly CosmeticOption<EyebrowType>[] = [
  { value: 'NONE', label: '不画眉毛' },
  { value: 'ANGRY', label: '小倔强' },
  { value: 'SAD', label: '委屈巴巴' },
  { value: 'CONFUSED', label: '好奇挑眉' },
  { value: 'THICK', label: '毛绒眉' },
  { value: 'UNI', label: '乖乖平眉' },
  { value: 'TIERED', label: '双层弯眉' },
];

/**
 * 嘴型由共享表面五官绘制，使用小圆嘴、软糖方嘴和猫猫笑脸。
 */
export const MOUTH_OPTIONS: readonly CosmeticOption<MouthType>[] = [
  { value: 'TRIANGLE', label: '开心小嘴' },
  { value: 'CIRCLE', label: '嘟嘟圆嘴' },
  { value: 'SQUARE', label: '软糖方嘴' },
  { value: 'FLAT', label: '乖乖抿嘴' },
  { value: 'BEAK', label: '小鸭鸭嘴' },
  { value: 'CURVE', label: '猫猫微笑' },
];

/**
 * 体型：压扁 / 拉长整条鱼（getBodyTypeParams 的 scaleX/scaleY）。
 * ⚠️ 不上架 STAR —— 它的缩放参数和 ROUND 完全一样（1.15/1.15），
 * 摆上货架就是「按钮在、区别没有」的死选项，等它有了专属轮廓再放出来。
 */
export const BODY_OPTIONS: readonly CosmeticOption<BodyType>[] = [
  { value: 'DEFAULT', label: '小鱼宝宝' },
  { value: 'ROUND', label: '圆滚糯米' },
  { value: 'SLENDER', label: '小小流线' },
  { value: 'CHUNKY', label: '胖胖团子' },
  { value: 'BOX', label: '软糖小方' },
  { value: 'MERMAID', label: '人鱼宝宝' },
  { value: 'RAY', label: '软绵小翼' },
  { value: 'EEL', label: '长长糯条' },
];

/** 尾巴（渲染分支见 drawTail，8 个非 DEFAULT 值全有专属画法） */
export const TAIL_OPTIONS: readonly CosmeticOption<TailType>[] = [
  { value: 'DEFAULT', label: '圆瓣小尾' },
  { value: 'CRESCENT', label: '弯弯月牙' },
  { value: 'FORKED', label: '蝴蝶燕尾' },
  { value: 'FAN', label: '花瓣小扇' },
  { value: 'TRIDENT', label: '三瓣软糖' },
  { value: 'LOBSTER', label: '蜜桃虾尾' },
  { value: 'MECHANICAL', label: '玩具小尾' },
  { value: 'GHOST', label: '云朵幽灵' },
  { value: 'RIBBON', label: '丝带蝴蝶' },
];

/** 拖尾：身后拖出的粒子痕迹（drawTrail，7 个非 NONE 值全有专属画法） */
export const TRAIL_OPTIONS: readonly CosmeticOption<TrailType>[] = [
  { value: 'NONE', label: '不带尾迹' },
  { value: 'BUBBLES', label: '啵啵气泡' },
  { value: 'RAINBOW', label: '彩糖泡泡' },
  { value: 'FIRE', label: '暖暖云火' },
  { value: 'GLITTER', label: '星星闪粉' },
  { value: 'HEARTS', label: '甜心泡泡' },
  { value: 'ELECTRIC', label: '卷卷电光' },
  { value: 'SLIME', label: '青苹果冻' },
];

/** 标签页 key */
export type CosmeticTabId = 'color' | 'pattern' | 'face' | 'body' | 'accessory' | 'eyes' | 'boost' | 'ai-presets';

/** 标签页顺序与标题（图标由组件层给，数据层不引 React） */
export const COSMETIC_TABS: readonly { id: CosmeticTabId; label: string }[] = [
  { id: 'color', label: '颜色' },
  { id: 'pattern', label: '花纹' },
  { id: 'face', label: '五官' },
  { id: 'body', label: '身形' },
  { id: 'accessory', label: '配饰' },
  { id: 'eyes', label: '眼睛' },
  { id: 'boost', label: '加速效果' },
  { id: 'ai-presets', label: '萌萌套装' },
];

/** 整套预设：一键换掉全部 11 项 */
export interface CosmeticPreset {
  name: string;
  description: string;
  cosmetics: Cosmetics;
}

/**
 * 萌系预设。以前硬编码在 CosmeticsPanel 里，挪到这里是为了让
 * `cosmetics-render.test.ts` 能直接跑「8 个预设必须画得出 8 种鱼」——
 * 不依赖 React 组件就能守住渲染质量。
 */
/** Sweet outfits keep the saved option IDs while pairing soft colors and expressions. */
export const AI_COSMETICS_PRESETS: readonly CosmeticPreset[] = [
  { name: '🍓 草莓奶糖', description: '粉粉的爱心，软软的蝴蝶结', cosmetics: { ...DEFAULT_COSMETICS, teeth: 'RAINBOW', skinColor: '#f472b6', pattern: 'HEART', scaleType: 'SHINY', accessory: 'BOW_TIE', tailType: 'FAN', bodyType: 'ROUND', mouthType: 'CURVE', eyeType: 'LOVE', trailType: 'HEARTS' } },
  { name: '☁️ 云朵奶泡', description: '抱着棉花云，做一个甜甜的梦', cosmetics: { ...DEFAULT_COSMETICS, skinColor: '#a9d9ee', pattern: 'CLOUD', scaleType: 'SHINY', accessory: 'HALO', tailType: 'GHOST', bodyType: 'CHUNKY', mouthType: 'CIRCLE', eyeType: 'ANIME', trailType: 'BUBBLES' } },
  { name: '👑 奶黄小王子', description: '戴上小皇冠，今天也乖乖的', cosmetics: { ...DEFAULT_COSMETICS, teeth: 'GOLD', skinColor: '#fbbf24', pattern: 'STAR', scaleType: 'SHINY', accessory: 'CROWN', tailType: 'FORKED', bodyType: 'ROUND', mouthType: 'CURVE', trailType: 'GLITTER' } },
  { name: '🌸 桃桃花仙子', description: '一朵小桃花，两条轻轻的丝带', cosmetics: { ...DEFAULT_COSMETICS, skinColor: '#ffbfd3', pattern: 'SPOTS', scaleType: 'GLOW', accessory: 'FLOWER', tailType: 'RIBBON', bodyType: 'MERMAID', mouthType: 'CURVE', eyeType: 'ANIME', trailType: 'HEARTS' } },
  { name: '🤖 薄荷小机器人', description: '糖果按钮和亮晶晶的玩具小尾', cosmetics: { ...DEFAULT_COSMETICS, teeth: 'DIAMOND', skinColor: '#b2e3d4', pattern: 'CIRCUIT', scaleType: 'MECHANICAL', tailType: 'MECHANICAL', bodyType: 'BOX', mouthType: 'SQUARE', eyeType: 'CYBORG', trailType: 'ELECTRIC' } },
  { name: '🌙 蓝莓晚安', description: '数数小星星，眼睛困困啦', cosmetics: { ...DEFAULT_COSMETICS, skinColor: '#b5a0e5', pattern: 'GALAXY', scaleType: 'CRYSTAL', accessory: 'HALO', tailType: 'CRESCENT', bodyType: 'ROUND', mouthType: 'FLAT', eyeType: 'DEAD', trailType: 'GLITTER' } },
  { name: '🐲 蜜桃小龙', description: '圆圆的小龙鳞，暖暖的小太阳', cosmetics: { ...DEFAULT_COSMETICS, teeth: 'VAMPIRE', skinColor: '#fb923c', pattern: 'LAVA', scaleType: 'DRAGON', accessory: 'FLOWER', tailType: 'TRIDENT', bodyType: 'CHUNKY', mouthType: 'CIRCLE', eyeType: 'FIRE', eyebrowType: 'ANGRY', trailType: 'FIRE' } },
  { name: '🫧 奶萌小海盗', description: '爱心眼罩下藏着一点点小倔强', cosmetics: { ...DEFAULT_COSMETICS, teeth: 'SHARP', skinColor: '#9ec8f1', pattern: 'STRIPES', scaleType: 'SHINY', accessory: 'EYEPATCH', tailType: 'LOBSTER', bodyType: 'DEFAULT', mouthType: 'TRIANGLE', eyeType: 'MAD', eyebrowType: 'CONFUSED', trailType: 'RAINBOW' } },
];

/**
 * 把某个选项「装到」当前装扮上，得到一份用于预览的装扮。
 * 预览缩略图靠它算出「这条鱼穿上这个选项之后长什么样」——
 * 直接改那一项，其余保持玩家当前的选择，这样缩略图之间只差一个变量，对比才有意义。
 */
export const withOption = <K extends keyof Cosmetics>(
  cosmetics: Cosmetics,
  key: K,
  value: Cosmetics[K]
): Cosmetics => ({ ...cosmetics, [key]: value });
