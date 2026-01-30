
import React, { useRef, useEffect } from 'react';
import { GameState, Entity, Particle, CreatureType, Obstacle, PlayerState, PowerUp, Hazard, Projectile, Building, BuildingType, Portal, Cosmetics } from '../types';
import { WORLD_SIZE, GAME_MECHANICS, BOOST_CONFIG, BIOME_CONFIGS, BUILDING_CONFIGS, MAP_SHAPE_CONFIG, PORTAL_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

// --- EXPORTED DRAW FUNCTION FOR PREVIEW ---
export const drawCuteFish = (ctx: CanvasRenderingContext2D, entity: Entity, visualTime: number, isPlayer: boolean) => {
    const { type, radius, animOffset, renderScale, happyTimer, fearTimer, isHidden, camoActive, speedBoostTimer, cosmetics } = entity;
    
    if (!Number.isFinite(radius) || radius <= 0) return;

    const safeScale = Number.isFinite(renderScale) ? renderScale : 1;
    const isScared = fearTimer && fearTimer > 0;

    // --- 传送后残影效果 ---
    if (isPlayer && speedBoostTimer && speedBoostTimer > 60) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        const trailCount = 4;
        for(let i=1; i<=trailCount; i++) {
            ctx.save();
            ctx.translate(entity.x - entity.vx * i * 3, entity.y - entity.vy * i * 3);
            ctx.rotate(entity.angle);
            ctx.scale(safeScale * (1 - i*0.15), safeScale * (1 - i*0.15));
            ctx.fillStyle = `hsla(${(visualTime * 15 + i * 40) % 360}, 100%, 75%, 0.6)`;
            ctx.beginPath();
            ctx.ellipse(0, 0, radius, radius * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    ctx.save();
    ctx.translate(entity.x, entity.y);
    
    if (isScared) {
        const shake = Math.sin(visualTime * 2) * 3;
        ctx.translate(shake, shake);
    }
    
    ctx.scale(safeScale, safeScale);
    
    // Player indicator (Halo)
    if (isPlayer) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = `rgba(34, 211, 238, ${0.4 + Math.sin(visualTime * 0.1) * 0.3})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#22d3ee';
        ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    if (entity.evolutionVisualTimer && entity.evolutionVisualTimer > 0) {
        ctx.save();
        const alpha = Math.min(1, entity.evolutionVisualTimer / 30); 
        ctx.rotate(visualTime * 0.05); 
        ctx.globalAlpha = 0.6 * alpha;
        ctx.fillStyle = '#fbbf24'; 
        for(let i=0; i<8; i++) {
             ctx.beginPath();
             ctx.rotate(Math.PI / 4);
             ctx.moveTo(0, 0);
             ctx.lineTo(radius * 3, -radius * 0.5);
             ctx.lineTo(radius * 3, radius * 0.5);
             ctx.fill();
        }
        ctx.restore();
    }
    
    ctx.rotate(entity.angle);

    // Visibility logic
    if (isHidden) ctx.globalAlpha = isPlayer ? 0.4 : 0.2;
    if (camoActive) {
        ctx.fillStyle = isPlayer ? 'rgba(100, 116, 139, 0.8)' : 'rgba(100, 116, 139, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        if (isPlayer) {
            ctx.strokeStyle = 'white';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
        }
        ctx.restore();
        return; 
    }

    // --- BODY DRAWING WITH COSMETICS ---
    
    // Determine Base Fill (Color or Gradient)
    let bodyFill: string | CanvasGradient = entity.config.color;
    
    if (isPlayer && cosmetics && cosmetics.skinColor !== 'DEFAULT') {
        const skin = cosmetics.skinColor;
        
        if (skin.startsWith('GRADIENT_')) {
            // Create Gradient based on ID
            const grad = ctx.createLinearGradient(-radius, -radius * 0.5, radius, radius * 0.5);
            
            if (skin === 'GRADIENT_SUNSET') {
                grad.addColorStop(0, '#6d28d9'); // Purple
                grad.addColorStop(0.5, '#db2777'); // Pink
                grad.addColorStop(1, '#f59e0b'); // Orange
            } else if (skin === 'GRADIENT_OCEAN') {
                grad.addColorStop(0, '#1e3a8a'); // Dark Blue
                grad.addColorStop(0.5, '#06b6d4'); // Cyan
                grad.addColorStop(1, '#a5f3fc'); // Light Blue
            } else if (skin === 'GRADIENT_TOXIC') {
                grad.addColorStop(0, '#14532d'); // Dark Green
                grad.addColorStop(0.5, '#4ade80'); // Green
                grad.addColorStop(1, '#facc15'); // Yellow
            } else if (skin === 'GRADIENT_RAINBOW') {
                grad.addColorStop(0, '#ef4444');
                grad.addColorStop(0.2, '#f59e0b');
                grad.addColorStop(0.4, '#eab308');
                grad.addColorStop(0.6, '#22d3ee');
                grad.addColorStop(0.8, '#3b82f6');
                grad.addColorStop(1, '#a855f7');
            } else if (skin === 'GRADIENT_GOLD') {
                grad.addColorStop(0, '#78350f');
                grad.addColorStop(0.3, '#fcd34d');
                grad.addColorStop(0.6, '#fff7ed');
                grad.addColorStop(1, '#fbbf24');
            } else if (skin === 'GRADIENT_CANDY') {
                grad.addColorStop(0, '#f472b6'); // Pink
                grad.addColorStop(1, '#60a5fa'); // Blue
            } else if (skin === 'GRADIENT_AURORA') {
                grad.addColorStop(0, '#0f172a');
                grad.addColorStop(0.5, '#22c55e');
                grad.addColorStop(1, '#3b82f6');
            } else if (skin === 'GRADIENT_FIRE') {
                grad.addColorStop(0, '#7f1d1d');
                grad.addColorStop(0.4, '#ef4444');
                grad.addColorStop(1, '#fcd34d');
            }
            bodyFill = grad;
        } else {
            bodyFill = skin;
        }
    }

    // Define Body Path function for reuse (Clips)
    const defineBodyPath = () => {
         ctx.beginPath();
         if (type === CreatureType.PLANKTON) {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
         } else {
            const wobble = Math.sin(visualTime * 0.2 + animOffset) * 0.05;
            const biteSpeed = 0.25;
            const mouthGap = 0.1 + Math.abs(Math.sin(visualTime * biteSpeed + animOffset)) * 0.3; 
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, mouthGap, -mouthGap); 
         }
         ctx.closePath();
    };

    // 1. Tail (Generic)
    if (type !== CreatureType.PLANKTON) {
        ctx.save();
        ctx.translate(-radius * 0.6, 0);
        const tailWag = Math.sin(visualTime * 0.4 + animOffset) * 0.3;
        ctx.rotate(tailWag);
        ctx.fillStyle = bodyFill;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-radius * 0.8, -radius * 0.6);
        ctx.lineTo(-radius * 0.8, radius * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Tail Pattern
        if (isPlayer && cosmetics && cosmetics.pattern !== 'NONE') {
             ctx.clip();
             ctx.fillStyle = 'rgba(255,255,255,0.2)';
             if (cosmetics.pattern === 'STRIPES') for(let i=-2; i<2; i++) ctx.fillRect(-radius/2 + i*10, -radius, 5, radius*2);
             if (cosmetics.pattern === 'ZEBRA') for(let i=-2; i<2; i++) { ctx.moveTo(-10, -10); ctx.lineTo(10,10); ctx.stroke(); }
        }
        ctx.restore();
    }

    if (type === CreatureType.PLANKTON) {
        ctx.fillStyle = bodyFill;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else {
        // --- PREDATOR FISH RENDERING ---
        const biteSpeed = 0.25;
        const mouthGap = 0.1 + Math.abs(Math.sin(visualTime * biteSpeed + animOffset)) * 0.3; 

        // 1. Mouth Interior
        ctx.fillStyle = cosmetics?.pattern === 'LAVA' ? '#7f1d1d' : '#450a0a'; 
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius * 0.95, -mouthGap, mouthGap);
        ctx.fill();

        // 2. Main Body
        ctx.save(); // Save for clipping
        defineBodyPath();
        
        ctx.fillStyle = bodyFill;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.fill();
        
        // --- COSMETIC PATTERNS (Updated with 10 New Types) ---
        if (isPlayer && cosmetics && cosmetics.pattern !== 'NONE') {
            ctx.save();
            ctx.clip(); // Clip pattern to body
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; 
            
            const seed = parseInt(entity.id.substring(0, 4), 36);

            switch(cosmetics.pattern) {
                case 'STRIPES':
                    for (let i = -radius; i < radius; i += 20) {
                        ctx.beginPath(); ctx.moveTo(i, -radius); ctx.lineTo(i - 10, radius); ctx.lineTo(i + 5, radius); ctx.lineTo(i + 15, -radius); ctx.fill();
                    }
                    break;
                case 'SPOTS':
                    for (let i = 0; i < 8; i++) {
                        const px = -radius + (Math.sin(seed + i) * 0.5 + 0.5) * 2 * radius;
                        const py = -radius + (Math.cos(seed + i * 2) * 0.5 + 0.5) * 2 * radius;
                        ctx.beginPath(); ctx.arc(px, py, radius * 0.2, 0, Math.PI*2); ctx.fill();
                    }
                    break;
                case 'TIGER':
                    for (let i = -radius; i < radius; i += 25) {
                        ctx.beginPath(); ctx.moveTo(i, -radius*0.8); ctx.quadraticCurveTo(i+10, 0, i, radius*0.8); ctx.lineTo(i+8, radius*0.8); ctx.quadraticCurveTo(i+18, 0, i+8, -radius*0.8); ctx.fill();
                    }
                    break;
                case 'DOTS':
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    for(let x=-radius; x<radius; x+=radius/4) {
                        for(let y=-radius; y<radius; y+=radius/4) {
                            ctx.beginPath(); ctx.arc(x, y, radius/12, 0, Math.PI*2); ctx.fill();
                        }
                    }
                    break;
                case 'CAMO':
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    for(let i=0; i<6; i++) {
                        const cx = (Math.sin(i*123) * 0.7) * radius;
                        const cy = (Math.cos(i*321) * 0.7) * radius;
                        ctx.beginPath(); ctx.ellipse(cx, cy, radius/2, radius/3, i, 0, Math.PI*2); ctx.fill();
                    }
                    break;
                case 'ZEBRA':
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    for(let i=-radius; i<radius; i+=15) {
                        ctx.beginPath(); ctx.moveTo(i, -radius); ctx.lineTo(i+5, -radius); ctx.lineTo(i-5, radius); ctx.lineTo(i-10, radius); ctx.fill();
                    }
                    break;
                case 'LEOPARD':
                    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
                    for(let i=0; i<10; i++) {
                         const cx = (Math.sin(i*55) * 0.7) * radius;
                         const cy = (Math.cos(i*88) * 0.7) * radius;
                         ctx.beginPath(); ctx.arc(cx, cy, radius/8, 0, Math.PI*1.5); ctx.stroke();
                    }
                    break;
                case 'HEART':
                    ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
                    const size = radius * 0.4;
                    ctx.beginPath(); ctx.moveTo(0, size*0.3); ctx.bezierCurveTo(size/2, -size/2, size, size/3, 0, size); ctx.bezierCurveTo(-size, size/3, -size/2, -size/2, 0, size*0.3); ctx.fill();
                    break;
                case 'STAR':
                    ctx.fillStyle = 'rgba(255, 255, 100, 0.7)';
                    const cx = -radius*0.2; const cy = 0; const spikes = 5; const outer = radius * 0.4; const inner = radius * 0.2;
                    ctx.beginPath();
                    for(let i=0; i<spikes*2; i++){
                        const r = (i%2 === 0) ? outer : inner; const a = (Math.PI / spikes) * i; ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
                    }
                    ctx.fill();
                    break;
                case 'CIRCUIT':
                    ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.shadowBlur = 5; ctx.shadowColor = '#00ff00';
                    ctx.beginPath(); ctx.moveTo(-radius*0.5, -radius*0.5); ctx.lineTo(0, -radius*0.5); ctx.lineTo(0, radius*0.5); ctx.lineTo(radius*0.5, radius*0.5); ctx.stroke();
                    ctx.beginPath(); ctx.arc(-radius*0.5, -radius*0.5, 3, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                    break;
                case 'LAVA':
                    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.shadowColor = '#fcd34d'; ctx.shadowBlur = 10;
                    for(let i=0; i<5; i++) {
                        ctx.beginPath(); ctx.moveTo((Math.random()-0.5)*radius, (Math.random()-0.5)*radius); ctx.lineTo((Math.random()-0.5)*radius, (Math.random()-0.5)*radius); ctx.stroke();
                    }
                    ctx.shadowBlur = 0;
                    break;
                case 'KOI':
                    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(-radius*0.3, -radius*0.3, radius*0.3, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(radius*0.2, radius*0.4, radius*0.15, 0, Math.PI*2); ctx.fill();
                    break;
                case 'SKELETON':
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(-radius*0.8, 0); ctx.lineTo(radius*0.5, 0); ctx.stroke();
                    for(let i=-radius*0.5; i<radius*0.4; i+=radius/5) {
                        ctx.beginPath(); ctx.moveTo(i, -radius*0.4); ctx.lineTo(i, radius*0.4); ctx.stroke();
                    }
                    break;
                // NEW PATTERNS
                case 'LIGHTNING':
                     ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3; ctx.shadowColor='yellow'; ctx.shadowBlur=5;
                     ctx.beginPath(); ctx.moveTo(-radius*0.8, -radius*0.4); ctx.lineTo(-radius*0.2, 0); ctx.lineTo(-radius*0.4, 0); ctx.lineTo(radius*0.2, radius*0.5); ctx.stroke(); ctx.shadowBlur=0;
                     break;
                case 'CHECKER':
                     ctx.fillStyle = 'rgba(0,0,0,0.4)'; const cs = radius/4;
                     for(let x=-radius; x<radius; x+=cs) for(let y=-radius; y<radius; y+=cs) if((Math.floor(x/cs)+Math.floor(y/cs))%2===0) ctx.fillRect(x,y,cs,cs);
                     break;
                case 'CLOUD':
                     ctx.fillStyle = 'rgba(255,255,255,0.7)';
                     for(let i=0; i<5; i++) { ctx.beginPath(); ctx.arc((Math.random()-0.5)*radius*1.2, (Math.random()-0.5)*radius*0.8, radius*0.25, 0, Math.PI*2); ctx.fill(); }
                     break;
                case 'VINES':
                     ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3;
                     ctx.beginPath(); ctx.moveTo(-radius, 0); 
                     for(let i=-radius; i<radius; i+=10) ctx.lineTo(i, Math.sin(i/20)*radius*0.4);
                     ctx.stroke();
                     break;
                case 'TARGET':
                     ctx.strokeStyle = 'rgba(255,0,0,0.6)'; ctx.lineWidth = 4;
                     ctx.beginPath(); ctx.arc(0,0,radius*0.6,0,Math.PI*2); ctx.stroke();
                     ctx.beginPath(); ctx.arc(0,0,radius*0.3,0,Math.PI*2); ctx.stroke();
                     break;
                case 'GALAXY':
                     ctx.fillStyle = 'white';
                     for(let i=0; i<20; i++) { ctx.beginPath(); ctx.arc((Math.random()-0.5)*radius*1.8, (Math.random()-0.5)*radius*1.8, Math.random()*2+1, 0, Math.PI*2); ctx.fill(); }
                     break;
                case 'SMILEY':
                     ctx.fillStyle = '#1e293b';
                     ctx.beginPath(); ctx.arc(-radius*0.2, -radius*0.2, 5, 0, Math.PI*2); ctx.fill();
                     ctx.beginPath(); ctx.arc(radius*0.2, -radius*0.2, 5, 0, Math.PI*2); ctx.fill();
                     ctx.beginPath(); ctx.arc(0, 0, radius*0.4, 0, Math.PI); ctx.stroke();
                     break;
                case 'FIREY':
                     ctx.fillStyle = '#ef4444';
                     ctx.beginPath(); ctx.moveTo(-radius, radius*0.5); 
                     for(let x=-radius; x<radius; x+=10) ctx.lineTo(x, radius*0.5 - Math.random()*radius*0.4);
                     ctx.lineTo(radius, radius*0.5); ctx.fill();
                     break;
                case 'RUNE':
                     ctx.fillStyle = '#06b6d4'; ctx.font=`bold ${radius*0.4}px monospace`; ctx.textAlign='center'; ctx.fillText('ᚨᚺ', 0, 0);
                     break;
                case 'CANDY':
                     ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 5;
                     for(let x=-radius; x<radius; x+=20) { ctx.beginPath(); ctx.moveTo(x, -radius); ctx.lineTo(x-20, radius); ctx.stroke(); }
                     break;
            }

            ctx.restore();
        }

        // --- COSMETIC SCALES (Strengthened & New Types) ---
        if (isPlayer && cosmetics && cosmetics.scaleType !== 'NONE') {
            ctx.save();
            ctx.clip();
            
            // Stronger visual styles
            ctx.lineWidth = 2; // Thicker lines
            
            switch(cosmetics.scaleType) {
                case 'SHINY':
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                    for (let y = -radius; y < radius; y += 15) {
                        const offset = (y % 30 === 0) ? 0 : 7.5;
                        for (let x = -radius; x < radius; x += 15) {
                            ctx.beginPath(); ctx.arc(x + offset, y, 7.5, 0, Math.PI); ctx.stroke();
                        }
                    }
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // More visible gloss
                    ctx.beginPath(); ctx.ellipse(-radius*0.2, -radius*0.2, radius*0.4, radius*0.2, -0.5, 0, Math.PI*2); ctx.fill();
                    break;
                case 'DRAGON':
                     ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Darker
                     ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                     for (let y = -radius; y < radius; y += 16) {
                         const offset = (y % 32 === 0) ? 0 : 8;
                         for (let x = -radius; x < radius; x += 16) {
                             ctx.beginPath();
                             ctx.moveTo(x + offset, y);
                             ctx.lineTo(x + offset + 8, y + 8);
                             ctx.lineTo(x + offset, y + 16);
                             ctx.lineTo(x + offset - 8, y + 8);
                             ctx.fill(); ctx.stroke();
                         }
                     }
                     break;
                case 'STONE':
                     ctx.fillStyle = 'rgba(0,0,0,0.3)';
                     ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 2;
                     for(let i=0; i<15; i++) {
                         const rx = (Math.random()-0.5)*2*radius;
                         const ry = (Math.random()-0.5)*2*radius;
                         const rs = Math.random()*radius*0.3 + 5;
                         ctx.fillRect(rx, ry, rs, rs);
                     }
                     ctx.shadowBlur = 0;
                     break;
                case 'FEATHER':
                    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                    for(let x=-radius; x<radius; x+=12) {
                        for(let y=-radius; y<radius; y+=12) {
                            ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI); ctx.stroke();
                        }
                    }
                    break;
                case 'MECHANICAL':
                    ctx.fillStyle = '#94a3b8'; 
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 2;
                    for(let i=0; i<4; i++) {
                        const bx = (i/3 - 0.5) * radius * 1.5;
                        ctx.beginPath(); ctx.arc(bx, 0, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.arc(bx, radius*0.4, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.arc(bx, -radius*0.4, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                    }
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.strokeRect(-radius*0.6, -radius*0.5, radius*1.2, radius);
                    break;
                case 'GLOW':
                    ctx.shadowColor = 'white';
                    ctx.shadowBlur = 15;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3;
                    ctx.stroke(); // Outline body
                    ctx.shadowBlur = 0;
                    break;
                case 'MOSAIC':
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    const s = 10;
                    for(let x=-radius; x<radius; x+=s) {
                        for(let y=-radius; y<radius; y+=s) {
                            if ((x+y)% (s*2) === 0) ctx.fillRect(x,y,s,s);
                        }
                    }
                    break;
                case 'CRYSTAL':
                    ctx.fillStyle = 'rgba(200,255,255,0.6)';
                    ctx.beginPath(); ctx.moveTo(0, -radius*0.6); ctx.lineTo(radius*0.4, 0); ctx.lineTo(0, radius*0.6); ctx.lineTo(-radius*0.4, 0); ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.stroke();
                    break;
                case 'VOID':
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.beginPath(); ctx.arc(0,0,radius*0.7,0,Math.PI*2); ctx.fill();
                    break;
                case 'PIXEL':
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    const ps = 6;
                    for(let i=0; i<30; i++) {
                        ctx.fillRect((Math.random()-0.5)*radius*1.6, (Math.random()-0.5)*radius*1.6, ps, ps);
                    }
                    break;
                // NEW SCALES
                case 'ARMOR':
                    ctx.fillStyle = 'rgba(100,116,139,0.7)';
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath(); ctx.rect(-radius*0.8, -radius*0.5, radius*1.6, radius*0.3); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.rect(-radius*0.7, -radius*0.1, radius*1.4, radius*0.3); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.rect(-radius*0.6, radius*0.3, radius*1.2, radius*0.3); ctx.fill(); ctx.stroke();
                    break;
                case 'DIAMOND_PLATE':
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                    const ds = 12;
                    for(let x=-radius; x<radius; x+=ds) for(let y=-radius; y<radius; y+=ds) {
                        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+ds/2,y+ds/2); ctx.stroke();
                    }
                    break;
                case 'SLIME':
                    ctx.fillStyle = 'rgba(34,197,94,0.4)';
                    for(let i=0; i<6; i++) {
                        ctx.beginPath(); ctx.arc((Math.random()-0.5)*radius, -radius*0.4 + Math.random()*radius, radius*0.2, 0, Math.PI*2); ctx.fill();
                    }
                    break;
                case 'BIO_HAZARD':
                    ctx.fillStyle = '#facc15';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(0,0,radius*0.3,0,Math.PI*2); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, -radius*0.3); ctx.lineTo(0, -radius*0.6); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(radius*0.2, radius*0.2); ctx.lineTo(radius*0.5, radius*0.5); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-radius*0.2, radius*0.2); ctx.lineTo(-radius*0.5, radius*0.5); ctx.stroke();
                    break;
            }

            ctx.restore();
        }

        ctx.stroke(); // Stroke body path
        ctx.restore(); // End clipping

        // 3. Teeth Logic (Cosmetics)
        let toothCount = Math.max(3, Math.floor(radius / 8));
        const toothSize = (radius * 0.8) / toothCount;
        
        const teethType = (isPlayer && cosmetics) ? cosmetics.teeth : 'NORMAL';

        // Set Teeth Color
        if (teethType === 'GOLD') ctx.fillStyle = '#fcd34d';
        else if (teethType === 'VAMPIRE' || teethType === 'SHARP' || teethType === 'NORMAL') ctx.fillStyle = '#ffffff';
        else if (teethType === 'BRACES') ctx.fillStyle = '#d1d5db';
        else if (teethType === 'DIAMOND') ctx.fillStyle = '#06b6d4';
        else if (teethType === 'RAINBOW') ctx.fillStyle = `hsl(${(visualTime * 10) % 360}, 100%, 70%)`;
        else ctx.fillStyle = '#ffffff';
        
        // --- DRAW TEETH (Helper) ---
        // PROTRUSION UPDATE: Increased Y multiplier from ~0.7 to ~0.9/1.0
        const drawToothRow = (isUpper: boolean) => {
             ctx.save();
             ctx.rotate(isUpper ? -mouthGap : mouthGap);
             ctx.beginPath();
             
             // Base stick-out factor
             const protrusion = 1.0; 
             
             if (teethType === 'NORMAL' || teethType === 'GOLD' || teethType === 'BRACES' || teethType === 'DIAMOND' || teethType === 'RAINBOW') {
                for(let i=0; i<toothCount; i++) {
                    const startX = radius * 0.2 + i * toothSize;
                    ctx.moveTo(startX, 0);
                    ctx.lineTo(startX + toothSize/2, (isUpper ? 1 : -1) * toothSize * 0.9 * protrusion);
                    ctx.lineTo(startX + toothSize, 0);
                }
            } else if (teethType === 'SHARP' || teethType === 'SABER') {
                const sharpCount = toothCount * 1.5;
                const sharpSize = toothSize * 0.66;
                const lenMult = teethType === 'SABER' && isUpper ? 3.5 : 1.5;
                for(let i=0; i<sharpCount; i++) {
                    const startX = radius * 0.15 + i * sharpSize;
                    ctx.moveTo(startX, 0);
                    ctx.lineTo(startX + sharpSize/2, (isUpper ? 1 : -1) * sharpSize * lenMult * protrusion);
                    ctx.lineTo(startX + sharpSize, 0);
                }
            } else if (teethType === 'VAMPIRE') {
                if (isUpper) {
                    const f1 = radius * 0.4;
                    const f2 = radius * 0.7;
                    const fW = radius * 0.15;
                    const fH = radius * 0.6; // Longer fangs
                    ctx.moveTo(f1, 0); ctx.lineTo(f1+fW/2, fH); ctx.lineTo(f1+fW, 0);
                    ctx.moveTo(f2, 0); ctx.lineTo(f2+fW/2, fH); ctx.lineTo(f2+fW, 0);
                } else {
                    for(let i=0; i<toothCount; i++) {
                        const startX = radius * 0.25 + i * toothSize;
                        ctx.moveTo(startX, 0); ctx.lineTo(startX + toothSize/2, -toothSize * 0.4); ctx.lineTo(startX + toothSize, 0);
                    }
                }
            } else if (teethType === 'CURVED') {
                for(let i=0; i<toothCount; i++) {
                    const startX = radius * 0.2 + i * toothSize;
                    ctx.moveTo(startX, 0);
                    // Curve backwards
                    ctx.quadraticCurveTo(startX, (isUpper ? 1 : -1) * toothSize * 1.2, startX - toothSize*0.5, (isUpper ? 1 : -1) * toothSize * 1.0);
                    ctx.lineTo(startX + toothSize*0.8, 0);
                }
            } else if (teethType === 'DOUBLE_ROW') {
                 for(let r=0; r<2; r++) {
                    for(let i=0; i<toothCount; i++) {
                        const startX = radius * (0.2 + r*0.05) + i * toothSize;
                        ctx.moveTo(startX, 0);
                        ctx.lineTo(startX + toothSize/2, (isUpper ? 1 : -1) * toothSize * 0.8);
                        ctx.lineTo(startX + toothSize, 0);
                    }
                 }
            } else if (teethType === 'GAPPED') {
                for(let i=0; i<toothCount; i++) {
                    if (i % 2 !== 0) continue; // Skip every other
                    const startX = radius * 0.2 + i * toothSize;
                    ctx.moveTo(startX, 0);
                    ctx.lineTo(startX + toothSize/2, (isUpper ? 1 : -1) * toothSize * 0.9);
                    ctx.lineTo(startX + toothSize, 0);
                }
            } else if (teethType === 'BUGS') {
                 // Bunny teeth
                 if (isUpper) {
                     ctx.rect(radius*0.8, 0, toothSize, toothSize*1.8);
                     ctx.rect(radius*0.8 + toothSize, 0, toothSize, toothSize*1.8);
                 }
            } else if (teethType === 'BLOCKY') {
                for(let i=0; i<toothCount; i++) {
                    const startX = radius * 0.2 + i * toothSize;
                    ctx.rect(startX, 0, toothSize*0.8, (isUpper ? 1 : -1) * toothSize*0.8);
                }
            }

            ctx.fill();

            // Extras
            if (teethType === 'BRACES') {
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(radius * 0.2, (isUpper ? 1 : -1) * toothSize * 0.45);
                ctx.lineTo(radius * 0.9, (isUpper ? 1 : -1) * toothSize * 0.45);
                ctx.stroke();
                // Brackets
                ctx.fillStyle = '#94a3b8';
                for(let i=0; i<toothCount; i++) {
                     const cx = radius * 0.2 + i * toothSize + toothSize/2;
                     const cy = (isUpper ? 1 : -1) * toothSize * 0.45;
                     ctx.fillRect(cx-2, cy-2, 4, 4);
                }
            }

            ctx.restore();
        };

        drawToothRow(true);
        drawToothRow(false);

        // 4. Eyes
        const eyeX = radius * 0.2;
        const eyeY = radius * 0.45;
        const eyeSize = radius * 0.22;
        
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(eyeX, -eyeY, eyeSize, 0, Math.PI * 2);
        ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(eyeX + eyeSize*0.3, -eyeY, eyeSize * 0.4, 0, Math.PI * 2);
        ctx.arc(eyeX + eyeSize*0.3, eyeY, eyeSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        if (entity.config.behavior === 'AGGRESSIVE' || entity.config.behavior === 'BOSS') {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = radius * 0.05;
            ctx.beginPath(); ctx.moveTo(eyeX - eyeSize, -eyeY - eyeSize*0.8); ctx.lineTo(eyeX + eyeSize, -eyeY - eyeSize*0.2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(eyeX - eyeSize, eyeY + eyeSize*0.8); ctx.lineTo(eyeX + eyeSize, eyeY + eyeSize*0.2); ctx.stroke();
        }
    }

    ctx.restore();
};

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  // ... (Keep existing implementation of GameCanvas main component)
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawSpeechBubble = (ctx: CanvasRenderingContext2D, e: Entity | PlayerState) => {
    // ... (Keep existing)
    if (!e.speechBubble) return;
    ctx.save();
    ctx.translate(e.x, e.y - e.radius - 20);
    const text = e.speechBubble.text;
    ctx.font = "bold 18px Arial";
    const m = ctx.measureText(text);
    const w = m.width + 24;
    const h = 36;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = e.speechBubble.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-w/2, -h, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, -h/2);
    ctx.restore();
  };

  const drawPortalVortex = (ctx: CanvasRenderingContext2D, p: Portal, visualTime: number) => {
     // ... (Keep existing)
    ctx.save();
    ctx.translate(p.x, p.y);
    const beaconHeight = 3500;
    const beaconGrad = ctx.createLinearGradient(0, 0, 0, -beaconHeight);
    beaconGrad.addColorStop(0, 'rgba(168, 85, 247, 0.4)'); 
    beaconGrad.addColorStop(0.3, 'rgba(34, 211, 238, 0.1)'); 
    beaconGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beaconGrad;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 1.2, 0);
    ctx.lineTo(p.radius * 1.2, 0);
    ctx.lineTo(p.radius * 2.5, -beaconHeight);
    ctx.lineTo(-p.radius * 2.5, -beaconHeight);
    ctx.fill();
    for(let k=0; k<2; k++) {
        ctx.save();
        ctx.rotate(visualTime * (0.04 + k*0.02) * (k%2 === 0 ? 1 : -1));
        ctx.strokeStyle = k === 0 ? 'rgba(216, 180, 254, 0.8)' : 'rgba(34, 211, 238, 0.8)';
        ctx.setLineDash([20, 15]);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * (1.6 + k*0.3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    const layers = 4;
    for(let i=0; i<layers; i++) {
        ctx.save();
        ctx.rotate(visualTime * (0.03 + i * 0.015) * (i % 2 === 0 ? 1 : -1));
        const scale = 1.2 - (i * 0.25);
        ctx.fillStyle = i === 0 ? 'rgba(126, 34, 206, 0.8)' : (i === 1 ? 'rgba(168, 85, 247, 0.7)' : 'rgba(34, 211, 238, 0.6)');
        ctx.beginPath();
        for(let j=0; j<4; j++) {
            ctx.rotate(Math.PI / 2);
            ctx.ellipse(p.radius * 0.5 * scale, 0, p.radius * 1.2 * scale, p.radius * 0.4 * scale, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
    }
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    const corePulse = (0.95 + Math.sin(visualTime * 0.25) * 0.05); 
    ctx.arc(0, 0, p.radius * 0.65 * corePulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  };
  
  const drawMapBackground = (ctx: CanvasRenderingContext2D) => {
      // ... (Keep existing)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      const steps = 180;
      for(let i=0; i<=steps; i++) {
          const angle = (Math.PI * 2 * i) / steps;
          const r = getMapBoundaryRadius(angle);
          const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * r;
          const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * r;
          if (i===0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      Object.values(BIOME_CONFIGS).forEach(biome => {
             ctx.fillStyle = biome.color;
             ctx.fillRect(biome.xRange[0], biome.yRange[0], biome.xRange[1] - biome.xRange[0], biome.yRange[1] - biome.yRange[0]);
             ctx.strokeStyle = "rgba(255,255,255,0.05)";
             ctx.lineWidth = 2;
             ctx.beginPath();
             for(let gx = biome.xRange[0]; gx < biome.xRange[1]; gx+=400) {
                 ctx.moveTo(gx, biome.yRange[0]); ctx.lineTo(gx, biome.yRange[1]);
             }
             for(let gy = biome.yRange[0]; gy < biome.yRange[1]; gy+=400) {
                 ctx.moveTo(biome.xRange[0], gy); ctx.lineTo(biome.xRange[1], gy);
             }
             ctx.stroke();
             ctx.save();
             ctx.fillStyle = "rgba(255,255,255,0.08)";
             ctx.font = "bold 300px Arial"; 
             ctx.textAlign = "center";
             ctx.textBaseline = "middle";
             const bcx = (biome.xRange[0] + biome.xRange[1]) / 2;
             const bcy = (biome.yRange[0] + biome.yRange[1]) / 2;
             ctx.fillText(biome.name, bcx, bcy);
             ctx.restore();
      });
      ctx.restore();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 12;
      ctx.beginPath();
      for(let i=0; i<=steps; i++) {
          const angle = (Math.PI * 2 * i) / steps;
          const r = getMapBoundaryRadius(angle);
          const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * r;
          const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * r;
          if (i===0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;

    const render = () => {
        try {
            const { player, entities, particles, obstacles, powerUps, hazards, projectiles, portals, buildings, camera } = gameState;
            const visualTime = performance.now() / 16; 

            // Clear absolute screen
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#020617'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // World Coordinate Setup
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(camera.zoom, camera.zoom);
            ctx.translate(-camera.x, -camera.y);

            // 1. Background
            drawMapBackground(ctx);

            // 2. Structures & Hazards (Lower Layer)
            if (hazards) {
                hazards.forEach(h => {
                    ctx.save();
                    ctx.translate(h.x, h.y);
                    if (h.stage === 'WARNING') {
                        const pulse = Math.sin(visualTime * 0.2) * 0.2 + 0.8;
                        ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + Math.sin(visualTime * 0.3) * 0.3})`;
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(0, 0, h.radius * pulse, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
                        ctx.beginPath();
                        ctx.arc(0, 0, h.radius * (h.timer / 120), 0, Math.PI * 2);
                        ctx.fill();
                    } else if (h.stage === 'STRIKE') {
                        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius);
                        grad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
                        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                });
            }

            if (buildings) buildings.forEach(b => {
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.fillStyle = BUILDING_CONFIGS[b.type].color;
                ctx.beginPath(); ctx.arc(0, 0, b.radius/2, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            });

            obstacles.forEach(obs => {
                ctx.fillStyle = obs.type === 'SEAWEED' ? '#4d7c0f' : '#475569';
                ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI*2); ctx.fill();
            });

            // 3. Dynamic Objects
            powerUps.forEach(p => {
                ctx.fillStyle = p.type === 'SPEED' ? 'yellow' : 'cyan';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            });

            particles.forEach(p => {
                 ctx.globalAlpha = p.life;
                 ctx.fillStyle = p.color;
                 ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                 ctx.globalAlpha = 1;
            });

            // 4. Entities
            entities.forEach(e => {
                drawCuteFish(ctx, e, visualTime, false);
            });

            // 5. PLAYER
            drawCuteFish(ctx, player, visualTime, true);

            // 6. PORTALS
            if (portals) {
                portals.forEach(p => drawPortalVortex(ctx, p, visualTime));
            }

            // 7. SPEECH BUBBLES
            entities.forEach(e => {
                if (e.speechBubble) drawSpeechBubble(ctx, e);
            });
            if (player.speechBubble) drawSpeechBubble(ctx, player);

        } catch (e) {
            console.error("Render loop error:", e);
        }
        animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(animationFrameId);
    };
  }, [gameState]);

  return (
    <canvas 
       ref={canvasRef}
       className="w-full h-full block bg-slate-950"
       onMouseMove={(e) => onMouseMove(e.clientX, e.clientY)}
       onMouseDown={onMouseDown}
       onMouseUp={onMouseUp}
    />
  );
};

export default GameCanvas;
