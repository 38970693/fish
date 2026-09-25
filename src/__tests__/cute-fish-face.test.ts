import { describe, expect, it } from 'vitest';
import { cuteFacePair } from '../rendering/cuteFishFace';

describe('俯视鱼的成对可爱五官', () => {
  it('默认眼睛、瞳孔、高光与腮红严格上下镜像', () => {
    const [top, bottom] = cuteFacePair(30, 0.35, 0.42, 0.2, 'NORMAL');
    for (const key of ['eye', 'pupil', 'shine', 'blush'] as const) {
      expect(top[key]?.x).toBe(bottom[key]?.x);
      expect(top[key]?.y).toBeCloseTo(-(bottom[key]?.y ?? 0));
    }
    expect(top.eye.radius).toBeGreaterThan(30 * 0.2);
    expect(Math.abs(top.blush!.y)).toBeLessThan(Math.abs(top.eye.y));
  });

  it('凶恶和死亡眼不加腮红；小到不可见时也不画', () => {
    expect(cuteFacePair(30, 0.35, 0.42, 0.2, 'MAD')[0].blush).toBeNull();
    expect(cuteFacePair(30, 0.35, 0.42, 0.2, 'DEAD')[0].blush).toBeNull();
    expect(cuteFacePair(8, 0.35, 0.42, 0.2, 'NORMAL')[0].blush).toBeNull();
  });
});
