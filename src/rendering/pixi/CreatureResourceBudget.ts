export const CREATURE_POOL_CAPACITY = 96;
export const APPEARANCE_CACHE_CAPACITY = 128;
export const CREATURE_REUSE_COOLDOWN_FRAMES = 4;
export const CREATURE_DISPOSE_DELAY_FRAMES = 8;

export interface LruTouchResult {
  hit: boolean;
  evicted?: string;
}

/** 有界外观键缓存。Map 的插入顺序就是 LRU 顺序，touch 会把命中项移到末尾。 */
export class AppearanceLru {
  private entries = new Map<string, true>();

  constructor(readonly capacity = APPEARANCE_CACHE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('AppearanceLru capacity must be a positive integer');
  }

  touch(key: string): LruTouchResult {
    if (this.entries.delete(key)) {
      this.entries.set(key, true);
      return { hit: true };
    }
    this.entries.set(key, true);
    if (this.entries.size <= this.capacity) return { hit: false };
    const evicted = this.entries.keys().next().value as string;
    this.entries.delete(evicted);
    return { hit: false, evicted };
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}
