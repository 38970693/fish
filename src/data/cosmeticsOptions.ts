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

import type {
  AccessoryType,
  Cosmetics,
  EyeType,
  PatternType,
  ScaleType,
  TeethType,
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
  { value: 'NORMAL', label: '普通', color: '#ffffff' },
  { value: 'SHARP', label: '锐齿', color: '#ef4444' },
  { value: 'VAMPIRE', label: '吸血鬼', color: '#7f1d1d' },
  { value: 'GOLD', label: '金牙', color: '#fbbf24' },
  { value: 'SABER', label: '军刀', color: '#94a3b8' },
  { value: 'DOUBLE_ROW', label: '双排', color: '#fde047' },
  { value: 'DIAMOND', label: '钻石', color: '#e0f2fe' },
  { value: 'RAINBOW', label: '彩虹', color: '#f472b6' },
];

/**
 * 皮肤颜色。`DEFAULT` 不是颜色而是「用这条鱼本来的色」——
 * 老玩家的存档里 skinColor 可能就是 DEFAULT，面板必须能选中它。
 */
export const SKIN_COLOR_OPTIONS: readonly CosmeticOption<string>[] = [
  { value: 'DEFAULT', label: '本鱼本色', color: 'DEFAULT' },
  { value: '#ef4444', label: '红', color: '#ef4444' },
  { value: '#f97316', label: '橙', color: '#f97316' },
  { value: '#eab308', label: '金', color: '#eab308' },
  { value: '#22c55e', label: '绿', color: '#22c55e' },
  { value: '#06b6d4', label: '青', color: '#06b6d4' },
  { value: '#3b82f6', label: '蓝', color: '#3b82f6' },
  { value: '#8b5cf6', label: '紫', color: '#8b5cf6' },
  { value: '#ec4899', label: '粉', color: '#ec4899' },
  { value: '#a855f7', label: '品紫', color: '#a855f7' },
  { value: '#f43f5e', label: '玫红', color: '#f43f5e' },
  { value: '#14b8a6', label: '蓝绿', color: '#14b8a6' },
  { value: '#84cc16', label: '黄绿', color: '#84cc16' },
  { value: '#fb923c', label: '杏', color: '#fb923c' },
  { value: '#f472b6', label: '桃粉', color: '#f472b6' },
  { value: '#c084fc', label: '淡紫', color: '#c084fc' },
];

/** 花纹图案 */
export const PATTERN_OPTIONS: readonly CosmeticOption<PatternType>[] = [
  { value: 'NONE', label: '无' },
  { value: 'STRIPES', label: '条纹' },
  { value: 'SPOTS', label: '斑点' },
  { value: 'TIGER', label: '虎纹' },
  { value: 'ZEBRA', label: '斑马纹' },
  { value: 'STAR', label: '星星' },
  { value: 'GALAXY', label: '星系' },
  { value: 'LAVA', label: '熔岩' },
  { value: 'HEART', label: '爱心' },
  { value: 'CLOUD', label: '云朵' },
];

/** 鳞片效果 */
export const SCALE_OPTIONS: readonly CosmeticOption<ScaleType>[] = [
  { value: 'NONE', label: '无' },
  { value: 'SHINY', label: '闪亮' },
  { value: 'GLOW', label: '发光' },
  { value: 'CRYSTAL', label: '水晶' },
  { value: 'DRAGON', label: '龙鳞' },
  { value: 'ARMOR', label: '盔甲' },
  { value: 'MECHANICAL', label: '机械' },
];

/** 配饰 */
export const ACCESSORY_OPTIONS: readonly CosmeticOption<AccessoryType>[] = [
  { value: 'NONE', label: '无', icon: '❌' },
  { value: 'CROWN', label: '皇冠', icon: '👑' },
  { value: 'SUNGLASSES', label: '墨镜', icon: '🕶️' },
  { value: 'FLOWER', label: '花朵', icon: '🌸' },
  { value: 'HALO', label: '光环', icon: '👼' },
  { value: 'EYEPATCH', label: '眼罩', icon: '🏴‍☠️' },
  { value: 'BOW_TIE', label: '领结', icon: '🎀' },
  { value: 'GOLD_CHAIN', label: '金链', icon: '📿' },
];

