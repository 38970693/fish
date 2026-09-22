import { buildStandardFishGeometry } from './standardFish';
import type { MorphologyArchetype, MorphologyGenes, StandardFishGeometry } from '../types';

/** 原型只决定几何语法；部件、材质和动作仍由配方独立组合。 */
export const buildMorphologyGeometry = (archetype: MorphologyArchetype, genes: MorphologyGenes): StandardFishGeometry => {
  switch (archetype) {
    case 'DEEP_BODY':
      return buildStandardFishGeometry({ ...genes, bodyLength: Math.min(0.5, genes.bodyLength), bodyDepth: Math.max(0.7, genes.bodyDepth) });
    case 'PUFFER':
      return buildStandardFishGeometry({ ...genes, bodyLength: Math.min(0.24, genes.bodyLength), bodyDepth: Math.max(0.86, genes.bodyDepth), bellyCurve: 0.9, backCurve: 0.9 });
    case 'EEL':
      return buildStandardFishGeometry({ ...genes, bodyLength: Math.max(0.86, genes.bodyLength), bodyDepth: Math.min(0.2, genes.bodyDepth), headRatio: Math.min(0.5, genes.headRatio) });
    default:
      return buildStandardFishGeometry(genes);
  }
};

