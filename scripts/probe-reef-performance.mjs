import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const world of ['finite', 'endless']) {
    await page.goto(`http://localhost:3000/?renderer=canvas&world=${world}&worldSeed=42&mode=rivals&pondLayout=procedural&pondSeed=42`);
    await page.getByRole('button', { name: /^驶入/ }).click();
    await page.waitForFunction(() => window.__FISH_DEBUG__.state().obstacles.some(o => o.reef));
    const result = await page.evaluate(async () => {
      const { createEntity } = await import('/src/systems/spawn.ts');
      const s = window.__FISH_DEBUG__.state(), p = s.player;
      s.entities = Array.from({ length: 180 }, (_, i) => {
        const angle = i * 2.39996, radius = 350 + i % 12 * 110;
        const fish = createEntity(i % 2 ? 'HAMMERHEAD' : 'CLOWN_FISH', p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, { moodId: 'CALM' });
        fish.invulnerableTimer = 100000; fish.semiGhostTimer = 0;
        return fish;
      });
      p.isGodMode = true; p.evolutionPoints = -100000; p.speed = 0;
      s.quests = undefined; s.run = undefined; s.portals = []; s.buildings = []; s.rivalSquads = undefined;
      window.__FISH_DEBUG__.profile(30);
      const profile = window.__FISH_DEBUG__.profile(300);
      return { world: s.worldMode, entities: s.entities.length, obstacles: s.obstacles.length,
        groups: s.obstacles.filter(o => o.reef?.anchor).length,
        msPerFrame: profile.msPerFrame, systems: profile.systems.slice(0, 5) };
    });
    console.log(JSON.stringify(result));
  }
} finally { await browser.close(); }
