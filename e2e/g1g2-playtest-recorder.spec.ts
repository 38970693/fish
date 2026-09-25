import { test, expect } from '@playwright/test';

test('试玩页另开的游戏确实进入 RIVALS 规则', async ({ page, context }) => {
  await page.goto('/previews/g1-g2-playtest.html');
  const gamePromise = context.waitForEvent('page');
  await page.getByRole('link', { name: '另开游戏窗口' }).click();
  const game = await gamePromise;
  await expect(game).toHaveURL(/mode=rivals/);
  await game.getByRole('button', { name: /驶入/ }).click();
  await expect.poll(async () => game.evaluate(() =>
    (window as unknown as { __FISH_DEBUG__?: { state: () => { run?: { mode: string } } } })
      .__FISH_DEBUG__?.state().run?.mode)).toBe('RIVALS');
});

test('交接资料检查提示 A/B/C 与原话缺漏，但不代替真人审核', async ({ page }) => {
  await page.goto('/previews/g1-g2-playtest.html');
  await expect(page.locator('#handoffChecklist li[data-complete="false"]')).toHaveCount(5);
  await page.getByLabel('试玩者').fill('自动测试代号');
  await page.getByLabel('设备与浏览器').fill('测试浏览器');
  for (const phase of ['A', 'B', 'C']) {
    await page.getByLabel('局别').selectOption(phase);
    await page.getByRole('button', { name: '开始本局' }).click();
    if (phase === 'A') {
      await page.getByLabel('首场争夺：抢、观望或放弃，为什么').fill('观望，因为还没看清目标');
      await page.getByLabel('第二场：是否想再抢，为什么').fill('想再抢，因为知道了路线');
      await page.getByLabel('两队行为能否区分、是否能退出').fill('能区分，仍需验证退出路线');
      await page.getByLabel('观察事实').fill('测试事实');
      await page.getByLabel('玩家原话').fill('测试原话');
      await page.getByRole('button', { name: '记录此刻' }).click();
    }
    if (phase === 'B') await page.getByLabel('指令/附身的实际效果与预期').fill('测试指令反馈');
    await page.getByLabel('结束方式').selectOption('unfinished');
    await page.getByRole('button', { name: '保存本局结果' }).click();
  }
  await expect(page.locator('#handoffChecklist li[data-complete="true"]')).toHaveCount(5);
  await expect(page.getByText(/交接资料检查只提示缺漏，不判断体验/)).toBeVisible();
});

