import type { MorphologyAnchor, MorphologyGenes, MorphologyPoint, StandardFishGeometry } from '../types';

const anchor = (x: number, y: number, normalX: number, normalY: number, scale: number): MorphologyAnchor => ({
  x, y, tangentX: normalY, tangentY: -normalX, normalX, normalY, scale,
});

/** 生成朝 +x 的标准鱼归一化轮廓；坐标乘实体 radius 后即可渲染。 */
export const buildStandardFishGeometry = (genes: MorphologyGenes): StandardFishGeometry => {
  const halfLength = 0.7 + genes.bodyLength * 0.61;
  const depth = 0.32 + genes.bodyDepth * 0.68;
  const headBulge = 1.04 + genes.headRatio * 0.24;
  const snout = 0.035 + genes.snoutLength * 0.1;
  const tailDepth = 0.12 + genes.tailPeduncle * 0.2;
  // 俯视鱼以身体中轴为镜像轴。背线/腹线基因共同决定横向宽度，避免
  // 配方在一侧堆出“侧视肚皮”，同时仍保留两个旧基因对体型的影响。
  const sideDepth = depth * (0.82 + ((genes.backCurve + genes.bellyCurve) * 0.5) * 0.27);
  const noseX = halfLength + snout;
  const sampleSide = (side: -1 | 1): MorphologyPoint[] => {
    const points: MorphologyPoint[] = [];
    const samples = 19;
    for (let index = 0; index < samples; index += 1) {
      const t = index / (samples - 1);
      // 圆钝的头部快速展开，向尾柄逐渐收束。高密度采样同时服务 Canvas 与 Pixi mesh。
      const bulb = Math.pow(Math.sin(Math.PI * t), 0.54);
      const frontWeight = 1 + (headBulge - 1) * Math.pow(1 - t, 1.7);
      const curveBias = 0.91 + ((genes.backCurve + genes.bellyCurve) * 0.5) * 0.145 - t * 0.015;
      const envelope = tailDepth * t + sideDepth * bulb * frontWeight * curveBias
        + sideDepth * 0.12 * Math.pow(1 - t, 7);
      points.push({
        x: noseX + (-halfLength - noseX) * t,
        y: side * envelope,
      });
    }
    return points;
  };
  const upper = sampleSide(-1);
  const lower = sampleSide(1).reverse();
  // 鼻端保留两个镜像点，闭合后形成圆钝的小脸，避免尖锐的三角鱼头。
  const points: MorphologyPoint[] = [...upper, ...lower];
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const eyeX = halfLength * (0.42 + genes.headRatio * 0.1);
  const eyeY = depth * (0.34 + genes.eyeSpacing * 0.18);
  const eyeSize = Math.min(0.15 + genes.eyeScale * 0.12, eyeY * 0.7);
  return {
    outline: points,
    anchors: {
      eyeLeft: anchor(eyeX, -eyeY, 0, -1, eyeSize),
      eyeRight: anchor(eyeX, eyeY, 0, 1, eyeSize),
      mouth: anchor(halfLength + snout, 0, 1, 0, depth * 0.25),
      // 背鳍处于俯视中轴，在渲染层表现为居中的脊线，不再伸向单侧。
      dorsal: anchor(-halfLength * 0.03, 0, 0, -1, 0.35 + genes.dorsalFinHeight * 0.55),
      pectoralLeft: anchor(halfLength * 0.03, -depth * 0.58, 0, -1, 0.25 + genes.pectoralFinSize * 0.55),
      pectoralRight: anchor(halfLength * 0.03, depth * 0.58, 0, 1, 0.25 + genes.pectoralFinSize * 0.55),
      pelvicLeft: anchor(-halfLength * 0.28, -depth * 0.46, 0, -1, 0.18 + genes.pectoralFinSize * 0.34),
      pelvicRight: anchor(-halfLength * 0.28, depth * 0.46, 0, 1, 0.18 + genes.pectoralFinSize * 0.34),
      tailRoot: anchor(-halfLength, 0, -1, 0, tailDepth * 2),
    },
    bounds: { minX, minY, maxX, maxY, radius: Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY)) },
  };
};
