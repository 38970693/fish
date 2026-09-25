import type { ResolvedMorphology } from './types';
import { MORPHOLOGY_PARTS } from './registry';

export interface PairedSlotDiagnostic {
  name: '胸鳍' | '腹鳍';
  leftPart: string;
  rightPart: string;
  error: number;
  mirrored: boolean;
}

export interface MorphologySymmetryMetrics {
  outlineError: number;
  anchorError: number;
  pairedSlots: readonly PairedSlotDiagnostic[];
}

/** 数值均为鱼体半径的倍数；误差是镜像对应点的最大偏差。 */
export const measureMorphologySymmetry = (morphology: ResolvedMorphology): MorphologySymmetryMetrics => {
  const { outline, anchors } = morphology.geometry;
  const outlineError = Math.max(0, ...outline.map(point => {
    const match = outline.find(other => Math.abs(other.x - point.x) < 0.00001 && Math.abs(other.y + point.y) < 0.00001);
    if (match) return 0;
    return Math.min(...outline.map(other => Math.hypot(other.x - point.x, other.y + point.y)));
  }));
  const pairs = [
    { name: '胸鳍' as const, left: 'pectoralLeft' as const, right: 'pectoralRight' as const },
    { name: '腹鳍' as const, left: 'pelvicLeft' as const, right: 'pelvicRight' as const },
  ];
  const pairedSlots = pairs.map(({ name, left, right }) => {
    const a = anchors[left]; const b = anchors[right];
    const error = Math.max(
      Math.abs(a.x - b.x), Math.abs(a.y + b.y), Math.abs(a.scale - b.scale),
      Math.abs(a.normalX - b.normalX), Math.abs(a.normalY + b.normalY),
    );
    const leftPart = morphology.parts[left]; const rightPart = morphology.parts[right];
    const mirrored = error < 0.00001 && MORPHOLOGY_PARTS[leftPart]?.pairId === rightPart && MORPHOLOGY_PARTS[rightPart]?.pairId === leftPart;
    return { name, leftPart, rightPart, error, mirrored };
  });
  return {
    outlineError,
    anchorError: Math.max(...pairedSlots.map(pair => pair.error)),
    pairedSlots,
  };
};
