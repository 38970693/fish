import type { AccessoryType, BodyType, EyeType, EyebrowType, MouthType, PatternType, ScaleType, TailType, TeethType, TrailType } from '../types';
import { cartoonPalette, traceCartoonTail } from './cartoonStyle';
import { cuteCloud, cuteHeart, cuteOval, cuteRoundRect, cuteStar } from './cuteCosmeticShapes';
import { drawClosedFishEye } from './fishBlink';

type Ctx = CanvasRenderingContext2D;
const ink = '#655371';
const sweets = ['#ffb5cb', '#ffe49d', '#a6e5d2', '#a9d9ff', '#d7bdff'];
const dot = (ctx: Ctx, x: number, y: number, size: number, color: string) => cuteOval(ctx, x, y, size, size, color);
const sticker = (ctx: Ctx, shape: 'HEART' | 'STAR', x: number, y: number, size: number, color: string) => {
  ctx.fillStyle = color;
  (shape === 'HEART' ? cuteHeart : cuteStar)(ctx, x, y, size); ctx.fill();
};

/** Soft little charms follow the fish without allocating a trail history. */
export const drawTrail = (ctx: Ctx, type: TrailType | undefined, r: number, time: number, offset: number) => {
  if (!type || type === 'NONE') return;
  for (let i = 0; i < 4; i++) {
    const size = Math.max(1, r * (0.22 - i * 0.035));
    ctx.save(); ctx.translate(-r * (1.7 + i * 0.46), Math.sin(time * 0.06 + offset + i) * r * 0.16);
    ctx.globalAlpha *= 0.65 - i * 0.13;
    ctx.lineWidth = Math.max(0.7, r * 0.025); ctx.lineCap = 'round';
    switch (type) {
      case 'BUBBLES':
        dot(ctx, 0, 0, size, '#d6f5ff'); ctx.strokeStyle = '#94d8e9'; ctx.stroke();
        dot(ctx, -size * 0.3, -size * 0.3, size * 0.22, '#ffffff'); break;
      case 'RAINBOW':
        dot(ctx, 0, 0, size, sweets[i]); dot(ctx, -size * 0.25, -size * 0.3, size * 0.2, '#fffaf5'); break;
      case 'FIRE':
        ctx.fillStyle = i % 2 ? '#ffc6a2' : '#ffd58e'; cuteCloud(ctx, 0, 0, size * 0.75); ctx.fill();
        sticker(ctx, 'STAR', 0, 0, size * 0.45, '#fff8d4'); break;
      case 'GLITTER':
        ctx.rotate(Math.sin(time * 0.04 + i) * 0.15); sticker(ctx, 'STAR', 0, 0, size, i % 2 ? '#fffdf5' : '#ffe49d'); break;
      case 'HEARTS': sticker(ctx, 'HEART', 0, 0, size, '#ffabc7'); break;
      case 'ELECTRIC':
        ctx.strokeStyle = '#afc5ff'; ctx.beginPath(); ctx.moveTo(size, -size * 0.3);
        ctx.quadraticCurveTo(0, -size, 0, 0); ctx.quadraticCurveTo(0, size, -size, size * 0.3); ctx.stroke();
        dot(ctx, size, -size * 0.3, size * 0.2, '#fff4bd'); break;
      case 'SLIME':
        cuteOval(ctx, 0, 0, size, size * 0.75, '#b6e8bd');
        dot(ctx, -size * 0.25, -size * 0.2, size * 0.18, '#f2ffe7'); break;
    }
    ctx.restore();
  }
};

export const getBodyTypeParams = (type: BodyType): { scaleX: number; scaleY: number } => {
  const shapes: Record<BodyType, [number, number]> = {
    DEFAULT: [1, 1], ROUND: [1.12, 1.16], SLENDER: [1.14, 0.94], CHUNKY: [1.08, 1.2],
    BOX: [1.04, 1.06], STAR: [1.15, 1.15], MERMAID: [1.15, 1.03], RAY: [1.05, 1.22], EEL: [1.3, 0.82],
  };
  const [scaleX, scaleY] = shapes[type] ?? shapes.DEFAULT;
  return { scaleX, scaleY };
};

