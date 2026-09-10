
import React, { useRef, useEffect } from 'react';
// Added GameStatus to imports to fix line 134 reference error
import { GameState, GameStatus, Entity, Particle, CreatureType, Obstacle, PlayerState, PowerUp, Hazard, Building, BuildingType, Portal, Cosmetics, BodyType, TailType, TrailType, EyeType, EyebrowType, AccessoryType, PatternType, ScaleType } from '../types';
import { WORLD_SIZE, GAME_MECHANICS, BOOST_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, PORTAL_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

/**
 * 画一块迷你金色小饼干（圆饼 + 深色巧克力豆 + 描边）。
 * 场景里所有「食物感」的东西统一用它：吃鱼爆出的粒子、喷泉喷出的碎屑、环境漂浮点缀。
 */
export const drawCookie = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, spin: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.55)';
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  const chips: Array<[number, number]> = [[-0.35, -0.25], [0.32, -0.08], [-0.05, 0.38], [0.2, -0.42]];
  for (const [dx, dy] of chips) {
    ctx.beginPath();
    ctx.arc(dx * size, dy * size, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/**
 * 尾迹特效：装扮选了尾迹的鱼，身后拖出对应的粒子痕迹。
 * 无状态实现 —— 不存轨迹缓冲，直接按时间在鱼后方摆出 4 个渐隐的点，
 * 视觉上等价于拖尾，但零内存、零清理逻辑。
 * 画在鱼身下层（调用点在 defineBodyPath 之前）。
 */
const drawTrail = (ctx: CanvasRenderingContext2D, trailType: TrailType | undefined, radius: number, visualTime: number, animOffset: number) => {
    if (!trailType || trailType === 'NONE') return;
    const segments = 4;
    for (let i = 0; i < segments; i += 1) {
        const t = i / segments;
        const dist = radius * (1.15 + t * 2.6);
        const sway = Math.sin(visualTime * 0.08 + animOffset + i * 1.3) * radius * 0.25;
        const size = Math.max(1.5, radius * (0.5 - t * 0.28));

        ctx.save();
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.translate(-dist, sway);

        switch (trailType) {
            case 'BUBBLES': // 半透明气泡
                ctx.strokeStyle = '#bae6fd';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.stroke();
                break;
            case 'RAINBOW': // 彩虹：色相随时间流动
                ctx.fillStyle = `hsl(${(visualTime * 2 + i * 40) % 360}, 85%, 62%)`;
                ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
                break;
            case 'FIRE': // 火焰：橙红渐层椭圆
                ctx.fillStyle = i < 2 ? '#fb923c' : '#ef4444';
                ctx.beginPath(); ctx.ellipse(0, 0, size * 1.2, size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'GLITTER': // 闪粉：旋转的金白小方块
                ctx.rotate(visualTime * 0.1 + i);
                ctx.fillStyle = i % 2 === 0 ? '#fde68a' : '#ffffff';
                ctx.fillRect(-size / 2, -size / 2, size, size);
                break;
            case 'HEARTS': { // 爱心：两圆一角
                ctx.fillStyle = '#f472b6';
                const s = size * 0.9;
                ctx.beginPath();
                ctx.arc(-s * 0.35, -s * 0.2, s * 0.38, 0, Math.PI * 2);
                ctx.arc(s * 0.35, -s * 0.2, s * 0.38, 0, Math.PI * 2);
                ctx.moveTo(-s * 0.72, -s * 0.05);
                ctx.lineTo(0, s * 0.75);
                ctx.lineTo(s * 0.72, -s * 0.05);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'ELECTRIC': // 电弧：锯齿线
                ctx.strokeStyle = '#67e8f9';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(size, 0);
                ctx.lineTo(size * 0.3, -size * 0.8);
                ctx.lineTo(-size * 0.3, size * 0.5);
                ctx.lineTo(-size, -size * 0.3);
                ctx.stroke();
                break;
            case 'SLIME': // 黏液：绿色椭圆滴
                ctx.fillStyle = '#a3e635';
                ctx.beginPath(); ctx.ellipse(0, 0, size * 0.7, size * 0.45, 0.3, 0, Math.PI * 2); ctx.fill();
                break;
        }
        ctx.restore();
    }
};

export const drawCuteFish = (ctx: CanvasRenderingContext2D, entity: Entity, visualTime: number, isPlayer: boolean) => {
    const { type, radius, animOffset, renderScale, happyTimer, fearTimer, isHidden, camoActive, speedBoostTimer, cosmetics, semiGhostTimer } = entity;

    if (!Number.isFinite(radius) || radius <= 0) return;

    // 吉祥物
    if (type === CreatureType.MASCOT) {
        ctx.save();
        ctx.translate(entity.x, entity.y);
        const breathe = Math.sin(visualTime * 0.1) * 0.05;
        ctx.scale(1 + breathe, 1 - breathe);
        ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -radius * 0.6, radius * 0.5, Math.PI * 0.8, Math.PI * 2.2); ctx.bezierCurveTo(radius * 0.8, -radius * 0.2, radius * 0.8, radius * 0.6, 0, radius * 0.8); ctx.bezierCurveTo(-radius * 0.5, radius * 1.2, radius * 0.5, radius * 1.5, 0, radius * 1.8); ctx.bezierCurveTo(-radius * 0.6, radius * 0.8, -radius * 0.6, -radius * 0.2, -radius * 0.4, -radius * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore(); return;
    }

    ctx.save();
    ctx.translate(entity.x, entity.y);
    const safeScale = Number.isFinite(renderScale) ? renderScale : 1;
    ctx.scale(safeScale, safeScale);

    // 半虚状态：半透明效果
    const isSemiGhost = semiGhostTimer && semiGhostTimer > 0;
    if (isSemiGhost) {
        ctx.globalAlpha = 0.4 + Math.sin(visualTime * 0.3) * 0.2; // 半透明 + 微微闪烁

        // 半虚状态特效光环
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.5 + Math.sin(visualTime * 0.2) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 玩家光环
    if (isPlayer && !isSemiGhost) {
        ctx.beginPath(); ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 + Math.sin(visualTime*0.1)*0.2})`; ctx.lineWidth = 3; ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    
    ctx.rotate(entity.angle);

    // 核心绘制逻辑
    const biteSpeed = isPlayer && (entity as any).boost?.active ? 0.4 : 0.15;
    // 使用平滑的正弦波：范围 0.05 到 0.6，避免使用 Math.abs 造成的尖点
    const mouthPhase = (visualTime * biteSpeed + animOffset) % (Math.PI * 2);
    const mouthGap = (Math.sin(mouthPhase) + 1) / 2 * 0.55 + 0.05;
    const mType = cosmetics?.mouthType || 'TRIANGLE';
    const bodyFill = cosmetics?.skinColor === 'DEFAULT' ? entity.config.color : cosmetics?.skinColor || entity.config.color;

    const defineBodyPath = () => {
        ctx.beginPath();
        if (type === CreatureType.PLANKTON) { 
            ctx.arc(0, 0, radius, 0, Math.PI * 2); 
        }
        else {
            if (mType === 'CIRCLE') {
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.moveTo(radius * 0.9, 0); ctx.arc(radius * 0.8, 0, radius * 0.3 * mouthGap, 0, Math.PI * 2, true);
            } else if (mType === 'SQUARE') {
                const h = radius * mouthGap;
                ctx.moveTo(radius, h); ctx.lineTo(radius * 0.5, h); ctx.lineTo(radius * 0.5, -h); ctx.lineTo(radius, -h);
                ctx.arc(0, 0, radius, -mouthGap, mouthGap, true);
            } else { // TRIANGLE
                ctx.moveTo(0, 0); ctx.arc(0, 0, radius, mouthGap, -mouthGap);
            }
        }
        ctx.closePath();
    };

    // 尾迹特效：画在鱼身下层（装扮面板选了尾迹从此真正生效）
    drawTrail(ctx, cosmetics?.trailType, radius, visualTime, animOffset);

    // 绘制口腔内壁
    if (type !== CreatureType.PLANKTON) {
        ctx.save(); ctx.fillStyle = '#400505'; ctx.beginPath();
        if (mType === 'CIRCLE') ctx.arc(radius * 0.8, 0, radius * 0.28 * mouthGap, 0, Math.PI * 2);
        else { ctx.moveTo(0, 0); ctx.arc(0, 0, radius * 0.95, -mouthGap, mouthGap); }
        ctx.fill(); ctx.restore();
    }

    // 绘制身体
    ctx.save(); defineBodyPath(); ctx.fillStyle = bodyFill; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
    if (type === CreatureType.PLANKTON) {
        ctx.fillStyle = '#b45309'; // Chocolate chips
        ctx.beginPath(); ctx.arc(-radius*0.3, -radius*0.2, radius*0.15, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(radius*0.4, -radius*0.1, radius*0.15, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-radius*0.1, radius*0.4, radius*0.15, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(radius*0.2, radius*0.3, radius*0.15, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // 绘制花纹/图案
    if (cosmetics?.pattern && cosmetics.pattern !== 'NONE') {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawPattern(ctx, cosmetics.pattern, radius, visualTime);
        ctx.restore();
    }

    // 绘制鳞片效果
    if (cosmetics?.scaleType && cosmetics.scaleType !== 'NONE') {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawScaleEffect(ctx, cosmetics.scaleType, radius, visualTime, bodyFill);
        ctx.restore();
    }

    // 绘制牙齿
    if (type !== CreatureType.PLANKTON && cosmetics?.teeth && cosmetics.teeth !== 'NORMAL') {
        const tType = cosmetics.teeth;
        ctx.save();
        ctx.fillStyle = tType === 'GOLD' ? '#fbbf24' : (tType === 'DIAMOND' ? '#e0f2fe' : (tType === 'RAINBOW' ? '#ff6b6b' : 'white'));

        const drawTooth = (ang: number, isUpper: boolean) => {
            ctx.save();
            ctx.rotate(ang);
            const tx = radius * 0.88;
            const size = radius * 0.15;
            if (tType === 'SHARP') {
                ctx.beginPath(); ctx.moveTo(tx, -size/2); ctx.lineTo(tx + size, 0); ctx.lineTo(tx, size/2); ctx.fill();
            } else if (tType === 'VAMPIRE') {
                ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx + size * 1.5, -size/2); ctx.lineTo(tx + size, 0); ctx.lineTo(tx + size * 1.5, size/2); ctx.fill();
            } else if (tType === 'SABER') {
                ctx.beginPath(); ctx.moveTo(tx, -size/3); ctx.lineTo(tx + size * 1.2, 0); ctx.lineTo(tx, size/3); ctx.fill();
            } else {
                ctx.fillRect(tx, -size/2, size, size);
            }
            ctx.restore();
        };

        if (mType === 'CIRCLE') {
            for(let i=0; i<8; i++) {
                ctx.save(); ctx.translate(radius*0.8, 0); ctx.rotate((i/8)*Math.PI*2);
                ctx.fillRect(radius*0.22*mouthGap, -2, 6, 4); ctx.restore();
            }
        } else {
            const count = 4; const step = 0.15;
            for(let i=0; i<count; i++) {
                drawTooth(-mouthGap + step * i + 0.05, true);
                drawTooth(mouthGap - step * i - 0.05, false);
            }
        }
        ctx.restore();
    }

    // 绘制尾巴
    if (cosmetics?.tailType && cosmetics.tailType !== 'DEFAULT') {
        drawTail(ctx, cosmetics.tailType, radius, visualTime);
    }

    // 绘制眼睛
    const eyeX = radius * 0.35; const eyeY = radius * 0.45;
    if (cosmetics?.eyeType && cosmetics.eyeType !== 'NORMAL') {
        drawEyes(ctx, cosmetics.eyeType, eyeX, eyeY, radius, visualTime);
    } else {
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius*0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX, eyeY, radius*0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX+radius*0.05, -eyeY, radius*0.1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX+radius*0.05, eyeY, radius*0.1, 0, Math.PI*2); ctx.fill();
    }

    // 绘制眉毛
    if (cosmetics?.eyebrowType && cosmetics.eyebrowType !== 'NONE') {
        drawEyebrows(ctx, cosmetics.eyebrowType, eyeX, eyeY, radius);
    }

    // 绘制配饰
    if (cosmetics?.accessory && cosmetics.accessory !== 'NONE') {
        drawAccessory(ctx, cosmetics.accessory, radius, visualTime);
    }

    ctx.restore();
};

// ============== Cosmetic 渲染辅助函数 ==============

/** 获取身体类型参数 */
const getBodyTypeParams = (bodyType: BodyType, radius: number) => {
  const params: Record<BodyType, { scaleX: number; scaleY: number; tailOffset: number }> = {
    DEFAULT: { scaleX: 1, scaleY: 1, tailOffset: 0 },
    ROUND: { scaleX: 1.1, scaleY: 1.1, tailOffset: 0 },
    SLENDER: { scaleX: 0.85, scaleY: 1.2, tailOffset: -5 },
    CHUNKY: { scaleX: 1.2, scaleY: 0.9, tailOffset: 5 },
    BOX: { scaleX: 1, scaleY: 0.95, tailOffset: 0 },
    STAR: { scaleX: 1.15, scaleY: 1.15, tailOffset: 0 },
    MERMAID: { scaleX: 0.9, scaleY: 1.1, tailOffset: -3 },
    RAY: { scaleX: 1.3, scaleY: 0.7, tailOffset: 10 },
    EEL: { scaleX: 0.7, scaleY: 1.4, tailOffset: -8 },
  };
  return params[bodyType] || params.DEFAULT;
};

/** 绘制尾巴 */
const drawTail = (ctx: CanvasRenderingContext2D, tailType: TailType, radius: number, visualTime: number) => {
  const tailOffset = -radius * 0.9;
  const tailWag = Math.sin(visualTime * 0.15) * 0.1;

  ctx.save();
  ctx.translate(tailOffset, 0);
  ctx.rotate(tailWag);

  ctx.fillStyle = ctx.fillStyle || '#888';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;

  switch (tailType) {
    case 'CRESCENT':
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.5, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.lineTo(0, 0);
      ctx.fill();
      break;
    case 'FORKED':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-radius * 0.4, -radius * 0.3);
      ctx.lineTo(-radius * 0.5, 0);
      ctx.lineTo(-radius * 0.4, radius * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'FAN':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius * 0.4, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    case 'TRIDENT':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-radius * 0.6, -radius * 0.25);
      ctx.lineTo(-radius * 0.4, 0);
      ctx.lineTo(-radius * 0.6, radius * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    case 'RIBBON':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const wave = Math.sin(visualTime * 0.2 + i) * radius * 0.15;
        ctx.quadraticCurveTo(-radius * 0.3, wave, -radius * 0.5, i * radius * 0.15);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-radius * 0.4, -radius * 0.2);
      ctx.lineTo(-radius * 0.5, 0);
      ctx.lineTo(-radius * 0.4, radius * 0.2);
      ctx.closePath();
      ctx.fill();
  }
  ctx.restore();
};

/** 绘制眼睛（根据眼睛类型） */
const drawEyes = (ctx: CanvasRenderingContext2D, eyeType: EyeType, eyeX: number, eyeY: number, radius: number, visualTime: number) => {
  ctx.fillStyle = 'white';

  switch (eyeType) {
    case 'ANIME':
      ctx.beginPath(); ctx.ellipse(eyeX, -eyeY, radius * 0.25, radius * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eyeX, eyeY, radius * 0.25, radius * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0066cc';
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.02, -eyeY, radius * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.02, eyeY, radius * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    case 'MAD':
      ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX, eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cc0000';
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.05, -eyeY, radius * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.05, eyeY, radius * 0.1, 0, Math.PI * 2); ctx.fill();
      break;
    case 'DERP':
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.08, -eyeY - radius * 0.05, radius * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.08, eyeY - radius * 0.05, radius * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.1, -eyeY - radius * 0.03, radius * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.1, eyeY - radius * 0.03, radius * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    case 'DEAD':
      ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX, eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(eyeX - radius * 0.15, -eyeY - radius * 0.1); ctx.lineTo(eyeX + radius * 0.15, -eyeY + radius * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eyeX - radius * 0.15, eyeY - radius * 0.1); ctx.lineTo(eyeX + radius * 0.15, eyeY + radius * 0.1); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX, eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.05, -eyeY, radius * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX + radius * 0.05, eyeY, radius * 0.1, 0, Math.PI * 2); ctx.fill();
  }
};

/** 绘制眉毛 */
const drawEyebrows = (ctx: CanvasRenderingContext2D, eyebrowType: EyebrowType, eyeX: number, eyeY: number, radius: number) => {
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;

  const yOff = -eyeY - radius * 0.35;

  switch (eyebrowType) {
    case 'ANGRY':
      ctx.beginPath();
      ctx.moveTo(eyeX - radius * 0.2, yOff - radius * 0.1);
      ctx.lineTo(eyeX + radius * 0.2, yOff + radius * 0.1);
      ctx.stroke();
      break;
    case 'THICK':
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(eyeX - radius * 0.25, yOff);
      ctx.lineTo(eyeX + radius * 0.25, yOff);
      ctx.stroke();
      break;
    case 'UNI':
      ctx.beginPath();
      ctx.arc(eyeX + radius * 0.1, yOff, radius * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(eyeX - radius * 0.2, yOff);
      ctx.lineTo(eyeX + radius * 0.15, yOff - radius * 0.05);
      ctx.stroke();
  }
};

/** 绘制配饰 */
const drawAccessory = (ctx: CanvasRenderingContext2D, accessory: AccessoryType, radius: number, visualTime: number) => {
  ctx.save();

  switch (accessory) {
    case 'CROWN':
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.3, -radius * 0.6);
      ctx.lineTo(-radius * 0.2, -radius * 0.9);
      ctx.lineTo(0, -radius * 0.7);
      ctx.lineTo(radius * 0.2, -radius * 0.9);
      ctx.lineTo(radius * 0.3, -radius * 0.6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'BOW_TIE':
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.moveTo(0, radius * 0.1);
      ctx.lineTo(-radius * 0.3, radius * 0.2);
      ctx.lineTo(-radius * 0.15, radius * 0.1);
      ctx.lineTo(0, radius * 0.05);
      ctx.lineTo(radius * 0.15, radius * 0.1);
      ctx.lineTo(radius * 0.3, radius * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'FLOWER':
      const petalCount = 5;
      for (let i = 0; i < petalCount; i++) {
        ctx.save();
        ctx.rotate((i / petalCount) * Math.PI * 2 + visualTime * 0.05);
        ctx.fillStyle = ['#ff69b4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'][i % 5];
        ctx.beginPath();
        ctx.ellipse(radius * 0.5, 0, radius * 0.15, radius * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'SUNGLASSES':
      ctx.fillStyle = '#111';
      const sx = radius * 0.35;
      const sy = radius * 0.45;
      ctx.beginPath();
      ctx.ellipse(sx, -sy, radius * 0.2, radius * 0.15, 0, 0, Math.PI * 2);
      ctx.ellipse(sx, sy, radius * 0.2, radius * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + radius * 0.2, -sy);
      ctx.lineTo(sx + radius * 0.2, sy);
      ctx.stroke();
      break;
    case 'HALO':
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -radius * 0.9, radius * 0.4, radius * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      break;
  }

  ctx.restore();
};

/** 绘制花纹图案 */
const drawPattern = (ctx: CanvasRenderingContext2D, pattern: PatternType, radius: number, visualTime: number) => {
  ctx.save();
  ctx.globalAlpha = 0.4;

  switch (pattern) {
    case 'STRIPES':
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * radius * 0.3, -radius);
        ctx.lineTo(i * radius * 0.3, radius);
        ctx.stroke();
      }
      break;
    case 'SPOTS':
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + visualTime * 0.02;
        const x = Math.cos(angle) * radius * 0.4;
        const y = Math.sin(angle) * radius * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'HEART':
      ctx.fillStyle = 'rgba(255,100,100,0.5)';
      ctx.beginPath();
      const hx = Math.sin(visualTime * 0.1) * radius * 0.1;
      ctx.moveTo(hx, radius * 0.2);
      ctx.bezierCurveTo(hx - radius * 0.2, -radius * 0.1, hx - radius * 0.3, -radius * 0.3, hx, -radius * 0.15);
      ctx.bezierCurveTo(hx + radius * 0.3, -radius * 0.3, hx + radius * 0.2, -radius * 0.1, hx, radius * 0.2);
      ctx.fill();
      break;
    default:
      break;
  }

  ctx.restore();
};

/** 绘制鳞片效果 */
const drawScaleEffect = (ctx: CanvasRenderingContext2D, scaleType: ScaleType, radius: number, visualTime: number, baseColor: string) => {
  ctx.save();

  switch (scaleType) {
    case 'SHINY':
      const gradient = ctx.createLinearGradient(-radius, 0, radius, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.8, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'GLOW':
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 10 + Math.sin(visualTime * 0.1) * 5;
      ctx.strokeStyle = 'rgba(0,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'CRYSTAL':
      ctx.strokeStyle = 'rgba(200,200,255,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7);
        ctx.stroke();
      }
      break;
    default:
      break;
  }

  ctx.restore();
};

// ============== 辅助函数结束 ==============

// 传送门颜色配置（根据传送门名称分配不同颜色）
const getPortalColor = (portal: Portal): string => {
    if (portal.name?.includes('浅滩')) return '#22d3ee'; // 青色 - 浅滩
    if (portal.name?.includes('珊瑚')) return '#f0abfc'; // 粉色 - 珊瑚
    if (portal.name?.includes('沼泽')) return '#86efac'; // 绿色 - 沼泽
    if (portal.name?.includes('深渊')) return '#a855f7'; // 紫色 - 深渊
    return '#d8b4fe'; // 默认紫色
};

const getPortalSecondaryColor = (portal: Portal): string => {
    if (portal.name?.includes('浅滩')) return '#67e8f9';
    if (portal.name?.includes('珊瑚')) return '#fda4af';
    if (portal.name?.includes('沼泽')) return '#4ade80';
    if (portal.name?.includes('深渊')) return '#c084fc';
    return '#22d3ee';
};

// 传送门绘制函数（增强版）
/**
 * 障碍物绘制 —— 重构前 obstacles 只生成不绘制，珊瑚区的「复杂地形」是隐形的。
 * 用 id 做种子生成固定形状，保证每帧形状一致，不会抖动。
 */
const seededNoise = (seed: string, i: number): number => {
    let h = 0;
    for (let k = 0; k < seed.length; k += 1) h = (h * 31 + seed.charCodeAt(k)) | 0;
    return ((Math.abs(h) + i * 2654435761) % 1000) / 1000;
};

const drawObstacle = (ctx: CanvasRenderingContext2D, o: Obstacle) => {
    const palettes = {
        ROCK: { fill: '#475569', stroke: '#334155' },
        CORAL: { fill: '#fb7185', stroke: '#9f1239' },
        SEAWEED: { fill: '#15803d', stroke: '#14532d' },
    };
    const c = palettes[o.type] ?? palettes.ROCK;

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 3;

    if (o.type === 'CORAL') {
        // 珊瑚：三个圆瓣叠加
        for (let i = 0; i < 3; i += 1) {
            const a = (i / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * o.radius * 0.4, Math.sin(a) * o.radius * 0.4, o.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (o.type === 'SEAWEED') {
        // 海草：几条竖立的叶片
        for (let i = 0; i < 4; i += 1) {
            const offset = (i - 1.5) * o.radius * 0.35;
            ctx.beginPath();
            ctx.moveTo(offset, o.radius * 0.6);
            ctx.quadraticCurveTo(offset + o.radius * 0.3, 0, offset, -o.radius * 0.8);
            ctx.lineTo(offset + o.radius * 0.12, -o.radius * 0.8);
            ctx.quadraticCurveTo(offset + o.radius * 0.42, 0, offset + o.radius * 0.12, o.radius * 0.6);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        // 岩石：不规则多边形
        ctx.beginPath();
        const points = 9;
        for (let i = 0; i < points; i += 1) {
            const a = (i / points) * Math.PI * 2;
            const r = o.radius * (0.75 + seededNoise(o.id, i) * 0.35);
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
};

/** 建筑绘制 —— 之前同样只生成不绘制 */
const drawBuilding = (ctx: CanvasRenderingContext2D, b: Building, time: number) => {
    const conf = (BUILDING_CONFIGS as Record<string, { color: string; name: string }>)[b.type];
    if (!conf) return;

    const glyph = b.type === 'HOSPITAL' ? '医' : b.type === 'SHRINE' ? '庙' : b.type === 'SHOP' ? '商' : '军';
    const onCooldown = b.cooldown > 0;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = onCooldown ? 0.45 : 1;

    // 光晕
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * (1 + Math.sin(time * 0.03) * 0.04), 0, Math.PI * 2);
    ctx.fillStyle = conf.color + '33';
    ctx.fill();
    ctx.strokeStyle = conf.color;
    ctx.lineWidth = 4;
    ctx.stroke();

    // 底座
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = conf.color;
    ctx.fill();

    // 标识
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(b.radius * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 0);

    ctx.restore();
};

const drawPortal = (ctx: CanvasRenderingContext2D, portal: Portal, visualTime: number) => {
    ctx.save();
    ctx.translate(portal.x, portal.y);

    const primaryColor = getPortalColor(portal);
    const secondaryColor = getPortalSecondaryColor(portal);

    // 更强的脉冲效果
    const pulsePhase = Math.sin(visualTime * 0.06);
    const pulseScale = 1 + pulsePhase * 0.12;
    const rotationSpeed = visualTime * 0.015;

    // 外层大光晕（增强动态效果）
    const outerGlow = ctx.createRadialGradient(0, 0, portal.radius * 0.3, 0, 0, portal.radius * 2.5);
    const glowAlpha = 0.2 + pulsePhase * 0.1;
    outerGlow.addColorStop(0, `rgba(${hexToRgb(primaryColor)}, ${glowAlpha})`);
    outerGlow.addColorStop(0.4, `rgba(${hexToRgb(secondaryColor)}, ${glowAlpha * 0.6})`);
    outerGlow.addColorStop(0.7, `rgba(${hexToRgb(primaryColor)}, ${glowAlpha * 0.3})`);
    outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(0, 0, portal.radius * 2.5 * pulseScale, 0, Math.PI * 2);
    ctx.fill();

    // 外层旋转光环（双向旋转）
    for (let i = 0; i < 4; i++) {
        ctx.save();
        const direction = i % 2 === 0 ? 1 : -1;
        ctx.rotate(rotationSpeed * direction + (i * Math.PI / 2));

        const haloGradient = ctx.createLinearGradient(-portal.radius * 2, 0, portal.radius * 2, 0);
        haloGradient.addColorStop(0, 'transparent');
        haloGradient.addColorStop(0.5, primaryColor);
        haloGradient.addColorStop(1, 'transparent');

        ctx.strokeStyle = haloGradient;
        ctx.lineWidth = 6 + Math.sin(visualTime * 0.08 + i * 1.5) * 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = primaryColor;

        // 椭圆形光环
        ctx.beginPath();
        ctx.ellipse(0, 0, portal.radius * 1.5 * pulseScale, portal.radius * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 中层能量环（旋转的小粒子）
    ctx.save();
    ctx.rotate(-rotationSpeed * 2);
    const innerRingCount = 6;
    for (let i = 0; i < innerRingCount; i++) {
        const angle = (i / innerRingCount) * Math.PI * 2 + visualTime * 0.02;
        const dist = portal.radius * 0.7;
        const particleX = Math.cos(angle) * dist;
        const particleY = Math.sin(angle) * dist;

        // 动态大小的粒子
        const particleSize = 8 + Math.sin(visualTime * 0.1 + i) * 3;
        const particleGradient = ctx.createRadialGradient(particleX, particleY, 0, particleX, particleY, particleSize);
        particleGradient.addColorStop(0, '#fff');
        particleGradient.addColorStop(0.4, primaryColor);
        particleGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = particleGradient;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize * pulseScale, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 泡泡粒子效果
    const bubbleCount = 8;
    for (let i = 0; i < bubbleCount; i++) {
        const bubbleAngle = (i / bubbleCount) * Math.PI * 2 + visualTime * 0.03;
        const bubbleDist = portal.radius * (1.2 + Math.sin(visualTime * 0.05 + i) * 0.3);
        const bubbleX = Math.cos(bubbleAngle) * bubbleDist;
        const bubbleY = Math.sin(bubbleAngle) * bubbleDist;
        const bubbleSize = 3 + Math.sin(visualTime * 0.08 + i * 2) * 2;

        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, bubbleSize, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${hexToRgb(primaryColor)}, ${0.4 + Math.sin(visualTime * 0.1 + i) * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // 核心光球（带脉冲动画）
    const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, portal.radius * 0.9);
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    coreGradient.addColorStop(0.2, `rgba(${hexToRgb(primaryColor)}, 0.7)`);
    coreGradient.addColorStop(0.5, `rgba(${hexToRgb(secondaryColor)}, 0.4)`);
    coreGradient.addColorStop(0.8, `rgba(${hexToRgb(primaryColor)}, 0.2)`);
    coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGradient;
    ctx.shadowBlur = 40;
    ctx.shadowColor = primaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, portal.radius * 0.9 * pulseScale, 0, Math.PI * 2);
    ctx.fill();

    // 中心星芒效果
    const starSize = portal.radius * 0.15 * (1 + pulsePhase * 0.3);
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
        const starAngle = (i / 4) * Math.PI * 2 + visualTime * 0.01;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(starAngle - 0.2) * starSize, Math.sin(starAngle - 0.2) * starSize);
        ctx.lineTo(Math.cos(starAngle) * starSize * 2, Math.sin(starAngle) * starSize * 2);
        ctx.lineTo(Math.cos(starAngle + 0.2) * starSize, Math.sin(starAngle + 0.2) * starSize);
    }
    ctx.closePath();
    ctx.fill();

    // 传送门名称（带发光背景）
    ctx.shadowBlur = 8;
    ctx.shadowColor = primaryColor;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(portal.name || '传送门', 0, portal.radius + 30);

    ctx.restore();
};

// 辅助函数：将HEX颜色转换为rgb字符串
const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : '255, 255, 255';
};

// 偷袭提示绘制函数
const drawAmbushIndicator = (ctx: CanvasRenderingContext2D, entity: Entity, playerX: number, playerY: number, playerLevel: number, visualTime: number) => {
    if (entity.level <= playerLevel) return; // Only show on fish larger than player
    
    const distance = Math.hypot(entity.x - playerX, entity.y - playerY);
    if (distance > AMBUSH_CONFIG.INDICATOR_RANGE) return; // Only show within indicator range
    
    ctx.save();
    ctx.translate(entity.x, entity.y);
    
    // Calculate the back angle (opposite to the fish's facing direction)
    const backAngle = entity.angle + Math.PI;
    
    // Position the indicator behind the fish
    const indicatorDistance = entity.radius * 1.2;
    const indicatorX = Math.cos(backAngle) * indicatorDistance;
    const indicatorY = Math.sin(backAngle) * indicatorDistance;
    
    // Pulsing animation
    const pulse = 0.6 + Math.sin(visualTime * 0.15) * 0.3;
    const size = 15 * pulse;
    
    // Draw indicator - exclamation mark style
    ctx.globalAlpha = 0.7 + Math.sin(visualTime * 0.1) * 0.3;
    
    // Outer glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ef4444';
    
    // Red exclamation circle
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, size, 0, Math.PI * 2);
    ctx.fill();
    
    // White exclamation mark
    ctx.fillStyle = 'white';
    ctx.shadowBlur = 0;
    
    // Exclamation mark top
    const exTopH = size * 0.5;
    ctx.fillRect(
      indicatorX - size * 0.15, 
      indicatorY - size * 0.7, 
      size * 0.3, 
      exTopH
    );
    
    // Exclamation mark dot
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY + size * 0.3, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw attack angle arc (showing the vulnerable back area)
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius * 1.5, backAngle - AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD, backAngle + AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD);
    ctx.lineTo(0, 0);
    ctx.fill();
    
    ctx.restore();
};

// 传送门绘制函数

// 视口裁剪辅助函数
const isOnScreen = (entity: Entity, camera: { x: number; y: number; zoom: number }, canvasWidth: number, canvasHeight: number): boolean => {
  const screenX = (entity.x - camera.x) * camera.zoom + canvasWidth / 2;
  const screenY = (entity.y - camera.y) * camera.zoom + canvasHeight / 2;
  const visibleRadius = Math.max(entity.radius, 50) * camera.zoom + 100; // 增加缓冲
  return (
    screenX + visibleRadius > 0 &&
    screenX - visibleRadius < canvasWidth &&
    screenY + visibleRadius > 0 &&
    screenY - visibleRadius < canvasHeight
  );
};

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();
    let animationFrameId: number;

    const render = () => {
        const { player, entities, particles, camera, status } = gameState;
        const visualTime = performance.now() / 16; 
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        // 深蓝色海洋背景：从深处的墨蓝过渡到中层海水的湛蓝
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#071c3d'); // 深海墨蓝
        gradient.addColorStop(0.55, '#0c2f63'); // 中层深蓝
        gradient.addColorStop(1, '#155da5'); // 靠近「海面」的湛蓝
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);

        // 绘制边界缓冲区域（柔和的渐变边缘）
        if (status !== GameStatus.BATTLE_TEST) {
            const boundaryPulse = Math.sin(visualTime * 0.05) * 0.1 + 0.9;
            for (let layer = 5; layer >= 1; layer--) {
                const layerAlpha = (0.05 + Math.sin(visualTime * 0.03 + layer) * 0.02) * boundaryPulse;
                const layerRadius = MAP_SHAPE_CONFIG.BASE_RADIUS + MAP_SHAPE_CONFIG.PETAL_VARIANCE * 0.5 + layer * 60;
                ctx.beginPath();
                ctx.strokeStyle = `rgba(59, 130, 246, ${layerAlpha})`;
                ctx.lineWidth = 40 - layer * 6;
                ctx.setLineDash([]);
                // 绘制花瓣形边界
                for (let a = 0; a <= Math.PI * 2; a += 0.05) {
                    const r = getMapBoundaryRadius(a) + layer * 60;
                    const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(a) * r;
                    const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(a) * r;
                    if (a === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }

        // 竞技场光圈 (仅战斗模式)
        // Correct fix: Import GameStatus from types to fix the reference error.
        if (status === GameStatus.BATTLE_TEST) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineWidth = 10; ctx.setLineDash([20, 20]);
            ctx.arc(MAP_SHAPE_CONFIG.CENTER_X, MAP_SHAPE_CONFIG.CENTER_Y, 800, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        }

        // 绘制地形：障碍物与建筑（画在鱼之前，避免遮挡生物）
        // 只画视野附近，80 个障碍物全画没有意义
        gameState.obstacles.forEach(o => {
            if (Math.abs(o.x - player.x) > 1800 || Math.abs(o.y - player.y) > 1400) return;
            drawObstacle(ctx, o);
        });
        gameState.buildings.forEach(b => drawBuilding(ctx, b, gameState.time));

        // 绘制喷泉
        gameState.fountains.forEach(f => {
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.3)'; // Light blue water
            ctx.beginPath();
            ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Fountain core
            ctx.fillStyle = '#0ea5e9';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.fill();

            // Water spout effect
            const spoutHeight = 40 + Math.sin(gameState.time * 0.2) * 10;
            ctx.fillStyle = 'rgba(224, 242, 254, 0.6)';
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(-5, -spoutHeight);
            ctx.lineTo(5, -spoutHeight);
            ctx.lineTo(10, 0);
            ctx.fill();
            ctx.restore();
        });

        // ==================== 绘制宝藏（增强版） ====================
        gameState.treasures.forEach(treasure => {
            ctx.save();
            ctx.translate(treasure.x, treasure.y);

            // 计算玩家距离，用于缩放效果
            const playerDist = Math.hypot(treasure.x - player.x, treasure.y - player.y);
            const proximityScale = Math.max(0.8, 1 - playerDist / 5000);

            if (treasure.status === 'WARNING') {
                // 预告状态：闪烁效果（增强版）
                const pulseScale = 1 + Math.sin(visualTime * 0.2) * 0.3;
                const blinkAlpha = 0.3 + Math.sin(visualTime * 0.15) * 0.2;

                // 外层光芒（动态扩散）
                const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, treasure.radius * 3 * pulseScale);
                outerGlow.addColorStop(0, `rgba(252, 211, 77, ${blinkAlpha})`);
                outerGlow.addColorStop(0.5, `rgba(251, 191, 36, ${blinkAlpha * 0.5})`);
                outerGlow.addColorStop(1, 'rgba(252, 211, 77, 0)');
                ctx.beginPath();
                ctx.arc(0, 0, treasure.radius * 3 * pulseScale, 0, Math.PI * 2);
                ctx.fillStyle = outerGlow;
                ctx.fill();

                // 核心（带脉冲动画）
                ctx.beginPath();
                ctx.arc(0, 0, treasure.radius * pulseScale, 0, Math.PI * 2);
                ctx.fillStyle = '#fcd34d';
                ctx.shadowBlur = 30;
                ctx.shadowColor = '#fcd34d';
                ctx.fill();

                // 问号提示（带旋转）
                ctx.save();
                ctx.rotate(Math.sin(visualTime * 0.05) * 0.1);
                ctx.fillStyle = '#78350f';
                ctx.font = 'bold 28px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', 0, 0);
                ctx.restore();

                // 预告文字（带呼吸效果）
                ctx.fillStyle = '#fef3c7';
                ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
                ctx.globalAlpha = 0.6 + Math.sin(visualTime * 0.1) * 0.4;
                ctx.fillText('即将出现', 0, treasure.radius + 20);
                ctx.globalAlpha = 1;
            } else {
                // 激活状态：根据类型绘制不同宝藏（增强版）
                const baseRotation = visualTime * 0.03;

                // 根据类型配置不同的颜色和图标
                const treasureConfig = {
                    FEAST: { color: '#f97316', glow: '#ea580c', icon: '🍖', name: '盛宴' },
                    CHEST: { color: '#eab308', glow: '#ca8a04', icon: '💰', name: '宝箱' },
                    GEM: { color: '#a855f7', glow: '#9333ea', icon: '💎', name: '宝石' },
                    FOOD: { color: '#22c55e', glow: '#16a34a', icon: '⭐', name: '美食' }
                };
                const config = treasureConfig[treasure.type as keyof typeof treasureConfig] || treasureConfig.FEAST;

                // 绘制外层旋转光环
                ctx.save();
                ctx.rotate(baseRotation);
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.arc(0, 0, treasure.radius * (1.2 + i * 0.15), 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(${hexToRgb(config.color)}, ${0.3 - i * 0.05})`;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([10, 15]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.restore();

                // 光晕（带脉冲）
                const pulseGlow = 1 + Math.sin(visualTime * 0.1) * 0.2;
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, treasure.radius * 2 * pulseGlow);
                gradient.addColorStop(0, config.color);
                gradient.addColorStop(0.4, config.color + 'aa');
                gradient.addColorStop(0.7, config.color + '44');
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, treasure.radius * 2 * pulseGlow, 0, Math.PI * 2);
                ctx.fill();

                // 核心（带旋转效果）
                ctx.save();
                ctx.rotate(baseRotation * 2);
                ctx.beginPath();
                ctx.arc(0, 0, treasure.radius * proximityScale, 0, Math.PI * 2);
                ctx.fillStyle = config.color;
                ctx.shadowBlur = 25;
                ctx.shadowColor = config.glow;
                ctx.fill();

                // 内部装饰
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, treasure.radius * 0.6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // 宝藏图标（浮动效果）
                ctx.save();
                ctx.translate(0, Math.sin(visualTime * 0.08) * 3);
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(config.icon, 0, 2);
                ctx.restore();

                // 宝藏名称标签
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(config.name, 0, treasure.radius + 18);
            }
            ctx.restore();
        });
        // ==================== 宝藏绘制结束 ====================

        // 绘制漂流瓶等道具
        gameState.powerUps.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            if (p.type === 'BOTTLE') {
                ctx.rotate(Math.sin(gameState.time * 0.05) * 0.2); // Bobbing effect
                // Bottle body
                ctx.fillStyle = 'rgba(167, 243, 208, 0.6)'; // Glass color
                ctx.beginPath();
                ctx.roundRect(-10, -15, 20, 30, 5);
                ctx.fill();
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2;
                ctx.stroke();
                // Cork
                ctx.fillStyle = '#d97706';
                ctx.fillRect(-5, -20, 10, 5);
                // Paper inside
                ctx.fillStyle = '#fef3c7';
                ctx.fillRect(-6, -10, 12, 20);
            } else if (p.type === 'SHELL') {
                // Draw Shell
                ctx.fillStyle = '#fbcfe8'; // Pinkish shell
                ctx.beginPath();
                ctx.arc(0, 0, p.radius, 0, Math.PI, true);
                ctx.lineTo(p.radius, p.radius * 0.5);
                ctx.lineTo(-p.radius, p.radius * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#db2777';
                ctx.lineWidth = 2;
                ctx.stroke();
                // Shell lines
                ctx.beginPath();
                ctx.moveTo(0, 0); ctx.lineTo(-p.radius*0.5, -p.radius*0.8);
                ctx.moveTo(0, 0); ctx.lineTo(0, -p.radius);
                ctx.moveTo(0, 0); ctx.lineTo(p.radius*0.5, -p.radius*0.8);
                ctx.stroke();
            } else {
                ctx.fillStyle = p.type === 'SPEED' ? '#3b82f6' : '#8b5cf6';
                ctx.beginPath();
                ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });

        particles.forEach(p => {
            ctx.globalAlpha = p.life;
            if (p.shape === 'COOKIE') {
                drawCookie(ctx, p.x, p.y, p.size, p.spin ?? 0);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
        });
        ctx.globalAlpha = 1;

        // 环境装饰：缓慢上浮的金色小饼干碎屑，让海水里有「食物颗粒」的氛围
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < 16; i += 1) {
            const drift = (visualTime * (0.2 + (i % 4) * 0.06)) % 5800;
            const bx = ((i * 733) % 5800) + 100;
            const by = ((i * 547 + drift) % 5800) + 100;
            if (Math.abs(bx - player.x) > 1600 || Math.abs(by - player.y) > 1200) continue;
            drawCookie(ctx, bx, by, 3.5 + (i % 3), i + visualTime * 0.01);
        }
        ctx.globalAlpha = 1;

        // 绘制标签（如"逆转！"气泡）
        gameState.labels.forEach(label => {
            ctx.save();
            ctx.translate(label.x, label.y);
            
            // 浮动动画
            const floatOffset = Math.sin(visualTime * 0.1) * 5;
            ctx.translate(0, floatOffset);
            
            // 文字阴影
            ctx.shadowBlur = 10;
            ctx.shadowColor = label.color;
            
            // 绘制背景气泡
            ctx.font = 'bold 28px sans-serif';
            const metrics = ctx.measureText(label.text);
            const padding = 10;
            const bubbleWidth = metrics.width + padding * 2;
            const bubbleHeight = 40;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.roundRect(-bubbleWidth / 2, -bubbleHeight / 2 + floatOffset, bubbleWidth, bubbleHeight, 10);
            ctx.fill();
            
            // 绘制边框
            ctx.strokeStyle = label.color;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // 绘制文字
            ctx.fillStyle = label.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.text, 0, floatOffset);
            
            ctx.restore();
        });

        // 视口裁剪：只渲染可见的实体
        const visibleEntities = entities.filter(e => isOnScreen(e, camera, canvas.width, canvas.height));

        visibleEntities.forEach(e => drawCuteFish(ctx, e, visualTime, false));

        // 绘制偷袭提示（在大鱼背后显示偷袭机会）
        visibleEntities.forEach(e => drawAmbushIndicator(ctx, e, player.x, player.y, player.level, visualTime));

        // 诱惑技能生效中：玩家画成一块大肉（武器机甲已随武器系统移除）
        if (player.lureActive) {
            ctx.save();
            ctx.translate(player.x, player.y);
            ctx.fillStyle = '#ef4444'; // Red meat
            ctx.beginPath();
            ctx.ellipse(0, 0, player.radius * 1.5, player.radius, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fca5a5'; // Fat marbling
            ctx.beginPath(); ctx.ellipse(-player.radius*0.5, 0, player.radius*0.8, player.radius*0.2, Math.PI/4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(player.radius*0.3, player.radius*0.2, player.radius*0.6, player.radius*0.15, -Math.PI/6, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        } else {
            drawCuteFish(ctx, player, visualTime, true);
        }

        // 绘制传送门（最上层）
        gameState.portals.forEach(portal => drawPortal(ctx, portal, visualTime));

        animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
  }, [gameState]);

  return <canvas ref={canvasRef} onMouseMove={(e) => onMouseMove(e.clientX, e.clientY)} onMouseDown={onMouseDown} onMouseUp={onMouseUp} />;
};

export default GameCanvas;
