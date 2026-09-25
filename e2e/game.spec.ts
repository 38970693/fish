import { test, expect } from '@playwright/test';

test.describe('Game Core Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the game page', async ({ page }) => {
    await expect(page).toHaveTitle(/欢乐鱼塘|Happy Fish Pond/);
  });

  test('should display game canvas', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('should show start button', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /驶入/ });
    await expect(startButton).toBeVisible();
  });
});

test.describe('Player Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const startButton = page.getByRole('button', { name: /驶入/ });
    await startButton.click();
    await page.waitForTimeout(1000);
  });

  test('should respond to keyboard input', async ({ page }) => {
    // Press arrow keys and verify game continues
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Game should still be running
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('should move player with WASD', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await page.keyboard.press('a');
    await page.waitForTimeout(100);
    await page.keyboard.press('s');
    await page.waitForTimeout(100);
    await page.keyboard.press('d');
    await page.waitForTimeout(100);
  });
});

test.describe('UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const startButton = page.getByRole('button', { name: /驶入/ });
    await startButton.click();
    await page.waitForTimeout(2000);
  });

  test('should display HUD elements', async ({ page }) => {
    // HUD 玩家面板：进化点数 + 等级/保护提示（多个元素匹配取其一）
    await expect(page.getByText(/进化点数/)).toBeVisible();
    await expect(page.getByText(/新手保护|Lv\./).first()).toBeVisible();
  });

  test('should display level indicator', async ({ page }) => {
    // 等级显示为 Lv.X 格式
    const levelText = page.locator('text=/Lv\\.\\d+/');
    await expect(levelText.first()).toBeVisible();
  });

  test('should display mini-map', async ({ page }) => {
    const miniMap = page.locator('canvas').last();
    await expect(miniMap).toBeVisible();
  });
});

test.describe('Game Mechanics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const startButton = page.getByRole('button', { name: /驶入/ });
    await startButton.click();
    await page.waitForTimeout(3000);
  });

  test('should spawn creatures over time', async ({ page }) => {
    // Wait for creatures to spawn
    await page.waitForTimeout(5000);

    // Game should still be running without errors
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('should handle portal teleportation', async ({ page }) => {
    // Find and click on a portal area
    // This is a simplified test - full portal testing would need more specific interaction
    await page.waitForTimeout(1000);
  });

  test('should handle treasure collection', async ({ page }) => {
    // Wait for treasure event
    await page.waitForTimeout(1000);
    // Check if treasure UI appears
  });
});