/** Rounded fabric, petals and toy fins. The caller places these behind the body. */
export const drawTail = (ctx: Ctx, type: TailType, r: number, time: number, rootX = -0.9, bodyColor = '#a9d9ff') => {
  ctx.save(); ctx.translate(rootX * r, 0); ctx.rotate(Math.sin(time * 0.1) * 0.065);
  const palette = cartoonPalette(bodyColor);
  ctx.fillStyle = palette.fin; ctx.strokeStyle = palette.outline;
  ctx.lineWidth = Math.max(0.7, r * 0.025); ctx.lineCap = 'round';
  switch (type) {
    case 'CRESCENT':
      ctx.beginPath(); ctx.moveTo(0, -r * 0.12);
      ctx.bezierCurveTo(-r * 0.25, -r * 0.2, -r * 0.35, -r * 0.65, -r * 0.58, -r * 0.5);
      ctx.quadraticCurveTo(-r * 0.28, 0, -r * 0.58, r * 0.5);
      ctx.bezierCurveTo(-r * 0.35, r * 0.65, -r * 0.25, r * 0.2, 0, r * 0.12);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'FORKED':
      traceCartoonTail(ctx, r, 0, 0.12, 0.62, 0.4, 0.8, 0.8); ctx.fill(); ctx.stroke(); break;
    case 'FAN':
      for (const side of [-1, 0, 1]) {
        ctx.save(); ctx.rotate(side * 0.5);
        cuteOval(ctx, -r * 0.3, 0, r * 0.42, r * 0.22, palette.fin); ctx.stroke(); ctx.restore();
      }
      break;
    case 'TRIDENT':
      for (const side of [-1, 0, 1]) {
        cuteOval(ctx, -r * 0.35, side * r * 0.23, r * (side ? 0.3 : 0.4), r * 0.13, side ? '#e8c8fa' : '#f5d4ed'); ctx.stroke();
      }
      break;
    case 'RIBBON':
      for (const side of [-1, 1]) {
        const wave = Math.sin(time * 0.09) * r * 0.07;
        ctx.fillStyle = side < 0 ? '#ffc2da' : '#d6c4f6';
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-r * 0.3, side * r * 0.5, -r * 0.6, side * r * 0.42 + wave, -r * 0.85, side * r * 0.2);
        ctx.quadraticCurveTo(-r * 0.65, side * r * 0.02, -r * 0.47, side * r * 0.18 + wave);
        ctx.quadraticCurveTo(-r * 0.12, side * r * 0.3, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      dot(ctx, -r * 0.12, 0, r * 0.08, '#fff1e5'); break;
    case 'LOBSTER':
      for (let i = 0; i < 3; i++) {
        cuteOval(ctx, -r * (0.13 + i * 0.19), 0, r * 0.19, r * (0.2 + i * 0.055), ['#ffd6bd', '#ffc5ae', '#ffb7a5'][i]); ctx.stroke();
      }
      for (const side of [-1, 1]) cuteOval(ctx, -r * 0.65, side * r * 0.17, r * 0.24, r * 0.18, '#ffd6bd');
      break;
    case 'MECHANICAL':
      traceCartoonTail(ctx, r, 0, 0.12, 0.58, 0.35, 0.25, 1);
      ctx.fillStyle = '#c6d8ef'; ctx.fill(); ctx.stroke();
      cuteRoundRect(ctx, -r * 0.66, -r * 0.13, r * 0.22, r * 0.26, r * 0.07); ctx.fillStyle = '#9cb9dd'; ctx.fill();
      sticker(ctx, 'STAR', -r * 0.28, 0, r * 0.12, '#fff1b7');
      cuteOval(ctx, -r * 0.76, 0, r * (0.14 + Math.sin(time * 0.15) * 0.02), r * 0.08, '#b9edee'); break;
    case 'GHOST':
      ctx.globalAlpha *= 0.72;
      ctx.fillStyle = '#dfd7fb'; cuteCloud(ctx, -r * 0.35, 0, r * 0.36); ctx.fill(); ctx.stroke();
      dot(ctx, -r * 0.43, -r * 0.06, r * 0.026, ink); dot(ctx, -r * 0.27, -r * 0.06, r * 0.026, ink); break;
    default:
      traceCartoonTail(ctx, r, 0, 0.12, 0.55, 0.38, 0.3, 0.8); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
};

/** Every expression retains large eye whites, reflections and rosy cheeks. */
export const drawEyes = (ctx: Ctx, type: EyeType, eyeX: number, eyeY: number, radius: number, time: number, openness = 1) => {
  const size = Math.min(radius * (type === 'ANIME' ? 0.275 : 0.26), Math.abs(eyeY) * 0.9);
  if (size <= 0) return;
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => cuteOval(ctx, x, y, rx, ry, color);
  ctx.save(); ctx.shadowBlur = 0; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(eyeX, side * eyeY); ctx.scale(1, side);
    oval(size * 1.12, -size * 0.43, size * 0.52, size * 0.29, '#ffb7ca');
    if (type !== 'DEAD') {
      if (openness <= 0.08) {
        drawClosedFishEye(ctx, size);
        ctx.restore();
        continue;
      }
      ctx.scale(1, openness);
    }
    const tall = type === 'ANIME' ? 1.05 : 1;
    oval(0, 0, size * 1.065, size * (tall + 0.065), type === 'CYBORG' ? '#91accb' : ink);
    oval(0, 0, size, size * tall, '#fffdf9');
    const px = size * 0.1;
    const iris = type === 'ANIME' ? '#80b7ec' : type === 'MAD' ? '#d6a0bb' : type === 'CAT' ? '#9fcba4'
      : type === 'FIRE' ? '#efb176' : type === 'CYBORG' ? '#a1cfde' : '#91a1c7';
    if (type !== 'DEAD' && type !== 'LOVE') {
      oval(px, 0, size * 0.78, size * 0.8, iris);
      oval(px, type === 'DERP' ? side * size * 0.2 : 0, size * 0.56, size * 0.63, '#26374f');
    }
    if (type === 'CAT') oval(px, 0, size * 0.25, size * 0.65, '#1f3445');
    if (type === 'LOVE') sticker(ctx, 'HEART', px, 0, size * 0.84, '#ef8eaf');
    if (type === 'FIRE') sticker(ctx, 'STAR', px, size * 0.08 + Math.sin(time * 0.15) * size * 0.015, size * 0.53, '#ffe49d');
    if (type === 'CYBORG') {
      ctx.strokeStyle = '#e5fbfa'; ctx.lineWidth = size * 0.1; ctx.beginPath(); ctx.arc(px, 0, size * 0.55, 0.3, 2.3); ctx.stroke();
      dot(ctx, -size * 0.82, 0, size * 0.08, '#fff1b7');
    }
    if (type === 'DEAD') {
      // A sleepy crescent instead of the old death crosses.
      ctx.strokeStyle = '#7b6b8d'; ctx.lineWidth = size * 0.15;
      ctx.beginPath(); ctx.moveTo(-size * 0.52, -size * 0.1);
      ctx.quadraticCurveTo(px, size * 0.55, size * 0.6, -size * 0.1); ctx.stroke();
      dot(ctx, size * 0.64, -size * 0.44, size * 0.08, '#dac9f8');
    } else {
      oval(px - size * 0.23, -size * 0.31, size * (type === 'ANIME' ? 0.3 : 0.24), size * 0.25, '#ffffff');
      dot(ctx, px + size * 0.33, size * 0.26, size * 0.11, '#ffffff');
    }
    if (type === 'MAD' || type === 'ANIME') {
      ctx.strokeStyle = ink; ctx.lineWidth = size * 0.11; ctx.beginPath();
      ctx.moveTo(-size * 0.68, -size * 0.75);
      ctx.quadraticCurveTo(-size * 0.2, -size * (type === 'MAD' ? 0.82 : 1.15), size * 0.38, -size * 0.77); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
};

/** Little curved brows sit beside the face, with rounded ends. */
export const drawEyebrows = (ctx: Ctx, type: EyebrowType, eyeX: number, eyeY: number, r: number, eyeSize = r * 0.2) => {
  if (type === 'NONE') return;
  ctx.save(); ctx.strokeStyle = '#80647f'; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(eyeX - eyeSize * 0.05, side * (eyeY + eyeSize * 1.16)); ctx.scale(1, side);
    ctx.lineWidth = Math.max(0.8, r * (type === 'THICK' ? 0.055 : 0.035));
    const w = r * 0.12;
    ctx.beginPath(); ctx.moveTo(-w, 0);
    switch (type) {
      case 'ANGRY': ctx.quadraticCurveTo(0, -r * 0.025, w, -r * 0.07); break;
      case 'SAD': ctx.quadraticCurveTo(0, r * 0.04, w, r * 0.065); break;
      case 'CONFUSED': ctx.quadraticCurveTo(0, side * r * 0.12, w, -r * 0.01); break;
      case 'THICK': ctx.quadraticCurveTo(0, r * 0.025, w, 0); break;
      case 'UNI': ctx.quadraticCurveTo(0, -r * 0.005, w, 0); break;
      case 'TIERED':
        ctx.quadraticCurveTo(0, r * 0.06, w, 0); ctx.stroke();
        ctx.lineWidth *= 0.7; ctx.beginPath(); ctx.moveTo(-w * 0.75, r * 0.065);
        ctx.quadraticCurveTo(0, r * 0.1, w * 0.75, r * 0.065); break;
      default: ctx.quadraticCurveTo(0, r * 0.065, w, 0);
    }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
};

/** Optional face anchors keep glasses and patches fitted to every body shape. */
export const drawAccessory = (ctx: Ctx, type: AccessoryType, r: number, time: number, eyeX = r * 0.35, eyeY = r * 0.45, eyeSize = r * 0.23) => {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, r * 0.027);
  switch (type) {
    case 'CROWN':
      ctx.translate(-r * 0.18, -r * 0.5);
      ctx.fillStyle = '#ffe29b'; ctx.strokeStyle = '#bc9679';
      ctx.beginPath(); ctx.moveTo(-r * 0.28, r * 0.04);
      ctx.lineTo(-r * 0.28, -r * 0.25); ctx.quadraticCurveTo(-r * 0.27, -r * 0.36, -r * 0.18, -r * 0.24);
      ctx.lineTo(-r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.04, -r * 0.33);
      ctx.quadraticCurveTo(0, -r * 0.44, r * 0.04, -r * 0.33);
      ctx.lineTo(r * 0.1, -r * 0.1); ctx.lineTo(r * 0.18, -r * 0.24);
      ctx.quadraticCurveTo(r * 0.27, -r * 0.36, r * 0.28, -r * 0.25);
      ctx.lineTo(r * 0.28, r * 0.04); ctx.closePath(); ctx.fill(); ctx.stroke();
      cuteRoundRect(ctx, -r * 0.3, -r * 0.02, r * 0.6, r * 0.12, r * 0.05); ctx.fillStyle = '#ffd085'; ctx.fill(); ctx.stroke();
      sticker(ctx, 'HEART', 0, 0, r * 0.075, '#f4a3ba');
      for (const x of [-0.22, 0, 0.22]) dot(ctx, x * r, -r * (x ? 0.27 : 0.35), r * 0.044, '#fff8dc'); break;
    case 'BOW_TIE':
      ctx.translate(-r * 0.2, r * 0.4);
      for (const side of [-1, 1]) {
        ctx.fillStyle = side < 0 ? '#f5a7c6' : '#ffc5da';
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.bezierCurveTo(side * r * 0.38, -r * 0.32, side * r * 0.42, r * 0.32, 0, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        cuteOval(ctx, side * r * 0.17, -r * 0.07, r * 0.07, r * 0.025, '#ffeaf3');
      }
      dot(ctx, 0, 0, r * 0.075, '#ee94b8'); break;
    case 'FLOWER':
      ctx.translate(-r * 0.25, -r * 0.53); ctx.rotate(Math.sin(time * 0.035) * 0.1);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        dot(ctx, Math.cos(a) * r * 0.14, Math.sin(a) * r * 0.14, r * 0.13, i % 2 ? '#ffcee0' : '#f7b5d4'); ctx.stroke();
      }
      dot(ctx, 0, 0, r * 0.105, '#ffe3a1'); dot(ctx, -r * 0.025, -r * 0.03, r * 0.03, '#fff9de'); break;
    case 'SUNGLASSES':
      for (const side of [-1, 1]) {
        cuteOval(ctx, eyeX, side * eyeY, eyeSize * 1.15, eyeSize * 1.05, '#b49bce'); ctx.stroke();
        cuteOval(ctx, eyeX, side * eyeY, eyeSize * 0.87, eyeSize * 0.77, '#526581');
        cuteOval(ctx, eyeX - eyeSize * 0.24, side * eyeY - eyeSize * 0.25, eyeSize * 0.29, eyeSize * 0.13, '#cce7f5');
      }
      ctx.strokeStyle = '#b49bce'; ctx.lineWidth = r * 0.055; ctx.beginPath();
      ctx.moveTo(eyeX, -eyeY + eyeSize); ctx.quadraticCurveTo(eyeX - r * 0.1, 0, eyeX, eyeY - eyeSize); ctx.stroke(); break;
    case 'HALO':
      ctx.strokeStyle = '#d6b589'; ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath(); ctx.ellipse(-r * 0.16, -r * 0.77, r * 0.32, r * 0.105, -0.15, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff1bf'; ctx.lineWidth *= 0.6; ctx.stroke();
      sticker(ctx, 'STAR', r * 0.22, -r * 0.73, r * 0.08, '#ffe4a1'); break;
    case 'EYEPATCH':
      ctx.strokeStyle = '#c6a4d8'; ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.7); ctx.quadraticCurveTo(eyeX, -eyeY, r * 0.82, 0); ctx.stroke();
      cuteOval(ctx, eyeX, -eyeY, eyeSize * 1.16, eyeSize * 1.05, '#c5a6df');
      ctx.strokeStyle = '#9d82b8'; ctx.lineWidth = Math.max(0.8, r * 0.025); ctx.stroke();
      sticker(ctx, 'HEART', eyeX, -eyeY, eyeSize * 0.52, '#fff1f6'); break;
    case 'GOLD_CHAIN':
      // A pearl necklace and heart charm leave the front of the face open.
      for (let i = 0; i < 11; i++) {
        const a = 1.15 + i * (Math.PI * 2 - 2.3) / 10;
        dot(ctx, Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.55, r * 0.055, i % 2 ? '#fff7de' : '#f3dcab');
      }
      sticker(ctx, 'HEART', -r * 0.67, 0, r * 0.12, '#ffb7c9'); break;
  }
  ctx.restore();
};

/** Sticker-like patterns avoid covering the large eyes at the front. */
export const drawPattern = (ctx: Ctx, type: PatternType, r: number, time: number) => {
  if (type === 'NONE') return;
  ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha *= 0.78;
  switch (type) {
    case 'STRIPES': case 'TIGER': case 'ZEBRA':
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = type === 'TIGER' ? '#ad7e78' : type === 'ZEBRA' ? (i % 2 ? '#c5b3d8' : '#fff5ed') : '#fff2dc';
        ctx.lineWidth = r * (type === 'ZEBRA' ? 0.13 : type === 'TIGER' ? 0.105 : 0.08);
        const x = r * (-0.65 + i * 0.35);
        ctx.beginPath(); ctx.moveTo(x, -r * 0.65);
        ctx.quadraticCurveTo(x + r * (type === 'TIGER' ? 0.17 : 0.07), 0, x, r * 0.65); ctx.stroke();
      }
      break;
    case 'SPOTS': case 'DOTS':
      for (const [x, y] of [[-0.52, -0.25], [-0.52, 0.25], [-0.05, -0.35], [-0.05, 0.35], [-0.28, 0]]) {
        dot(ctx, x * r, y * r, r * 0.085, '#fff1d5');
      }
      break;
    case 'HEART': case 'STAR':
      for (const [x, y, size] of [[-0.5, -0.2, 0.16], [-0.5, 0.2, 0.16], [-0.04, 0, 0.21]]) {
        sticker(ctx, type, x * r, y * r, size * r, type === 'HEART' ? '#ffb6cc' : '#fff0b8');
      }
      break;
    case 'GALAXY':
      cuteOval(ctx, -r * 0.3, 0, r * 0.6, r * 0.48, '#cbbaf1');
      for (let i = 0; i < 7; i++) {
        const a = i * 2.399; const distance = r * (0.18 + (i % 3) * 0.12);
        sticker(ctx, 'STAR', -r * 0.3 + Math.cos(a) * distance, Math.sin(a) * distance, r * (i % 2 ? 0.065 : 0.105), i % 2 ? '#fffdf7' : '#ffe9b1');
      }
      break;
    case 'LAVA':
      for (const side of [-1, 1]) {
        ctx.strokeStyle = side < 0 ? '#ffcca5' : '#fff0bf'; ctx.lineWidth = r * 0.13; ctx.beginPath();
        ctx.moveTo(-r * 0.8, side * r * 0.2);
        ctx.bezierCurveTo(-r * 0.6, side * r * 0.5, -r * 0.4, 0, r * 0.13, side * r * 0.24); ctx.stroke();
      }
      sticker(ctx, 'HEART', -r * 0.27, 0, r * 0.12, '#f5a9a2'); break;
    case 'CLOUD':
      for (const [x, y, size] of [[-0.52, -0.2, 0.2], [-0.52, 0.2, 0.2], [-0.04, 0, 0.23]]) {
        ctx.fillStyle = '#fffdf7'; cuteCloud(ctx, x * r, y * r, size * r); ctx.fill();
      }
      break;
    case 'CIRCUIT':
      ctx.strokeStyle = '#b9e8e1'; ctx.lineWidth = r * 0.035;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-r * 0.75, side * r * 0.3);
        ctx.quadraticCurveTo(-r * 0.3, side * r * 0.4, -r * 0.2, side * r * 0.18); ctx.stroke();
        dot(ctx, -r * 0.2, side * r * 0.18, r * 0.07, '#fff3bb');
      }
      break;
  }
  ctx.restore();
};

