import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/?renderer=pixi');
  await page.getByText('全球海域航图', { exact: true }).waitFor();
  await page.screenshot({ path: 'scripts/global-ocean-map.png' });

  await page.getByRole('button', { name: '选择海域 马里亚纳深海' }).click();
  await page.getByText('黑暗探索与巨物生存', { exact: true }).waitFor();
  const start = page.getByRole('button', { name: '驶入马里亚纳深海' });
  await start.click();
  await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.status === 'PLAYING');
  const state = await page.evaluate(() => ({
    pondId: window.__FISH_DEBUG__.state().pondId,
    portals: window.__FISH_DEBUG__.state().portals.filter(portal => portal.kind === 'POND').map(portal => portal.name),
  }));
  if (state.pondId !== 'ABYSS') throw new Error(`Expected ABYSS, got ${state.pondId}`);
  if (!state.portals.some(name => name.includes('赤道暖海')) || !state.portals.some(name => name.includes('珊瑚群岛'))) {
    throw new Error(`Global route portal names missing: ${JSON.stringify(state.portals)}`);
  }
  await page.screenshot({ path: 'scripts/global-ocean-abyss.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}
