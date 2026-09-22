import type { MorphologyGenes, MorphologyRecipe, PartDefinition } from './types';
import { STANDARD_VOLUME_LAYERS } from './surface/volumeProfile';

export const DEFAULT_STANDARD_GENES: MorphologyGenes = {
  bodyLength: 0.5,
  bodyDepth: 0.5,
  headRatio: 0.5,
  bellyCurve: 0.5,
  backCurve: 0.5,
  snoutLength: 0.35,
  tailPeduncle: 0.5,
  dorsalFinHeight: 0.45,
  pectoralFinSize: 0.45,
  tailFork: 0.35,
  eyeScale: 0.5,
  eyeSpacing: 0.5,
};

const STANDARD_MOTION = {
  spineSections: 10,
  tailAmplitude: 0.18,
  tailFrequency: 2.2,
  amplitudeCurve: [0, 0.03, 0.08, 0.18, 0.38, 0.68, 1],
  turnBend: 0.55,
  finFlutter: 0.12,
  idleBreath: 0.04,
} as const;

const standardRanges: MorphologyRecipe['ranges'] = {
  bodyLength: [0.3, 0.72], bodyDepth: [0.3, 0.72], headRatio: [0.32, 0.68],
  bellyCurve: [0.28, 0.72], backCurve: [0.28, 0.72], snoutLength: [0.18, 0.62],
  tailPeduncle: [0.25, 0.7], dorsalFinHeight: [0.22, 0.75], pectoralFinSize: [0.25, 0.75],
  tailFork: [0.12, 0.8], eyeScale: [0.3, 0.72], eyeSpacing: [0.3, 0.7],
};

export const MORPHOLOGY_RECIPES = {
  STANDARD_FISH: {
    id: 'STANDARD_FISH', archetype: 'STANDARD_FISH', defaults: DEFAULT_STANDARD_GENES,
    ranges: standardRanges,
    requiredParts: { dorsal: 'dorsal.classic', pectoralLeft: 'pectoral.classic', pectoralRight: 'pectoral.classic.right', tailFin: 'tail.classic' },
    allowedTags: ['standard-fish', 'deep-body'],
    material: { primaryColor: '#38bdf8', secondaryColor: '#e0f2fe', patternId: 'NONE', scaleId: 'NONE', glow: 0 },
    surfaceLayers: STANDARD_VOLUME_LAYERS,
    motion: STANDARD_MOTION, maxVisualExtent: 2.15,
  },
  CLOWN_FISH: {
    id: 'CLOWN_FISH', archetype: 'STANDARD_FISH',
    defaults: { ...DEFAULT_STANDARD_GENES, bodyLength: 0.46, bodyDepth: 0.62, headRatio: 0.54, tailFork: 0.22, eyeScale: 0.58 },
    ranges: { ...standardRanges, bodyLength: [0.36, 0.57], bodyDepth: [0.5, 0.72], tailFork: [0.12, 0.42] },
    requiredParts: { dorsal: 'dorsal.classic', pectoralLeft: 'pectoral.classic', pectoralRight: 'pectoral.classic.right', tailFin: 'tail.rounded' },
    allowedTags: ['standard-fish', 'deep-body'],
    material: { primaryColor: '#fb923c', secondaryColor: '#fff7ed', patternId: 'CLOWN_BANDS', scaleId: 'NONE', glow: 0 },
    surfaceLayers: STANDARD_VOLUME_LAYERS,
    motion: { ...STANDARD_MOTION, tailFrequency: 2.45 }, maxVisualExtent: 2.2,
  },
  DEEP_BODY: {
    id: 'DEEP_BODY', archetype: 'DEEP_BODY',
    defaults: { ...DEFAULT_STANDARD_GENES, bodyLength: 0.3, bodyDepth: 0.88, dorsalFinHeight: 0.72, pectoralFinSize: 0.58 },
    ranges: { ...standardRanges, bodyLength: [0.2, 0.48], bodyDepth: [0.72, 0.98] },
    requiredParts: { dorsal: 'dorsal.long', pectoralLeft: 'pectoral.long', pectoralRight: 'pectoral.long.right', tailFin: 'tail.rounded' },
    allowedTags: ['deep-body', 'standard-fish'],
    material: { primaryColor: '#fbbf24', secondaryColor: '#fef3c7', patternId: 'STRIPES', scaleId: 'SHINY', glow: 0.05 },
    surfaceLayers: STANDARD_VOLUME_LAYERS,
    motion: { ...STANDARD_MOTION, spineSections: 6, tailAmplitude: 0.13 }, maxVisualExtent: 2.25,
  },
  PUFFER: {
    id: 'PUFFER', archetype: 'PUFFER',
    defaults: { ...DEFAULT_STANDARD_GENES, bodyLength: 0.12, bodyDepth: 0.96, headRatio: 0.76, tailPeduncle: 0.25, eyeScale: 0.68 },
    ranges: { ...standardRanges, bodyLength: [0.05, 0.25], bodyDepth: [0.82, 1] },
    requiredParts: { dorsal: 'dorsal.classic', pectoralLeft: 'pectoral.classic', pectoralRight: 'pectoral.classic.right', tailFin: 'tail.classic' },
    allowedTags: ['standard-fish'],
    material: { primaryColor: '#a3e635', secondaryColor: '#ecfccb', patternId: 'SPOTS', scaleId: 'SPIKES', glow: 0 },
    surfaceLayers: STANDARD_VOLUME_LAYERS,
    motion: { ...STANDARD_MOTION, spineSections: 6, tailAmplitude: 0.1, tailFrequency: 2.8 }, maxVisualExtent: 2.1,
  },
  EEL: {
    id: 'EEL', archetype: 'EEL',
    defaults: { ...DEFAULT_STANDARD_GENES, bodyLength: 0.98, bodyDepth: 0.08, headRatio: 0.38, tailPeduncle: 0.36, dorsalFinHeight: 0.18, pectoralFinSize: 0.15 },
    ranges: { ...standardRanges, bodyLength: [0.85, 1], bodyDepth: [0.04, 0.2] },
    requiredParts: { dorsal: 'dorsal.classic', pectoralLeft: 'pectoral.classic', pectoralRight: 'pectoral.classic.right', tailFin: 'tail.classic' },
    allowedTags: ['standard-fish'],
    material: { primaryColor: '#14b8a6', secondaryColor: '#99f6e4', patternId: 'DOTS', scaleId: 'SHINY', glow: 0.08 },
    surfaceLayers: STANDARD_VOLUME_LAYERS,
    motion: { ...STANDARD_MOTION, spineSections: 10, tailAmplitude: 0.28, tailFrequency: 1.65, turnBend: 0.8 }, maxVisualExtent: 2.55,
  },
} as const satisfies Record<string, MorphologyRecipe>;

