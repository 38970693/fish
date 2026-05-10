
import React, { useRef, useEffect } from 'react';
// Added GameStatus to imports to fix line 134 reference error
import { GameState, GameStatus, Entity, Particle, CreatureType, Obstacle, PlayerState, PowerUp, Hazard, Projectile, Building, BuildingType, Portal, Cosmetics } from '../types';
import { WORLD_SIZE, GAME_MECHANICS, BOOST_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, PORTAL_CONFIG, TREASURE_CONFIG, AMBUSH_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

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

    // 绘制牙齿 (修复 AI 和 嘴型匹配)
    if (type !== CreatureType.PLANKTON && cosmetics?.teeth && cosmetics.teeth !== 'NORMAL') {
        const tType = cosmetics.teeth;
        ctx.save();
        ctx.fillStyle = tType === 'GOLD' ? '#fbbf24' : (tType === 'DIAMOND' ? '#e0f2fe' : 'white');
        
        const drawTooth = (ang: number, isUpper: boolean) => {
            ctx.save();
            ctx.rotate(ang);
            const tx = radius * 0.88;
            const size = radius * 0.15;
            if (tType === 'SHARP') { ctx.beginPath(); ctx.moveTo(tx, -size/2); ctx.lineTo(tx + size, 0); ctx.lineTo(tx, size/2); ctx.fill(); }
            else { ctx.fillRect(tx, -size/2, size, size); }
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

    // 眼睛
    const eyeX = radius * 0.35; const eyeY = radius * 0.45;
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX, -eyeY, radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeX, eyeY, radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX+radius*0.05, -eyeY, radius*0.1, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeX+radius*0.05, eyeY, radius*0.1, 0, Math.PI*2); ctx.fill();

    ctx.restore();
};

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
        // 深蓝色海洋背景
        ctx.fillStyle = '#0f172a'; // If previously 0f172a, let's make it a deeper, richer blue
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#020617'); // Very dark deep blue
        gradient.addColorStop(1, '#1e3a8a'); // Lighter deep blue at bottom (or vice versa)
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

        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); });
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

        // 绘制子弹
        gameState.projectiles.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = '#22d3ee';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#22d3ee';
            ctx.beginPath();
            ctx.ellipse(0, 0, p.radius * 1.5, p.radius * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        visibleEntities.forEach(e => drawCuteFish(ctx, e, visualTime, false));

        // 绘制偷袭提示（在大鱼背后显示偷袭机会）
        visibleEntities.forEach(e => drawAmbushIndicator(ctx, e, player.x, player.y, player.level, visualTime));
        
        // 如果玩家使用了诱惑技能，绘制成肉块，如果是机甲，绘制成机甲
        if (player.isMecha) {
            ctx.save();
            ctx.translate(player.x, player.y);
            ctx.rotate(player.angle);
            
            // 机甲身体
            ctx.fillStyle = '#64748b'; // Slate gray armor
            ctx.beginPath();
            ctx.roundRect(-player.radius, -player.radius * 0.8, player.radius * 2, player.radius * 1.6, 10);
            ctx.fill();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // 能量核心
            ctx.fillStyle = '#38bdf8';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#38bdf8';
            ctx.beginPath(); 
            ctx.arc(0, 0, player.radius * 0.4, 0, Math.PI * 2); 
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // 炮管
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(player.radius * 0.5, -player.radius * 0.9, player.radius * 1.2, player.radius * 0.4);
            ctx.fillRect(player.radius * 0.5, player.radius * 0.5, player.radius * 1.2, player.radius * 0.4);
            
            // 驾驶舱
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.arc(player.radius * 0.6, 0, player.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        } else if (player.lureActive) {
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
