import { describe, expect, it, vi } from 'vitest';
import { Graphics, Texture } from 'pixi.js';
import { createEntity } from '../gameEngine';
import { CreatureType, DEFAULT_COSMETICS, type Entity } from '../types';
import { EYE_OPTIONS } from '../data/cosmeticsOptions';
import { fishEyeOpenness } from '../rendering/fishBlink';
import { drawCuteFace } from '../rendering/cuteFishFace';
import { drawEyes } from '../rendering/cosmetics';
import { CosmeticGraphicsContext } from '../rendering/pixi/CosmeticGraphicsContext';
import { CreatureDisplay } from '../rendering/pixi/CreatureDisplay';

const fish = () => ({ id: 'blink-preview', animOffset: 0, cosmetics: { ...DEFAULT_COSMETICS } });
const firstClosed = (subject: Pick<Entity, 'id' | 'animOffset' | 'cosmetics'> = fish()) => {
  for (let now = 0; now < 4000; now++) if (fishEyeOpenness(subject, now) === 0) return now;
  throw new Error('Fish did not blink');
};

describe('自然眨眼', () => {
  it('静态缩略图睁眼，眨眼经过半闭、闭合、再次睁开', () => {
    const subject = fish(), closed = firstClosed(subject);
    expect(fishEyeOpenness(subject, 14 * (1000 / 60))).toBe(1);
    expect(fishEyeOpenness(subject, closed - 35)).toBeGreaterThan(0);
    expect(fishEyeOpenness(subject, closed - 35)).toBeLessThan(1);
    expect(fishEyeOpenness(subject, closed + 35)).toBe(0);
    expect(fishEyeOpenness(subject, closed + 100)).toBeGreaterThan(0);
    expect(fishEyeOpenness(subject, closed + 100)).toBeLessThan(1);
    expect(fishEyeOpenness(subject, closed + 160)).toBe(1);
  });

  it('稳定身份错开节奏，不使用游戏随机数，也不改鱼状态', () => {
    const subjects = Array.from({ length: 12 }, (_, i) => ({ ...fish(), id: `fish-${i}` }));
    const before = structuredClone(subjects);
    const random = vi.spyOn(Math, 'random');
    try {
      const times = subjects.map(firstClosed);
      expect(new Set(times).size).toBeGreaterThan(8);
      for (const subject of subjects) {
        const time = firstClosed(subject);
        expect(fishEyeOpenness(structuredClone(subject), time)).toBe(fishEyeOpenness(subject, time));
      }
      expect(random).not.toHaveBeenCalled();
      expect(subjects).toEqual(before);
    } finally { random.mockRestore(); }
  });

  it('偶尔会连眨；睡眼表情和无效时间保持稳定', () => {
    const subject = fish();
    const episodes: number[] = [];
    let previous = 1;
    for (let time = 0; time < 30_000; time += 10) {
      const value = fishEyeOpenness(subject, time);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value === 0 && previous !== 0) episodes.push(time);
      previous = value;
    }
    expect(episodes.some((time, i) => i > 0 && time - episodes[i - 1] < 500)).toBe(true);
    subject.cosmetics.eyeType = 'DEAD';
    expect(fishEyeOpenness(subject, firstClosed())).toBe(1);
    expect(fishEyeOpenness(fish(), NaN)).toBe(1);
  });

  it.each(EYE_OPTIONS)('$value 眨眼保留两侧位置，闭眼不残留眼白和瞳孔', option => {
    const graphic = new Graphics(), ctx = new CosmeticGraphicsContext(graphic).asCanvas();
    const paint = (open: number) => option.value === 'NORMAL'
      ? drawCuteFace(ctx, 50, 15, 20, 0.2, open)
      : drawEyes(ctx, option.value, 15, 20, 50, 14, open);
    paint(1);
    const count = graphic.context.instructions.length;
    graphic.clear(); paint(0);
    expect(graphic.context.bounds.minY).toBeLessThan(-15);
    expect(graphic.context.bounds.maxY).toBeGreaterThan(15);
    if (option.value !== 'DEAD') {
      expect(graphic.context.instructions.length).toBeLessThan(count);
      expect(graphic.context.instructions.filter(i => i.action === 'stroke')).toHaveLength(2);
    } else expect(graphic.context.instructions.length).toBe(count);
    graphic.destroy();
  });

  it('Pixi 圆眼的中间帧也压扁眼白和瞳孔，不只切换闭眼线', () => {
    const graphic = new Graphics(), ctx = new CosmeticGraphicsContext(graphic).asCanvas();
    drawCuteFace(ctx, 10, 3.5, 4.5, 0.2, 1);
    const openHeight = graphic.context.bounds.maxY - 4.5;
    graphic.clear(); drawCuteFace(ctx, 10, 3.5, 4.5, 0.2, 0.4);
    expect(graphic.context.bounds.maxY - 4.5).toBeCloseTo(openHeight * 0.4);
    graphic.destroy();
  });

  it('Pixi 只更新眼睛，复用身体和装扮；静帧和 LOD 正确切换', () => {
    const subject = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    subject.id = 'blink-preview'; subject.animOffset = 0;
    subject.cosmetics = { ...DEFAULT_COSMETICS, accessory: 'SUNGLASSES' };
    const display = new CreatureDisplay(subject.id);
    display.update(subject, 200, false);
    const eyes = display.root.getChildByLabel('fish-eyes') as Graphics;
    const details = display.root.children[display.root.getChildIndex(eyes) + 1] as Graphics;
    const eyeClear = vi.spyOn(eyes, 'clear'), detailClear = vi.spyOn(details, 'clear');
    const signature = display.appearanceSignature();
    const openCount = eyes.context.instructions.length;
    display.update(subject, 300, false);
    expect(eyeClear).not.toHaveBeenCalled();
    display.update(subject, firstClosed(subject), false);
    expect(eyes.context.instructions.length).toBeLessThan(openCount);
    expect(detailClear).not.toHaveBeenCalled();
    expect(display.appearanceSignature()).toBe(signature);
    display.update(subject, firstClosed(subject), false, 0, true);
    expect(eyes.context.instructions.length).toBe(openCount);
    display.update(subject, 300, false, 2);
    display.useLodTexture({ texture: Texture.WHITE, centerX: 0, centerY: 0, bytes: 4 });
    expect(eyes.visible).toBe(false);
    display.update(subject, 300, false, 0);
    expect(eyes.visible).toBe(true);
    display.setPresentationMode('VOLUME_ONLY');
    display.update(subject, 300, false);
    expect(eyes.visible).toBe(false);
    display.destroy();
  });
});
