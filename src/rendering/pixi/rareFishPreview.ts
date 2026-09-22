import { Application } from 'pixi.js';
import { createEntity } from '../../systems/spawn';
import { CreatureType, DEFAULT_COSMETICS } from '../../types';
import { CreatureDisplay } from './CreatureDisplay';

const host = document.getElementById('pond')!;
const app = new Application();
await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true, autoStart: false, preference: 'webgl' });
host.appendChild(app.canvas);
app.canvas.style.width = '100%';
app.canvas.style.height = '100%';
const specimens = [false, true].map(rare => {
  const entity = createEntity(CreatureType.CLOWN_FISH, 0, 0);
  const originalRadius = entity.radius;
  entity.cosmetics = { ...DEFAULT_COSMETICS, pattern: 'ZEBRA', ...(rare ? { rareVariant: 'STARRY_CLOWN' as const } : {}) };
  entity.radius = 60;
  entity.animOffset = 0;
  entity.angle = 0;
  entity.semiGhostTimer = 0;
  entity.camoActive = false;
  entity.inCover = false;
  const display = new CreatureDisplay(rare ? 'starry' : 'normal');
  app.stage.addChild(display.root);
  return { entity, display, originalRadius };
});
let actualSize = false;
document.getElementById('scale')!.onclick = event => {
  actualSize = !actualSize;
  (event.currentTarget as HTMLButtonElement).textContent = actualSize ? '查看放大细节' : '查看游戏内大小';
};
let frame = 0;
const animate = (now: number) => {
  specimens.forEach(({ entity, display, originalRadius }, i) => {
    entity.x = host.clientWidth * (i ? 0.76 : 0.26);
    entity.y = host.clientHeight * 0.5 + Math.sin(now * 0.0014) * 8;
    entity.renderScale = actualSize ? originalRadius / entity.radius : Math.min(1.6, host.clientWidth / 620);
    display.update(entity, now, false);
  });
  app.render();
  frame = requestAnimationFrame(animate);
};
frame = requestAnimationFrame(animate);
window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); app.destroy(true, { children: true }); }, { once: true });
