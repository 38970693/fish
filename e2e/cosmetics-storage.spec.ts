import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types';

test('玩家整套装扮和加速效果刷新后恢复，重置也持久保存', async ({ page }) => {
  const outfit = () => page.evaluate(() =>
    (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().player.cosmetics);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?renderer=pixi');
  await page.getByRole('button', { name: '装扮我的鱼' }).click();
  await page.locator('[data-tab="ai-presets"]').click();
  await page.locator('[data-cosmetic-key="preset"][data-cosmetic-value="🤖 薄荷小机器人"]').click(); // 玩具机器人套装包含 CIRCUIT 花纹。
  await page.locator('[data-tab="eyes"]').click();
  await page.locator('[data-cosmetic-key="eyeType"][data-cosmetic-value="ANIME"]').click();
  await page.getByRole('button', { name: '加速效果', exact: true }).click();
  await page.locator('[data-cosmetic-key="boostStyle"][data-cosmetic-value="FLAME"]').click();
  await page.locator('[data-cosmetic-key="boostColor"][data-cosmetic-value="#fb923c"]').click();
  await page.getByRole('slider', { name: '拖尾长度' }).fill('1.4');
  await page.getByRole('slider', { name: '效果粗细' }).fill('1.2');
  await page.getByRole('checkbox', { name: '附加气泡' }).uncheck();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const saved = await outfit();
  expect(saved).toMatchObject({ pattern: 'CIRCUIT', eyeType: 'ANIME', boostEffect: {
    style: 'FLAME', color: '#fb923c', length: 1.4, width: 1.2, bubbles: false,
  } });

  await page.reload();
  await expect(page.getByRole('button', { name: '装扮我的鱼' })).toBeVisible();
  expect(await outfit()).toEqual(saved);
  await page.getByRole('button', { name: '装扮我的鱼' }).click();
  await page.locator('[data-tab="eyes"]').click();
  await expect(page.locator('[data-cosmetic-key="eyeType"][data-cosmetic-value="ANIME"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '加速效果', exact: true }).click();
  await expect(page.getByRole('slider', { name: '拖尾长度' })).toHaveValue('1.4');
  await expect(page.getByRole('checkbox', { name: '附加气泡' })).not.toBeChecked();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: /驶入/ }).click();
  await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible();
  expect(await outfit()).toEqual(saved);

  await page.evaluate(() => {
    (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().status = 'SHOP' as GameState['status'];
  });
  await page.getByRole('button', { name: '重置', exact: true }).click();
  const reset = await outfit();
  await page.reload();
  await expect(page.getByRole('button', { name: '装扮我的鱼' })).toBeVisible();
  expect(await outfit()).toEqual(reset);
  expect(reset).toMatchObject({ eyeType: 'NORMAL', pattern: 'NONE', skinColor: 'DEFAULT' });
  expect(reset.boostEffect).toBeUndefined();
  expect(errors).toEqual([]);
});
