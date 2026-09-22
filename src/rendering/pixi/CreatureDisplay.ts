import { Container, Graphics, MeshSimple, Sprite, Texture, type Texture as PixiTexture } from 'pixi.js';
import { CreatureType, type BodyType, type Entity } from '../../types';
import type { CreatureShapeId } from '../../data/creatureShapes';
import { buildAppendageRig, type AppendageRigSpec } from './AppendageRig';
import { lodJointCount, type CreatureLod } from './CreatureLod';
import { getCachedPatternMarks, getMorphologyPart, morphologyAppearanceSignature, resolveMorphology, type ResolvedMorphology, type SurfaceLayerKind } from '../../morphology';
import { buildSpineMeshData, type SpineMeshData } from './MorphologyMesh';

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

const bodyScale: Record<BodyType, { x: number; y: number }> = {
  DEFAULT: { x: 1, y: 1 }, ROUND: { x: 1.15, y: 1.15 }, SLENDER: { x: 0.85, y: 1.2 },
  CHUNKY: { x: 1.25, y: 0.88 }, BOX: { x: 1.05, y: 0.95 }, STAR: { x: 1.15, y: 1.15 },
  MERMAID: { x: 0.9, y: 1.12 }, RAY: { x: 1.35, y: 0.7 }, EEL: { x: 0.68, y: 1.45 },
};

export const creatureAppearanceSignature = (entity: Entity): string => {
  const cosmetics = entity.cosmetics;
  return [
    entity.config.shape ?? 'FISH', Math.round(entity.radius * 10) / 10, entity.config.color,
    cosmetics?.skinColor, cosmetics?.pattern, cosmetics?.scaleType, cosmetics?.accessory,
    cosmetics?.tailType, cosmetics?.bodyType, cosmetics?.mouthType, cosmetics?.eyeType,
    cosmetics?.eyebrowType, cosmetics?.teeth, cosmetics?.rareVariant,
    morphologyAppearanceSignature(entity),
  ].join('|');
};

export const isPixiStandardFish = (entity: Entity): boolean =>
  (entity.config.shape ?? 'FISH') === 'FISH';

const resolvedBodyColor = (entity: Entity, morphology?: ResolvedMorphology): string => {
  if (morphology) return morphology.material.primaryColor;
  const selected = entity.cosmetics?.skinColor;
  return selected && selected !== 'DEFAULT' ? selected : entity.config.color;
};

/** 一个实体对应一个长期复用的 Pixi 节点，位置更新不会重建外观。 */
export class CreatureDisplay {
  readonly root = new Container();
  private rear = new Graphics();
  private body = new Graphics();
  private surface = new Graphics();
  private dorsalLight = new Graphics();
  private headLight = new Graphics();
  private details = new Graphics();
  private frontAnimated = new Graphics();
  private effects = new Graphics();
  private flexMesh?: MeshSimple;
  private flexMeshLod: CreatureLod | -1 = -1;
  private flexMeshData?: SpineMeshData;
  private lodSprite = new Sprite();
  private signature = '';
  private radius = 1;
  private color = '#38bdf8';
  private standardFish = true;
  private morphology?: ResolvedMorphology;
  private lod: CreatureLod = 0;
  private presentationMode: CreaturePresentationMode = 'FULL';

