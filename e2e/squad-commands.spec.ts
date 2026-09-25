import { test, expect, type Page } from '@playwright/test';

/**
 * FQ-05 端到端：键盘 / 头像 → 离散指令队列 → squadSystem → 状态变化。
 *
 * 单测覆盖了系统内部（`fq05-commands.test.ts` 27 例），但**盖不到最上面那一层**：
 * React 的 keydown 有没有真的把 1/2/3 接到 `queueSquadAction`、鼠标屏幕坐标有没有被
 * 正确反解成世界坐标、头像点击有没有接到指定附身。本文件专门盯这几段接线。
 *
 * ── 为什么直接往 state 里塞队员 / 敌人 ──
 * 真去「吃掉一条鱼收编」需要先撞见一条体型合适的鱼、贴身咬死，时序完全不受控；
 * `__FISH_DEBUG__` 就是给探针留的口子（App.tsx 里 DEV 才挂），这里用它把
 * 「已经吃到一条鱼」这个前置条件直接摆好，再验证**玩家操作**这一段。
 */

/** 摆一个队员 + 一个敌人；返回玩家 / 队员的原始坐标，供位置交换断言用 */
const injectSquad = (page: Page, memberSpeed = 4) =>
  page.evaluate((speed) => {
    const dbg = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
    const s = dbg.state();
    // 抄玩家实体当模板：字段一定齐全（渲染 / 战斗 / 阵营都读它），只改需要区分的字段。
    // inCover / camoActive 显式清掉 —— 出生点万一在水草里，集火会因为「不可感知」选不到目标，
    // 测试就会莫名其妙地红。
    const base = { semiGhostTimer: 0, camoActive: false, inCover: false, health: 100, maxHealth: 100 };
    const member = {
      ...s.player, ...base,
      id: 'e2e-member', ownerId: 'player', radius: 40,
      x: s.player.x + 260, y: s.player.y + 160, speed,
    };
    const enemy = {
      ...s.player, ...base,
      id: 'e2e-enemy', ownerId: undefined, radius: 30,
      x: s.player.x + 400, y: s.player.y,
    };
    s.entities.push(member, enemy);
    return { playerX: s.player.x, playerY: s.player.y, memberX: member.x, memberY: member.y };
  }, memberSpeed);

const squadSnapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.squad());

const playerSnapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.player());

/**
 * 把鼠标移到某个实体的屏幕位置。
 *
 * 为什么必须要这一步（首轮就跑红过）：集火的选靶是「鼠标容差圈（170px）内的敌人优先」，
 * 而鼠标**没移动过时停在屏幕中心** —— 屏幕中心又正好跟着相机 ≈ 玩家所在处。
 * 于是「圈内」等于「玩家 170px 内」，判据退化成「离玩家最近」，世界里随机刷出来的野鱼
 * 完全可能比我们注入的敌人更近，集火就锁到别条鱼身上去了。
 * 把鼠标真的压到目标身上，圈内就只剩它，选靶才是确定的。
 */
const pointMouseAt = async (page: Page, entityId: string): Promise<void> => {
  const pos = await page.evaluate((id) => {
    const s = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
    const e = s.entities.find((x: { id: string }) => x.id === id);
    if (!e) return null;
    // 与 GameCanvas 的相机变换一致：screen = (world - camera) * zoom + size / 2
    return {
      x: (e.x - s.camera.x) * s.camera.zoom + window.innerWidth / 2,
      y: (e.y - s.camera.y) * s.camera.zoom + window.innerHeight / 2,
    };
  }, entityId);
  if (pos) await page.mouse.move(pos.x, pos.y);
};

const startGame = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /驶入/ }).click();
  await expect(page.getByText(/玩家 \(/)).toBeVisible({ timeout: 5000 });
};

test.describe('FQ-05 战队指令与指定附身', () => {
  test('没有队员时按 1 → 说出原因，而不是静默失败', async ({ page }) => {
    await startGame(page);

    await page.keyboard.press('Digit1');

    // 指令提示挂在 HUD 上（NOTICE_FRAMES=150 帧 ≈ 2.5s，足够 HUD 的 100ms 同步一次）
    await expect(page.getByText('没有队员，无法下令')).toBeVisible({ timeout: 4000 });
    // 没真的下达 → 状态不该变（缺省就是护卫）
    expect((await squadSnapshot(page)).command).toBe('GUARD');
  });

  test('键盘 1/2/3 与 HUD 按钮都能改变指令状态', async ({ page }) => {
    await startGame(page);
    await injectSquad(page);

    await page.keyboard.press('Digit3');
    await expect.poll(async () => (await squadSnapshot(page)).command, { timeout: 3000 })
      .toBe('RETREAT');

    await page.keyboard.press('Digit2');
    await expect.poll(async () => (await squadSnapshot(page)).command, { timeout: 3000 })
      .toBe('GUARD');

    // HUD 按钮走的是另一条通路（onSquadCommand → 入队），也要能生效
    await page.getByRole('button', { name: /3 撤退/ }).click();
    await expect.poll(async () => (await squadSnapshot(page)).command, { timeout: 3000 })
      .toBe('RETREAT');
  });

  test('按 1 集火记住目标；目标死亡后自动回护卫', async ({ page }) => {
    await startGame(page);
    await injectSquad(page);
    // 鼠标压到注入的那个敌人身上，选靶才是确定的（见 pointMouseAt 注释）
    await pointMouseAt(page, 'e2e-enemy');

    await page.keyboard.press('Digit1');

    await expect.poll(async () => (await squadSnapshot(page)).command, { timeout: 3000 })
      .toBe('FOCUS');
    expect((await squadSnapshot(page)).targetId).toBe('e2e-enemy');
    // 队列被消费干净（离散输入不留到下一帧重复执行 —— AR-03）
    expect((await squadSnapshot(page)).queued).toBe(0);

    // 目标死亡 → 下一帧判失靶、降级回护卫
    await page.evaluate(() => {
      const s = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      const e = s.entities.find((x: { id: string }) => x.id === 'e2e-enemy');
      if (e) e.health = 0;
    });
    await expect.poll(async () => (await squadSnapshot(page)).command, { timeout: 4000 })
      .toBe('GUARD');
    expect((await squadSnapshot(page)).targetId).toBeNull();
  });

  test('点队员头像 → 交换身体与位置，成长进度不丢', async ({ page }) => {
    await startGame(page);
    // 队员速度钉 0：让它站定，这样「玩家有没有真的瞬移到它身上」才是可断言的
    const info = await injectSquad(page, 0);

    const before = await playerSnapshot(page);
    const memberBefore = (await squadSnapshot(page)).members[0];
    expect(memberBefore.id).toBe('e2e-member');

    await page.locator('[title^="点此附身到"]').first().click();

    // 位置：玩家落到队员原来站着的地方（之后还会自己游，所以给一点容差）
    await expect.poll(async () => {
      const p = await playerSnapshot(page);
      return Math.abs(p.x - memberBefore.x);
    }, { timeout: 3000 }).toBeLessThan(60);

    // 身体：拿到了队员那具（radius 40，玩家原本 15）
    const after = await playerSnapshot(page);
    expect(after.radius).toBeGreaterThan(25);
    expect(after.x).toBeGreaterThan(before.x + 80);
    // 灵魂：等级不因换身体而变（附身不该丢进度）
    expect(after.level).toBe(before.level);
    expect(info.memberX).toBeGreaterThan(info.playerX);
  });
});
