import { DEFAULT_COSMETICS, type Cosmetics } from '../types';
import {
  ACCESSORY_OPTIONS, AI_COSMETICS_PRESETS, BODY_OPTIONS, EYE_OPTIONS,
  EYEBROW_OPTIONS, MOUTH_OPTIONS, PATTERN_OPTIONS, SCALE_OPTIONS,
  TAIL_OPTIONS, TEETH_OPTIONS, TRAIL_OPTIONS,
} from '../data/cosmeticsOptions';
import { BOOST_STYLE_OPTIONS, DEFAULT_BOOST_EFFECT, getBoostEffect } from '../data/boostEffects';
import { RARE_VARIANT_DATA } from '../data/rareVariants';

export const PLAYER_COSMETICS_STORAGE_KEY = 'fish.playerCosmetics.v1';

const optionsByKey = {
  teeth: TEETH_OPTIONS, pattern: PATTERN_OPTIONS, scaleType: SCALE_OPTIONS,
  accessory: ACCESSORY_OPTIONS, tailType: TAIL_OPTIONS, bodyType: BODY_OPTIONS,
  mouthType: MOUTH_OPTIONS, eyeType: EYE_OPTIONS, eyebrowType: EYEBROW_OPTIONS,
  trailType: TRAIL_OPTIONS,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

/** 旧配置补齐默认值；损坏的单项不影响其余搭配。预设也可能含商店未单独上架的款式。 */
const normalizeCosmetics = (value: unknown): Cosmetics => {
  const result = { ...DEFAULT_COSMETICS };
  if (!isRecord(value)) return result;
  for (const key of Object.keys(optionsByKey) as Array<keyof typeof optionsByKey>) {
    const selected = value[key];
    if (optionsByKey[key].some(option => option.value === selected)
      || AI_COSMETICS_PRESETS.some(preset => preset.cosmetics[key] === selected)) {
      Object.assign(result, { [key]: selected });
    }
  }
  if (value.skinColor === 'DEFAULT' || isColor(value.skinColor)) result.skinColor = value.skinColor;
  if (typeof value.rareVariant === 'string' && Object.hasOwn(RARE_VARIANT_DATA, value.rareVariant)) {
    result.rareVariant = value.rareVariant as Cosmetics['rareVariant'];
  }
  if (isRecord(value.boostEffect)) {
    const effect = value.boostEffect;
    result.boostEffect = getBoostEffect({ ...result, boostEffect: {
      style: BOOST_STYLE_OPTIONS.some(option => option.value === effect.style)
        ? effect.style as NonNullable<Cosmetics['boostEffect']>['style'] : DEFAULT_BOOST_EFFECT.style,
      color: isColor(effect.color) ? effect.color : DEFAULT_BOOST_EFFECT.color,
      length: typeof effect.length === 'number' ? effect.length : DEFAULT_BOOST_EFFECT.length,
      width: typeof effect.width === 'number' ? effect.width : DEFAULT_BOOST_EFFECT.width,
      bubbles: typeof effect.bubbles === 'boolean' ? effect.bubbles : DEFAULT_BOOST_EFFECT.bubbles,
    } });
  }
  return result;
};

export const loadPlayerCosmetics = (): Cosmetics => {
  try {
    const stored = localStorage.getItem(PLAYER_COSMETICS_STORAGE_KEY);
    return stored ? normalizeCosmetics(JSON.parse(stored)) : { ...DEFAULT_COSMETICS };
  } catch {
    return { ...DEFAULT_COSMETICS };
  }
};

export const savePlayerCosmetics = (cosmetics: Cosmetics): void => {
  try {
    localStorage.setItem(PLAYER_COSMETICS_STORAGE_KEY, JSON.stringify(normalizeCosmetics(cosmetics)));
  } catch {
    // 本地存储被禁用时，仍可正常换装和游玩。
  }
};
