
import React, { useRef, useEffect } from 'react';
// Added GameStatus to imports to fix line 134 reference error
import { GameState, GameStatus, Entity, Particle, CreatureType, PlayerState, PowerUp, Hazard, Building, BuildingType, Portal, Cosmetics, BodyType, TailType, TrailType, EyeType, EyebrowType, AccessoryType, PatternType, ScaleType } from '../types';
import { WORLD_SIZE, GAME_MECHANICS, BOOST_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, PORTAL_CONFIG, TREASURE_CONFIG, FEEDING_EVENT_CONFIG, AMBUSH_CONFIG, COMBAT_CONFIG, getPond, getMood } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { defineShapePath, drawShapeBack, drawShapeFront, drawSurfaceMouth } from './fishShapes';
import type { CreatureShapeId } from '../data/creatureShapes';
import { CanvasGameRenderer } from '../rendering/canvas/CanvasGameRenderer';
import { createViewport } from '../rendering/types';
import type { WaterCurrentZone } from '../data/habitats';
import { getCachedPatternMarks, resolveMorphology, resolveMorphologyMotion, type ResolvedMorphology } from '../morphology';
import { drawMorphologyBodyDetails, drawMorphologyFrontParts, drawMorphologyPatterns, drawMorphologyRearParts, traceMorphologyBody } from '../rendering/canvas/MorphologyCanvasRenderer';
import { drawObstacleCanvas } from '../rendering/canvas/ObstacleCanvasRenderer';
import { OBSTACLE_ECOLOGY } from '../data/obstacleEcology';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: (event: { button: number }) => void;
  onMouseUp: (event: { button: number }) => void;
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

export interface FishRenderOptions {
    showPattern?: boolean;
    volumeOnly?: boolean;
    lod?: 0 | 1 | 2;
}