/** 眼睛类型 */
export const EYE_OPTIONS: readonly CosmeticOption<EyeType>[] = [
  { value: 'NORMAL', label: '普通' },
  { value: 'ANIME', label: '动漫' },
  { value: 'MAD', label: '愤怒' },
  { value: 'CAT', label: '猫眼' },
  { value: 'FIRE', label: '火焰' },
  { value: 'CYBORG', label: '机械' },
  { value: 'LOVE', label: '爱心' },
  { value: 'DEAD', label: '死亡' },
];

/** 标签页 key */
export type CosmeticTabId = 'color' | 'pattern' | 'accessory' | 'eyes' | 'ai-presets';

/** 标签页顺序与标题（图标由组件层给，数据层不引 React） */
export const COSMETIC_TABS: readonly { id: CosmeticTabId; label: string }[] = [
  { id: 'color', label: '颜色' },
  { id: 'pattern', label: '花纹' },
  { id: 'accessory', label: '配饰' },
  { id: 'eyes', label: '眼睛' },
  { id: 'ai-presets', label: 'AI预设' },
];

/** 整套预设：一键换掉全部 11 项 */
export interface CosmeticPreset {
  name: string;
  cosmetics: Cosmetics;
}

/**
 * 酷炫预设。以前硬编码在 CosmeticsPanel 里，挪到这里是为了让
 * `cosmetics-render.test.ts` 能直接跑「8 个预设必须画得出 8 种鱼」——
 * 不依赖 React 组件就能守住渲染质量。
 */
export const AI_COSMETICS_PRESETS: readonly CosmeticPreset[] = [
  { name: '🦈 鲨鱼', cosmetics: { teeth: 'SHARP', skinColor: '#64748b', pattern: 'NONE', scaleType: 'SHINY', accessory: 'NONE', tailType: 'FORKED', bodyType: 'SLENDER', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'ANGRY', trailType: 'BUBBLES' } },
  { name: '👑 国王', cosmetics: { teeth: 'GOLD', skinColor: '#fbbf24', pattern: 'NONE', scaleType: 'SHINY', accessory: 'CROWN', tailType: 'FORKED', bodyType: 'CHUNKY', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'THICK', trailType: 'RAINBOW' } },
  { name: '🤖 机械', cosmetics: { teeth: 'DIAMOND', skinColor: '#374151', pattern: 'CIRCUIT', scaleType: 'MECHANICAL', accessory: 'SUNGLASSES', tailType: 'MECHANICAL', bodyType: 'BOX', mouthType: 'SQUARE', eyeType: 'CYBORG', eyebrowType: 'NONE', trailType: 'ELECTRIC' } },
  { name: '🐉 神龙', cosmetics: { teeth: 'SABER', skinColor: '#dc2626', pattern: 'LAVA', scaleType: 'DRAGON', accessory: 'NONE', tailType: 'TRIDENT', bodyType: 'SLENDER', mouthType: 'CURVE', eyeType: 'FIRE', eyebrowType: 'UNI', trailType: 'FIRE' } },
  { name: '🧜 美人鱼', cosmetics: { teeth: 'NORMAL', skinColor: '#06b6d4', pattern: 'SPOTS', scaleType: 'GLOW', accessory: 'FLOWER', tailType: 'RIBBON', bodyType: 'MERMAID', mouthType: 'CIRCLE', eyeType: 'LOVE', eyebrowType: 'NONE', trailType: 'BUBBLES' } },
  { name: '🌀 星空', cosmetics: { teeth: 'DIAMOND', skinColor: '#4c1d95', pattern: 'GALAXY', scaleType: 'CRYSTAL', accessory: 'HALO', tailType: 'RIBBON', bodyType: 'SLENDER', mouthType: 'CIRCLE', eyeType: 'ANIME', eyebrowType: 'NONE', trailType: 'GLITTER' } },
  { name: '🌸 樱花', cosmetics: { teeth: 'NORMAL', skinColor: '#f472b6', pattern: 'HEART', scaleType: 'GLOW', accessory: 'FLOWER', tailType: 'FAN', bodyType: 'ROUND', mouthType: 'CIRCLE', eyeType: 'LOVE', eyebrowType: 'NONE', trailType: 'HEARTS' } },
  { name: '⚡ 电光', cosmetics: { teeth: 'SHARP', skinColor: '#facc15', pattern: 'STRIPES', scaleType: 'GLOW', accessory: 'SUNGLASSES', tailType: 'FORKED', bodyType: 'SLENDER', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'ANGRY', trailType: 'ELECTRIC' } },
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
