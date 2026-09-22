import { Application } from 'pixi.js';
import { CreatureType, DEFAULT_COSMETICS, type Entity } from '../types';
import { createEntity } from '../gameEngine';
import { drawCuteFish } from '../components/GameCanvas';
import { CreatureDisplay } from '../rendering/pixi/CreatureDisplay';
import { MORPHOLOGY_PARTS } from './registry';
import { resolveMorphology } from './resolveMorphology';
import type { FishAppearanceV2, MorphologyGene, PartSlot } from './types';

const geneLabels: Record<MorphologyGene, string> = {
  bodyLength: '身体长度', bodyDepth: '身体高度', headRatio: '头部占比', bellyCurve: '腹线饱满',
  backCurve: '背线隆起', snoutLength: '吻部长度', tailPeduncle: '尾柄粗细', dorsalFinHeight: '背鳍高度',
  pectoralFinSize: '胸鳍大小', tailFork: '尾部分叉', eyeScale: '眼睛大小', eyeSpacing: '眼睛间距',
};

const controls = document.querySelector<HTMLElement>('#controls')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const diagnostics = document.querySelector<HTMLElement>('#diagnostics')!;
const json = document.querySelector<HTMLTextAreaElement>('#json')!;
const pixiHost = document.querySelector<HTMLElement>('#pixi')!;
const ctx = canvas.getContext('2d')!;
canvas.width = 600; canvas.height = 420;

const fish = createEntity(CreatureType.CLOWN_FISH, canvas.width / 2, canvas.height / 2) as Entity;
fish.radius = 104; fish.renderScale = 1; fish.angle = 0; fish.cosmetics = { ...DEFAULT_COSMETICS, rareVariant: 'STARRY_CLOWN' };
fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 20260921, genes: {}, parts: {} };

const app = new Application();
await app.init({ resizeTo: pixiHost, backgroundAlpha: 0, antialias: true });
pixiHost.appendChild(app.canvas);
const display = new CreatureDisplay('morphology-lab');
app.stage.addChild(display.root);
let running = true;
let lod: 0 | 1 = 0;
let showRig = false;
let showPattern = true;
let volumeOnly = false;
let rareVariant = true;

const geneInputs = new Map<MorphologyGene, HTMLInputElement>();
const slots: PartSlot[] = ['dorsal', 'pectoralLeft', 'pectoralRight', 'tailFin'];

const renderControls = () => {
  controls.innerHTML = '<h2 style="margin-top:0">形态配方</h2>';
  const recipeRow = document.createElement('div'); recipeRow.className = 'selectrow'; recipeRow.innerHTML = '<label>recipeId</label>';
  const recipeSelect = document.createElement('select');
  for (const recipeId of ['CLOWN_FISH', 'STANDARD_FISH', 'DEEP_BODY', 'PUFFER', 'EEL']) {
    const option = new Option(recipeId, recipeId); option.selected = fish.appearanceV2!.recipeId === recipeId; recipeSelect.add(option);
  }
  recipeSelect.addEventListener('change', () => {
    fish.appearanceV2 = { schemaVersion: 2, recipeId: recipeSelect.value, seed: fish.appearanceV2!.seed, genes: {}, parts: {} };
    rareVariant = recipeSelect.value === 'CLOWN_FISH';
    fish.cosmetics = { ...fish.cosmetics!, rareVariant: rareVariant ? 'STARRY_CLOWN' : undefined };
    const rareButton = document.querySelector<HTMLButtonElement>('#toggle-rare');
    if (rareButton) rareButton.textContent = rareVariant ? '切换普通小丑鱼' : '切换星夜小丑鱼';
    renderControls(); refreshJson();
  });
  recipeRow.append(recipeSelect); controls.append(recipeRow);
  const modeRow = document.createElement('div'); modeRow.className = 'selectrow'; modeRow.innerHTML = '<label>搭配模式</label>';
  const modeSelect = document.createElement('select');
  for (const mode of ['SPECIES', 'CREATIVE', 'DEVELOPER'] as const) {
    const option = new Option(mode, mode); option.selected = (fish.appearanceV2!.mode ?? 'SPECIES') === mode; modeSelect.add(option);
  }
  modeSelect.addEventListener('change', () => { fish.appearanceV2!.mode = modeSelect.value as FishAppearanceV2['mode']; renderControls(); refreshJson(); });
  modeRow.append(modeSelect); controls.append(modeRow);
  controls.insertAdjacentHTML('beforeend', '<h2>形态基因</h2>');
  const resolved = resolveMorphology(fish);
  for (const [key, label] of Object.entries(geneLabels) as [MorphologyGene, string][]) {
    const row = document.createElement('div'); row.className = 'row';
    const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.01'; input.value = String(resolved.genes[key]);
    const output = document.createElement('output'); output.textContent = Number(input.value).toFixed(2);
    input.addEventListener('input', () => {
      fish.appearanceV2!.genes = { ...fish.appearanceV2!.genes, [key]: Number(input.value) };
      output.textContent = Number(input.value).toFixed(2); refreshJson();
    });
    row.innerHTML = `<label>${label}</label>`; row.append(input, output); controls.append(row); geneInputs.set(key, input);
  }
  const heading = document.createElement('h2'); heading.textContent = '部件插槽'; controls.append(heading);
  for (const slot of slots) {
    const row = document.createElement('div'); row.className = 'selectrow'; row.innerHTML = `<label>${slot}</label>`;
    const select = document.createElement('select');
    for (const part of Object.values(MORPHOLOGY_PARTS).filter(part => part.slot === slot)) {
      const option = new Option(part.id, part.id); option.selected = resolved.parts[slot] === part.id; select.add(option);
    }
    select.addEventListener('change', () => { fish.appearanceV2!.parts = { ...fish.appearanceV2!.parts, [slot]: select.value }; refreshJson(); });
    row.append(select); controls.append(row);
  }
};