export const MORPHOLOGY_PARTS = {
  'dorsal.classic': { id: 'dorsal.classic', slot: 'dorsal', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'DORSAL', length: 0.72, spread: 0.9, fork: 0, softness: 0.25 }, layer: 'REAR', boundsScale: 0.5, fallbackId: 'dorsal.classic' },
  'dorsal.long': { id: 'dorsal.long', slot: 'dorsal', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'DORSAL', length: 1.12, spread: 1.1, fork: 0, softness: 0.7 }, layer: 'REAR', boundsScale: 0.92, fallbackId: 'dorsal.classic' },
  'pectoral.classic': { id: 'pectoral.classic', slot: 'pectoralLeft', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'PECTORAL', length: 0.72, spread: 0.65, fork: 0, softness: 0.3 }, layer: 'FRONT', boundsScale: 0.42, fallbackId: 'pectoral.classic' },
  'pectoral.classic.right': { id: 'pectoral.classic.right', slot: 'pectoralRight', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'PECTORAL', length: 0.72, spread: 0.65, fork: 0, softness: 0.3 }, layer: 'REAR', boundsScale: 0.42, fallbackId: 'pectoral.classic.right' },
  'pectoral.long': { id: 'pectoral.long', slot: 'pectoralLeft', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'PECTORAL', length: 1.15, spread: 0.76, fork: 0.12, softness: 0.75 }, layer: 'FRONT', boundsScale: 0.9, fallbackId: 'pectoral.classic' },
  'pectoral.long.right': { id: 'pectoral.long.right', slot: 'pectoralRight', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'PECTORAL', length: 1.15, spread: 0.76, fork: 0.12, softness: 0.75 }, layer: 'REAR', boundsScale: 0.9, fallbackId: 'pectoral.classic.right' },
  'tail.classic': { id: 'tail.classic', slot: 'tailFin', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'TAIL', length: 0.72, spread: 0.64, fork: 0.25, softness: 0.35 }, layer: 'REAR', boundsScale: 0.72, fallbackId: 'tail.classic' },
  'tail.rounded': { id: 'tail.rounded', slot: 'tailFin', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'TAIL', length: 0.85, spread: 0.78, fork: 0.08, softness: 0.5 }, layer: 'REAR', boundsScale: 0.8, fallbackId: 'tail.classic' },
  'tail.ribbon': { id: 'tail.ribbon', slot: 'tailFin', tags: ['standard-fish', 'deep-body'], geometry: { kind: 'TAIL', length: 1.3, spread: 0.7, fork: 0.55, softness: 0.9 }, layer: 'REAR', boundsScale: 1.25, fallbackId: 'tail.classic' },
  'tail.tentacle-fan': { id: 'tail.tentacle-fan', slot: 'tailFin', tags: ['cephalopod'], geometry: { kind: 'TAIL', length: 1.05, spread: 0.92, fork: 0.7, softness: 1 }, layer: 'REAR', boundsScale: 1.2, fallbackId: 'tail.classic' },
} as const satisfies Record<string, PartDefinition>;

export type MorphologyRecipeId = keyof typeof MORPHOLOGY_RECIPES;
export type MorphologyPartId = keyof typeof MORPHOLOGY_PARTS;

export const getMorphologyPart = (id: string | undefined, fallback: MorphologyPartId): PartDefinition =>
  MORPHOLOGY_PARTS[id as MorphologyPartId] ?? MORPHOLOGY_PARTS[fallback];

export const morphologyRecipeForCreature = (type: string, shape = 'FISH'): MorphologyRecipeId =>
  shape === 'FISH' && type === 'CLOWN_FISH' ? 'CLOWN_FISH' : 'STANDARD_FISH';
