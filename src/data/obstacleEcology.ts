export const OBSTACLE_ECOLOGY = {
  BRITTLE_CHANCE: 0.2,
  VENT_CHANCE: 0.09,
  BRITTLE_DURABILITY: 100,
  BRITTLE_COIN_COUNT: 3,
  VENT_IDLE_FRAMES: 240,
  VENT_WARNING_FRAMES: 75,
  VENT_ACTIVE_FRAMES: 90,
  VENT_RANGE: 430,
  VENT_PUSH: 1.65,
} as const;

export const stableObstacleHash = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const stableObstacleSample = (seed: string, channel: number): number => {
  let value = stableObstacleHash(`${seed}:${channel}`) + Math.imul(channel + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
};