/** Sparse, rounded scales feel like a toy's finish rather than plate armor. */
export const drawScaleEffect = (ctx: Ctx, type: ScaleType, r: number, time: number, _baseColor: string) => {
  if (type === 'NONE') return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.7, r * 0.023);
  switch (type) {
    case 'SHINY':
      cuteOval(ctx, -r * 0.28, -r * 0.16, r * 0.3, r * 0.095, 'rgba(255,253,245,0.55)');
      dot(ctx, r * 0.03, -r * 0.27, r * 0.05, '#fffaf5'); break;
    case 'GLOW':
      ctx.globalAlpha *= 0.38 + Math.sin(time * 0.05) * 0.04;
      cuteOval(ctx, -r * 0.23, 0, r * 0.62, r * 0.4, '#d8f9ed');
      sticker(ctx, 'STAR', -r * 0.4, -r * 0.22, r * 0.095, '#fffadf'); break;
    case 'CRYSTAL':
      ctx.globalAlpha *= 0.65;
      for (const [x, y] of [[-0.54, -0.2], [-0.54, 0.2], [-0.04, 0]]) {
        sticker(ctx, 'STAR', x * r, y * r, r * 0.17, '#e8ddff');
        dot(ctx, (x - 0.025) * r, (y - 0.025) * r, r * 0.033, '#ffffff');
      }
      break;
    case 'DRAGON':
      ctx.strokeStyle = '#fff1bb'; ctx.globalAlpha *= 0.65;
      for (let col = 0; col < 3; col++) for (const side of [-1, 1]) {
        const x = r * (-0.64 + col * 0.23), y = side * r * 0.22;
        ctx.beginPath(); ctx.moveTo(x - r * 0.08, y);
        ctx.quadraticCurveTo(x, y + side * r * 0.14, x + r * 0.08, y); ctx.stroke();
      }
      break;
    case 'ARMOR':
      for (const side of [-1, 1]) {
        cuteRoundRect(ctx, -r * 0.63, side * r * 0.2 - r * 0.11, r * 0.5, r * 0.22, r * 0.09);
        ctx.fillStyle = 'rgba(230,213,246,0.42)'; ctx.fill(); ctx.strokeStyle = '#eadff5'; ctx.stroke();
        sticker(ctx, 'HEART', -r * 0.37, side * r * 0.2, r * 0.065, '#ffcedc');
      }
      break;
    case 'MECHANICAL':
      cuteRoundRect(ctx, -r * 0.68, -r * 0.26, r * 0.64, r * 0.52, r * 0.13);
      ctx.fillStyle = 'rgba(195,225,239,0.38)'; ctx.fill(); ctx.strokeStyle = '#a9cedd'; ctx.stroke();
      for (let i = 0; i < 3; i++) dot(ctx, r * (-0.53 + i * 0.18), 0, r * 0.047, sweets[i]);
      cuteOval(ctx, -r * 0.36, -r * 0.15, r * 0.18, r * 0.026, '#f3fcff'); break;
  }
  ctx.restore();
};

