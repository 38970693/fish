import { Container, Graphics, MeshSimple, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import { CreatureType, type Entity } from '../../types';
import type { CreatureShapeId } from '../../data/creatureShapes';
import { buildAppendageRig, type AppendageRigSpec, type RigSegment } from './AppendageRig';
import { buildAppendageMeshData, type AppendageMeshData } from './AppendageMesh';
import { lodJointCount, type CreatureLod } from './CreatureLod';
import { buildRadialSpines, getCachedPatternMarks, getMorphologyPart, morphologyAppearanceSignature, resolveMorphology, resolveMorphologyMotion, usesMorphologyFishRenderer, type ResolvedMorphology, type ResolvedMotionState, type SurfaceLayerKind } from '../../morphology';
import { buildSpineMeshData, type SpineMeshData } from './MorphologyMesh';
import { cuteFacePair, drawCuteFace } from '../cuteFishFace';
import { fishEyeOpenness } from '../fishBlink';
import { cartoonPalette, drawCartoonGloss, traceCartoonTail } from '../cartoonStyle';
import { drawAccessory, drawEyes, drawEyebrows, drawPattern, drawScaleEffect, drawTail, drawTeeth, drawTrail, getBodyTypeParams } from '../cosmetics';
import { drawSurfaceMouth } from '../../components/fishShapes';
import { CosmeticGraphicsContext } from './CosmeticGraphicsContext';
import type { FillGradient } from 'pixi.js';
import type { PatternType, ScaleType } from '../../types';

export interface LodTextureAsset {
  texture: PixiTexture;
  centerX: number;
  centerY: number;
  bytes: number;
}

export type CreaturePresentationMode = 'FULL' | 'NO_PATTERN' | 'VOLUME_ONLY';

export const PIXI_CREATURE_SHAPES: readonly CreatureShapeId[] = [
  'FISH', 'TURTLE', 'JELLY', 'SEAHORSE', 'CRAB', 'PUFFER', 'CEPHALOPOD', 'OCTOPUS', 'EEL', 'RAY',
  'BILLFISH', 'ANGLER', 'HAMMERHEAD', 'SEAL', 'SHARK', 'ORCA', 'NARWHAL', 'MERMAID', 'KRAKEN', 'OARFISH',
];

export const creatureAppearanceSignature = (entity: Entity): string => {
  const cosmetics = entity.cosmetics;
  return [
    entity.config.shape ?? 'FISH', Math.round(entity.radius * 10) / 10, entity.config.color,
    cosmetics?.skinColor, cosmetics?.pattern, cosmetics?.scaleType, cosmetics?.accessory,
    cosmetics?.tailType, cosmetics?.bodyType, cosmetics?.mouthType, cosmetics?.eyeType,
    cosmetics?.eyebrowType, cosmetics?.teeth, cosmetics?.rareVariant,
    cosmetics?.trailType,
    morphologyAppearanceSignature(entity),
  ].join('|');
};

export const isPixiStandardFish = (entity: Entity): boolean =>
  usesMorphologyFishRenderer(entity.type, entity.config.shape);

const resolvedBodyColor = (entity: Entity, morphology?: ResolvedMorphology): string => {
  const selected = entity.cosmetics?.skinColor;
  const color = morphology?.material.primaryColor ?? (selected && selected !== 'DEFAULT' ? selected : entity.config.color);
  return entity.type === CreatureType.PLANKTON ? color : cartoonPalette(color).body;
};

/** 一个实体对应一个长期复用的 Pixi 节点，位置更新不会重建外观。 */
export class CreatureDisplay {
  readonly root = new Container();
  private rear = new Graphics();
  private body = new Graphics();
  private pattern = new Graphics();
  private surface = new Graphics();
  private dorsalLight = new Graphics();
  private headLight = new Graphics();
  private details = new Graphics();
  private eyes = new Graphics();
  private eyeOpenness = 1;
  private frontAnimated = new Graphics();
  private effects = new Graphics();
  private scaleCosmetics = new Graphics();
  private cosmeticMask = new Graphics();
  private cosmeticGradients: FillGradient[] = [];
  private flexMesh?: MeshSimple;
  private flexMeshLod: CreatureLod | -1 = -1;
  private flexMeshData?: SpineMeshData;
  private rigMesh?: MeshSimple;
  private rigMeshData?: AppendageMeshData;
  private rigGroups: RigSegment[][] = [];
  private rigAlpha = 1;
  private lodSprite = new Sprite();
  private signature = '';
  private radius = 1;
  private color = '#38bdf8';
  private standardFish = true;
  private morphology?: ResolvedMorphology;
  private lod: CreatureLod = 0;
  private presentationMode: CreaturePresentationMode = 'FULL';
  private hiddenSurfaceLayers = new Set<SurfaceLayerKind>();

  constructor(private id: string) {
    this.root.label = `creature:${id}`;
    this.lodSprite.anchor.set(0.5);
    this.lodSprite.visible = false;
    this.eyes.label = 'fish-eyes';
    this.root.addChild(this.effects, this.rear, this.body, this.pattern, this.surface, this.dorsalLight, this.headLight, this.scaleCosmetics, this.eyes, this.details, this.frontAnimated, this.cosmeticMask);
  }

  rebind(id: string): void {
    this.id = id;
    this.root.label = `creature:${id}`;
    this.signature = '';
    this.root.visible = true;
  }

  setPresentationMode(mode: CreaturePresentationMode): void {
    if (mode === this.presentationMode) return;
    this.presentationMode = mode;
    this.signature = '';
  }

  /** 实验室预览专用：只过滤解析后的表面层，不修改实体外观数据。 */
  setHiddenSurfaceLayers(kinds: ReadonlySet<SurfaceLayerKind>): void {
    const next = new Set(kinds);
    if (next.size === this.hiddenSurfaceLayers.size && [...next].every(kind => this.hiddenSurfaceLayers.has(kind))) return;
    this.hiddenSurfaceLayers = next;
    this.signature = '';
  }

  update(entity: Entity, now: number, isPlayer: boolean, lod: CreatureLod = 0, skipAnimation = false): void {
    const nextSignature = `${creatureAppearanceSignature(entity)}|layers:${[...this.hiddenSurfaceLayers].sort().join(',')}`;
    if (nextSignature !== this.signature) {
      this.signature = nextSignature;
      this.rebuild(entity);
    }
    const scale = Number.isFinite(entity.renderScale) ? entity.renderScale : 1;
    const motion = this.morphology ? resolveMorphologyMotion(entity, this.morphology) : undefined;
    this.root.position.set(entity.x, entity.y);
    this.root.rotation = entity.angle;
    // 光斑跟随鱼体朝向，局部保持在中线上。
    this.dorsalLight.rotation = 0;
    this.headLight.rotation = 0;
    const breath = motion ? 1 + Math.sin(now * 0.0021 + entity.animOffset) * motion.breathAmplitude : 1;
    this.root.scale.set(scale * (motion?.bodyStretch ?? 1), scale * breath);
    this.root.alpha = entity.semiGhostTimer && entity.semiGhostTimer > 0
      ? 0.45 + Math.sin(now * 0.018 + entity.animOffset) * 0.12
      : entity.camoActive || entity.inCover ? (isPlayer ? 0.52 : 0.42) : 1;
    this.lod = lod;
    this.syncSurfaceNodes(lod);
    if (lod < 2 && this.lodSprite.parent) this.lodSprite.removeFromParent();
    this.details.visible = lod === 0;
    this.eyes.visible = lod === 0 && this.presentationMode !== 'VOLUME_ONLY';
    if (this.eyes.visible && entity.type !== CreatureType.PLANKTON) {
      const openness = skipAnimation ? 1 : fishEyeOpenness(entity, now);
      if (openness !== this.eyeOpenness) this.drawEyes(entity, openness);
    }
    this.pattern.visible = lod < 2 && this.presentationMode === 'FULL';
    this.surface.visible = lod < 2;
    this.dorsalLight.visible = lod < 2;
    this.headLight.visible = lod === 0;
    this.frontAnimated.visible = lod < 2;
    this.rear.visible = lod < 2;
    this.body.visible = lod < 2;
    this.effects.visible = lod < 2;
    this.scaleCosmetics.visible = lod < 2 && this.presentationMode !== 'VOLUME_ONLY';
    if (this.rigMesh) this.rigMesh.visible = lod < 2 && !this.standardFish && this.rigGroups.length > 0;
    this.lodSprite.visible = lod === 2 && !!this.lodSprite.texture;
    this.updateFlexibleBody(entity, now, lod, motion);
    if (!skipAnimation && lod < 2) this.drawAnimated(entity, now, isPlayer, motion, lod);
  }

  useLodTexture(asset: LodTextureAsset): void {
    this.lodSprite.texture = asset.texture;
    this.lodSprite.position.set(asset.centerX, asset.centerY);
    if (!this.lodSprite.parent) this.root.addChild(this.lodSprite);
    this.lodSprite.visible = this.lod === 2;
    this.rear.visible = false;
    this.body.visible = false;
    this.pattern.visible = false;
    this.surface.visible = false;
    this.dorsalLight.visible = false;
    this.headLight.visible = false;
    this.details.visible = false;
    this.eyes.visible = false;
    this.frontAnimated.visible = false;
    this.effects.visible = false;
    this.scaleCosmetics.visible = false;
    if (this.rigMesh) this.rigMesh.visible = false;
  }

  createSnapshotTarget(): { target: Container; centerX: number; centerY: number } {
    const target = new Container();
    const clone = (source: Graphics) => {
      const graphic = new Graphics({ context: source.context });
      graphic.position.copyFrom(source.position);
      graphic.scale.copyFrom(source.scale);
      graphic.rotation = source.rotation;
      if (source.mask === this.cosmeticMask) {
        const mask = new Graphics({ context: this.cosmeticMask.context });
        target.addChild(mask);
        graphic.mask = mask;
      }
      return graphic;
    };
    target.addChild(clone(this.rear));
    if (this.rigMesh?.visible && this.rigMeshData) {
      const rig = new MeshSimple({ texture: Texture.WHITE, vertices: this.rigMeshData.vertices.slice(),
        uvs: this.rigMeshData.uvs.slice(), indices: this.rigMeshData.indices.slice() });
      rig.tint = this.color;
      rig.alpha = this.rigAlpha;
      target.addChild(rig);
    }
    target.addChild(
      clone(this.body), clone(this.pattern), clone(this.surface), clone(this.dorsalLight),
      clone(this.headLight), clone(this.scaleCosmetics), clone(this.eyes), clone(this.details), clone(this.frontAnimated)
    );
    const bounds = target.getLocalBounds();
    return { target, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2 };
  }

  isStandardFish(): boolean {
    return this.standardFish;
  }

  appearanceSignature(): string {
    return this.signature;
  }

  releaseAppearance(): void {
    this.signature = '';
  }

  destroy(): void {
    for (const gradient of this.cosmeticGradients) gradient.destroy();
    for (const node of [this.pattern, this.surface, this.dorsalLight, this.headLight]) {
      node.removeFromParent();
      node.destroy();
    }
    this.root.destroy({ children: true });
  }

  private syncSurfaceNodes(lod: CreatureLod): void {
    const nodes = [this.surface, this.dorsalLight, this.headLight];
    if (lod === 2) {
      this.pattern.removeFromParent();
      for (const node of nodes) node.removeFromParent();
      return;
    }
    if (!this.pattern.parent) {
      const patternIndex = this.flexMesh?.parent
        ? this.root.getChildIndex(this.flexMesh) + 1
        : this.root.getChildIndex(this.body) + 1;
      this.root.addChildAt(this.pattern, patternIndex);
    }
    for (const node of nodes) {
      if (node.parent) continue;
      const detailsIndex = this.root.getChildIndex(this.eyes);
      this.root.addChildAt(node, detailsIndex);
    }
  }

  private rebuild(entity: Entity): void {
    this.radius = Math.max(1, entity.radius);
    this.standardFish = isPixiStandardFish(entity);
    const r = this.radius;
    const cosmetics = entity.cosmetics;
    const bodyShape = getBodyTypeParams(cosmetics?.bodyType ?? 'DEFAULT');
    const scale = { x: bodyShape.scaleX, y: bodyShape.scaleY };
    this.body.clear();
    this.pattern.clear();
    this.surface.clear();
    this.dorsalLight.clear();
    this.headLight.clear();
    this.details.clear();
    this.eyes.clear();
    this.eyeOpenness = 1;
    this.scaleCosmetics.clear(); this.cosmeticMask.clear();
    for (const gradient of this.cosmeticGradients) gradient.destroy();
    this.cosmeticGradients = [];
    this.pattern.mask = null; this.scaleCosmetics.mask = null;
    const resolvedMorphology = this.standardFish && entity.type !== CreatureType.PLANKTON ? resolveMorphology(entity) : undefined;
    this.morphology = resolvedMorphology && this.hiddenSurfaceLayers.size
      ? { ...resolvedMorphology, surfaceLayers: resolvedMorphology.surfaceLayers.filter(layer => !this.hiddenSurfaceLayers.has(layer.kind)) }
      : resolvedMorphology;
    this.color = resolvedBodyColor(entity, this.morphology);
    this.flexMeshLod = -1;
    this.flexMeshData = undefined;
    this.rigGroups = [];
    if (this.rigMesh) this.rigMesh.visible = false;
    this.body.scale.set(this.morphology ? 1 : scale.x, this.morphology ? 1 : scale.y);
    this.pattern.scale.set(this.morphology ? 1 : scale.x, this.morphology ? 1 : scale.y);
    this.details.scale.set(this.morphology ? 1 : scale.x, this.morphology ? 1 : scale.y);
    this.eyes.scale.copyFrom(this.details.scale);

    if (entity.type === CreatureType.PLANKTON) {
      this.body.circle(0, 0, r).fill({ color: this.color }).stroke({ color: '#ffffff', width: 1, alpha: 0.35 });
      this.details.circle(r * 0.25, -r * 0.2, Math.max(1, r * 0.12)).fill({ color: '#ffffff' });
      return;
    }

    if (!this.standardFish) {
      this.drawSpecialShape((entity.config.shape ?? 'FISH') as CreatureShapeId);
      for (const instruction of this.body.context.instructions) {
        if (instruction.action === 'fill') this.cosmeticMask.path(instruction.data.path).fill('#ffffff');
      }
      this.pattern.mask = this.cosmeticMask;
      this.scaleCosmetics.mask = this.cosmeticMask;
      if (this.presentationMode === 'FULL') this.drawPattern(entity);
      const scaleType = cosmetics?.scaleType;
      if (scaleType && scaleType !== 'NONE' && this.presentationMode !== 'VOLUME_ONLY') {
        const ctx = new CosmeticGraphicsContext(this.scaleCosmetics);
        drawScaleEffect(ctx.asCanvas(), scaleType, r, 14, this.color);
        this.cosmeticGradients.push(...ctx.gradients);
      }
      if (this.presentationMode !== 'VOLUME_ONLY') this.drawFace(entity);
      this.drawAccessory(entity);
      return;
    }

    const outline = this.morphology!.geometry.outline.flatMap(point => [point.x * r, point.y * r]);
    this.cosmeticMask.poly(outline, true).fill('#ffffff');
    this.pattern.mask = this.cosmeticMask;
    this.scaleCosmetics.mask = this.cosmeticMask;
    const scaleType = this.morphology!.material.scaleId;
    if (scaleType && scaleType !== 'NONE' && this.presentationMode !== 'VOLUME_ONLY') {
      const ctx = new CosmeticGraphicsContext(this.scaleCosmetics);
      drawScaleEffect(ctx.asCanvas(), scaleType as ScaleType, r, 14, this.color);
      this.cosmeticGradients.push(...ctx.gradients);
    }
    const palette = cartoonPalette(this.morphology!.material.primaryColor);
    this.body.poly(outline, true).fill({ color: this.color }).stroke({ color: palette.outline, width: Math.max(0.8, r * 0.028), join: 'round' });
    // 柔性鱼身由网格填充，仍保留一圈轻薄的轮廓以便小鱼从水中分离。
    this.surface.poly(outline, true).stroke({ color: palette.outline, width: Math.max(0.8, r * 0.028), alpha: 0.7, join: 'round' });
    if (this.presentationMode !== 'VOLUME_ONLY') for (const family of ['pectoral', 'pelvic'] as const) {
      const fins = ([-1, 1] as const).map(side => {
        const left = side < 0;
        const fin = family === 'pectoral'
          ? left ? this.morphology!.geometry.anchors.pectoralLeft : this.morphology!.geometry.anchors.pectoralRight
          : left ? this.morphology!.geometry.anchors.pelvicLeft : this.morphology!.geometry.anchors.pelvicRight;
        const partId = family === 'pectoral'
          ? left ? this.morphology!.parts.pectoralLeft : this.morphology!.parts.pectoralRight
          : left ? this.morphology!.parts.pelvicLeft : this.morphology!.parts.pelvicRight;
        const fallback = family === 'pectoral'
          ? left ? 'pectoral.classic' : 'pectoral.classic.right'
          : left ? 'pelvic.round' : 'pelvic.round.right';
        const part = getMorphologyPart(partId, fallback).geometry;
        const finLength = fin.scale * part.length;
        return { fin, finLength, part, side };
      });

      // 每组鱼鳍只保留轮廓与填色，避免小尺寸下根部线条堆叠。
      for (const { fin, finLength, part, side } of fins) {
        this.details.moveTo((fin.x + part.spread * 0.22) * r, fin.y * r)
          .quadraticCurveTo((fin.x + part.spread * 0.12) * r, (fin.y + side * finLength * 1.15) * r,
            (fin.x - part.spread * 0.36) * r, (fin.y + side * finLength * 0.85) * r)
          .quadraticCurveTo((fin.x - part.spread * 0.58) * r, (fin.y + side * finLength * 0.4) * r,
            (fin.x - part.spread * 0.12) * r, fin.y * r)
          .closePath();
      }
      this.details.fill({ color: palette.fin, alpha: 0.9 })
        .stroke({ color: palette.outline, width: Math.max(0.7, r * 0.022), alpha: 0.75 });


    }
    this.drawMorphologySurface();
    const spines = this.morphology.surfaceLayers.find(layer => layer.kind === 'RADIAL_SPINES');
    if (spines && this.presentationMode !== 'VOLUME_ONLY') {
      for (const triangle of buildRadialSpines(this.morphology)) {
        this.details.moveTo(triangle[0].x * r, triangle[0].y * r)
          .lineTo(triangle[1].x * r, triangle[1].y * r)
          .lineTo(triangle[2].x * r, triangle[2].y * r).closePath();
      }
      this.details.fill({ color: spines.color, alpha: spines.alpha });
    }
    if (this.presentationMode === 'FULL') this.drawPattern(entity);
    if (this.presentationMode !== 'VOLUME_ONLY') {
      this.drawFace(entity);
      this.drawAccessory(entity);
    }
  }

  private drawMorphologySurface(): void {
    if (!this.morphology) return;
    const r = this.radius;
    const { minX, maxY } = this.morphology.geometry.bounds;
    const headX = this.morphology.geometry.anchors.eyeLeft.x;
    const layer = (kind: SurfaceLayerKind) => this.morphology!.surfaceLayers.find(item => item.kind === kind);
    const { dorsalRidge, headDome, tailPeduncle, worldLight } = this.morphology.volume;
    const flank = layer('FLANK_SHADE');
    const ridge = layer('DORSAL_VOLUME');
    const dome = layer('HEAD_DOME');
    const peduncle = layer('TAIL_PEDUNCLE');
    const gill = layer('GILL');
    const lateral = layer('LATERAL_LINE');
    const nostril = layer('NOSTRIL');

    if (flank) {
      const context = new CosmeticGraphicsContext(this.surface);
      const gradient = context.createLinearGradient(0, -maxY * r, 0, maxY * r);
      const rgb = Number.parseInt(flank.color.slice(1), 16);
      const rgba = (alpha: number) => `rgba(${rgb >> 16},${(rgb >> 8) & 255},${rgb & 255},${alpha})`;
      gradient.addColorStop(0, rgba(flank.alpha)); gradient.addColorStop(0.38, rgba(0));
      gradient.addColorStop(0.62, rgba(0)); gradient.addColorStop(1, rgba(flank.alpha));
      // 新路径隔离描边与填色，避免上一条轮廓也被后续阴影重新填满。
      this.surface.beginPath().poly(this.morphology.geometry.outline.flatMap(point => [point.x * r, point.y * r]), true).fill(gradient);
      this.cosmeticGradients.push(...context.gradients);
    }
    if (peduncle) {
      for (const scale of [1, 0.68, 0.38]) {
        this.surface.beginPath().ellipse(tailPeduncle.centerX * r, 0, tailPeduncle.radiusX * r * scale, tailPeduncle.radiusY * r * scale)
          .fill({ color: peduncle.color, alpha: peduncle.alpha * (0.24 + (1 - scale) * 0.22) });
      }
    }
    // 两层真正的柔和渐变，避免同心色块在鱼背上形成条带。
    const highlight = (graphics: Graphics, region: typeof dorsalRidge, color: string, alpha: number) => {
      graphics.position.set(region.centerX * r, region.centerY * r);
      const context = new CosmeticGraphicsContext(graphics);
      const ctx = context.asCanvas();
      const gradient = ctx.createRadialGradient(worldLight.x * region.radiusX * r * 0.12, 0, 0, 0, 0, region.radiusX * r);
      const rgb = Number.parseInt(color.slice(1), 16);
      const rgba = (opacity: number) => `rgba(${rgb >> 16},${(rgb >> 8) & 255},${rgb & 255},${opacity})`;
      gradient.addColorStop(0, rgba(alpha));
      gradient.addColorStop(0.55, rgba(alpha * 0.38));
      gradient.addColorStop(1, rgba(0));
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.ellipse(0, 0, region.radiusX * r, region.radiusY * r, 0, 0, Math.PI * 2); ctx.fill();
      this.cosmeticGradients.push(...context.gradients);
    };
    if (ridge) highlight(this.dorsalLight, dorsalRidge, ridge.color, ridge.alpha);
    if (dome) highlight(this.headLight, headDome, dome.color, dome.alpha);

    if (this.presentationMode === 'VOLUME_ONLY') return;

    if (gill && gill.alpha > 0) {
      for (const side of [-1, 1] as const) for (let index = 0; index < (gill.count ?? 1); index += 1) {
        const offset = index * 0.115;
        this.details.moveTo((headX - 0.24 - offset) * r, side * maxY * r * 0.12)
          .quadraticCurveTo((headX - 0.42 - offset) * r, side * maxY * r * 0.34, (headX - 0.2 - offset) * r, side * maxY * r * 0.58);
      }
      this.details.stroke({ color: gill.color, width: Math.max(1, r * (gill.width ?? 0.035)), alpha: gill.alpha, cap: 'round' });
    }
    if (lateral && lateral.alpha > 0) {
      for (const side of [-1, 1] as const) this.details.moveTo((headX - 0.38) * r, side * maxY * r * 0.2)
        .quadraticCurveTo(-r * 0.18, side * maxY * r * 0.27, minX * r * 0.7, side * maxY * r * 0.14);
      this.details.stroke({ color: lateral.color, width: Math.max(0.8, r * (lateral.width ?? 0.025)), alpha: lateral.alpha, cap: 'round' });
    }
    if (nostril && nostril.alpha > 0) {
      const mouth = this.morphology.geometry.anchors.mouth;
      for (const side of [-1, 1] as const) {
        this.details.circle((mouth.x - 0.2) * r, side * maxY * r * 0.13, Math.max(0.8, r * (nostril.width ?? 0.024)));
      }
      this.details.fill({ color: nostril.color, alpha: nostril.alpha });
    }

  }

  private updateFlexibleBody(entity: Entity, now: number, lod: CreatureLod, motion?: ResolvedMotionState): void {
    if (!this.morphology || lod === 2) {
      if (this.flexMesh) this.flexMesh.visible = false;
      this.body.visible = lod < 2;
      return;
    }
    const resolved = motion ?? resolveMorphologyMotion(entity, this.morphology);
    const phase = now * 0.001 * resolved.tailFrequency + entity.animOffset;
    const meshData = buildSpineMeshData(this.morphology, this.radius, phase, resolved.speedRatio, resolved.turn, lod, this.flexMeshData);
    if (!this.flexMesh || this.flexMeshLod !== lod || this.flexMesh.vertices.length !== meshData.vertices.length) {
      this.flexMesh?.destroy();
      this.flexMesh = new MeshSimple({ texture: Texture.WHITE, vertices: meshData.vertices, uvs: meshData.uvs, indices: meshData.indices });
      this.flexMesh.tint = this.color;
      this.flexMesh.label = `morphology-mesh:${this.id}:lod${lod}`;
      const bodyIndex = this.root.getChildIndex(this.body);
      this.root.addChildAt(this.flexMesh, bodyIndex + 1);
      this.flexMeshLod = lod;
      this.flexMeshData = meshData;
    } else {
      this.flexMesh.vertices = meshData.vertices;
      this.flexMeshData = meshData;
    }
    this.flexMesh.visible = true;
    // Mesh 承担实色身体；Graphics 仍保留轮廓/降级资源，但近中景不重复填充。
    this.body.visible = false;
  }

  private drawPattern(entity: Entity): void {
    const pattern = this.morphology?.material.patternId ?? entity.cosmetics?.pattern ?? 'NONE';
    const r = this.radius;
    if (this.morphology?.patternLayers.length) {
      this.drawResolvedPatternLayers();
      return;
    }
    if (pattern === 'NONE') return;
    if (pattern === 'SPOTS' || pattern === 'DOTS' || pattern === 'LEOPARD') {
      if (this.morphology && pattern !== 'LEOPARD') {
        const count = pattern === 'SPOTS' ? 12 : 24;
        const sizeScale = pattern === 'SPOTS' ? 2.3 : 1.35;
        for (const mark of getCachedPatternMarks(this.morphology, count)) {
          this.details.circle(mark.x * r, mark.y * r, mark.radius * r * sizeScale)
            .fill({ color: mark.color, alpha: mark.alpha * (pattern === 'SPOTS' ? 0.5 : 0.38) });
        }
        return;
      }
      for (const [x, y, size] of [[-0.4, -0.25, 0.12], [0.05, 0.32, 0.1], [0.35, -0.18, 0.09], [-0.15, 0.05, 0.08]] as const) {
        this.details.circle(r * x, r * y, r * size).fill({ color: '#0f172a', alpha: 0.38 });
      }
      return;
    }
    const ctx = new CosmeticGraphicsContext(this.pattern);
    drawPattern(ctx.asCanvas(), pattern as PatternType, r, 14);
    this.cosmeticGradients.push(...ctx.gradients);
    // 旧 AI 外观中未上架的图案保留原来的条纹回退。
    if (!this.pattern.context.instructions.length) for (let i = -2; i <= 2; i++) {
      const x = i * r * 0.26;
      this.pattern.moveTo(x - r * 0.08, -r * 0.58).lineTo(x + r * 0.1, r * 0.58)
        .stroke({ color: '#172554', width: Math.max(2, r * 0.09), alpha: 0.48 });
    }
  }

  private drawResolvedPatternLayers(): void {
    if (!this.morphology) return;
    const r = this.radius;
    for (const layer of this.morphology.patternLayers) {
      for (const primitive of layer.primitives) {
        if (primitive.kind === 'BAND') {
          const trace = () => this.pattern.moveTo((primitive.x - 0.08) * r, -primitive.height * r)
            .quadraticCurveTo((primitive.x + primitive.bend) * r, 0, (primitive.x - primitive.bend * 0.45) * r, primitive.height * r);
          if (primitive.outlineColor && primitive.outlineWidth) trace().stroke({
            color: primitive.outlineColor, width: primitive.outlineWidth * r, alpha: 0.42, cap: 'round',
          });
          trace().stroke({ color: primitive.color, width: primitive.width * r, alpha: primitive.alpha, cap: 'round' });
          if (primitive.highlightColor && primitive.highlightWidth) trace().stroke({
            color: primitive.highlightColor, width: primitive.highlightWidth * r, alpha: 0.48, cap: 'round',
          });
        } else if (primitive.kind === 'CIRCLE') {
          this.pattern.circle(primitive.x * r, primitive.y * r, primitive.radius * r)
            [primitive.ringWidth ? 'stroke' : 'fill']({
              color: primitive.color, alpha: primitive.alpha,
              ...(primitive.ringWidth ? { width: primitive.ringWidth * r } : {}),
            });
          if (primitive.sparkle) {
            const x = primitive.x * r; const y = primitive.y * r; const arm = r * 0.055;
            this.pattern.moveTo(x - arm, y).lineTo(x + arm, y).moveTo(x, y - arm).lineTo(x, y + arm)
              .stroke({ color: '#f8fdff', width: Math.max(0.8, r * 0.012), alpha: 0.72, cap: 'round' });
          }
        } else if (primitive.kind === 'PATH') {
          if (primitive.points.length < 2) continue;
          this.pattern.moveTo(primitive.points[0].x * r, primitive.points[0].y * r);
          for (const point of primitive.points.slice(1)) this.pattern.lineTo(point.x * r, point.y * r);
          if (primitive.closed) this.pattern.closePath();
          this.pattern.stroke({ color: primitive.color, width: primitive.width * r, alpha: primitive.alpha, cap: 'round' });
        } else {
          this.pattern.ellipse(primitive.x * r, primitive.y * r, primitive.radiusX * r, primitive.radiusY * r)
            .stroke({ color: primitive.color, width: primitive.width * r, alpha: primitive.alpha });
        }
      }
    }
  }

  private drawSpecialShape(shape: CreatureShapeId): void {
    const r = this.radius;
    const fill = this.color;
    const outline = { color: cartoonPalette(this.color).outline, width: Math.max(0.8, r * 0.028), alpha: 0.8 };
    switch (shape) {
      case 'TURTLE':
        this.body.ellipse(-r * 0.05, 0, r * 0.9, r * 0.66).fill({ color: fill }).stroke(outline);
        this.body.circle(r * 0.82, 0, r * 0.3).fill({ color: fill }).stroke(outline);
        for (const y of [-0.56, 0.56]) this.body.ellipse(-r * 0.1, r * y, r * 0.38, r * 0.16).fill({ color: fill, alpha: 0.9 });
        this.details.ellipse(-r * 0.12, 0, r * 0.67, r * 0.48).stroke({ color: '#fde68a', width: 3, alpha: 0.55 });
        this.details.moveTo(-r * 0.75, 0).lineTo(r * 0.48, 0).moveTo(-r * 0.12, -r * 0.47).lineTo(-r * 0.12, r * 0.47)
          .stroke({ color: '#fde68a', width: 2, alpha: 0.4 });
        break;
      case 'JELLY':
        this.body.moveTo(-r * 0.78, 0).arc(0, 0, r * 0.78, Math.PI, Math.PI * 2).lineTo(r * 0.62, r * 0.35)
          .quadraticCurveTo(r * 0.35, r * 0.55, 0, r * 0.35).quadraticCurveTo(-r * 0.35, r * 0.55, -r * 0.78, 0)
          .closePath().fill({ color: fill, alpha: 0.8 }).stroke(outline);
        this.details.arc(0, 0, r * 0.55, Math.PI * 1.08, Math.PI * 1.92).stroke({ color: '#ffffff', width: 3, alpha: 0.3 });
        break;
      case 'SEAHORSE':
        this.body.ellipse(-r * 0.08, 0, r * 0.48, r * 0.78).fill({ color: fill }).stroke(outline);
        this.body.circle(r * 0.22, -r * 0.58, r * 0.38).fill({ color: fill }).stroke(outline);
        this.body.roundRect(r * 0.35, -r * 0.67, r * 0.72, r * 0.18, r * 0.09).fill({ color: fill });
        this.details.arc(-r * 0.2, r * 0.68, r * 0.42, -0.15, Math.PI * 1.55).stroke({ color: fill, width: r * 0.22 });
        for (let i = 0; i < 5; i += 1) this.details.circle(-r * 0.42, -r * 0.48 + i * r * 0.23, r * 0.06).fill({ color: '#fde047', alpha: 0.65 });
        break;
      case 'CRAB':
        this.body.ellipse(0, 0, r, r * 0.62).fill({ color: fill }).stroke(outline);
        this.details.moveTo(-r * 0.75, -r * 0.25).lineTo(-r * 1.05, -r * 0.58).lineTo(-r * 1.28, -r * 0.36)
          .moveTo(-r * 0.75, r * 0.25).lineTo(-r * 1.05, r * 0.58).lineTo(-r * 1.28, r * 0.36)
          .stroke({ color: fill, width: r * 0.14 });
        break;
      case 'PUFFER':
        this.body.circle(0, 0, r * 0.82).fill({ color: fill }).stroke(outline);
        for (let i = 0; i < 16; i += 1) {
          const a = i / 16 * Math.PI * 2;
          this.details.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72)
            .lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12).stroke({ color: fill, width: Math.max(2, r * 0.08) });
        }
        break;
      case 'CEPHALOPOD':
        this.body.moveTo(r * 0.95, 0).quadraticCurveTo(r * 0.2, -r * 0.88, -r * 0.78, -r * 0.55)
          .lineTo(-r, 0).lineTo(-r * 0.78, r * 0.55).quadraticCurveTo(r * 0.2, r * 0.88, r * 0.95, 0)
          .closePath().fill({ color: fill }).stroke(outline);
        this.details.moveTo(-r * 0.45, -r * 0.45).lineTo(-r * 0.9, -r * 0.85).lineTo(-r * 0.85, -r * 0.3).closePath().fill({ color: fill, alpha: 0.8 });
        this.details.moveTo(-r * 0.45, r * 0.45).lineTo(-r * 0.9, r * 0.85).lineTo(-r * 0.85, r * 0.3).closePath().fill({ color: fill, alpha: 0.8 });
        break;
      case 'OCTOPUS':
        this.body.circle(r * 0.2, 0, r * 0.75).fill({ color: fill }).stroke(outline);
        this.body.ellipse(-r * 0.15, -r * 0.68, r * 0.34, r * 0.2).fill({ color: fill, alpha: 0.8 });
        this.body.ellipse(-r * 0.15, r * 0.68, r * 0.34, r * 0.2).fill({ color: fill, alpha: 0.8 });
        break;
      case 'EEL':
        this.body.ellipse(r * 0.38, 0, r * 0.72, r * 0.45).fill({ color: fill }).stroke(outline);
        break;
      case 'RAY':
        this.body.moveTo(r, 0).quadraticCurveTo(0, -r * 1.05, -r * 0.72, -r * 0.58).lineTo(-r * 0.3, 0)
          .lineTo(-r * 0.72, r * 0.58).quadraticCurveTo(0, r * 1.05, r, 0).closePath().fill({ color: fill }).stroke(outline);
        this.details.moveTo(-r * 0.25, 0).lineTo(-r * 1.8, 0).stroke({ color: fill, width: Math.max(2, r * 0.08) });
        break;
      case 'BILLFISH':
        this.body.ellipse(0, 0, r, r * 0.52).fill({ color: fill }).stroke(outline);
        this.details.moveTo(r * 0.82, -r * 0.06).lineTo(r * 2.05, 0).lineTo(r * 0.82, r * 0.06).closePath().fill({ color: '#cbd5e1' });
        this.drawTopDownRidge(-0.05, 0.9, 0.09, '#1d4ed8');
        break;
      case 'ANGLER':
        this.body.circle(-r * 0.05, 0, r * 0.88).fill({ color: fill }).stroke(outline);
        this.details.moveTo(r * 0.05, 0).quadraticCurveTo(r * 0.55, 0, r * 1.18, 0)
          .stroke({ color: '#94a3b8', width: Math.max(2, r * 0.06) });
        this.details.circle(r * 1.28, 0, r * 0.16).fill({ color: '#fde047', alpha: 0.95 });
        break;
      case 'HAMMERHEAD':
        this.body.ellipse(-r * 0.05, 0, r, r * 0.48).fill({ color: fill }).stroke(outline);
        this.body.roundRect(r * 0.55, -r * 0.9, r * 0.45, r * 1.8, r * 0.18).fill({ color: fill }).stroke(outline);
        this.drawTopDownRidge(-0.05, 0.62, 0.07, fill);
        break;
      case 'SEAL':
        this.body.ellipse(0, 0, r * 1.05, r * 0.58).fill({ color: fill }).stroke(outline);
        this.body.circle(r * 0.72, 0, r * 0.45).fill({ color: fill });
        for (const y of [-0.48, 0.48]) this.details.ellipse(-r * 0.1, r * y, r * 0.45, r * 0.14).fill({ color: fill, alpha: 0.85 });
        for (const y of [-0.15, 0.15]) this.details.moveTo(r * 0.86, r * y).lineTo(r * 1.3, r * y * 1.8).stroke({ color: '#e2e8f0', width: 1.5, alpha: 0.8 });
        break;
      case 'SHARK':
        this.body.ellipse(0, 0, r, r * 0.5).fill({ color: fill }).stroke(outline);
        this.drawTopDownRidge(-0.05, 0.72, 0.085, fill);
        for (let i = 0; i < 3; i += 1) this.details.moveTo(r * (0.38 - i * 0.12), -r * 0.25).lineTo(r * (0.3 - i * 0.12), r * 0.25).stroke({ color: '#1e293b', width: 2, alpha: 0.65 });
        break;
      case 'ORCA':
        this.body.ellipse(0, 0, r, r * 0.53).fill({ color: '#020617' }).stroke(outline);
        for (const side of [-1, 1]) {
          this.details.ellipse(r * 0.3, side * r * 0.25, r * 0.28, r * 0.12).fill({ color: '#f8fafc' });
          this.details.ellipse(-r * 0.28, side * r * 0.4, r * 0.2, r * 0.07).fill({ color: '#f8fafc', alpha: 0.82 });
        }
        this.drawTopDownRidge(0.08, 0.7, 0.09, '#020617');
        break;
      case 'NARWHAL':
        this.body.ellipse(0, 0, r, r * 0.58).fill({ color: fill }).stroke(outline);
        this.details.moveTo(r * 0.8, 0).lineTo(r * 1.9, -r * 0.13).lineTo(r * 1.9, r * 0.13).closePath().fill({ color: '#e2e8f0' });
        for (let i = 0; i < 4; i += 1) this.details.moveTo(r * (0.95 + i * 0.22), -r * 0.1).lineTo(r * (1.05 + i * 0.22), r * 0.08).stroke({ color: '#94a3b8', width: 2 });
        this.drawTopDownRidge(-0.12, 0.48, 0.055, fill);
        break;
      case 'MERMAID':
        this.body.ellipse(r * 0.05, 0, r * 0.82, r * 0.48).fill({ color: fill }).stroke(outline);
        this.details.circle(r * 0.62, 0, r * 0.34).fill({ color: '#f9a8d4' });
        this.details.arc(r * 0.55, 0, r * 0.42, Math.PI * 0.55, Math.PI * 1.45).stroke({ color: '#7c3aed', width: r * 0.18 });
        break;
      case 'KRAKEN':
        this.body.circle(r * 0.18, 0, r * 0.76).fill({ color: fill }).stroke(outline);
        this.details.arc(r * 0.2, 0, r * 0.52, Math.PI * 1.1, Math.PI * 1.9).stroke({ color: '#fca5a5', width: 3, alpha: 0.45 });
        break;
      case 'OARFISH':
        this.body.ellipse(r * 0.45, 0, r * 0.68, r * 0.34).fill({ color: fill }).stroke(outline);
        this.drawTopDownRidge(0.18, 0.9, 0.075, '#ef4444');
        break;
      default:
        this.body.circle(0, 0, r * 0.82).fill({ color: fill }).stroke(outline);
    }
  }

  private drawTopDownRidge(x: number, length: number, width: number, color: string): void {
    const context = new CosmeticGraphicsContext(this.details);
    drawCartoonGloss(context.asCanvas(), this.radius, x * this.radius, length, width);
    this.cosmeticGradients.push(...context.gradients);
  }

  private drawEyes(entity: Entity, openness = 1): void {
    this.eyes.clear();
    this.eyeOpenness = openness;
    const r = this.radius;
    const eyeType = entity.cosmetics?.eyeType ?? 'NORMAL';
    const eyeAnchor = this.morphology?.geometry.anchors.eyeLeft;
    const eyeX = r * (eyeAnchor?.x ?? 0.35);
    const eyeY = r * Math.abs(eyeAnchor?.y ?? 0.45);
    const faces = cuteFacePair(r, eyeX / r, eyeY / r, eyeAnchor?.scale ?? 0.2, eyeType);
    const eyeRadius = faces[0].eye.radius;
    const ctx = new CosmeticGraphicsContext(this.eyes).asCanvas();
    if (eyeType !== 'NORMAL') {
      drawEyes(ctx, eyeType, eyeX, eyeY, eyeRadius / 0.2, 14, openness);
    } else {
      drawCuteFace(ctx, r, eyeX, eyeY, eyeAnchor?.scale ?? 0.2, openness);
    }
  }

  private drawFace(entity: Entity): void {
    this.drawEyes(entity);
    const r = this.radius;
    const eyeAnchor = this.morphology?.geometry.anchors.eyeLeft;
    const eyeX = r * (eyeAnchor?.x ?? 0.35);
    const eyeY = r * Math.abs(eyeAnchor?.y ?? 0.45);
    const ctx = new CosmeticGraphicsContext(this.details).asCanvas();
    const eyebrow = entity.cosmetics?.eyebrowType;
    if (eyebrow && eyebrow !== 'NONE') drawEyebrows(ctx, eyebrow, eyeX, eyeY, r, (eyeAnchor?.scale ?? 0.2) * r * 1.32);
  }

  private drawAccessory(entity: Entity): void {
    const accessory = entity.cosmetics?.accessory;
    if (accessory && accessory !== 'NONE') {
      const eye = this.morphology?.geometry.anchors.eyeLeft;
      drawAccessory(new CosmeticGraphicsContext(this.details).asCanvas(), accessory, this.radius, 14,
        (eye?.x ?? 0.35) * this.radius, Math.abs(eye?.y ?? 0.45) * this.radius, (eye?.scale ?? 0.2) * this.radius * 1.32);
    }
  }

  private drawMotionFins(motion?: ResolvedMotionState): void {
    if (!this.morphology) return;
    const r = this.radius;
    for (const family of ['pectoral', 'pelvic'] as const) {
      for (const side of [-1, 1] as const) {
        const left = side < 0;
        const fin = family === 'pectoral'
          ? left ? this.morphology.geometry.anchors.pectoralLeft : this.morphology.geometry.anchors.pectoralRight
          : left ? this.morphology.geometry.anchors.pelvicLeft : this.morphology.geometry.anchors.pelvicRight;
        const partId = family === 'pectoral'
          ? left ? this.morphology.parts.pectoralLeft : this.morphology.parts.pectoralRight
          : left ? this.morphology.parts.pelvicLeft : this.morphology.parts.pelvicRight;
        const fallback = family === 'pectoral'
          ? left ? 'pectoral.classic' : 'pectoral.classic.right'
          : left ? 'pelvic.round' : 'pelvic.round.right';
        const part = getMorphologyPart(partId, fallback).geometry;
        const pose = left ? motion?.leftFin ?? 0 : motion?.rightFin ?? 0;
        const length = fin.scale * part.length * (1 + pose * 0.34);
        this.frontAnimated.moveTo((fin.x + part.spread * 0.22) * r, fin.y * r)
          .quadraticCurveTo((fin.x + part.spread * 0.12) * r, (fin.y + side * length * 1.15) * r,
            (fin.x - part.spread * 0.36) * r, (fin.y + side * length * 0.85) * r)
          .quadraticCurveTo((fin.x - part.spread * 0.58) * r, (fin.y + side * length * 0.4) * r,
            (fin.x - part.spread * 0.12) * r, fin.y * r).closePath();
      }
    }
    const palette = cartoonPalette(this.morphology.material.primaryColor);
    this.frontAnimated.fill({ color: palette.fin, alpha: 0.9 })
      .stroke({ color: palette.outline, width: Math.max(0.7, r * 0.022), alpha: 0.75 });
  }

  private drawAnimated(entity: Entity, now: number, isPlayer: boolean, motion?: ResolvedMotionState, lod: CreatureLod = 0): void {
    const r = this.radius;
    const resolved = motion ?? (this.morphology ? resolveMorphologyMotion(entity, this.morphology) : undefined);
    const phase = now * 0.008 + entity.animOffset;
    const tailPhase = now * 0.001 * (resolved?.tailFrequency ?? 2.2) + entity.animOffset;
    const wag = Math.sin(tailPhase) * r * (resolved?.tailAmplitude ?? 0.18);
    this.rear.clear();
    this.effects.clear();
    if (entity.type === CreatureType.CLOWN_FISH && entity.cosmetics?.rareVariant === 'STARRY_CLOWN') {
      const pulse = 1 + Math.sin(now * 0.004 + entity.animOffset) * 0.06;
      this.effects.ellipse(0, 0, r * 1.18 * pulse, r * 0.88 * pulse)
        .fill({ color: '#4adce7', alpha: 0.055 })
        .stroke({ color: '#7debf2', width: Math.max(1.5, r * 0.045), alpha: 0.35 });
      for (let i = 0; i < 3; i += 1) {
        const angle = now * 0.0008 + entity.animOffset + i * Math.PI * 2 / 3;
        this.effects.circle(Math.cos(angle) * r * 1.1, Math.sin(angle) * r * 0.72, r * 0.035)
          .fill({ color: i === 0 ? '#ffe9aa' : '#c5fbff', alpha: 0.75 });
      }
    }
    if (this.presentationMode !== 'VOLUME_ONLY') {
      drawTrail(new CosmeticGraphicsContext(this.rear).asCanvas(), entity.cosmetics?.trailType, r, now / (1000 / 60), entity.animOffset);
    }
    this.frontAnimated.clear();
    this.rigGroups = [];
    if (this.standardFish && entity.type !== CreatureType.PLANKTON) {
      if (lod === 0 && resolved?.braking && this.morphology && this.presentationMode !== 'VOLUME_ONLY') this.drawMotionFins(resolved);
      const tail = this.morphology?.parts.tailFin ?? entity.cosmetics?.tailType ?? 'DEFAULT';
      const tailGeometry = this.morphology ? getMorphologyPart(this.morphology.parts.tailFin, 'tail.classic').geometry : undefined;
      const tailLength = tailGeometry?.length ?? (tail === 'RIBBON' ? 1.25 : tail === 'FORKED' || tail === 'TRIDENT' ? 0.9 : 0.72);
      const tailRoot = this.morphology?.geometry.anchors.tailRoot;
      const rootX = tailRoot?.x ?? -0.78;
      const rootHalf = (tailRoot?.scale ?? 0.5) * 0.45;
      const fork = tailGeometry
        ? tailGeometry.spread * (0.62 + (this.morphology?.genes.tailFork ?? 0.45) * 0.38)
        : 0.38 + (this.morphology?.genes.tailFork ?? 0.45) * 0.42;
      const tailSoftness = tailGeometry?.softness ?? 0.35;
      const tailFork = tailGeometry?.fork ?? 0.25;
      const tipX = r * (rootX - tailLength);
      const spread = 1 + Math.sin(tailPhase) * (resolved?.tailAmplitude ?? 0.18) * 0.3;
      const palette = cartoonPalette(this.morphology?.material.primaryColor ?? this.color);
      const customTail = entity.cosmetics?.tailType && entity.cosmetics.tailType !== 'DEFAULT' && this.presentationMode !== 'VOLUME_ONLY';
      if (customTail) {
        drawTail(new CosmeticGraphicsContext(this.rear).asCanvas(), entity.cosmetics!.tailType, r, now / (1000 / 60), rootX, this.color);
      } else {
        traceCartoonTail(new CosmeticGraphicsContext(this.rear).asCanvas(), r, rootX, rootHalf, tailLength, fork * spread, tailFork, tailSoftness);
        this.rear.fill({ color: palette.fin, alpha: 0.9 })
          .stroke({ color: palette.outline, width: Math.max(0.8, r * 0.025), alpha: 0.8 });
        for (const ray of [-0.55, 0, 0.55]) {
          this.rear.moveTo(r * rootX, ray * r * rootHalf)
            .quadraticCurveTo(r * (rootX - tailLength * 0.48), ray * r * fork * spread, tipX, ray * r * fork * spread)
            .stroke({ color: this.morphology?.material.secondaryColor ?? '#ffffff', width: Math.max(0.6, r * 0.016), alpha: 0.1 });
        }
      }
      if (this.presentationMode !== 'VOLUME_ONLY') {
        const context = new CosmeticGraphicsContext(this.frontAnimated);
        const ctx = context.asCanvas();
        const visualTime = now / (1000 / 60);
        const mouthGap = 0.05 + (Math.sin(visualTime * 0.15 + entity.animOffset) + 1) / 2 * 0.55;
        const mouthType = entity.cosmetics?.mouthType ?? 'TRIANGLE';
        const mouthX = (this.morphology?.geometry.anchors.mouth.x ?? 1.02) * r;
        ctx.save(); ctx.translate(mouthX - r * 0.71, -r * 0.14);
        drawSurfaceMouth(ctx, mouthType, r, mouthGap);
        ctx.restore();
        if (entity.cosmetics?.teeth && entity.cosmetics.teeth !== 'NORMAL') {
          drawTeeth(ctx, entity.cosmetics.teeth, mouthType, r, visualTime, mouthGap, mouthGap, mouthX - r * 0.16);
        }
      }
    } else if (!this.standardFish) {
      this.drawSpecialAnimated(entity, (entity.config.shape ?? 'FISH') as CreatureShapeId, phase, wag);
      if (this.presentationMode !== 'VOLUME_ONLY') {
        drawSurfaceMouth(new CosmeticGraphicsContext(this.frontAnimated).asCanvas(), entity.cosmetics?.mouthType ?? 'TRIANGLE', r, 0.15 + Math.sin(phase) * 0.1);
      }
    }
    this.updateRigMesh();
    if (isPlayer) {
      const concealed = entity.camoActive || entity.inCover;
      this.effects.circle(0, 0, r * 1.55).stroke({ color: concealed ? '#4ade80' : '#22d3ee', width: 3, alpha: 0.45 + Math.sin(phase) * 0.18 });
    }
    if (entity.shieldTimer && entity.shieldTimer > 0) {
      this.effects.circle(0, 0, r * 1.35).fill({ color: '#60a5fa', alpha: 0.12 }).stroke({ color: '#93c5fd', width: 2, alpha: 0.8 });
    }
    if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      for (let i = 0; i < 3; i += 1) {
        this.effects.moveTo(-r * (1.1 + i * 0.3), -r * 0.4).lineTo(-r * (1.7 + i * 0.35), -r * 0.4)
          .stroke({ color: '#67e8f9', width: 2, alpha: 0.55 - i * 0.12 });
      }
    }
  }

  private drawSpecialAnimated(entity: Entity, shape: CreatureShapeId, phase: number, wag: number): void {
    const r = this.radius;
    const wave = (index: number, amount = 0.22) => Math.sin(phase * 1.8 + index * 0.85) * r * amount;
    const speed = Math.max(1, entity.speed || entity.config.speed || 1);
    const transverseVelocity = (-entity.vx * Math.sin(entity.angle) + entity.vy * Math.cos(entity.angle)) / speed;
    if (shape === 'JELLY') {
      for (let i = -2; i <= 2; i += 1) {
        this.drawRig({
          rootX: i * 0.26, rootY: 0.28, direction: Math.PI / 2, length: 1.38, joints: 6,
          baseWidth: 0.1, tipWidth: 0.035, amplitude: 0.2, waveCycles: 0.6,
          phaseOffset: i * 0.72, velocityInfluence: 0.18, maxExtent: 1.9,
        }, phase, transverseVelocity, 0.68);
      }
      return;
    }
    if (shape === 'CEPHALOPOD' || shape === 'OCTOPUS' || shape === 'KRAKEN') {
      const count = shape === 'KRAKEN' ? 8 : shape === 'OCTOPUS' ? 6 : 5;
      const length = shape === 'KRAKEN' ? 2.2 : 1.45;
      for (let i = 0; i < count; i += 1) {
        const spread = (i - (count - 1) / 2) * r * 0.2;
        const fan = (i - (count - 1) / 2) * (shape === 'KRAKEN' ? 0.11 : 0.08);
        this.drawRig({
          rootX: -0.42, rootY: spread / r * 0.42, direction: Math.PI + fan, length,
          joints: shape === 'KRAKEN' ? 8 : 6,
          baseWidth: shape === 'KRAKEN' ? 0.18 : 0.12,
          tipWidth: shape === 'KRAKEN' ? 0.045 : 0.03,
          amplitude: shape === 'KRAKEN' ? 0.38 : 0.26,
          waveCycles: 0.7, phaseOffset: i * 0.74,
          velocityInfluence: shape === 'KRAKEN' ? 0.34 : 0.24,
          maxExtent: shape === 'KRAKEN' ? 2.55 : 1.9,
        }, phase, transverseVelocity, 0.84);
      }
      return;
    }
    if (shape === 'EEL' || shape === 'OARFISH') {
      const oarfish = shape === 'OARFISH';
      const segments = this.drawRig({
        rootX: 0.45, rootY: 0, direction: Math.PI, length: oarfish ? 3.1 : 2.45,
        joints: oarfish ? 10 : 9, baseWidth: oarfish ? 0.42 : 0.68,
        tipWidth: 0.08, amplitude: oarfish ? 0.14 : 0.22, waveCycles: oarfish ? 0.72 : 0.9,
        phaseOffset: 0, velocityInfluence: 0.2, maxExtent: oarfish ? 3.25 : 2.7,
      }, phase * 0.72, transverseVelocity, 0.96);
      const tip = segments.at(-1)?.to;
      if (tip) this.rear.moveTo(tip.x, tip.y).lineTo(tip.x - r * 0.45, tip.y - r * 0.42 + wag)
        .lineTo(tip.x - r * 0.25, tip.y).lineTo(tip.x - r * 0.45, tip.y + r * 0.42 + wag).closePath()
        .fill({ color: this.color, alpha: 0.85 });
      return;
    }
    if (shape === 'CRAB') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          const y = side * r * (0.22 + i * 0.18);
          this.rear.moveTo(-r * 0.35 + i * r * 0.25, y).lineTo(-r * 0.65 + i * r * 0.2, y + side * r * 0.36)
            .lineTo(-r * 0.95 + i * r * 0.2, y + side * r * 0.45).stroke({ color: this.color, width: Math.max(2, r * 0.08) });
        }
        this.rear.moveTo(r * 0.45, side * r * 0.35).lineTo(r * 0.95, side * r * 0.72 + wave(side, 0.08))
          .stroke({ color: this.color, width: Math.max(3, r * 0.14) });
        this.rear.circle(r * 1.08, side * r * 0.76 + wave(side, 0.08), r * 0.27).fill({ color: this.color });
      }
      return;
    }
    if (shape === 'PUFFER') {
      for (const side of [-1, 1]) this.rear.ellipse(-r * 0.15, side * r * 0.72, r * 0.32, r * 0.12).fill({ color: this.color, alpha: 0.8 });
      return;
    }
    if (shape === 'MERMAID') {
      this.rear.moveTo(-r * 0.65, 0).quadraticCurveTo(-r * 1.18, -r * 0.8 + wag, -r * 1.5, -r * 0.62 + wag)
        .lineTo(-r * 1.18, 0).lineTo(-r * 1.5, r * 0.62 + wag).quadraticCurveTo(-r * 1.18, r * 0.8 + wag, -r * 0.65, 0)
        .fill({ color: '#22c55e', alpha: 0.9 });
      return;
    }
    if (['BILLFISH', 'HAMMERHEAD', 'SHARK', 'ORCA', 'NARWHAL', 'SEAL', 'TURTLE'].includes(shape)) {
      const tailColor = shape === 'ORCA' ? '#020617' : this.color;
      this.rear.moveTo(-r * 0.75, 0).quadraticCurveTo(-r * 1.2, -r * 0.75 + wag, -r * 1.5, -r * 0.72 + wag)
        .lineTo(-r * 1.25, 0).lineTo(-r * 1.5, r * 0.72 + wag).quadraticCurveTo(-r * 1.2, r * 0.75 + wag, -r * 0.75, 0)
        .fill({ color: tailColor, alpha: 0.9 });
    }
  }

  private drawRig(spec: AppendageRigSpec, phase: number, transverseVelocity: number, alpha: number) {
    const joints = lodJointCount(this.lod, spec.joints);
    if (joints === 0) return [];
    const segments = buildAppendageRig({ ...spec, joints }, { radius: this.radius, phase, transverseVelocity });
    this.rigGroups.push(segments);
    this.rigAlpha = alpha;
    return segments;
  }

  private updateRigMesh(): void {
    if (!this.rigGroups.length) {
      if (this.rigMesh) this.rigMesh.visible = false;
      return;
    }
    const data = buildAppendageMeshData(this.rigGroups, this.rigMeshData);
    if (!this.rigMesh || this.rigMesh.vertices.length !== data.vertices.length) {
      this.rigMesh?.destroy();
      this.rigMesh = new MeshSimple({ texture: Texture.WHITE, vertices: data.vertices, uvs: data.uvs, indices: data.indices });
      this.rigMesh.label = `appendage-mesh:${this.id}`;
      this.root.addChildAt(this.rigMesh, this.root.getChildIndex(this.body));
    } else {
      this.rigMesh.vertices = data.vertices;
    }
    this.rigMeshData = data;
    this.rigMesh.tint = this.color;
    this.rigMesh.alpha = this.rigAlpha;
    this.rigMesh.visible = true;
  }
}