const refreshJson = () => { json.value = JSON.stringify(fish.appearanceV2, null, 2); };
renderControls(); refreshJson();

document.querySelector('#reroll')!.addEventListener('click', () => {
  fish.appearanceV2!.seed = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]);
  fish.appearanceV2!.genes = {}; renderControls(); refreshJson();
});
document.querySelector('#toggle-rare')!.addEventListener('click', event => {
  rareVariant = !rareVariant;
  fish.cosmetics = { ...fish.cosmetics!, rareVariant: rareVariant ? 'STARRY_CLOWN' : undefined };
  (event.currentTarget as HTMLButtonElement).textContent = rareVariant ? '切换普通小丑鱼' : '切换星夜小丑鱼';
});
document.querySelector('#toggle-pattern')!.addEventListener('click', event => {
  showPattern = !showPattern;
  (event.currentTarget as HTMLButtonElement).textContent = showPattern ? '关闭花纹' : '显示花纹';
});
document.querySelector('#toggle-volume')!.addEventListener('click', event => {
  volumeOnly = !volumeOnly;
  (event.currentTarget as HTMLButtonElement).textContent = volumeOnly ? '显示完整外观' : '仅看体积';
});
document.querySelector('#toggle-motion')!.addEventListener('click', event => {
  running = !running; (event.currentTarget as HTMLButtonElement).textContent = running ? '暂停游动' : '继续游动';
});
document.querySelector('#toggle-rig')!.addEventListener('click', event => {
  showRig = !showRig; (event.currentTarget as HTMLButtonElement).textContent = showRig ? '隐藏骨架' : '显示骨架';
});
document.querySelector('#lod')!.addEventListener('click', event => {
  lod = lod === 0 ? 1 : 0; (event.currentTarget as HTMLButtonElement).textContent = `LOD ${lod}`;
});
document.querySelector('#export')!.addEventListener('click', async () => navigator.clipboard?.writeText(json.value));
document.querySelector('#import')!.addEventListener('click', () => {
  try {
    const value = JSON.parse(json.value) as FishAppearanceV2;
    if (value.schemaVersion !== 2) throw new Error('schemaVersion 必须为 2');
    fish.appearanceV2 = value; renderControls(); refreshJson();
  } catch (error) { diagnostics.textContent = `导入失败：${error instanceof Error ? error.message : String(error)}`; }
});

let frozenTime = performance.now();
const frame = (time: number) => {
  if (running) frozenTime = time;
  const morphology = resolveMorphology(fish);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCuteFish(ctx, fish, frozenTime / 16.667, false, { showPattern, volumeOnly });
  if (showRig) {
    const debugScale = fish.radius;
    ctx.save(); ctx.translate(fish.x, fish.y); ctx.rotate(fish.angle);
    ctx.strokeStyle = 'rgba(250,204,21,.55)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, fish.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fbbf24'; for (const anchor of Object.values(morphology.geometry.anchors)) { ctx.beginPath(); ctx.arc(anchor.x * debugScale, anchor.y * debugScale, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  const pixiEntity = { ...fish, x: pixiHost.clientWidth / 2, y: pixiHost.clientHeight / 2 };
  display.setPresentationMode(volumeOnly ? 'VOLUME_ONLY' : showPattern ? 'FULL' : 'NO_PATTERN');
  display.update(pixiEntity, frozenTime, false, lod);
  diagnostics.className = morphology.warnings.length ? 'warning' : 'ok';
  diagnostics.textContent = [
    `配方: ${morphology.recipeId} / ${morphology.archetype}`,
    `种子: ${morphology.seed}`,
    `边界: ${morphology.geometry.bounds.radius.toFixed(3)}r / 上限 ${morphology.maxVisualExtent}r`,
    `表面层: ${morphology.surfaceLayers.map(layer => `${layer.kind}:${layer.symmetry}`).join(', ')}`,
    `视图: ${volumeOnly ? '仅体积' : showPattern ? '完整外观' : '无花纹'}`,
    `部件: ${Object.entries(morphology.parts).map(([slot, id]) => `${slot}=${id}`).join(', ')}`,
    morphology.warnings.length ? `警告:\n${morphology.warnings.join('\n')}` : '校验: 通过',
  ].join('\n');
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
