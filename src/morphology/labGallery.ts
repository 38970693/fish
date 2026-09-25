import { Application, type Texture } from 'pixi.js';
import { createEntity } from '../gameEngine';
import { CreatureType, DEFAULT_COSMETICS, type Entity } from '../types';
import { drawCuteFish } from '../components/GameCanvas';
import { CreatureDisplay } from '../rendering/pixi/CreatureDisplay';

export const LAB_GALLERY_SPECIES = [
  { label: '小丑鱼', type: CreatureType.CLOWN_FISH, recipeId: 'CLOWN_FISH' },
  { label: '蓝唐王鱼', type: CreatureType.BLUE_TANG, recipeId: 'BLUE_TANG' },
  { label: '锦鲤', type: CreatureType.KOI, recipeId: 'KOI' },
  { label: '河豚', type: CreatureType.PUFFER_FISH, recipeId: 'PUFFER' },
  { label: '大白鲨', type: CreatureType.GREAT_WHITE, recipeId: 'GREAT_WHITE' },
] as const;

const CELL_WIDTH = 340;
const CELL_HEIGHT = 208;
const LABEL_WIDTH = 170;
const HEADER_HEIGHT = 82;
const SEED = 20260923;

const fillCell = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#123348';
  ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
};

const createSample = (species: (typeof LAB_GALLERY_SPECIES)[number]): Entity => {
  const entity = createEntity(species.type, 0, 0);
  entity.radius = 64; entity.renderScale = 1; entity.angle = 0;
  entity.vx = 0; entity.vy = 0; entity.isIdle = true;
  entity.cosmetics = { ...DEFAULT_COSMETICS };
  entity.appearanceV2 = { schemaVersion: 2, recipeId: species.recipeId, seed: SEED, genes: {}, parts: {} };
  return entity;
};

const paintRow = (
  app: Application, ctx: CanvasRenderingContext2D, entity: Entity, sample: CreatureDisplay,
  label: string, row: number, lod: 0 | 1 | 2
): Texture | undefined => {
  const y = HEADER_HEIGHT + row * CELL_HEIGHT;
  const canvasX = LABEL_WIDTH;
  const pixiX = LABEL_WIDTH + CELL_WIDTH + 8;
  fillCell(ctx, canvasX, y); fillCell(ctx, pixiX, y);
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText(label, 16, y + 32);
  ctx.fillText(`LOD ${lod}`, 16, y + 56);
  const canvasCell = document.createElement('canvas');
  canvasCell.width = CELL_WIDTH; canvasCell.height = CELL_HEIGHT;
  const cellCtx = canvasCell.getContext('2d');
  if (!cellCtx) throw new Error('无法创建样板 Canvas');
  drawCuteFish(cellCtx, { ...entity, x: CELL_WIDTH / 2, y: CELL_HEIGHT / 2 }, 0, false, { lod });
  ctx.drawImage(canvasCell, canvasX, y);
  sample.update(entity, 0, false, lod === 2 ? 0 : lod, true);
  let lodTexture: Texture | undefined;
  if (lod === 2) {
    const snapshot = sample.createSnapshotTarget();
    lodTexture = app.renderer.generateTexture({ target: snapshot.target, resolution: 1 }) as Texture;
    for (const child of [...snapshot.target.children]) child.destroy({ context: false });
    snapshot.target.destroy({ children: false });
    sample.update(entity, 0, false, 2, true);
    sample.useLodTexture({ texture: lodTexture, centerX: snapshot.centerX, centerY: snapshot.centerY, bytes: lodTexture.width * lodTexture.height * 4 });
  }
  const extracted = app.renderer.extract.canvas({ target: sample.root, resolution: 1 }) as HTMLCanvasElement;
  ctx.drawImage(extracted, pixiX + (CELL_WIDTH - extracted.width) / 2, y + (CELL_HEIGHT - extracted.height) / 2);
  return lodTexture;
};

const paintSpecies = (app: Application, ctx: CanvasRenderingContext2D, index: number) => {
  const species = LAB_GALLERY_SPECIES[index];
  const entity = createSample(species);
  const sample = new CreatureDisplay(`gallery-${species.recipeId}`);
  let lodTexture: Texture | undefined;
  try {
    for (const lod of [0, 1, 2] as const) {
      lodTexture = paintRow(app, ctx, entity, sample, species.label, index * 3 + lod, lod) ?? lodTexture;
    }
  } finally {
    sample.destroy();
    lodTexture?.destroy(true);
  }
};

/** 实验室专用：固定种子导出五种鱼 × 两渲染器 × 三档 LOD 的 PNG。 */
export const generateMorphologyGallery = (app: Application): HTMLCanvasElement => {
  const output = document.createElement('canvas');
  output.width = LABEL_WIDTH + CELL_WIDTH * 2 + 32;
  output.height = HEADER_HEIGHT + CELL_HEIGHT * LAB_GALLERY_SPECIES.length * 3 + 24;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('无法创建图集 Canvas');
  ctx.fillStyle = '#0d2030'; ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('V3-06 固定种子鱼图集', 20, 32);
  ctx.font = '14px sans-serif'; ctx.fillText(`Seed ${SEED} · Canvas / PixiJS · LOD 0/1/2`, 20, 58);

  for (let index = 0; index < LAB_GALLERY_SPECIES.length; index += 1) paintSpecies(app, ctx, index);
  return output;
};