test('试玩记录页保留手填草稿并导出未审核的时间戳事实', async ({ page }) => {
  await page.goto('/previews/g1-g2-playtest.html');
  await expect(page.getByRole('heading', { name: 'G1/G2 真人试玩记录' })).toBeVisible();
  await page.screenshot({ path: 'scripts/g1-g2-playtest-page.png', fullPage: true });
  await page.getByLabel('试玩者').fill('测试玩家');
  await page.getByRole('button', { name: '开始本局' }).click();
  await page.getByLabel('观察事实').fill('第一场看到了抢食帮，但没有看到伏击帮');
  await page.getByLabel('玩家原话').fill('我不知道另一队在哪');
  await page.getByRole('button', { name: '记录此刻' }).click();
  await expect(page.getByText('第一场看到了抢食帮，但没有看到伏击帮')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('试玩者')).toHaveValue('测试玩家');
  await expect(page.getByText('第一场看到了抢食帮，但没有看到伏击帮')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出记录 JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(report.reviewStatus).toBe('unreviewed');
  expect(report.source).toBe('manual_self_report');
  expect(report.sessions[0].observations[0]).toMatchObject({
    fact: '第一场看到了抢食帮，但没有看到伏击帮',
    quote: '我不知道另一队在哪',
  });
  expect(report.sessions[0].observations[0].elapsedSeconds).toBeGreaterThanOrEqual(0);
});

test('本局必须明确记录胜利、死亡、未结束或练习', async ({ page }) => {
  await page.goto('/previews/g1-g2-playtest.html');
  await page.getByRole('button', { name: '开始本局' }).click();
  await page.getByRole('button', { name: '保存本局结果' }).click();
  await expect(page.getByRole('status')).toHaveText('请先选择本局结束方式');
  await expect(page.getByRole('button', { name: '开始本局' })).toBeDisabled();
  await page.getByLabel('结束方式').selectOption('unfinished');
  await page.getByRole('button', { name: '保存本局结果' }).click();
  await expect(page.getByRole('button', { name: '开始本局' })).toBeEnabled();
});

test('录屏由试玩者主动授权并下载，JSON 只记录文件名和待确认状态', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const context = canvas.getContext('2d')!;
      context.fillRect(0, 0, 64, 64);
      setInterval(() => { context.fillStyle = `rgb(${Date.now() % 255}, 0, 0)`; context.fillRect(0, 0, 64, 64); }, 50);
      return canvas.captureStream(10);
    } });
  });
  await page.goto('/previews/g1-g2-playtest.html');
  await page.getByRole('button', { name: '开始本局' }).click();
  await page.getByRole('button', { name: '开始录屏' }).click();
  await expect(page.getByRole('button', { name: '结束录屏并下载' })).toBeEnabled();
  await page.waitForTimeout(1200);
  const videoDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '结束录屏并下载' }).click();
  const videoDownload = await videoDownloadPromise;
  expect(videoDownload.suggestedFilename()).toMatch(/^g1-g2-A-\d+\.(webm|mp4)$/);
  await expect(page.getByLabel('录屏文件或链接')).toHaveValue(videoDownload.suggestedFilename());
  const jsonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出记录 JSON' }).click();
  const jsonDownload = await jsonDownloadPromise;
  const stream = await jsonDownload.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(report.sessions[0]).toMatchObject({ recordingFile: videoDownload.suggestedFilename(),
    recordingStatus: 'download_requested' });
  expect(report.reviewStatus).toBe('unreviewed');
});

test('拒绝录屏权限后仍可手填并导出，不伪造录像文件', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true,
      value: async () => { throw new DOMException('denied', 'NotAllowedError'); } });
  });
  await page.goto('/previews/g1-g2-playtest.html');
  await page.getByRole('button', { name: '开始本局' }).click();
  await page.getByRole('button', { name: '开始录屏' }).click();
  await expect(page.getByText('未获得录屏授权；手填记录仍可继续。')).toBeVisible();
  await page.getByLabel('观察事实').fill('拒绝录屏后继续记下了争夺过程');
  await page.getByRole('button', { name: '记录此刻' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出记录 JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(report.sessions[0].recordingFile).toBeUndefined();
  expect(report.sessions[0].observations[0].fact).toBe('拒绝录屏后继续记下了争夺过程');
});

test('保存本局会先停止仍在进行的录屏并请求下载', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const context = canvas.getContext('2d')!;
      setInterval(() => { context.fillStyle = `rgb(${Date.now() % 255}, 0, 0)`; context.fillRect(0, 0, 64, 64); }, 50);
      return canvas.captureStream(10);
    } });
  });
  await page.goto('/previews/g1-g2-playtest.html');
  await page.getByRole('button', { name: '开始本局' }).click();
  await page.getByRole('button', { name: '开始录屏' }).click();
  await expect(page.getByRole('button', { name: '结束录屏并下载' })).toBeEnabled();
  await page.waitForTimeout(1200);
  await page.getByLabel('结束方式').selectOption('unfinished');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存本局结果' }).click();
  const video = await downloadPromise;
  expect(video.suggestedFilename()).toMatch(/^g1-g2-A-\d+\.(webm|mp4)$/);
  await expect(page.getByRole('button', { name: '开始本局' })).toBeEnabled();
  await expect(page.getByText(/已请求下载 g1-g2-A-/)).toBeVisible();
});
