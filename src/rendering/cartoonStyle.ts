/** 保留装扮色相，用柔和的同色描边与奶油高光统一卡通材质。 */
export const cartoonPalette = (color: string) => {
  const value = /^#[\da-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : 0x38bdf8;
  const mix = (target: number, amount: number): string => {
    const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount) + ((target >> shift) & 255) * amount);
    return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
  };
  return { body: mix(0xfff5eb, 0.2), fin: mix(0xfff5eb, 0.32), outline: mix(0x3b3553, 0.5), highlight: mix(0xffffff, 0.65) };
};

/** Shared petal-shaped tail: rounded lobes retain each species' length and fork. */
export const traceCartoonTail = (
  ctx: CanvasRenderingContext2D, radius: number, rootX: number, rootHalf: number,
  length: number, spread: number, fork: number, softness: number,
): void => {
  const x = (distance: number) => (rootX - length * distance) * radius;
  const y = (width: number) => spread * width * radius;
  const notch = 0.87 - fork * 0.2;
  const roundness = 0.12 + softness * 0.08;
  ctx.beginPath();
  ctx.moveTo(x(0), -rootHalf * radius);
  ctx.quadraticCurveTo(x(0.5), y(-1.12), x(0.87), y(-1));
  ctx.quadraticCurveTo(x(1 + roundness), y(-0.92), x(1), y(-0.65));
  ctx.quadraticCurveTo(x(notch), y(-0.24), x(notch), 0);
  ctx.quadraticCurveTo(x(notch), y(0.24), x(1), y(0.65));
  ctx.quadraticCurveTo(x(1 + roundness), y(0.92), x(0.87), y(1));
  ctx.quadraticCurveTo(x(0.5), y(1.12), x(0), rootHalf * radius);
  ctx.closePath();
};

/** 特殊鱼种用宽而淡的高光表现背部，避免细脊线割裂鱼身。 */
export const drawCartoonGloss = (ctx: CanvasRenderingContext2D, radius: number, x: number, length: number, width: number): void => {
  ctx.save();
  const rx = radius * length * 0.55;
  const gradient = ctx.createRadialGradient(x - rx * 0.12, 0, 0, x, 0, rx);
  gradient.addColorStop(0, 'rgba(255,250,243,0.2)');
  gradient.addColorStop(0.55, 'rgba(255,250,243,0.075)');
  gradient.addColorStop(1, 'rgba(255,250,243,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.ellipse(x, 0, rx, radius * Math.max(0.18, width * 2.5), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};
