
import React, { useRef, useEffect } from 'react';
// Added GameStatus to imports to fix line 134 reference error
import { GameState, GameStatus, Entity, Particle, CreatureType, Obstacle, PlayerState, PowerUp, Hazard, Projectile, Building, BuildingType, Portal, Cosmetics } from '../types';
import { WORLD_SIZE, GAME_MECHANICS, BOOST_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, PORTAL_CONFIG, TREASURE_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

export const drawCuteFish = (ctx: CanvasRenderingContext2D, entity: Entity, visualTime: number, isPlayer: boolean) => {
    const { type, radius, animOffset, renderScale, happyTimer, fearTimer, isHidden, camoActive, speedBoostTimer, cosmetics } = entity;
    
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
    
    // 玩家光环
    if (isPlayer) {
        ctx.beginPath(); ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 + Math.sin(visualTime*0.1)*0.2})`; ctx.lineWidth = 3; ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    
    ctx.rotate(entity.angle);

    // 核心绘制逻辑
    const biteSpeed = isPlayer && (entity as any).boost?.active ? 0.4 : 0.15;
    const mouthGap = Math.abs(Math.sin(visualTime * biteSpeed + animOffset)) * 0.55 + 0.05;
    const mType = cosmetics?.mouthType || 'TRIANGLE';
    const bodyFill = cosmetics?.skinColor === 'DEFAULT' ? entity.config.color : cosmetics?.skinColor || entity.config.color;

    const defineBodyPath = () => {
        ctx.beginPath();
        if (type === CreatureType.PLANKTON) { ctx.arc(0, 0, radius, 0, Math.PI * 2); }
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
    ctx.save(); defineBodyPath(); ctx.fillStyle = bodyFill; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();

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
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);

        // 竞技场光圈 (仅战斗模式)
        // Correct fix: Import GameStatus from types to fix the reference error.
        if (status === GameStatus.BATTLE_TEST) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineWidth = 10; ctx.setLineDash([20, 20]);
            ctx.arc(MAP_SHAPE_CONFIG.CENTER_X, MAP_SHAPE_CONFIG.CENTER_Y, 800, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        }

        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); });
        ctx.globalAlpha = 1;
        entities.forEach(e => drawCuteFish(ctx, e, visualTime, false));
        drawCuteFish(ctx, player, visualTime, true);

        animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
  }, [gameState]);

  return <canvas ref={canvasRef} onMouseMove={(e) => onMouseMove(e.clientX, e.clientY)} onMouseDown={onMouseDown} onMouseUp={onMouseUp} />;
};

export default GameCanvas;