  constructor(private id: string) {
    this.root.label = `creature:${id}`;
    this.lodSprite.anchor.set(0.5);
    this.lodSprite.visible = false;
    this.root.addChild(this.effects, this.rear, this.body, this.surface, this.dorsalLight, this.headLight, this.details, this.frontAnimated);
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

  update(entity: Entity, now: number, isPlayer: boolean, lod: CreatureLod = 0, skipAnimation = false): void {
    const nextSignature = creatureAppearanceSignature(entity);
    if (nextSignature !== this.signature) {
      this.signature = nextSignature;
      this.rebuild(entity);
    }
    const scale = Number.isFinite(entity.renderScale) ? entity.renderScale : 1;
    this.root.position.set(entity.x, entity.y);
    this.root.rotation = entity.angle;
    // 两个高光节点围绕各自体积中心反向旋转，因此光源在世界中保持左上方向。
    this.dorsalLight.rotation = -entity.angle;
    this.headLight.rotation = -entity.angle;
    const breath = this.morphology ? 1 + Math.sin(now * 0.0021 + entity.animOffset) * this.morphology.motion.idleBreath : 1;
    this.root.scale.set(scale, scale * breath);
    this.root.alpha = entity.semiGhostTimer && entity.semiGhostTimer > 0
      ? 0.45 + Math.sin(now * 0.018 + entity.animOffset) * 0.12
      : entity.camoActive || entity.inCover ? (isPlayer ? 0.52 : 0.42) : 1;
    this.lod = lod;
    this.syncSurfaceNodes(lod);
    if (lod < 2 && this.lodSprite.parent) this.lodSprite.removeFromParent();
    this.details.visible = lod === 0;
    this.surface.visible = lod < 2;
    this.dorsalLight.visible = lod < 2;
    this.headLight.visible = lod === 0;
    this.frontAnimated.visible = lod < 2;
    this.rear.visible = lod < 2;
    this.body.visible = lod < 2;
    this.effects.visible = lod < 2;
    this.lodSprite.visible = lod === 2 && !!this.lodSprite.texture;
    this.updateFlexibleBody(entity, now, lod);
    if (!skipAnimation && lod < 2) this.drawAnimated(entity, now, isPlayer);
  }

  useLodTexture(asset: LodTextureAsset): void {
    this.lodSprite.texture = asset.texture;
    this.lodSprite.position.set(asset.centerX, asset.centerY);
    if (!this.lodSprite.parent) this.root.addChild(this.lodSprite);
    this.lodSprite.visible = this.lod === 2;
    this.rear.visible = false;
    this.body.visible = false;
    this.surface.visible = false;
    this.dorsalLight.visible = false;
    this.headLight.visible = false;
    this.details.visible = false;
    this.frontAnimated.visible = false;
    this.effects.visible = false;
  }

  createSnapshotTarget(): { target: Container; centerX: number; centerY: number } {
    const target = new Container();
    const clone = (source: Graphics) => {
      const graphic = new Graphics({ context: source.context });
      graphic.position.copyFrom(source.position);
      graphic.scale.copyFrom(source.scale);
      graphic.rotation = source.rotation;
      return graphic;
    };
    target.addChild(
      clone(this.rear), clone(this.body), clone(this.surface), clone(this.dorsalLight),
      clone(this.headLight), clone(this.details), clone(this.frontAnimated)
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
    for (const node of [this.surface, this.dorsalLight, this.headLight]) {
      node.removeFromParent();
      node.destroy();
    }
    this.root.destroy({ children: true });
  }

  private syncSurfaceNodes(lod: CreatureLod): void {
    const nodes = [this.surface, this.dorsalLight, this.headLight];
    if (lod === 2) {
      for (const node of nodes) node.removeFromParent();
      return;
    }
    for (const node of nodes) {
      if (node.parent) continue;
      const detailsIndex = this.root.getChildIndex(this.details);
      this.root.addChildAt(node, detailsIndex);
    }
  }

  private rebuild(entity: Entity): void {
    this.radius = Math.max(1, entity.radius);
    this.standardFish = isPixiStandardFish(entity);
    const r = this.radius;
    const cosmetics = entity.cosmetics;
    const scale = bodyScale[cosmetics?.bodyType ?? 'DEFAULT'];
    this.body.clear();
    this.surface.clear();
    this.dorsalLight.clear();
    this.headLight.clear();
    this.details.clear();
    this.morphology = this.standardFish && entity.type !== CreatureType.PLANKTON ? resolveMorphology(entity) : undefined;
    this.color = resolvedBodyColor(entity, this.morphology);
    this.flexMeshLod = -1;
    this.flexMeshData = undefined;
    this.body.scale.set(this.morphology ? 1 : scale.x, this.morphology ? 1 : scale.y);
    this.details.scale.set(this.morphology ? 1 : scale.x, this.morphology ? 1 : scale.y);

    if (entity.type === CreatureType.PLANKTON) {
      this.body.circle(0, 0, r).fill({ color: this.color }).stroke({ color: '#ffffff', width: 1, alpha: 0.35 });
      this.details.circle(r * 0.25, -r * 0.2, Math.max(1, r * 0.12)).fill({ color: '#ffffff' });
      return;
    }

    if (!this.standardFish) {
      this.drawSpecialShape((entity.config.shape ?? 'FISH') as CreatureShapeId);
      this.drawEyes(entity);
      this.drawAccessory(entity);
      return;
    }

    const outline = this.morphology!.geometry.outline.flatMap(point => [point.x * r, point.y * r]);
    this.body.poly(outline, true).fill({ color: this.color }).stroke({ color: '#0f172a', width: Math.max(1, r * 0.06), alpha: 0.45 });
    if (this.presentationMode !== 'VOLUME_ONLY') for (const side of [-1, 1] as const) {
      const pectoral = side < 0 ? this.morphology!.geometry.anchors.pectoralLeft : this.morphology!.geometry.anchors.pectoralRight;
      const partId = side < 0 ? this.morphology!.parts.pectoralLeft : this.morphology!.parts.pectoralRight;
      const fallback = side < 0 ? 'pectoral.classic' : 'pectoral.classic.right';
      const pectoralPart = getMorphologyPart(partId, fallback).geometry;
      const finLength = pectoral.scale * pectoralPart.length;
      this.details.moveTo(pectoral.x * r, pectoral.y * r)
        .quadraticCurveTo((pectoral.x - pectoralPart.spread * 0.43) * r, (pectoral.y + side * finLength) * r, (pectoral.x + pectoralPart.spread * 0.52) * r, (pectoral.y + side * 0.08) * r)
        .closePath().fill({ color: this.color, alpha: 0.78 })
        .stroke({ color: this.morphology!.material.secondaryColor, width: Math.max(0.8, r * 0.025), alpha: 0.34 });
      this.details.ellipse(pectoral.x * r, pectoral.y * r, r * pectoral.scale * 0.44, r * pectoral.scale * 0.2)
        .fill({ color: this.morphology!.material.secondaryColor, alpha: 0.16 });
      for (const offset of [-0.15, 0.04, 0.2]) {
        this.details.moveTo(pectoral.x * r, pectoral.y * r)
          .quadraticCurveTo((pectoral.x - pectoralPart.spread * (0.3 + offset)) * r, (pectoral.y + side * finLength * (0.8 + offset * 0.2)) * r, (pectoral.x + pectoralPart.spread * 0.4) * r, (pectoral.y + side * 0.07) * r)
          .stroke({ color: this.morphology!.material.secondaryColor, width: Math.max(0.7, r * 0.018), alpha: 0.25 });
      }
    }
    this.drawMorphologySurface();
    if (this.presentationMode === 'FULL') this.drawPattern(entity);
    if (this.presentationMode !== 'VOLUME_ONLY') {
      this.drawEyes(entity);
      this.drawAccessory(entity);
    }
  }

  private drawMorphologySurface(): void {
    if (!this.morphology) return;
    const r = this.radius;
    const { minX, maxY } = this.morphology.geometry.bounds;
    const headX = this.morphology.geometry.anchors.eyeLeft.x;
    const dorsal = this.morphology.geometry.anchors.dorsal;
    const dorsalPart = getMorphologyPart(this.morphology.parts.dorsal, 'dorsal.classic').geometry;
    const layer = (kind: SurfaceLayerKind) => this.morphology!.surfaceLayers.find(item => item.kind === kind);
    const { dorsalRidge, flankShade, headDome, tailPeduncle, worldLight } = this.morphology.volume;
    const flank = layer('FLANK_SHADE');
    const ridge = layer('DORSAL_VOLUME');
    const dome = layer('HEAD_DOME');
    const peduncle = layer('TAIL_PEDUNCLE');

    // PixiJS 用少量同心 Graphics 近似渐变；节点仅在外观签名变化时重建。
    if (flank) {
      for (const side of [-1, 1] as const) {
        this.surface.ellipse(
          flankShade.centerX * r,
          side * flankShade.radiusY * r * 0.52,
          flankShade.radiusX * r,
          flankShade.radiusY * r * 0.24
        ).fill({ color: flank.color, alpha: flank.alpha * 0.72 });
      }
    }
    if (peduncle) {
      for (const scale of [1, 0.68, 0.38]) {
        this.surface.ellipse(tailPeduncle.centerX * r, 0, tailPeduncle.radiusX * r * scale, tailPeduncle.radiusY * r * scale)
          .fill({ color: peduncle.color, alpha: peduncle.alpha * (0.24 + (1 - scale) * 0.22) });
      }
    }
    if (ridge) {
      this.dorsalLight.position.set(dorsalRidge.centerX * r, dorsalRidge.centerY * r);
      for (const scale of [1, 0.62, 0.3]) {
        this.dorsalLight.ellipse(
          worldLight.x * dorsalRidge.radiusX * r * 0.1,
          worldLight.y * dorsalRidge.radiusY * r * 0.32,
          dorsalRidge.radiusX * r * scale,
          Math.max(r * 0.025, dorsalRidge.radiusY * r * scale)
        ).fill({ color: ridge.color, alpha: ridge.alpha * (0.12 + (1 - scale) * 0.22) });
      }
    }
    if (dome) {
      this.headLight.position.set(headDome.centerX * r, headDome.centerY * r);
      for (const scale of [1, 0.66, 0.34]) {
        this.headLight.ellipse(
          worldLight.x * headDome.radiusX * r * 0.22,
          worldLight.y * headDome.radiusY * r * 0.22,
          headDome.radiusX * r * scale,
          headDome.radiusY * r * scale
        ).fill({ color: dome.color, alpha: dome.alpha * (0.1 + (1 - scale) * 0.25) });
      }
    }

    if (this.presentationMode === 'VOLUME_ONLY') return;

    this.details.moveTo((headX - 0.2) * r, -maxY * r * 0.48)
      .quadraticCurveTo((headX - 0.42) * r, 0, (headX - 0.2) * r, maxY * r * 0.48)
      .stroke({ color: '#0f172a', width: Math.max(1, r * 0.035), alpha: 0.3, cap: 'round' });
    this.details.moveTo((headX - 0.34) * r, r * 0.08)
      .quadraticCurveTo(-r * 0.18, r * 0.16, minX * r * 0.7, r * 0.05)
      .stroke({ color: this.morphology.material.secondaryColor, width: Math.max(0.8, r * 0.025), alpha: 0.2, cap: 'round' });
    const ridgeLength = r * (0.48 + dorsalPart.spread * 0.34);
    const ridgeHalfWidth = r * (0.025 + dorsal.scale * dorsalPart.length * 0.055);
    const ridgeX = dorsal.x * r;
    this.details.moveTo(ridgeX - ridgeLength * 0.62, 0)
      .quadraticCurveTo(ridgeX, -ridgeHalfWidth, ridgeX + ridgeLength * 0.48, 0)
      .quadraticCurveTo(ridgeX, ridgeHalfWidth, ridgeX - ridgeLength * 0.62, 0)
      .closePath().fill({ color: '#ffffff', alpha: 0.12 })
      .stroke({ color: this.morphology.material.secondaryColor, width: Math.max(0.8, r * 0.024), alpha: 0.32 });
  }

  private updateFlexibleBody(entity: Entity, now: number, lod: CreatureLod): void {
    if (!this.morphology || lod === 2) {
      if (this.flexMesh) this.flexMesh.visible = false;
      this.body.visible = lod < 2;
      return;
    }
    const speed = Math.hypot(entity.vx, entity.vy);
    const velocityAngle = speed > 0.001 ? Math.atan2(entity.vy, entity.vx) : entity.angle;
    let turn = velocityAngle - entity.angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const phase = now * 0.001 * this.morphology.motion.tailFrequency + entity.animOffset;
    const meshData = buildSpineMeshData(this.morphology, this.radius, phase, speed / Math.max(0.01, entity.speed), turn / Math.PI, lod, this.flexMeshData);
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
    if (this.presentationMode !== 'VOLUME_ONLY' && entity.type === CreatureType.CLOWN_FISH && entity.cosmetics?.rareVariant === 'STARRY_CLOWN') {
      // 三条珠光带保留小丑鱼辨识度，端点限制在椭圆身体内。
      for (const [x, height] of [[-0.65, 0.46], [-0.1, 0.65], [0.48, 0.52]]) {
        this.details.moveTo(r * (x - 0.08), -r * height)
          .quadraticCurveTo(r * (x + 0.14), 0, r * (x - 0.04), r * height)
          .stroke({ color: '#040c23', width: r * 0.21, alpha: 0.38 });
        this.details.moveTo(r * (x - 0.08), -r * height)
          .quadraticCurveTo(r * (x + 0.14), 0, r * (x - 0.04), r * height)
          .stroke({ color: '#5be6ef', width: r * 0.14, alpha: 0.65 });
        this.details.moveTo(r * (x - 0.08), -r * height)
          .quadraticCurveTo(r * (x + 0.14), 0, r * (x - 0.04), r * height)
          .stroke({ color: '#edfaff', width: r * 0.065, alpha: 0.95 });
      }
      for (const [index, mark] of getCachedPatternMarks(this.morphology!, 23).entries()) {
        this.details.circle(mark.x * r, mark.y * r, mark.radius * r)
          .fill({ color: mark.color, alpha: mark.alpha });
        if (index % 6 === 0) {
          const x = mark.x * r; const y = mark.y * r; const sparkle = r * 0.055;
          this.details.moveTo(x - sparkle, y).lineTo(x + sparkle, y)
            .moveTo(x, y - sparkle).lineTo(x, y + sparkle)
            .stroke({ color: '#f8fdff', width: Math.max(0.8, r * 0.012), alpha: 0.72, cap: 'round' });
        }
      }
      this.details.ellipse(-r * 0.14, -r * 0.36, r * 0.5, r * 0.12)
        .fill({ color: '#8abaff', alpha: 0.15 });
      return;
    }
    if (pattern === 'CLOWN_BANDS') {
      for (const [x, height, bend] of [[-0.48, 0.56, -0.06], [0.18, 0.72, 0.1], [0.62, 0.5, -0.03]] as const) {
        this.details.moveTo(r * x, -r * height).quadraticCurveTo(r * (x + bend), 0, r * (x - bend * 0.45), r * height)
          .stroke({ color: '#0f172a', width: r * 0.22, alpha: 0.42, cap: 'round' });
        this.details.moveTo(r * x, -r * height).quadraticCurveTo(r * (x + bend), 0, r * (x - bend * 0.45), r * height)
          .stroke({ color: this.morphology?.material.secondaryColor ?? '#fff7ed', width: r * 0.135, alpha: 0.96, cap: 'round' });
        this.details.moveTo(r * x, -r * height).quadraticCurveTo(r * (x + bend), 0, r * (x - bend * 0.45), r * height)
          .stroke({ color: '#ffffff', width: r * 0.032, alpha: 0.48, cap: 'round' });
      }
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
    if (pattern === 'HEART') {
      this.details.circle(-r * 0.08, -r * 0.05, r * 0.14).fill({ color: '#f472b6', alpha: 0.8 });
      this.details.circle(r * 0.08, -r * 0.05, r * 0.14).fill({ color: '#f472b6', alpha: 0.8 });
      this.details.moveTo(-r * 0.22, 0).lineTo(0, r * 0.28).lineTo(r * 0.22, 0).fill({ color: '#f472b6', alpha: 0.8 });
      return;
    }
    const stripeColor = pattern === 'ZEBRA' ? '#f8fafc' : pattern === 'LAVA' || pattern === 'FIREY' ? '#fb923c' : '#172554';
    for (let i = -2; i <= 2; i += 1) {
      const x = i * r * 0.26;
      this.details.moveTo(x - r * 0.08, -r * 0.58).lineTo(x + r * 0.1, r * 0.58)
        .stroke({ color: stripeColor, width: Math.max(2, r * 0.09), alpha: 0.48 });
    }
  }

  private drawSpecialShape(shape: CreatureShapeId): void {
    const r = this.radius;
    const fill = this.color;
    const outline = { color: '#0f172a', width: Math.max(1, r * 0.05), alpha: 0.5 };
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
    const r = this.radius;
    this.details.moveTo(r * (x - length * 0.55), 0)
      .quadraticCurveTo(r * x, -r * width, r * (x + length * 0.45), 0)
      .quadraticCurveTo(r * x, r * width, r * (x - length * 0.55), 0)
      .closePath().fill({ color, alpha: 0.72 })
      .stroke({ color: '#ffffff', width: Math.max(0.8, r * 0.018), alpha: 0.24 });
  }

  private drawEyes(entity: Entity): void {
    const r = this.radius;
    const eyeType = entity.cosmetics?.eyeType ?? 'NORMAL';
    const eyeColor = eyeType === 'MAD' ? '#ef4444' : eyeType === 'ANIME' ? '#60a5fa' : eyeType === 'LOVE' ? '#f472b6' : '#111827';
    const eyeAnchor = this.morphology?.geometry.anchors.eyeLeft;
    const eyeX = r * (eyeAnchor?.x ?? 0.38);
    const eyeY = r * Math.abs(eyeAnchor?.y ?? 0.38);
    const eyeRadius = r * (eyeAnchor?.scale ?? (eyeType === 'ANIME' ? 0.24 : 0.2));
    const eyes = [{ y: -eyeY, scale: 1, alpha: 1 }, { y: eyeY, scale: 1, alpha: 1 }];
    for (const eye of eyes) {
      const y = eye.y;
      const size = eyeRadius * eye.scale;
      this.details.circle(eyeX, y, size).fill({ color: '#ffffff', alpha: eye.alpha });
      if (eyeType === 'DEAD') {
        this.details.moveTo(eyeX - size * 0.55, y - size * 0.55).lineTo(eyeX + size * 0.55, y + size * 0.55)
          .moveTo(eyeX + size * 0.55, y - size * 0.55).lineTo(eyeX - size * 0.55, y + size * 0.55)
          .stroke({ color: '#111827', width: Math.max(1, r * 0.06) });
      } else {
        this.details.circle(eyeX + size * 0.24, y, size * 0.5).fill({ color: eyeColor, alpha: eye.alpha });
        this.details.circle(eyeX + size * 0.43, y - size * 0.15, size * 0.15).fill({ color: '#ffffff', alpha: 0.9 * eye.alpha });
      }
    }
    const eyebrow = entity.cosmetics?.eyebrowType;
    if (eyebrow && eyebrow !== 'NONE') {
      const tilt = eyebrow === 'ANGRY' ? r * 0.1 : eyebrow === 'SAD' ? -r * 0.1 : 0;
      for (const side of [-1, 1]) {
        const y = side * eyeY;
        this.details.moveTo(eyeX - eyeRadius * 0.8, y + side * (eyeRadius * 1.2 + tilt)).lineTo(eyeX + eyeRadius * 0.7, y + side * (eyeRadius * 1.2 - tilt))
          .stroke({ color: '#111827', width: eyebrow === 'THICK' ? 4 : 2, alpha: 0.75 });
      }
    }
  }

  private drawAccessory(entity: Entity): void {
    const accessory = entity.cosmetics?.accessory ?? 'NONE';
    const r = this.radius;
    if (accessory === 'CROWN') {
      this.details.moveTo(-r * 0.3, -r * 0.68).lineTo(-r * 0.2, -r).lineTo(0, -r * 0.78)
        .lineTo(r * 0.2, -r).lineTo(r * 0.34, -r * 0.68).closePath().fill({ color: '#facc15' });
    } else if (accessory === 'SUNGLASSES') {
      for (const y of [-r * 0.38, r * 0.38]) this.details.ellipse(r * 0.4, y, r * 0.27, r * 0.17).fill({ color: '#020617', alpha: 0.92 });
      this.details.moveTo(r * 0.42, -r * 0.2).lineTo(r * 0.42, r * 0.2).stroke({ color: '#020617', width: 3 });
    } else if (accessory === 'HALO') {
      this.details.ellipse(0, -r * 0.95, r * 0.45, r * 0.12).stroke({ color: '#facc15', width: 3 });
    } else if (accessory === 'BOW_TIE') {
      this.details.moveTo(r * 0.05, 0).lineTo(-r * 0.3, -r * 0.2).lineTo(-r * 0.3, r * 0.2).closePath().fill({ color: '#ef4444' });
      this.details.moveTo(r * 0.05, 0).lineTo(r * 0.3, -r * 0.2).lineTo(r * 0.3, r * 0.2).closePath().fill({ color: '#ef4444' });
    }
  }

  private drawAnimated(entity: Entity, now: number, isPlayer: boolean): void {
    const r = this.radius;
    const phase = now * 0.008 + entity.animOffset;
    const wag = Math.sin(phase * 2.2) * r * 0.18;
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
    this.frontAnimated.clear();
    if (this.standardFish && entity.type !== CreatureType.PLANKTON) {
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
      this.rear.moveTo(r * rootX, -r * rootHalf)
        .quadraticCurveTo(r * (rootX - tailLength * (0.38 + tailSoftness * 0.12)), -r * fork + wag * 0.35, tipX, -r * fork * 1.08 + wag)
        .quadraticCurveTo(r * (rootX - tailLength * 0.68), -r * fork * tailFork * 0.38 + wag * 0.2, r * (rootX - tailLength * (0.72 - tailFork * 0.08)), wag * 0.08)
        .quadraticCurveTo(r * (rootX - tailLength * 0.68), r * fork * tailFork * 0.38 + wag * 0.2, tipX, r * fork * 1.08 + wag)
        .quadraticCurveTo(r * (rootX - tailLength * (0.38 + tailSoftness * 0.12)), r * fork + wag * 0.35, r * rootX, r * rootHalf).closePath()
        .fill({ color: tail === 'MECHANICAL' ? '#94a3b8' : this.color, alpha: tail === 'GHOST' ? 0.45 : 0.9 })
        .stroke({ color: '#0f172a', width: 1, alpha: 0.35 });
      for (const ray of [-0.72, -0.36, 0, 0.36, 0.72]) {
        this.rear.moveTo(r * rootX, ray * r * rootHalf)
          .quadraticCurveTo(r * (rootX - tailLength * 0.48), ray * r * fork + wag * 0.2, tipX, ray * r * fork + wag)
          .stroke({ color: this.morphology?.material.secondaryColor ?? '#ffffff', width: Math.max(0.7, r * 0.02), alpha: 0.24 });
      }
      const mouthGap = 0.08 + ((Math.sin(phase * 1.4) + 1) / 2) * 0.25;
      const mouthType = entity.cosmetics?.mouthType ?? 'TRIANGLE';
      const mouthX = (this.morphology?.geometry.anchors.mouth.x ?? 1.02) * r;
      if (this.presentationMode === 'VOLUME_ONLY') {
        // 体积诊断模式不画动态嘴与鼻孔。
      } else if (mouthType === 'CIRCLE') {
        this.frontAnimated.circle(mouthX - r * 0.1, 0, r * 0.13).stroke({ color: '#0f172a', width: Math.max(1, r * 0.055), alpha: 0.72 });
      } else {
        this.frontAnimated.moveTo(mouthX - r * 0.25, -r * mouthGap * 0.48)
          .quadraticCurveTo(mouthX + r * 0.015, 0, mouthX - r * 0.25, r * mouthGap * 0.48)
          .stroke({ color: '#0f172a', width: Math.max(1.3, r * 0.055), alpha: 0.72, cap: 'round' });
      }
      this.frontAnimated.circle(mouthX - r * 0.18, -r * 0.17, Math.max(0.8, r * 0.018)).fill({ color: '#0f172a', alpha: 0.34 });
    } else if (!this.standardFish) {
      this.drawSpecialAnimated(entity, (entity.config.shape ?? 'FISH') as CreatureShapeId, phase, wag);
    }
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
    for (const segment of segments) {
      this.rear.moveTo(segment.from.x, segment.from.y).lineTo(segment.to.x, segment.to.y)
        .stroke({ color: this.color, width: segment.width, alpha, cap: 'round', join: 'round' });
    }
    return segments;
  }
}
