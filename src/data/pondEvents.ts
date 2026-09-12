/**
 * 塘专属事件 + 特产汇总 —— 「多鱼塘」阶段 3a 的数据层。
 *
 * 每塘一行：null = 本塘没有大世界事件（清水塘的「稳」就是它的性格）。
 * 事件以玩家为中心落点 —— 刷在玩家旁边，保证看得见、够得着。
 *
 * getPondSpecialties() 把三条特产线（鱼 / 建筑 / 事件）汇成一份 UI 好消费的摘要，
 * 菜单塘卡的「特产」行直接读它。
 */

import type { PondId } from './ponds';
import { POND_DATA, DEFAULT_POND } from './ponds';
import { CREATURE_DATA, type CreatureSpec } from './creatures';
import { BUILDING_SPAWN_RULES, BUILDING_DATA } from './buildings';

/** 塘事件配置：interval 单位是帧（60 帧 = 1 秒） */
export interface PondEventConfig {
  name: string;
  /** 触发间隔（帧），state.time % interval === 0 时触发 */
  interval: number;
  kind: 'COIN_RAIN' | 'SCHOOL';
  /** COIN_RAIN: 金币枚数；SCHOOL: 鱼的条数 */
  count: number;
  /** 事件落点距玩家的最大距离（px） */
  radius: number;
  /** SCHOOL 专用：过境的特产鱼 */
  creature?: string;
  color: string;
}

export const POND_EVENT_DATA: Record<PondId, PondEventConfig | null> = {
  // 新手塘不上事件：风平浪静是它区别于其它塘的体验
  CLEAR: null,
  CORAL: {
    name: '珊瑚产卵夜', interval: 3600, kind: 'COIN_RAIN', count: 6, radius: 260,
    color: '#2dd4bf',
  },
  ABYSS: {
    name: '星光鱼群潮', interval: 2400, kind: 'SCHOOL', count: 6, radius: 420,
    creature: 'STARLIGHT_FISH', color: '#67e8f9',
  },
};

/** 塘的特产摘要：三条特产线各汇总成一句话素材，UI 直接消费 */
export interface PondSpecialties {
  /** 特产鱼名（按 tier 升序） */
  fish: string[];
  /** 特产建筑名；无则 null */
  building: string | null;
  /** 塘事件名；无则 null */
  event: string | null;
}

export const getPondSpecialties = (pondId?: string | null): PondSpecialties => {
  const id = ((pondId && pondId in POND_DATA) ? pondId : DEFAULT_POND) as PondId;

  const fish = (Object.entries(CREATURE_DATA) as Array<[string, CreatureSpec]>)
    .filter(([, s]) => s.ponds?.includes(id))
    .sort((a, b) => a[1].tier - b[1].tier)
    .map(([, s]) => s.name);

  const buildingRule = BUILDING_SPAWN_RULES.find((r) => r.pond === id);
  const building = buildingRule ? BUILDING_DATA[buildingRule.type].name : null;

  const event = POND_EVENT_DATA[id]?.name ?? null;

  return { fish, building, event };
};
