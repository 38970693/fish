type Ctx = CanvasRenderingContext2D;

/** Small vector shapes shared by wardrobe thumbnails, Canvas and Pixi. */
export const cuteOval = (ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string): void => {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
};

export const cuteRoundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, rounding: number): void => {
  const r = Math.min(rounding, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
};

export const cuteHeart = (ctx: Ctx, x: number, y: number, size: number): void => {
  ctx.beginPath(); ctx.moveTo(x, y + size * 0.75);
  ctx.bezierCurveTo(x - size * 1.2, y, x - size * 0.68, y - size, x, y - size * 0.32);
  ctx.bezierCurveTo(x + size * 0.68, y - size, x + size * 1.2, y, x, y + size * 0.75);
  ctx.closePath();
};

export const cuteStar = (ctx: Ctx, x: number, y: number, size: number): void => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = i * Math.PI / 5 - Math.PI / 2;
    const r = size * (i % 2 ? 0.53 : 1);
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
  ctx.beginPath();
  ctx.moveTo((points[9].x + points[0].x) / 2, (points[9].y + points[0].y) / 2);
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  });
  ctx.closePath();
};

export const cuteCloud = (ctx: Ctx, x: number, y: number, size: number): void => {
  ctx.beginPath(); ctx.moveTo(x - size * 0.9, y + size * 0.3);
  ctx.bezierCurveTo(x - size * 1.35, y - size * 0.45, x - size * 0.7, y - size * 0.9, x - size * 0.4, y - size * 0.48);
  ctx.bezierCurveTo(x - size * 0.2, y - size * 1.2, x + size * 0.65, y - size * 1.05, x + size * 0.65, y - size * 0.4);
  ctx.bezierCurveTo(x + size * 1.4, y - size * 0.5, x + size * 1.5, y + size * 0.45, x + size * 0.8, y + size * 0.48);
  ctx.quadraticCurveTo(x, y + size * 0.65, x - size * 0.9, y + size * 0.3); ctx.closePath();
};