/** Tiny milk teeth stay inside the small mouth; old saved IDs keep their distinct styles. */
export const drawTeeth = (ctx: Ctx, type: TeethType, mouth: MouthType, r: number, _time: number, _gap: number, _open: number, mouthX = r * 0.84): void => {
  if (type === 'NORMAL') return;
  ctx.save(); ctx.translate(mouthX, 0); ctx.lineWidth = Math.max(0.45, r * 0.012); ctx.strokeStyle = '#bca1ae';
  const size = r * (mouth === 'FLAT' || mouth === 'CURVE' ? 0.04 : 0.055);
  const color = type === 'GOLD' ? '#ffe39e' : type === 'DIAMOND' ? '#d5efff' : '#fffaf0';
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(0, side * size * 0.77);
    if (type === 'DIAMOND') {
      sticker(ctx, 'STAR', 0, 0, size * 0.9, color);
    } else {
      const length = type === 'VAMPIRE' ? 1.65 : type === 'SABER' ? 1.9 : type === 'SHARP' ? 1.3 : 1;
      cuteRoundRect(ctx, -size * 0.58, -size * 0.5, size * length, size, size * 0.4);
      ctx.fillStyle = type === 'RAINBOW' ? (side < 0 ? '#ffbdd6' : '#bde7e0') : color; ctx.fill(); ctx.stroke();
      if (type === 'DOUBLE_ROW') {
        cuteRoundRect(ctx, -size * 1.6, -size * 0.36, size * 0.75, size * 0.72, size * 0.25); ctx.fillStyle = '#fff0bf'; ctx.fill();
      }
      if (type === 'GOLD') dot(ctx, size * 0.02, -size * 0.14, size * 0.14, '#fffbea');
      if (type === 'RAINBOW') dot(ctx, 0, -size * 0.14, size * 0.13, '#fffdf6');
    }
    ctx.restore();
  }
  ctx.restore();
};