export const drawCuteFish = (
    ctx: CanvasRenderingContext2D,
    entity: Entity,
    visualTime: number,
    isPlayer: boolean,
    renderOptions: FishRenderOptions = {}
) => {
    const { type, radius, animOffset, renderScale, happyTimer, fearTimer, isHidden, camoActive, inCover, speedBoostTimer, cosmetics, semiGhostTimer } = entity;

    if (!Number.isFinite(radius) || radius <= 0) return;

    // 形状分发：FISH（缺省）= 传统鱼形，走全部历史管线；其他形状由 fishShapes 模板接管
    // 身体轮廓与附属，嘴画成表面五官、不画内壁/装扮牙/装扮尾。手工构造的 config 没有
    // shape 字段 = FISH，旧调用点零变化。
    const shape = (entity.config?.shape ?? 'FISH') as CreatureShapeId;
    const isFish = shape === 'FISH';
    const morphology: ResolvedMorphology | undefined = isFish && type !== CreatureType.PLANKTON
        ? resolveMorphology(entity)
        : undefined;
    const morphologyMotion = morphology ? resolveMorphologyMotion(entity, morphology) : undefined;

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

    // 隐蔽：藏在水草里 / 开着隐身技能。
    // 以前 camoActive / isHidden 在这里被解构出来却从没被用过 —— 隐身既没逻辑效果也没视觉，
    // 玩家完全无从判断自己藏没藏好。这里补上「看得见的隐蔽」。
    const concealed = Boolean(camoActive || inCover);

    // 玩家光环：先画，免得被下面隐蔽的全局透明度削弱。
    // 隐蔽时换成绿色虚线「藏身环」，平时是青色实线环。
    if (isPlayer && !isSemiGhost) {
        const pulse = 0.3 + Math.sin(visualTime * 0.1) * 0.2;
        ctx.beginPath();
        if (concealed) {
            ctx.strokeStyle = `rgba(74, 222, 128, ${Math.min(1, pulse + 0.4)})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.arc(0, 0, radius * 1.75, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
            ctx.lineWidth = 3;
            ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // 隐蔽中的本体压暗成半透明：一眼看出「我现在是藏着的」
    if (concealed && !isSemiGhost) {
        ctx.globalAlpha = isPlayer ? 0.5 : 0.42;
    }

    // 体型：压扁 / 拉长整个鱼身。
    // ⚠️ 必须放在玩家光环之后 —— 光环是正圆，跟着被压扁一眼就露馅。
    // getBodyTypeParams 以前是死代码（bodyType 在面板/AI 预设里能选，但完全没效果），
    // 有了预览之后这种「选了没反应」的项会立刻被看出来，所以接上。
    const bodyShape = morphology ? { scaleX: 1, scaleY: 1 } : getBodyTypeParams(cosmetics?.bodyType ?? 'DEFAULT');
    ctx.scale(bodyShape.scaleX, bodyShape.scaleY);

    ctx.rotate(entity.angle);
    if (morphology) {
        const breath = 1 + Math.sin(visualTime * 0.035 + animOffset) * morphologyMotion!.breathAmplitude;
        ctx.scale(morphologyMotion!.bodyStretch, breath);
    }

    // 核心绘制逻辑
    const biteSpeed = isPlayer && (entity as any).boost?.active ? 0.4 : 0.15;
    // 使用平滑的正弦波：范围 0.05 到 0.6，避免使用 Math.abs 造成的尖点
    const mouthPhase = (visualTime * biteSpeed + animOffset) % (Math.PI * 2);
    const mouthGap = (Math.sin(mouthPhase) + 1) / 2 * 0.55 + 0.05;
    const mType = cosmetics?.mouthType || 'TRIANGLE';
    // 嘴型专属开口角：FLAT 永远是细缝（平嘴不张合，这正是它的性格）、
    // CURVE/BEAK 缩小开口（微笑嘴几乎闭着、喙只留一点缝）。
    // TRIANGLE/SQUARE 原样用 mouthGap —— 旧行为零变化。
    const mouthOpen = mType === 'FLAT' ? 0.06
      : mType === 'CURVE' ? mouthGap * 0.4
      : mType === 'BEAK' ? mouthGap * 0.5 + 0.05
      : mouthGap;
    const isStarryClown = type === CreatureType.CLOWN_FISH && cosmetics?.rareVariant === 'STARRY_CLOWN';
    const volumeOnly = renderOptions.volumeOnly === true;
    const showPattern = renderOptions.showPattern !== false && !volumeOnly;
    const morphologyLod = renderOptions.lod ?? 0;
    const bodyFill = morphology?.material.primaryColor
      ?? (cosmetics?.skinColor === 'DEFAULT' ? entity.config.color : cosmetics?.skinColor || entity.config.color);

    const defineBodyPath = () => {
        ctx.beginPath();
        if (type === CreatureType.PLANKTON) {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
        }
        else if (!isFish) {
            // 非鱼形：轮廓由形状模板给出（完整闭合 path，无嘴部缺口）
            defineShapePath(ctx, shape, radius);
        }
        else if (morphology) {
            traceMorphologyBody(ctx, morphology, radius);
        }
        else {
            if (mType === 'CIRCLE') {
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.moveTo(radius * 0.9, 0); ctx.arc(radius * 0.8, 0, radius * 0.3 * mouthGap, 0, Math.PI * 2, true);
            } else if (mType === 'SQUARE') {
                const h = radius * mouthGap;
                ctx.moveTo(radius, h); ctx.lineTo(radius * 0.5, h); ctx.lineTo(radius * 0.5, -h); ctx.lineTo(radius, -h);
                ctx.arc(0, 0, radius, -mouthGap, mouthGap, true);
            } else if (mType === 'FLAT' || mType === 'CURVE' || mType === 'BEAK') {
                // 平嘴 / 微笑 / 鸟喙：同为「差口圆」轮廓，只是开口角不同 ——
                // 喙片和微笑唇线在身体画完后另画（见「绘制尾巴」前的 BEAK / CURVE 块）
                ctx.moveTo(0, 0); ctx.arc(0, 0, radius, mouthOpen, -mouthOpen);
            } else { // TRIANGLE
                ctx.moveTo(0, 0); ctx.arc(0, 0, radius, mouthGap, -mouthGap);
            }
        }
        ctx.closePath();
    };

    // 尾迹特效：画在鱼身下层（装扮面板选了尾迹从此真正生效）
    if (!volumeOnly) drawTrail(ctx, cosmetics?.trailType, radius, visualTime, animOffset);

    // 形状背景附属（触须/腿/尾鳍/背鳍…）：画在身体 fill 之前，根部被身体盖住只露外段
    if (!isFish && type !== CreatureType.PLANKTON) {
        drawShapeBack(ctx, shape, radius, visualTime, animOffset, bodyFill);
    } else if (morphology) {
        drawMorphologyRearParts(ctx, morphology, radius, visualTime, bodyFill, morphologyMotion);
    }

    // 绘制口腔内壁（只有轮廓缺口嘴的鱼形才有「口腔」）
    if (isFish && type !== CreatureType.PLANKTON) {
        ctx.save(); ctx.fillStyle = '#400505'; ctx.beginPath();
        if (mType === 'CIRCLE') ctx.arc(radius * 0.8, 0, radius * 0.28 * mouthGap, 0, Math.PI * 2);
        else if (mType !== 'FLAT') { ctx.moveTo(0, 0); ctx.arc(0, 0, radius * 0.95, -mouthOpen, mouthOpen); }
        ctx.fill(); ctx.restore();
    }

    if (isStarryClown && !volumeOnly) {
        const pulse = 1 + Math.sin(visualTime * 0.04 + animOffset) * 0.06;
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = '#7debf2';
        ctx.lineWidth = Math.max(1.5, radius * 0.045);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.18 * pulse, radius * 0.88 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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

    if (morphology && showPattern && morphology.patternLayers.length) {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawMorphologyPatterns(ctx, morphology, radius, morphologyLod);
        ctx.restore();
    }

    if (morphology) {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawMorphologyBodyDetails(ctx, morphology, radius, entity.angle, morphologyLod);
        ctx.restore();
        if (!volumeOnly) {
            drawMorphologyFrontParts(ctx, morphology, radius, bodyFill, morphologyMotion);
            if (showPattern) drawMorphologyPatterns(ctx, morphology, radius, morphologyLod, 'EXTERIOR');
        }
        if (!volumeOnly) {
            const mouth = morphology.geometry.anchors.mouth;
            ctx.save();
            ctx.strokeStyle = 'rgba(15,23,42,0.72)';
            ctx.lineWidth = Math.max(1.5, radius * 0.065);
            ctx.beginPath();
            if (mType === 'CIRCLE') {
                ctx.arc((mouth.x - 0.08) * radius, 0, radius * (0.06 + mouthOpen * 0.08), 0, Math.PI * 2);
            } else if (mType === 'SQUARE') {
                const size = radius * (0.1 + mouthOpen * 0.12);
                ctx.rect((mouth.x - 0.2) * radius, -size, size * 1.25, size * 2);
            } else if (mType === 'FLAT') {
                ctx.moveTo((mouth.x - 0.28) * radius, 0); ctx.lineTo(mouth.x * radius, 0);
            } else if (mType === 'CURVE') {
                ctx.moveTo((mouth.x - 0.3) * radius, -radius * 0.03);
                ctx.quadraticCurveTo((mouth.x - 0.06) * radius, radius * 0.24, (mouth.x - 0.34) * radius, radius * 0.3);
            } else if (mType === 'BEAK') {
                ctx.moveTo((mouth.x - 0.25) * radius, -radius * 0.13);
                ctx.lineTo((mouth.x + 0.18) * radius, 0); ctx.lineTo((mouth.x - 0.25) * radius, radius * 0.13);
            } else {
                ctx.moveTo((mouth.x - 0.24) * radius, -radius * mouthOpen * 0.28);
                ctx.quadraticCurveTo(mouth.x * radius, 0, (mouth.x - 0.24) * radius, radius * mouthOpen * 0.28);
            }
            ctx.stroke(); ctx.restore();
        }
    }

    // 绘制花纹/图案
    const resolvedPattern = morphology?.material.patternId ?? cosmetics?.pattern ?? 'NONE';
    if (showPattern && morphology?.patternLayers.length) {
        // 共享花纹已在体积层之前绘制，使明暗自然覆盖在身体材质上。
    } else if (showPattern && isStarryClown) {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawStarryClownPattern(ctx, radius, morphology);
        ctx.restore();
    } else if (showPattern && resolvedPattern === 'CLOWN_BANDS') {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawClownBands(ctx, radius, morphology?.material.secondaryColor ?? '#fff7ed');
        ctx.restore();
    } else if (showPattern && morphology && (resolvedPattern === 'SPOTS' || resolvedPattern === 'DOTS')) {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawMorphologyMarks(ctx, radius, morphology, resolvedPattern);
        ctx.restore();
    } else if (showPattern && resolvedPattern !== 'NONE') {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawPattern(ctx, resolvedPattern as PatternType, radius, visualTime);
        ctx.restore();
    }

    // 绘制鳞片效果
    const resolvedScale = morphology?.material.scaleId ?? cosmetics?.scaleType ?? 'NONE';
    if (!volumeOnly && resolvedScale !== 'NONE') {
        ctx.save(); defineBodyPath(); ctx.clip();
        drawScaleEffect(ctx, resolvedScale as ScaleType, radius, visualTime, bodyFill);
        ctx.restore();
    }

    // 绘制牙齿（轮廓缺口嘴是鱼形专属；非鱼形的表面嘴塞不下牙）
    if (!volumeOnly && isFish && type !== CreatureType.PLANKTON && cosmetics?.teeth && cosmetics.teeth !== 'NORMAL') {
        const tType = cosmetics.teeth;
        ctx.save();
        // 颜色基色。RAINBOW 不在这里定，它逐颗按色相算
        const toothColor = tType === 'GOLD' ? '#fbbf24' : (tType === 'DIAMOND' ? '#e0f2fe' : 'white');
        const toothSize = radius * 0.15;

        const drawOneTooth = (x: number, color: string) => {
            ctx.fillStyle = color;
            if (tType === 'SHARP') {
                ctx.beginPath(); ctx.moveTo(x, -toothSize/2); ctx.lineTo(x + toothSize, 0); ctx.lineTo(x, toothSize/2); ctx.fill();
            } else if (tType === 'VAMPIRE') {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + toothSize * 1.5, -toothSize/2); ctx.lineTo(x + toothSize, 0); ctx.lineTo(x + toothSize * 1.5, toothSize/2); ctx.fill();
            } else if (tType === 'SABER') {
                ctx.beginPath(); ctx.moveTo(x, -toothSize/3); ctx.lineTo(x + toothSize * 1.2, 0); ctx.lineTo(x, toothSize/3); ctx.fill();
            } else if (tType === 'DOUBLE_ROW') {
                // 尖锥：比方块更像牙，双排才看得出层次
                ctx.beginPath();
                ctx.moveTo(x, -toothSize/2); ctx.lineTo(x + toothSize * 0.9, 0); ctx.lineTo(x, toothSize/2);
                ctx.closePath(); ctx.fill();
            } else {
                ctx.fillRect(x, -toothSize/2, toothSize, toothSize);
            }
        };

        const drawTooth = (ang: number, isUpper: boolean, index: number) => {
            ctx.save();
            ctx.rotate(ang);
            const tx = radius * 0.88;
            const color = tType === 'RAINBOW'
                ? `hsl(${(visualTime * 3 + index * 46 + (isUpper ? 0 : 20)) % 360}, 92%, 64%)`
                : toothColor;
            drawOneTooth(tx, color);
            if (tType === 'DOUBLE_ROW') {
                // 第二排：往嘴里面缩一排，错开半格 —— 「双排」得真的看得到两排
                drawOneTooth(tx - toothSize * 1.15, isUpper ? '#fef9c3' : '#fde68a');
            }
            ctx.restore();
        };

        if (mType === 'CIRCLE') {
            for(let i=0; i<8; i++) {
                ctx.save(); ctx.translate(radius*0.8, 0); ctx.rotate((i/8)*Math.PI*2);
                ctx.fillStyle = tType === 'RAINBOW' ? `hsl(${(visualTime * 3 + i * 45) % 360}, 92%, 64%)` : toothColor;
                ctx.fillRect(radius*0.22*mouthGap, -2, 6, 4); ctx.restore();
            }
        } else if (mType === 'TRIANGLE' || mType === 'SQUARE') {
            // 只有三角/方嘴露牙：平嘴是闭着的细缝、微笑嘴和鸟喙里塞牙既穿帮又看不清
            const count = 4; const step = 0.15;
            for(let i=0; i<count; i++) {
                drawTooth(-mouthOpen + step * i + 0.05, true, i);
                drawTooth(mouthOpen - step * i - 0.05, false, i);
            }
        }
        ctx.restore();
    }

    // 表面嘴（非鱼形）：小图形贴在头部前缘，响应嘴型装扮与呼吸张合
    if (!volumeOnly && !isFish && type !== CreatureType.PLANKTON) {
        drawSurfaceMouth(ctx, mType, radius, mouthOpen);
    }

    // 鸟喙（BEAK）：两片橙色喙盖在嘴缺口上，张合度跟着 mouthOpen，盖在身体之后才不会被鱼身盖掉
    if (!volumeOnly && mType === 'BEAK' && type !== CreatureType.PLANKTON) {
        const open = radius * (0.08 + mouthOpen * 0.35);
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        // 上喙：长而弯钩
        ctx.beginPath();
        ctx.moveTo(radius * 0.55, -open - radius * 0.16);
        ctx.quadraticCurveTo(radius * 1.32, -open * 0.5, radius * 1.2, open * 0.15);
        ctx.lineTo(radius * 0.55, -open + radius * 0.09);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // 下喙：短而直
        ctx.beginPath();
        ctx.moveTo(radius * 0.55, open + radius * 0.09);
        ctx.quadraticCurveTo(radius * 1.1, open * 0.5, radius * 1.0, open * 0.1);
        ctx.lineTo(radius * 0.55, open - radius * 0.05);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    // 微笑唇线（CURVE）：细口之上另画一条向前凸的弯弧 —— 一条「笑得眯起来」的嘴
    if (!volumeOnly && mType === 'CURVE' && type !== CreatureType.PLANKTON) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = Math.max(1.5, radius * 0.08);
        ctx.beginPath();
        ctx.moveTo(radius * 0.58, -radius * 0.04);
        ctx.quadraticCurveTo(radius * 0.98, radius * 0.28, radius * 0.52, radius * 0.36);
        ctx.stroke();
        ctx.restore();
    }

    // 绘制尾巴（装扮尾巴是鱼形专属；水母/章鱼等的尾/触须由形状模板自带）
    if (!volumeOnly && isFish && cosmetics?.tailType && cosmetics.tailType !== 'DEFAULT') {
        drawTail(ctx, cosmetics.tailType, radius, visualTime);
    }

    // 绘制眼睛
    const eyeX = radius * (morphology?.geometry.anchors.eyeLeft.x ?? 0.35);
    const eyeY = radius * Math.abs(morphology?.geometry.anchors.eyeLeft.y ?? 0.45);
    const eyeRadius = radius * (morphology?.geometry.anchors.eyeLeft.scale ?? 0.2);
    if (volumeOnly) {
        // 实验室体积视图只保留身体、尾部和共享明暗层。
    } else if (cosmetics?.eyeType && cosmetics.eyeType !== 'NORMAL') {
        drawEyes(ctx, cosmetics.eyeType, eyeX, eyeY, eyeRadius / 0.2, visualTime);
    } else {
        const eyeRows = [{ y: -eyeY, scale: 1, alpha: 1 }, { y: eyeY, scale: 1, alpha: 1 }];
        for (const eye of eyeRows) {
            const size = eyeRadius * eye.scale;
            ctx.save(); ctx.globalAlpha = eye.alpha;
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX, eye.y, size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(eyeX+size*0.26, eye.y, size*0.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(eyeX+size*0.43, eye.y-size*0.18, size*0.13, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }

    // 绘制眉毛
    if (!volumeOnly && cosmetics?.eyebrowType && cosmetics.eyebrowType !== 'NONE') {
        drawEyebrows(ctx, cosmetics.eyebrowType, eyeX, eyeY, radius);
    }

    // 形状前景附属（灯笼/独角/长剑/钳/壳纹…）：盖在身体上，仍位于配饰之下
    if (!volumeOnly && !isFish && type !== CreatureType.PLANKTON) {
        drawShapeFront(ctx, shape, radius, visualTime, animOffset, bodyFill, { lureActive: entity.lureActive });
    }

    // 绘制配饰
    if (!volumeOnly && cosmetics?.accessory && cosmetics.accessory !== 'NONE') {
        drawAccessory(ctx, cosmetics.accessory, radius, visualTime);
    }

    ctx.restore();
};

const drawStarryClownPattern = (ctx: CanvasRenderingContext2D, radius: number, morphology?: ResolvedMorphology) => {
  ctx.save();
  for (const [x, height] of [[-0.65, 0.46], [-0.1, 0.65], [0.48, 0.52]] as const) {
    ctx.beginPath();
    ctx.moveTo(radius * (x - 0.08), -radius * height);
    ctx.quadraticCurveTo(radius * (x + 0.14), 0, radius * (x - 0.04), radius * height);
    ctx.strokeStyle = 'rgba(4,12,35,0.38)';
    ctx.lineWidth = radius * 0.21;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(91,230,239,0.65)';
    ctx.lineWidth = radius * 0.14;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(237,250,255,0.95)';
    ctx.lineWidth = radius * 0.065;
    ctx.stroke();
  }
  const marks = morphology ? getCachedPatternMarks(morphology, 23) : [];
  for (let i = 0; i < 23; i += 1) {
    const fallbackAngle = i * 2.399963;
    const fallbackDistance = Math.sqrt((i + 0.5) / 23) * 0.84;
    const mark = marks[i];
    ctx.fillStyle = mark?.color ?? (i % 3 === 0 ? '#ffe9aa' : '#b6f7ff');
    ctx.globalAlpha = mark?.alpha ?? 0.85;
    ctx.beginPath();
    ctx.arc(
      (mark?.x ?? Math.cos(fallbackAngle) * fallbackDistance) * radius,
      (mark?.y ?? Math.sin(fallbackAngle) * fallbackDistance * 0.66) * radius,
      radius * (mark?.radius ?? (i % 5 === 0 ? 0.023 : 0.011)),
      0,
      Math.PI * 2
    );
    ctx.fill();
    if (i % 6 === 0) {
      const x = (mark?.x ?? Math.cos(fallbackAngle) * fallbackDistance) * radius;
      const y = (mark?.y ?? Math.sin(fallbackAngle) * fallbackDistance * 0.66) * radius;
      const sparkle = radius * 0.055;
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#f8fdff';
      ctx.lineWidth = Math.max(0.8, radius * 0.012);
      ctx.beginPath(); ctx.moveTo(x - sparkle, y); ctx.lineTo(x + sparkle, y); ctx.moveTo(x, y - sparkle); ctx.lineTo(x, y + sparkle); ctx.stroke();
    }
  }
  ctx.restore();
};

const drawClownBands = (ctx: CanvasRenderingContext2D, radius: number, secondaryColor: string) => {
  ctx.save();
  ctx.lineCap = 'round';
  for (const [x, height, bend] of [[-0.48, 0.56, -0.06], [0.18, 0.72, 0.1], [0.62, 0.5, -0.03]] as const) {
    ctx.beginPath();
    ctx.moveTo(radius * x, -radius * height);
    ctx.quadraticCurveTo(radius * (x + bend), 0, radius * (x - bend * 0.45), radius * height);
    ctx.strokeStyle = 'rgba(15,23,42,0.42)'; ctx.lineWidth = radius * 0.22; ctx.stroke();
    ctx.strokeStyle = secondaryColor; ctx.lineWidth = radius * 0.135; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.48)'; ctx.lineWidth = radius * 0.032; ctx.stroke();
  }
  ctx.restore();
};

const drawMorphologyMarks = (
  ctx: CanvasRenderingContext2D, radius: number, morphology: ResolvedMorphology, pattern: 'SPOTS' | 'DOTS'
) => {
  const marks = getCachedPatternMarks(morphology, pattern === 'SPOTS' ? 12 : 24);
  const sizeScale = pattern === 'SPOTS' ? 2.3 : 1.35;
  ctx.save();
  for (const mark of marks) {
    ctx.globalAlpha = mark.alpha * (pattern === 'SPOTS' ? 0.5 : 0.38);
    ctx.fillStyle = mark.color;
    ctx.beginPath();
    ctx.arc(mark.x * radius, mark.y * radius, mark.radius * radius * sizeScale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

// ============== Cosmetic 渲染辅助函数 ==============

/** 获取体型参数（scaleX/scaleY 直接乘在鱼身的局部变换上：>1 变胖、<1 变瘦） */
const getBodyTypeParams = (bodyType: BodyType): { scaleX: number; scaleY: number } => {
  const params: Record<BodyType, { scaleX: number; scaleY: number }> = {
    DEFAULT: { scaleX: 1, scaleY: 1 },
    ROUND: { scaleX: 1.15, scaleY: 1.15 },
    SLENDER: { scaleX: 0.85, scaleY: 1.2 },
    CHUNKY: { scaleX: 1.25, scaleY: 0.88 },
    BOX: { scaleX: 1.05, scaleY: 0.95 },
    STAR: { scaleX: 1.15, scaleY: 1.15 },
    MERMAID: { scaleX: 0.9, scaleY: 1.12 },
    RAY: { scaleX: 1.35, scaleY: 0.7 },
    EEL: { scaleX: 0.68, scaleY: 1.45 },
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
    case 'LOBSTER': { // 龙虾尾：分节 + 尾扇
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-radius * (0.3 + i * 0.22), 0, radius * 0.16, radius * (0.34 - i * 0.06), 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-radius * 0.95, 0);
      ctx.lineTo(-radius * 1.35, -radius * 0.3);
      ctx.lineTo(-radius * 1.2, 0);
      ctx.lineTo(-radius * 1.35, radius * 0.3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    }
    case 'MECHANICAL': { // 机械尾：金属板 + 喷口尾焰
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-radius * 0.55, -radius * 0.32);
      ctx.lineTo(-radius * 0.38, 0);
      ctx.lineTo(-radius * 0.55, radius * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.fillRect(-radius * 0.66, -radius * 0.1, radius * 0.14, radius * 0.2);
      ctx.fillStyle = 'rgba(34,211,238,0.7)';
      const flame = radius * (0.28 + Math.abs(Math.sin(visualTime * 0.25)) * 0.36);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.66, -radius * 0.08);
      ctx.lineTo(-radius * 0.66 - flame, 0);
      ctx.lineTo(-radius * 0.66, radius * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'GHOST': { // 幽灵尾：三团半透明飘絮
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#c7d2fe';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(
          -radius * (0.25 + i * 0.28),
          Math.sin(visualTime * 0.12 + i) * radius * 0.14,
          radius * 0.28, radius * 0.34, 0, 0, Math.PI * 2
        );
        ctx.fill();
      }
      break;
    }
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
      for (const side of [-1, 1]) {
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(eyeX + radius * 0.08, side * (eyeY + radius * 0.05), radius * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(eyeX + radius * 0.1, side * (eyeY + radius * 0.03), radius * 0.08, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'DEAD':
      ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeX, eyeY, radius * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(eyeX - radius * 0.15, -eyeY - radius * 0.1); ctx.lineTo(eyeX + radius * 0.15, -eyeY + radius * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eyeX - radius * 0.15, eyeY - radius * 0.1); ctx.lineTo(eyeX + radius * 0.15, eyeY + radius * 0.1); ctx.stroke();
      break;
    case 'CAT': { // 猫眼：竖瞳
      ctx.fillStyle = '#fde68a';
      ctx.beginPath(); ctx.ellipse(eyeX, -eyeY, radius * 0.22, radius * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eyeX, eyeY, radius * 0.22, radius * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.ellipse(eyeX, -eyeY, radius * 0.05, radius * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eyeX, eyeY, radius * 0.05, radius * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'FIRE': { // 火焰眼：外橙内黄 + 跳动火苗
      const flicker = 1 + Math.sin(visualTime * 0.35) * 0.12;
      for (const ey of [-eyeY, eyeY]) {
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.ellipse(eyeX, ey, radius * 0.24 * flicker, radius * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.ellipse(eyeX, ey - radius * 0.03, radius * 0.14, radius * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff7ed';
        ctx.beginPath(); ctx.ellipse(eyeX, ey - radius * 0.05, radius * 0.06, radius * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'CYBORG': { // 机械眼：红色镜头 + 扫描线
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 6;
      for (const ey of [-eyeY, eyeY]) {
        ctx.fillStyle = '#111827';
        ctx.beginPath(); ctx.arc(eyeX, ey, radius * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(eyeX, ey, radius * 0.13, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(239,68,68,0.85)';
      ctx.lineWidth = 2;
      const scanOffset = Math.sin(visualTime * 0.12) * radius * 0.2;
      for (const side of [-1, 1]) {
        const scan = side * (eyeY + scanOffset);
        ctx.beginPath(); ctx.moveTo(eyeX - radius * 0.26, scan); ctx.lineTo(eyeX + radius * 0.26, scan); ctx.stroke();
      }
      break;
    }
    case 'LOVE': { // 爱心眼
      ctx.fillStyle = '#f472b6';
      for (const ey of [-eyeY, eyeY]) {
        const s = radius * 0.26;
        ctx.beginPath();
        ctx.arc(eyeX - s * 0.35, ey - s * 0.2, s * 0.4, 0, Math.PI * 2);
        ctx.arc(eyeX + s * 0.35, ey - s * 0.2, s * 0.4, 0, Math.PI * 2);
        ctx.moveTo(eyeX - s * 0.75, ey - s * 0.02);
        ctx.lineTo(eyeX, ey + s * 0.8);
        ctx.lineTo(eyeX + s * 0.75, ey - s * 0.02);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
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
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(1, side);
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
    case 'SAD': // 八字愁眉：和 ANGRY 镜像 + 中段下坠，一副委屈样
      ctx.beginPath();
      ctx.moveTo(eyeX - radius * 0.22, yOff + radius * 0.12);
      ctx.quadraticCurveTo(eyeX, yOff + radius * 0.02, eyeX + radius * 0.22, yOff - radius * 0.1);
      ctx.stroke();
      break;
    case 'CONFUSED': // 困惑挑眉：单边高高挑起的拱线
      ctx.beginPath();
      ctx.moveTo(eyeX - radius * 0.22, yOff + radius * 0.08);
      ctx.quadraticCurveTo(eyeX - radius * 0.02, yOff - radius * 0.28, eyeX + radius * 0.16, yOff - radius * 0.02);
      ctx.stroke();
      break;
    case 'TIERED': // 层层眉：三条渐细的平行横线堆出层次
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = 3 - i * 0.8;
        ctx.beginPath();
        ctx.moveTo(eyeX - radius * 0.24, yOff - radius * 0.08 + i * radius * 0.12);
        ctx.lineTo(eyeX + radius * 0.22, yOff - radius * 0.1 + i * radius * 0.12);
        ctx.stroke();
      }
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
    ctx.restore();
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
    case 'EYEPATCH': { // 眼罩：盖住上面那只眼 + 斜绑带
      const ex = radius * 0.35;
      const ey = -radius * 0.45;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = Math.max(2, radius * 0.09);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.2, -radius * 0.98);
      ctx.lineTo(radius * 0.85, -radius * 0.05);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(ex, ey, radius * 0.29, radius * 0.24, -0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'GOLD_CHAIN': { // 金链：绕身子一圈，在嘴的位置留个缺口，两端有卡扣
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = Math.max(2, radius * 0.09);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.74, 0.7, Math.PI * 2 - 0.7);
      ctx.stroke();
      ctx.strokeStyle = '#fef3c7'; // 链节高光
      ctx.lineWidth = Math.max(1, radius * 0.03);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.74, 0.7, Math.PI * 2 - 0.7);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      for (const a of [0.7, -0.7]) {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * radius * 0.74, Math.sin(a) * radius * 0.74, radius * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
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
    case 'TIGER': { // 虎纹：粗细不一的黑横纹，压着底色走
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(20,12,0,0.85)';
      const tigerRows = [-0.62, -0.3, 0.02, 0.34, 0.66];
      tigerRows.forEach((ty, i) => {
        ctx.lineWidth = radius * (i % 2 === 0 ? 0.13 : 0.08);
        ctx.beginPath();
        ctx.moveTo(-radius * 0.75, ty * radius);
        ctx.quadraticCurveTo(0, ty * radius + radius * 0.1 * (i % 2 === 0 ? 1 : -1), radius * 0.75, ty * radius);
        ctx.stroke();
      });
      break;
    }
    case 'ZEBRA': { // 斑马纹：密而粗的竖纹（比 STRIPES 更抢眼）
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = radius * 0.16;
      for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(15,15,15,0.85)';
        ctx.beginPath();
        ctx.moveTo(i * radius * 0.32, -radius);
        ctx.quadraticCurveTo(i * radius * 0.32 + radius * 0.12, 0, i * radius * 0.32, radius);
        ctx.stroke();
      }
      break;
    }
    case 'STAR': { // 星星：散布的小五角星，随时间缓慢自转
      ctx.fillStyle = 'rgba(255,248,200,0.95)';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + visualTime * 0.01;
        const cx = Math.cos(a) * radius * 0.42;
        const cy = Math.sin(a) * radius * 0.32;
        const rr = radius * (0.14 + (i % 2) * 0.05);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2 - Math.PI / 2 + visualTime * 0.02;
          const rad = k % 2 === 0 ? rr : rr * 0.45;
          const px = cx + Math.cos(ang) * rad;
          const py = cy + Math.sin(ang) * rad;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'GALAXY': { // 星系：深色底 + 星云 + 星点
      const nebula = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      nebula.addColorStop(0, 'rgba(139,92,246,0.75)');
      nebula.addColorStop(0.55, 'rgba(30,58,138,0.6)');
      nebula.addColorStop(1, 'rgba(2,6,23,0.85)');
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = nebula;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        // 用固定公式散点，避免每帧抖动；半径用 i 的倍数错开
        const a = i * 2.399;
        const rr = radius * (0.2 + ((i * 37) % 100) / 140);
        const twinkle = 0.55 + Math.sin(visualTime * 0.12 + i) * 0.45;
        ctx.globalAlpha = twinkle;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.75, radius * (0.03 + (i % 3) * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'LAVA': { // 熔岩：橙红裂纹 + 发光
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
      ctx.lineWidth = radius * 0.1;
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * radius * 0.45;
        ctx.strokeStyle = i === 1 ? 'rgba(254,215,170,0.95)' : 'rgba(249,115,22,0.9)';
        ctx.beginPath();
        ctx.moveTo(-radius * 0.9, y);
        ctx.lineTo(-radius * 0.3, y - radius * 0.14);
        ctx.lineTo(radius * 0.2, y + radius * 0.16);
        ctx.lineTo(radius * 0.9, y - radius * 0.05);
        ctx.stroke();
      }
      break;
    }
    case 'CLOUD': { // 云朵：几团白色椭圆叠着飘
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const puffs: Array<[number, number, number]> = [
        [-0.42, -0.18, 0.3], [0.02, -0.34, 0.24], [0.4, -0.05, 0.28], [-0.1, 0.34, 0.22],
      ];
      puffs.forEach(([px, py, pr], i) => {
        ctx.beginPath();
        ctx.ellipse(
          px * radius + Math.sin(visualTime * 0.03 + i) * radius * 0.06,
          py * radius,
          pr * radius,
          pr * radius * 0.62,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      });
      break;
    }
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
    case 'DRAGON': { // 龙鳞：六边形鳞片网格
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = baseColor === 'DEFAULT' ? 'rgba(255,215,120,0.9)' : 'rgba(255,225,150,0.9)';
      ctx.lineWidth = 1.4;
      const step = radius * 0.3;
      for (let row = -2; row <= 2; row++) {
        for (let col = -2; col <= 2; col++) {
          const cx = col * step + (row % 2 === 0 ? 0 : step / 2);
          const cy = row * step * 0.85;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
            const px = cx + Math.cos(a) * step * 0.42;
            const py = cy + Math.sin(a) * step * 0.42;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }
    case 'ARMOR': { // 盔甲：横向板甲 + 铆钉
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = 'rgba(226,232,240,0.85)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const y = i * radius * 0.4;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.85, y);
        ctx.quadraticCurveTo(0, y + radius * 0.12, radius * 0.85, y);
        ctx.stroke();
        // 铆钉
        ctx.fillStyle = 'rgba(203,213,225,0.95)';
        for (const rx of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.arc(rx * radius, y + radius * 0.02, radius * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'MECHANICAL': { // 机械：面板网格 + 螺栓 + 走动的指示灯
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = 'rgba(148,163,184,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.5, -radius); ctx.lineTo(-radius * 0.5, radius);
      ctx.moveTo(radius * 0.2, -radius); ctx.lineTo(radius * 0.2, radius);
      ctx.moveTo(-radius, -radius * 0.25); ctx.lineTo(radius, -radius * 0.25);
      ctx.moveTo(-radius, radius * 0.35); ctx.lineTo(radius, radius * 0.35);
      ctx.stroke();
      ctx.fillStyle = 'rgba(100,116,139,0.95)';
      for (const [bx, by] of [[-0.7, -0.6], [-0.7, 0.62], [0.62, -0.6], [0.62, 0.62]] as Array<[number, number]>) {
        ctx.beginPath();
        ctx.arc(bx * radius, by * radius, radius * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      // 呼吸灯
      ctx.globalAlpha = 0.5 + Math.sin(visualTime * 0.2) * 0.45;
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(radius * 0.55, radius * 0.05, radius * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }

  ctx.restore();
};

// ============== 辅助函数结束 ==============

// 传送门颜色配置（根据传送门名称分配不同颜色）
const getPortalColor = (portal: Portal): string => {
    // 塘际门用自己的塘色（「多鱼塘」阶段 2a）
    if (portal.kind === 'POND') return getPond(portal.targetPond).color;
    if (portal.name?.includes('浅滩')) return '#22d3ee'; // 青色 - 浅滩
    if (portal.name?.includes('珊瑚')) return '#f0abfc'; // 粉色 - 珊瑚
    if (portal.name?.includes('沼泽')) return '#86efac'; // 绿色 - 沼泽
    if (portal.name?.includes('深渊')) return '#a855f7'; // 紫色 - 深渊
    return '#d8b4fe'; // 默认紫色
};

const getPortalSecondaryColor = (portal: Portal): string => {
    // 塘际门用琥珀色描边，一眼区分「这扇门会换塘」
    if (portal.kind === 'POND') return '#fcd34d';
    if (portal.name?.includes('浅滩')) return '#67e8f9';
    if (portal.name?.includes('珊瑚')) return '#fda4af';
    if (portal.name?.includes('沼泽')) return '#4ade80';
    if (portal.name?.includes('深渊')) return '#c084fc';
    return '#22d3ee';
};

// 传送门绘制函数（增强版）
/** 洋流在鱼和地形下方：半透明水道 + 会向流向移动的箭头。 */
const drawWaterCurrent = (ctx: CanvasRenderingContext2D, zone: WaterCurrentZone, visualTime: number) => {
    ctx.save();
    ctx.translate(zone.x, zone.y);
    ctx.rotate(zone.angle);
    ctx.fillStyle = zone.color + '18';
    ctx.strokeStyle = zone.color + '88';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.roundRect(-zone.length / 2, -zone.width / 2, zone.length, zone.width, zone.width / 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const spacing = 120;
    const travel = (visualTime * zone.strength * 0.9) % spacing;
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.68;
    for (let x = -zone.length / 2 + travel; x < zone.length / 2; x += spacing) {
        for (const y of [-zone.width * 0.22, zone.width * 0.22]) {
            ctx.beginPath();
            ctx.moveTo(x - 18, y - 13);
            ctx.lineTo(x, y);
            ctx.lineTo(x - 18, y + 13);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${zone.name}  ›`, 0, -zone.width / 2 - 10);
    ctx.restore();
};

/** 建筑标识字：新增建筑在这里补一个字（画圈逻辑通用，只有字和颜色来自数据） */
const BUILDING_GLYPHS: Record<string, string> = {
  HOSPITAL: '医',
  SHRINE: '庙',
  SHOP: '商',
  WISHING_WELL: '愿',
  PEARL_FARM: '珠',
  SHIPWRECK: '船',
};

/** 建筑绘制 —— 之前同样只生成不绘制 */
const drawBuilding = (ctx: CanvasRenderingContext2D, b: Building, time: number) => {
    const conf = (BUILDING_CONFIGS as Record<string, { color: string; name: string }>)[b.type];
    if (!conf) return;

    const glyph = BUILDING_GLYPHS[b.type] ?? '军';
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

    if (b.type === BuildingType.SHIPWRECK) {
        // 破损船体：保留清晰入口，不再只是一个写着“船”的圆。
        ctx.save();
        ctx.rotate(-0.16);
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-b.radius * 0.68, -b.radius * 0.18);
        ctx.lineTo(b.radius * 0.7, -b.radius * 0.18);
        ctx.lineTo(b.radius * 0.46, b.radius * 0.38);
        ctx.lineTo(-b.radius * 0.48, b.radius * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 7;
        for (const x of [-0.36, -0.08, 0.2, 0.48]) {
            ctx.beginPath();
            ctx.moveTo(b.radius * x, -b.radius * 0.15);
            ctx.lineTo(b.radius * (x - 0.08), b.radius * 0.32);
            ctx.stroke();
        }
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(-b.radius * 0.1, -b.radius * 0.2);
        ctx.lineTo(-b.radius * 0.18, -b.radius * 0.72);
        ctx.lineTo(b.radius * 0.1, -b.radius * 0.5);
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(b.radius * 0.48, b.radius * 0.08, b.radius * 0.13, b.radius * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        // 通用建筑底座与标识
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = conf.color;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(b.radius * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, 0, 0);
    }

    if (b.activity) {
        const progress = Math.max(0, Math.min(1, b.activity.progress));
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 0.76, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = b.activity.color;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 12;
        ctx.shadowColor = b.activity.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // 交互提示画在建筑**下方**（不是上方）：商场在屏幕中央时，头顶位置正好被
    // 顶部的「宝贝倒计时」HUD 面板盖住，画在下方永远清爽。小尾巴朝上指着建筑。
    if (b.prompt) {
        ctx.globalAlpha = 1; // 冷却压暗不影响提示可读性
        const bob = Math.sin(time * 0.08) * 4;
        const py = b.radius + 34 + bob;
        ctx.font = 'bold 16px sans-serif';
        const w = ctx.measureText(b.prompt.text).width + 24;
        const h = 30;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(-w / 2, py - h / 2, w, h, 15);
        ctx.fill();
        // 小尾巴朝上指向建筑
        ctx.beginPath();
        ctx.moveTo(-6, py - h / 2 + 1);
        ctx.lineTo(6, py - h / 2 + 1);
        ctx.lineTo(0, py - h / 2 - 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = b.prompt.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-w / 2, py - h / 2, w, h, 15);
        ctx.stroke();
        ctx.fillStyle = b.prompt.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.prompt.text, 0, py);
    }

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

    // 漩涡旋臂（特效增强）：三条旋臂绕核心慢转，制造「通往别处」的吸入感
    ctx.save();
    ctx.rotate(visualTime * 0.012);
    ctx.strokeStyle = `rgba(${hexToRgb(secondaryColor)}, 0.45)`;
    ctx.lineWidth = 2;
    for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        const baseAngle = (arm / 3) * Math.PI * 2;
        for (let t = 0; t <= 1.001; t += 0.05) {
            const r = portal.radius * (0.15 + t * 0.75);
            const a = baseAngle + t * 2.4;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (t === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();

    // 螺旋吸入的星尘（特效增强）：从外圈卷向核心，越近越亮越大，循环往复
    const dustCount = 14;
    for (let i = 0; i < dustCount; i++) {
        const phase = (visualTime * 0.0006 + i / dustCount) % 1;
        const r = portal.radius * (1.35 - phase * 1.15);
        const a = (i / dustCount) * Math.PI * 2 + phase * 5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 + phase * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${hexToRgb(primaryColor)}, ${0.15 + phase * 0.75})`;
        ctx.fill();
    }

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

    // 塘际门：额外套一圈虚线环（「多鱼塘」阶段 2a），和塘内门一眼区分
    if (portal.kind === 'POND') {
        ctx.save();
        ctx.setLineDash([12, 10]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(${hexToRgb(secondaryColor)}, 0.9)`;
        ctx.beginPath();
        ctx.arc(0, 0, portal.radius * 1.75 + Math.sin(visualTime * 0.06) * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

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

/**
 * 大肉块（诱惑生效中）：玩家技能与 AI 灯笼鱼共用。
 * 「变成大肉块骗小鱼」的伪装要成立，肉块形态就不能只属于玩家 ——
 * AI 灯笼鱼开着诱饵时也得真的是一块肉，而不是一条发着灯的鮟鱇。
 */
const drawMeatBlock = (ctx: CanvasRenderingContext2D, e: Entity): void => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = '#ef4444'; // Red meat
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 1.5, e.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fca5a5'; // Fat marbling
    ctx.beginPath(); ctx.ellipse(-e.radius*0.5, 0, e.radius*0.8, e.radius*0.2, Math.PI/4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(e.radius*0.3, e.radius*0.2, e.radius*0.6, e.radius*0.15, -Math.PI/6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
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

/**
 * 大鱼反击的前摇预告（FQ-04 / §5.1）。
 *
 * 为什么必须画出来：反击从「被咬瞬间的不可见伤害」改成「前摇 → 范围 → 伤害时点」之后，
 * 如果只有伤害没有预告，玩家只会觉得「我明明游开了还是掉血」。
 * 所以前摇期间把**判定范围**和**倒计时**都摊在屏幕上 —— 一眼看懂该往哪跑。
 */
const drawCounterTelegraph = (ctx: CanvasRenderingContext2D, entity: Entity, visualTime: number) => {
    const windup = entity.counterWindup ?? 0;
    if (windup <= 0) return;

    const total = Math.max(1, COMBAT_CONFIG.COUNTER_WINDUP);
    const progress = 1 - Math.min(1, windup / total); // 0 → 1，越接近 1 越危险
    const range = entity.radius * COMBAT_CONFIG.COUNTER_RANGE_MULT;

    ctx.save();
    ctx.translate(entity.x, entity.y);

    // 判定范围：站在这个圈里就会挨打，跑出去就躲掉了
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, range, 0, Math.PI * 2);
    ctx.fill();

    // 贴身倒计时光环：随前摇收紧并变亮
    ctx.globalAlpha = 0.45 + progress * 0.5;
    ctx.strokeStyle = progress > 0.75 ? '#fca5a5' : '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius + 10 + (1 - progress) * 10, 0, Math.PI * 2);
    ctx.stroke();

    // 外圈进度弧：从 0 长满一圈 = 伤害落地的瞬间
    ctx.globalAlpha = 0.55 + Math.sin(visualTime * 0.4) * 0.25;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, range, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();

    ctx.restore();
};

// 传送门绘制函数

// 视口裁剪辅助函数
/** 只要带圆心 + 半径就能裁剪：Entity / Obstacle / Building / Portal / Treasure / PowerUp 都满足 */
type SpatialPoint = { x: number; y: number; radius: number };

const isOnScreen = (p: SpatialPoint, camera: { x: number; y: number; zoom: number }, canvasWidth: number, canvasHeight: number): boolean => {
  const screenX = (p.x - camera.x) * camera.zoom + canvasWidth / 2;
  const screenY = (p.y - camera.y) * camera.zoom + canvasHeight / 2;
  const visibleRadius = Math.max(p.radius, 50) * camera.zoom + 100; // 增加缓冲
  return (
    screenX + visibleRadius > 0 &&
    screenX - visibleRadius < canvasWidth &&
    screenY + visibleRadius > 0 &&
    screenY - visibleRadius < canvasHeight
  );
};

/**
 * 花瓣边界的静态形状缓存（5 层）。形状只跟层号有关：每层 = 地图半径公式 + layer * 60。
 * 原来每帧重算 630 个点的 sin/cos 并重建路径；现在只在**第一次真正渲染**时算一次。
 * 数组顺序 = 原来的绘制顺序（第 5 层最先画，最外层在最底下）。
 *
 * ⚠️ 刻意做成「首次调用时构建」而不是模块加载时：单测（jsdom）会 import 这个文件，
 *    而 jsdom 没有 Path2D —— 模块加载即构建会让两个渲染测试套件在 import 阶段就崩。
 */
let boundaryLayers: { layer: number; path: Path2D }[] | null = null;
const getBoundaryLayers = (): { layer: number; path: Path2D }[] => {
  if (boundaryLayers) return boundaryLayers;
  const layers: { layer: number; path: Path2D }[] = [];
  for (let layer = 5; layer >= 1; layer -= 1) {
    const path = new Path2D();
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
      const r = getMapBoundaryRadius(a) + layer * 60;
      const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(a) * r;
      const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(a) * r;
      if (a === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    layers.push({ layer, path });
  }
  boundaryLayers = layers;
  return layers;
};

/** 最外层边界的半径上界（含花瓣起伏）：做「边界是否整体在屏幕外」的保守判定 */
const BOUNDARY_MAX_RADIUS =
  MAP_SHAPE_CONFIG.BASE_RADIUS + MAP_SHAPE_CONFIG.PETAL_VARIANCE + 5 * 60;

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationFrameId: number;

    /**
     * 只画一帧，**不排下一帧**。
     *
     * 拆出来是为了让性能探针（scripts/probe-perf.mjs）能在一次 evaluate 里
     * 同步连画 N 帧、量出「纯渲染耗时」：rAF 的**间隔**会被 vsync / 合成器节奏污染
     * （实测同一场景 p50 8.9ms 而 p95 54ms —— 前者接近真实工作量，后者大半是合成器抖动），
     * 同步连画没有这个干扰，是判断渲染优化有没有用的唯一可信信号。
     * 运行时行为零变化：`render` 还是「画一帧 + 排下一帧」。
     */
    const drawFrame = (frameState: Readonly<GameState>, now = performance.now()) => {
        const gameState = frameState;
        const { player, entities, particles, camera, status } = gameState;
        const visualTime = now / 16;
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
            // 花瓣边界是**静态几何**（只有透明度在呼吸），却原来每帧用 5 层 × 126 段
            // 重描一遍（630 次 lineTo + 1260 次 sin/cos + 5 次宽描边光栅化）。
            // 形状只跟层号有关 → 模块级缓存成 5 个 Path2D，每帧只剩 5 次 stroke(path)；
            // 玩家在地图中部时整个边界都在屏幕外，连这 5 次也直接跳过。
            const camDist = Math.hypot(camera.x - MAP_SHAPE_CONFIG.CENTER_X, camera.y - MAP_SHAPE_CONFIG.CENTER_Y);
            const screenRadius = Math.hypot(canvas.width, canvas.height) / 2 / camera.zoom;
            if (camDist - BOUNDARY_MAX_RADIUS <= screenRadius) {
                const boundaryPulse = Math.sin(visualTime * 0.05) * 0.1 + 0.9;
                for (const { layer, path } of getBoundaryLayers()) {
                    const layerAlpha = (0.05 + Math.sin(visualTime * 0.03 + layer) * 0.02) * boundaryPulse;
                    ctx.strokeStyle = `rgba(59, 130, 246, ${layerAlpha})`;
                    ctx.lineWidth = 40 - layer * 6;
                    ctx.setLineDash([]);
                    ctx.stroke(path);
                }
            }
        }

        // 竞技场光圈 (仅战斗模式)
        // Correct fix: Import GameStatus from types to fix the reference error.
        if (status === GameStatus.BATTLE_TEST) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineWidth = 10; ctx.setLineDash([20, 20]);
            ctx.arc(MAP_SHAPE_CONFIG.CENTER_X, MAP_SHAPE_CONFIG.CENTER_Y, 800, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        }

        // 绘制地形：洋流、障碍物与建筑（画在鱼之前，避免遮挡生物）
        (gameState.currents ?? []).forEach(zone => {
            const radius = Math.hypot(zone.length, zone.width) / 2;
            if (!isOnScreen({ x: zone.x, y: zone.y, radius }, camera, canvas.width, canvas.height)) return;
            drawWaterCurrent(ctx, zone, visualTime);
        });
        // 只画视野附近，80 个障碍物全画没有意义
        gameState.obstacles.forEach(o => {
            const visualRadius = o.feature === 'VENT' && o.featureState !== 'IDLE'
                ? o.radius + OBSTACLE_ECOLOGY.VENT_RANGE
                : o.radius;
            if (!isOnScreen({ ...o, radius: visualRadius }, camera, canvas.width, canvas.height)) return;
            drawObstacleCanvas(ctx, o, visualTime);
        });
        gameState.buildings.forEach(b => {
            if (!isOnScreen(b, camera, canvas.width, canvas.height)) return;
            drawBuilding(ctx, b, gameState.time);
        });

        // 绘制喷泉
        gameState.fountains.forEach(f => {
            if (!isOnScreen(f, camera, canvas.width, canvas.height)) return;
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

        // ==================== RIVALS 投食争夺 ====================
        const feeding = gameState.feedingEvent;
        if (feeding && feeding.x !== null && feeding.y !== null
            && feeding.phase !== 'WAITING' && feeding.phase !== 'COOLDOWN') {
            if (isOnScreen({ x: feeding.x, y: feeding.y, radius: FEEDING_EVENT_CONFIG.EVENT_RADIUS }, camera, canvas.width, canvas.height)) {
                ctx.save();
                ctx.translate(feeding.x, feeding.y);
                const pulse = 1 + Math.sin(visualTime * 0.12) * 0.08;
                ctx.beginPath();
                ctx.arc(0, 0, FEEDING_EVENT_CONFIG.EVENT_RADIUS * pulse, 0, Math.PI * 2);
                ctx.fillStyle = feeding.phase === 'WARNING' ? 'rgba(251, 146, 60, 0.10)' : 'rgba(250, 204, 21, 0.08)';
                ctx.fill();
                ctx.strokeStyle = feeding.phase === 'WARNING' ? '#fb923c' : '#facc15';
                ctx.lineWidth = 5;
                ctx.setLineDash(feeding.phase === 'WARNING' ? [18, 14] : [8, 10]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#fff7ed';
                ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(
                    feeding.phase === 'WARNING' ? '投食即将开始' : '投食争夺区',
                    0,
                    -FEEDING_EVENT_CONFIG.EVENT_RADIUS - 15
                );
                ctx.restore();
            }
            feeding.drops.forEach((drop, index) => {
                if (!isOnScreen(drop, camera, canvas.width, canvas.height)) return;
                drawCookie(ctx, drop.x, drop.y, drop.radius, visualTime * 0.04 + index);
            });
        }
        // ==================== 投食争夺结束 ====================

        // ==================== 绘制宝藏（增强版） ====================
        gameState.treasures.forEach(treasure => {
            if (!isOnScreen(treasure, camera, canvas.width, canvas.height)) return;
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
            if (!isOnScreen(p, camera, canvas.width, canvas.height)) return;
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
            } else if (p.type === 'COIN') {
                // 金币：翻转椭圆（伪 3D 旋转）+ 浮动 + 内圈高光，¥ 字随币面一起翻转
                const spin = Math.max(0.22, Math.abs(Math.sin(gameState.time * 0.08 + p.x)));
                ctx.save();
                ctx.translate(0, Math.sin(gameState.time * 0.06 + p.y) * 3);
                ctx.scale(spin, 1);
                ctx.beginPath();
                ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#fbbf24';
                ctx.shadowBlur = 12;
                ctx.shadowColor = 'rgba(251, 191, 36, 0.8)';
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#b45309';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, p.radius * 0.62, 0, Math.PI * 2);
                ctx.fillStyle = '#fde68a';
                ctx.fill();
                ctx.fillStyle = '#b45309';
                ctx.font = `bold ${Math.round(p.radius * 1.1)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('¥', 0, 1);
                ctx.restore();
            } else {
                ctx.fillStyle = p.type === 'SPEED' ? '#3b82f6' : '#8b5cf6';
                ctx.beginPath();
                ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });

        particles.forEach(p => {
            if (!isOnScreen({ x: p.x, y: p.y, radius: p.size }, camera, canvas.width, canvas.height)) return;
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
            if (!isOnScreen({ x: label.x, y: label.y, radius: 90 }, camera, canvas.width, canvas.height)) return;
            ctx.save();
            ctx.translate(label.x, label.y);
            
            // 浮动动画
            const floatOffset = Math.sin(visualTime * 0.1) * 5;
            ctx.translate(0, floatOffset);
            
            // 文字阴影
            ctx.shadowBlur = 10;
            ctx.shadowColor = label.color;
            
            // 绘制背景气泡（字号可由 label.size 指定，默认 28；逆转等高光时刻用大字）
            const fontSize = label.size ?? 28;
            ctx.font = `bold ${fontSize}px sans-serif`;
            const metrics = ctx.measureText(label.text);
            const padding = 10;
            const bubbleWidth = metrics.width + padding * 2;
            const bubbleHeight = fontSize + 12;
            
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

        // 诱饵开着的鱼（灯笼鱼埋伏）画成「大肉块」—— 伪装的意义就是让小鱼认不出来
        visibleEntities.forEach(e => {
            if (e.lureActive) drawMeatBlock(ctx, e);
            else drawCuteFish(ctx, e, visualTime, false);
        });

        // 稀有变体只在近距离显示名称，避免全图标签噪声。
        visibleEntities.forEach(e => {
            if (!e.cosmetics?.rareVariant || Math.hypot(e.x - player.x, e.y - player.y) > 700) return;
            ctx.save();
            ctx.translate(e.x, e.y - e.radius - 18);
            ctx.fillStyle = '#b6f7ff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦ 星夜小丑鱼', 0, 0);
            ctx.restore();
        });

        // 战队成员标记：青色虚线环 + 头顶「己」字，跟野怪一眼分开
        visibleEntities.forEach(e => {
            if (e.ownerId !== 'player') return;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = -visualTime * 0.05;
            ctx.beginPath();
            ctx.arc(0, 0, e.radius + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#22d3ee';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('己', 0, -e.radius - 14);
            ctx.restore();
        });

        // 敌队标记：实线/虚线轮廓 + 稳定队名。不能只靠皮肤颜色区分敌我。
        const visibleRivalLeader = new Map<string, string>();
        visibleEntities.forEach(e => {
            if (!e.ownerId || visibleRivalLeader.has(e.ownerId)) return;
            if (gameState.rivalSquads?.some(squad => squad.id === e.ownerId)) {
                visibleRivalLeader.set(e.ownerId, e.id);
            }
        });
        visibleEntities.forEach(e => {
            if (!e.ownerId || e.ownerId === 'player') return;
            const rival = gameState.rivalSquads?.find(squad => squad.id === e.ownerId);
            if (!rival) return;
            const isAmbusher = rival.kind === 'AMBUSHER';
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.strokeStyle = isAmbusher ? 'rgba(196, 181, 253, 0.95)' : 'rgba(251, 146, 60, 0.9)';
            ctx.lineWidth = 3;
            if (isAmbusher) ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, e.radius + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // 入场气泡存在时不重复画同一队名；气泡消失后稳定名称接棒。
            if (visibleRivalLeader.get(rival.id) === e.id && (!e.speechBubble || e.speechBubble.timer <= 0)) {
                ctx.fillStyle = isAmbusher ? '#c4b5fd' : '#fb923c';
                ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`敌 · ${rival.name}`, 0, -e.radius - 14);
            }
            ctx.restore();
        });

        // 绘制偷袭提示（在大鱼背后显示偷袭机会）
        visibleEntities.forEach(e => drawAmbushIndicator(ctx, e, player.x, player.y, player.level, visualTime));

        // 大鱼反击的前摇预告（FQ-04）：范围 + 倒计时都要看得见，否则「游开了还掉血」
        visibleEntities.forEach(e => drawCounterTelegraph(ctx, e, visualTime));
        drawCounterTelegraph(ctx, player, visualTime);

        // 诱惑技能生效中：玩家画成一块大肉（武器机甲已随武器系统移除）
        if (player.lureActive) {
            drawMeatBlock(ctx, player);
        } else {
            drawCuteFish(ctx, player, visualTime, true);
        }

        // 对话气泡：combat/ai/world/squad/skills… 十来个系统都在写 speechBubble，
        // 但 v2 重构时渲染丢了，一直是「只写不画」的死状态。现在补上，画在实体头顶。
        // 位置刻意抬高到 -radius-34：避开战队成员的「己」标记（在 -radius-14）。
        const drawSpeechBubble = (e: Entity) => {
            const bubble = e.speechBubble;
            if (!bubble || bubble.timer <= 0 || !bubble.text) return;
            ctx.save();
            ctx.translate(e.x, e.y);
            const bob = Math.sin(visualTime * 0.12) * 3;
            const by = -e.radius - 34 + bob;
            ctx.font = 'bold 14px sans-serif';
            const w = ctx.measureText(bubble.text).width + 20;
            const h = 26;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.beginPath();
            ctx.roundRect(-w / 2, by - h / 2, w, h, 13);
            ctx.fill();
            // 小尾巴
            ctx.beginPath();
            ctx.moveTo(-5, by + h / 2 - 1);
            ctx.lineTo(5, by + h / 2 - 1);
            ctx.lineTo(0, by + h / 2 + 8);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = bubble.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-w / 2, by - h / 2, w, h, 13);
            ctx.stroke();
            ctx.fillStyle = bubble.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(bubble.text, 0, by);
            ctx.restore();
        };
        visibleEntities.forEach(drawSpeechBubble);
        drawSpeechBubble(player);

        // 心境徽章（「AI 鱼随机状态」）：非「悠闲」的鱼头顶挂一个小 emoji。
        // 没有徽章的话，随机状态只体现在运动上 —— 玩家看不出哪条在打盹、哪条已经发疯。
        // 位置刻意偏**左上**：头顶正中让给对话气泡，正上方让给战队成员的「己」标记。
        // 只画玩家 900px 内的鱼，远处一律不画 —— 满屏 40 个 emoji 只会变成噪音。
        const MOOD_BADGE_RANGE_SQ = 900 * 900;
        const drawMoodBadge = (e: Entity) => {
            const mood = getMood(e.moodId);
            if (!mood.badge) return; // 悠闲不打扰视线
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            if (dx * dx + dy * dy > MOOD_BADGE_RANGE_SQ) return;
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const bob = Math.sin(visualTime * 0.08 + e.animOffset) * 2;
            ctx.fillText(mood.badge, e.x - e.radius * 0.95, e.y - e.radius * 0.8 + bob);
            ctx.restore();
        };
        visibleEntities.forEach(drawMoodBadge);

        // 绘制传送门（最上层）
        gameState.portals.forEach(portal => {
            if (!isOnScreen(portal, camera, canvas.width, canvas.height)) return;
            drawPortal(ctx, portal, visualTime);
        });

        // 塘际传送过场闪屏（「多鱼塘」阶段 2a）：全屏染一次目标塘的颜色
        const flash = gameState.screenFlash;
        if (flash && flash.timer > 0) {
            const alpha = Math.min(0.8, flash.timer / 40) * 0.8;
            ctx.fillStyle = `rgba(${hexToRgb(flash.color)}, ${alpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

    };

    const renderer = new CanvasGameRenderer(drawFrame);
    void renderer.init(canvas, createViewport());
    const resize = () => renderer.resize(createViewport());
    window.addEventListener('resize', resize);

    const render = (now: number) => {
        renderer.render(gameStateRef.current, now);
        animationFrameId = requestAnimationFrame(render);
    };

    // 性能探针入口（仅 DEV）：同步连画一帧，用来把渲染成本从 rAF 间隔里摘出来
    if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__FISH_DRAW_FRAME__ = () => renderer.render(gameStateRef.current, performance.now());
        (window as unknown as Record<string, unknown>).__FISH_RENDER_METRICS__ = () => renderer.metrics();
    }

    render(performance.now());
    return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(animationFrameId);
        renderer.destroy();
        if (import.meta.env.DEV) {
            delete (window as unknown as Record<string, unknown>).__FISH_DRAW_FRAME__;
            delete (window as unknown as Record<string, unknown>).__FISH_RENDER_METRICS__;
        }
    };
  }, []);

  return <canvas ref={canvasRef} data-renderer="canvas" onMouseMove={(e) => onMouseMove(e.clientX, e.clientY)} onMouseDown={onMouseDown} onMouseUp={onMouseUp} />;
};

export default GameCanvas;
