
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

    // --- MASCOT RENDERING ---
    if (type === CreatureType.MASCOT) {
        ctx.save();
        ctx.translate(entity.x, entity.y);
        const breathe = Math.sin(visualTime * 0.1) * 0.05;
        // Mascot stands vertically
        ctx.scale(1 + breathe, 1 - breathe);

        // 1. Body (S-Shape) - Vertical
        ctx.fillStyle = '#f59e0b'; // Gold
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        // Head area
        ctx.arc(0, -radius * 0.6, radius * 0.5, Math.PI * 0.8, Math.PI * 2.2); 
        // Chest/Belly (Puffed out like a suit)
        ctx.bezierCurveTo(radius * 0.8, -radius * 0.2, radius * 0.8, radius * 0.6, 0, radius * 0.8);
        // Tail curl
        ctx.bezierCurveTo(-radius * 0.5, radius * 1.2, radius * 0.5, radius * 1.5, 0, radius * 1.8);
        // Back
        ctx.bezierCurveTo(-radius * 0.6, radius * 0.8, -radius * 0.6, -radius * 0.2, -radius * 0.4, -radius * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 2. "Suit" White Patch (Shirt)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(radius*0.1, 0, radius * 0.25, radius * 0.35, 0, 0, Math.PI*2);
        ctx.fill();

        // 3. Bow Tie (Red)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(radius*0.1, -radius*0.3);
        ctx.lineTo(radius*0.3, -radius*0.4);
        ctx.lineTo(radius*0.3, -radius*0.2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(radius*0.1, -radius*0.3);
        ctx.lineTo(-radius*0.1, -radius*0.4);
        ctx.lineTo(-radius*0.1, -radius*0.2);
        ctx.fill();

        // 4. Sunglasses (Cool Factor)
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.roundRect(0, -radius*0.75, radius*0.35, radius*0.2, 2);
        ctx.roundRect(radius*0.38, -radius*0.75, radius*0.35, radius*0.2, 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(radius*0.35, -radius*0.65); ctx.lineTo(radius*0.38, -radius*0.65); ctx.stroke();

        // 5. Dorsal Fin (Mohawk style)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(-radius*0.4, -radius*0.8);
        ctx.quadraticCurveTo(-radius*0.7, -radius*0.2, -radius*0.3, radius*0.2);
        ctx.lineTo(-radius*0.35, -radius*0.8);
        ctx.fill();

        // 6. Arm/Fin (Crossed or Waving)
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        // Looks like arm folded
        ctx.ellipse(radius*0.2, radius*0.2, radius*0.2, radius*0.1, -0.5, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
        return;
    }

    const safeScale = Number.isFinite(renderScale) ? renderScale : 1;
    const isScared = fearTimer && fearTimer > 0;

    // --- TRAILS (Custom Particle Trails) ---
    if (isPlayer && cosmetics && cosmetics.trailType && cosmetics.trailType !== 'NONE') {
        // We handle trails by drawing particles BEHIND the fish before transformation
        // Actually, trails should be persistent particles, but we can simulate a "local" trail effect here for preview/instant feedback
        
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.rotate(entity.angle);
        
        const tType = cosmetics.trailType;
        const offset = visualTime * 0.5;
        
        if (tType === 'RAINBOW') {
            for(let i=1; i<5; i++) {
                ctx.fillStyle = `hsla(${(visualTime * 20 + i*30)%360}, 100%, 50%, 0.5)`;
                ctx.beginPath();
                ctx.arc(-radius * (1 + i*0.3), Math.sin(offset + i)*5, 5, 0, Math.PI*2);
                ctx.fill();
            }
        } else if (tType === 'FIRE') {
            ctx.fillStyle = `rgba(255, ${100 + Math.random()*155}, 0, 0.6)`;
            ctx.beginPath();
            ctx.moveTo(-radius, 0);
            ctx.lineTo(-radius*2.5, -radius*0.5);
            ctx.lineTo(-radius*2.0, 0);
            ctx.lineTo(-radius*2.5, radius*0.5);
            ctx.fill();
        } else if (tType === 'ELECTRIC') {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-radius, 0);
            for(let i=0; i<5; i++) {
                ctx.lineTo(-radius * (1.5 + i*0.3), (Math.random()-0.5)*radius);
            }
            ctx.stroke();
        }
        
        ctx.restore();
    }

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
            
            if (skin === 'GRADIENT_GOLD_1') { // Luxury Gold
                grad.addColorStop(0, '#fef08a'); 
                grad.addColorStop(0.5, '#eab308'); 
                grad.addColorStop(1, '#a16207');
            } else if (skin === 'GRADIENT_GOLD_2') { // Rose Gold
                grad.addColorStop(0, '#fbcfe8');
                grad.addColorStop(0.5, '#f472b6');
                grad.addColorStop(1, '#ca8a04');
            } else if (skin === 'GRADIENT_GOLD_3') { // Black Gold
                grad.addColorStop(0, '#1c1917');
                grad.addColorStop(0.5, '#ca8a04');
                grad.addColorStop(1, '#facc15');
            } else if (skin === 'GRADIENT_SUNSET') {
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

    const biteSpeed = 0.25;
    // Increased mouth amplitude by 20% (0.3 -> 0.36)
    const mouthGap = 0.1 + Math.abs(Math.sin(visualTime * biteSpeed + animOffset)) * 0.36; 

    // Define Body Path function for reuse (Clips)
    const defineBodyPath = () => {
         ctx.beginPath();
         if (type === CreatureType.PLANKTON) {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
         } else {
            // Body Shapes
            const bodyType = (isPlayer && cosmetics) ? cosmetics.bodyType : 'DEFAULT';
            
            ctx.moveTo(0, 0); // Center pivot for mouth

            if (bodyType === 'ROUND' || bodyType === 'DEFAULT') {
                ctx.arc(0, 0, radius, mouthGap, -mouthGap);
            } else if (bodyType === 'SLENDER') {
                ctx.ellipse(0, 0, radius * 1.2, radius * 0.8, 0, mouthGap, -mouthGap);
            } else if (bodyType === 'CHUNKY') {
                ctx.ellipse(0, 0, radius * 0.9, radius * 1.1, 0, mouthGap, -mouthGap);
            } else if (bodyType === 'BOX') {
                const s = radius * 0.9;
                ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.lineTo(-s, -s); ctx.lineTo(s, -s);
                ctx.lineTo(s, 0); // Back to mouth
            } else if (bodyType === 'STAR') {
                const spikes = 5;
                const outer = radius;
                const inner = radius * 0.5;
                for(let i=0; i<spikes*2; i++){
                    if (i===0) { ctx.moveTo(inner, 0); continue; } // Mouth area hack
                    const r = (i%2 === 0) ? outer : inner;
                    const a = (Math.PI / spikes) * i;
                    // Simplify mouth clipping for star:
                    if (a > -mouthGap && a < mouthGap) continue;
                    ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                }
            } else if (bodyType === 'MERMAID') {
                ctx.arc(0, 0, radius, mouthGap, -mouthGap);
            } else if (bodyType === 'RAY') {
                ctx.moveTo(0,0);
                ctx.bezierCurveTo(radius, -radius, -radius*2, -radius*2, -radius*0.5, 0);
                ctx.bezierCurveTo(-radius*2, radius*2, radius, radius, 0, 0);
            } else if (bodyType === 'EEL') {
                ctx.ellipse(-radius*0.5, 0, radius * 1.5, radius * 0.6, 0, mouthGap, -mouthGap);
            }
         }
         ctx.closePath();
    };

    // 1. Tail (Animated & Customized)
    if (type !== CreatureType.PLANKTON) {
        ctx.save();
        ctx.translate(-radius * 0.6, 0);
        const tailWag = Math.sin(visualTime * 0.4 + animOffset) * 0.4; // Increased wag
        ctx.rotate(tailWag);
        
        ctx.fillStyle = bodyFill;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        
        const tailType = (isPlayer && cosmetics) ? cosmetics.tailType : 'DEFAULT';
        
        ctx.beginPath();
        if (tailType === 'DEFAULT') {
            ctx.moveTo(0, 0);
            ctx.lineTo(-radius * 0.8, -radius * 0.6);
            ctx.lineTo(-radius * 0.8, radius * 0.6);
        } else if (tailType === 'CRESCENT') {
            ctx.arc(-radius*0.5, 0, radius*0.6, 0.5, -0.5, true);
        } else if (tailType === 'FORKED') {
            ctx.moveTo(0, 0);
            ctx.lineTo(-radius * 1.2, -radius * 0.4);
            ctx.lineTo(-radius * 0.5, 0);
            ctx.lineTo(-radius * 1.2, radius * 0.4);
        } else if (tailType === 'FAN') {
            ctx.moveTo(0,0);
            ctx.arc(-radius*0.2, 0, radius*0.8, Math.PI-1, Math.PI+1);
        } else if (tailType === 'TRIDENT') {
            ctx.moveTo(0,0);
            ctx.lineTo(-radius, -radius*0.5);
            ctx.lineTo(-radius*0.8, 0);
            ctx.lineTo(-radius, radius*0.5);
        } else if (tailType === 'LOBSTER') {
            ctx.moveTo(0,0);
            ctx.ellipse(-radius*0.6, 0, radius*0.6, radius*0.4, 0, 0, Math.PI*2);
        } else if (tailType === 'RIBBON') {
            ctx.moveTo(0,0);
            ctx.bezierCurveTo(-radius, -radius, -radius*1.5, 0, -radius*2, -radius*0.5);
            ctx.bezierCurveTo(-radius*1.5, radius, -radius, radius, 0, 0);
        } else if (tailType === 'MECHANICAL') {
            ctx.rect(-radius, -radius*0.3, radius, radius*0.6);
        } else if (tailType === 'GHOST') {
            ctx.moveTo(0,0);
            ctx.quadraticCurveTo(-radius, -radius*0.5, -radius*1.5, 0);
            ctx.quadraticCurveTo(-radius, radius*0.5, 0, 0);
        }

        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Tail Pattern
        if (isPlayer && cosmetics && cosmetics.pattern !== 'NONE') {
             ctx.clip();
             ctx.fillStyle = 'rgba(255,255,255,0.2)';
             // Simple overlay for tail pattern
             ctx.fillRect(-radius*2, -radius, radius*3, radius*2);
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
        
        // --- COSMETIC PATTERNS (Clipped) ---
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

        // --- COSMETIC SCALES (Enhanced Visibility) ---
        if (isPlayer && cosmetics && cosmetics.scaleType !== 'NONE') {
            ctx.save();
            ctx.clip();
            
            // Increased thickness for better visibility
            ctx.lineWidth = 3; 
            
            switch(cosmetics.scaleType) {
                case 'SHINY':
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    for (let y = -radius; y < radius; y += 15) {
                        const offset = (y % 30 === 0) ? 0 : 7.5;
                        for (let x = -radius; x < radius; x += 15) {
                            ctx.beginPath(); ctx.arc(x + offset, y, 7.5, 0, Math.PI); ctx.stroke();
                        }
                    }
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; 
                    ctx.beginPath(); ctx.ellipse(-radius*0.2, -radius*0.2, radius*0.4, radius*0.2, -0.5, 0, Math.PI*2); ctx.fill();
                    break;
                case 'DRAGON':
                     ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                     ctx.strokeStyle = '#fcd34d'; // Gold stroke for dragon
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
                     ctx.fillStyle = 'rgba(0,0,0,0.4)';
                     ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
                     for(let i=0; i<15; i++) {
                         const rx = (Math.random()-0.5)*2*radius;
                         const ry = (Math.random()-0.5)*2*radius;
                         const rs = Math.random()*radius*0.3 + 5;
                         ctx.fillRect(rx, ry, rs, rs);
                     }
                     ctx.shadowBlur = 0;
                     break;
                case 'FEATHER':
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                    for(let x=-radius; x<radius; x+=12) {
                        for(let y=-radius; y<radius; y+=12) {
                            ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI); ctx.stroke();
                        }
                    }
                    break;
                case 'MECHANICAL':
                    ctx.fillStyle = '#64748b'; 
                    ctx.strokeStyle = '#334155';
                    ctx.lineWidth = 3;
                    for(let i=0; i<4; i++) {
                        const bx = (i/3 - 0.5) * radius * 1.5;
                        ctx.beginPath(); ctx.arc(bx, 0, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.arc(bx, radius*0.4, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.arc(bx, -radius*0.4, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                    }
                    break;
                case 'GLOW':
                    ctx.shadowColor = 'white';
                    ctx.shadowBlur = 20;
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 4;
                    ctx.stroke(); // Outline body
                    ctx.shadowBlur = 0;
                    break;
                case 'MOSAIC':
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    const s = 10;
                    for(let x=-radius; x<radius; x+=s) {
                        for(let y=-radius; y<radius; y+=s) {
                            if ((x+y)% (s*2) === 0) ctx.fillRect(x,y,s,s);
                        }
                    }
                    break;
                case 'CRYSTAL':
                    ctx.fillStyle = 'rgba(200,255,255,0.7)';
                    ctx.beginPath(); ctx.moveTo(0, -radius*0.6); ctx.lineTo(radius*0.4, 0); ctx.lineTo(0, radius*0.6); ctx.lineTo(-radius*0.4, 0); ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.stroke();
                    break;
                case 'VOID':
                    ctx.fillStyle = 'rgba(0,0,0,0.9)';
                    ctx.beginPath(); ctx.arc(0,0,radius*0.7,0,Math.PI*2); ctx.fill();
                    break;
                case 'PIXEL':
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    const ps = 6;
                    for(let i=0; i<30; i++) {
                        ctx.fillRect((Math.random()-0.5)*radius*1.6, (Math.random()-0.5)*radius*1.6, ps, ps);
                    }
                    break;
                case 'ARMOR':
                    ctx.fillStyle = 'rgba(71,85,105,0.9)';
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.rect(-radius*0.8, -radius*0.5, radius*1.6, radius*0.3); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.rect(-radius*0.7, -radius*0.1, radius*1.4, radius*0.3); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.rect(-radius*0.6, radius*0.3, radius*1.2, radius*0.3); ctx.fill(); ctx.stroke();
                    break;
                case 'DIAMOND_PLATE':
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.strokeStyle = 'white';
                    const ds = 12;
                    for(let x=-radius; x<radius; x+=ds) for(let y=-radius; y<radius; y+=ds) {
                        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+ds/2,y+ds/2); ctx.stroke();
                    }
                    break;
                case 'SLIME':
                    ctx.fillStyle = 'rgba(34,197,94,0.6)';
                    for(let i=0; i<6; i++) {
                        ctx.beginPath(); ctx.arc((Math.random()-0.5)*radius, -radius*0.4 + Math.random()*radius, radius*0.2, 0, Math.PI*2); ctx.fill();
                    }
                    break;
                case 'BIO_HAZARD':
                    ctx.fillStyle = '#facc15';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(0,0,radius*0.4,0,Math.PI*2); ctx.fill(); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, -radius*0.4); ctx.lineTo(0, -radius*0.8); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(radius*0.3, radius*0.3); ctx.lineTo(radius*0.6, radius*0.6); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-radius*0.3, radius*0.3); ctx.lineTo(-radius*0.6, radius*0.6); ctx.stroke();
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
        if (teethType === 'GOLD') {
            // Shiny Gold Gradient
            const tGrad = ctx.createLinearGradient(0, -radius, 0, radius);
            tGrad.addColorStop(0, '#fef08a');
            tGrad.addColorStop(0.5, '#eab308');
            tGrad.addColorStop(1, '#a16207');
            ctx.fillStyle = tGrad;
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 5;
        }
        else if (teethType === 'VAMPIRE' || teethType === 'SHARP' || teethType === 'NORMAL') ctx.fillStyle = '#ffffff';
        else if (teethType === 'BRACES') ctx.fillStyle = '#d1d5db';
        else if (teethType === 'DIAMOND') ctx.fillStyle = '#06b6d4';
        else if (teethType === 'RAINBOW') ctx.fillStyle = `hsl(${(visualTime * 10) % 360}, 100%, 70%)`;
        else ctx.fillStyle = '#ffffff';
        
        // --- DRAW TEETH (Helper) ---
        const drawToothRow = (isUpper: boolean) => {
             ctx.save();
             ctx.rotate(isUpper ? -mouthGap : mouthGap);
             ctx.beginPath();
             
             // Base stick-out factor
             const protrusion = 1.0; 
             
             if (teethType === 'NORMAL' || teethType === 'GOLD' || teethType === 'BRACES' || teethType === 'DIAMOND' || teethType === 'RAINBOW') {
                for(let i=0; i<toothCount; i++) {
                    const startX = radius * 0.2 + i * toothSize;
                    const len = (teethType === 'GOLD') ? 1.3 : 0.9; // Gold teeth stick out more
                    ctx.moveTo(startX, 0);
                    ctx.lineTo(startX + toothSize/2, (isUpper ? 1 : -1) * toothSize * len * protrusion);
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
            if (teethType === 'GOLD') ctx.shadowBlur = 0; // Reset

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

        // 4. Eyes (Customizable)
        const eyeX = radius * 0.2;
        const eyeY = radius * 0.45;
        const eyeSize = radius * 0.22;
        
        const eyeType = (isPlayer && cosmetics) ? cosmetics.eyeType : 'NORMAL';

        ctx.save();
        
        const drawSingleEye = (x: number, y: number, size: number) => {
            if (eyeType === 'NORMAL') {
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.arc(x + size*0.3, y, size*0.4, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'ANIME') {
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.ellipse(x, y, size, size*1.2, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#0ea5e9'; // Blue iris
                ctx.beginPath(); ctx.ellipse(x+size*0.1, y, size*0.6, size*0.8, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'white'; // Shine
                ctx.beginPath(); ctx.arc(x+size*0.3, y-size*0.3, size*0.25, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'MAD') {
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.arc(x, y, size*0.3, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'DERP') {
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'black';
                // Random pupil direction offset
                const dx = (Math.random()-0.5)*size;
                const dy = (Math.random()-0.5)*size;
                ctx.beginPath(); ctx.arc(x+dx, y+dy, size*0.2, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'CYBORG') {
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#ef4444'; // Red laser
                ctx.shadowColor = 'red'; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(x, y, size*0.4, 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
                // Scanner line
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x-size, y); ctx.lineTo(x+size, y); ctx.stroke();
            } else if (eyeType === 'DEAD') {
                ctx.strokeStyle = 'black'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(x-size*0.7, y-size*0.7); ctx.lineTo(x+size*0.7, y+size*0.7); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x+size*0.7, y-size*0.7); ctx.lineTo(x-size*0.7, y+size*0.7); ctx.stroke();
            } else if (eyeType === 'LOVE') {
                ctx.fillStyle = '#ec4899';
                ctx.font = `${size*2}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('❤️', x, y);
            } else if (eyeType === 'HYPNO') {
                ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
                ctx.beginPath();
                for(let r=size*0.2; r<size; r+=size*0.25) {
                    ctx.arc(x, y, r, 0, Math.PI*2);
                }
                ctx.stroke();
            } else if (eyeType === 'CAT') {
                ctx.fillStyle = '#facc15'; // Yellow
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.ellipse(x, y, size*0.2, size*0.8, 0, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'FIRE') {
                ctx.fillStyle = '#fb923c';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#b91c1c';
                ctx.beginPath(); ctx.moveTo(x-size*0.5, y+size*0.5); ctx.lineTo(x, y-size*0.5); ctx.lineTo(x+size*0.5, y+size*0.5); ctx.fill();
            } else if (eyeType === 'BUTTON') {
                ctx.fillStyle = '#1e293b';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#334155';
                ctx.beginPath(); ctx.arc(x-size*0.3, y-size*0.3, size*0.15, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(x+size*0.3, y-size*0.3, size*0.15, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(x-size*0.3, y+size*0.3, size*0.15, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(x+size*0.3, y+size*0.3, size*0.15, 0, Math.PI*2); ctx.fill();
            } else if (eyeType === 'GOGGLES') {
                ctx.fillStyle = '#94a3b8';
                ctx.beginPath(); ctx.arc(x, y, size*1.2, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.beginPath(); ctx.moveTo(x-size, y+size); ctx.lineTo(x+size, y-size); ctx.lineTo(x+size*0.5, y-size*1.2); ctx.lineTo(x-size*1.2, y+size*0.5); ctx.fill();
            }
        };

        if (eyeType !== 'DERP') { // Draw symmetric eyes for non-derp
             drawSingleEye(eyeX, -eyeY, eyeSize);
             drawSingleEye(eyeX, eyeY, eyeSize);
        } else {
             // Derp eyes: Left looks up, Right looks down
             ctx.fillStyle = 'white';
             ctx.beginPath(); ctx.arc(eyeX, -eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = 'black';
             ctx.beginPath(); ctx.arc(eyeX, -eyeY-eyeSize*0.4, eyeSize*0.3, 0, Math.PI*2); ctx.fill();

             ctx.fillStyle = 'white';
             ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = 'black';
             ctx.beginPath(); ctx.arc(eyeX+eyeSize*0.3, eyeY+eyeSize*0.4, eyeSize*0.3, 0, Math.PI*2); ctx.fill();
        }
        
        // --- EYEBROWS ---
        if (isPlayer && cosmetics && cosmetics.eyebrowType && cosmetics.eyebrowType !== 'NONE') {
            ctx.fillStyle = 'black';
            const browY = eyeY + eyeSize * 1.2;
            const browX = eyeX;
            const browW = eyeSize * 2.5;
            const browH = eyeSize * 0.5;
            
            const drawBrow = (yFactor: number) => {
                ctx.save();
                ctx.translate(browX, yFactor * browY);
                if (cosmetics.eyebrowType === 'ANGRY') {
                    ctx.rotate(yFactor * -0.3);
                    ctx.fillRect(-browW/2, -browH/2, browW, browH);
                } else if (cosmetics.eyebrowType === 'SAD') {
                    ctx.rotate(yFactor * 0.3);
                    ctx.fillRect(-browW/2, -browH/2, browW, browH);
                } else if (cosmetics.eyebrowType === 'THICK') {
                    ctx.fillRect(-browW/2, -browH, browW, browH*2);
                } else if (cosmetics.eyebrowType === 'UNI') {
                    // Handled outside loop
                } else if (cosmetics.eyebrowType === 'CONFUSED') {
                    if (yFactor === -1) ctx.translate(0, -eyeSize); // Raise one
                    ctx.fillRect(-browW/2, -browH/2, browW, browH);
                } else if (cosmetics.eyebrowType === 'TIERED') {
                    ctx.fillRect(-browW/2, -browH/2, browW, browH/2);
                    ctx.fillRect(-browW/2, -browH*1.5, browW, browH/2);
                }
                ctx.restore();
            };
            
            if (cosmetics.eyebrowType === 'UNI') {
                ctx.fillRect(eyeX - eyeSize, -eyeSize*0.5, eyeSize*0.5, eyeSize*2.5); // Center block
                ctx.fillRect(eyeX - eyeSize, -eyeY - eyeSize, eyeSize*2, eyeSize*0.5); // Top
                ctx.fillRect(eyeX - eyeSize, eyeY + eyeSize*0.5, eyeSize*2, eyeSize*0.5); // Bottom
            } else {
                drawBrow(-1); // Top eye (visually top in side view? No, eyes are symmetric Y)
                drawBrow(1);
            }
        }
        
        ctx.restore();

        // 5. ACCESSORIES (On Top)
        if (isPlayer && cosmetics && cosmetics.accessory && cosmetics.accessory !== 'NONE') {
            ctx.save();
            const acc = cosmetics.accessory;
            
            if (acc === 'GOLD_CHAIN') {
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * 0.8, radius * 0.9, 0, 0, Math.PI * 2);
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = 6;
                ctx.setLineDash([5, 3]);
                ctx.stroke();
                // Pendant
                ctx.fillStyle = '#facc15';
                ctx.font = `bold ${radius * 0.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('$', 0, radius * 0.5);
            } else if (acc === 'PEARL_NECKLACE') {
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * 0.7, radius * 0.8, 0, 0, Math.PI*2);
                ctx.lineWidth = 6;
                ctx.strokeStyle = '#f3f4f6';
                ctx.setLineDash([1, 6]);
                ctx.lineCap = 'round';
                ctx.stroke();
            } else if (acc === 'SUNGLASSES') {
                ctx.fillStyle = 'black';
                ctx.fillRect(eyeX - eyeSize, -eyeY - eyeSize, eyeSize * 2.5, eyeSize * 2); // Top eye
                ctx.fillRect(eyeX - eyeSize, eyeY - eyeSize, eyeSize * 2.5, eyeSize * 2); // Bottom eye
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(eyeX - eyeSize, -eyeY); ctx.lineTo(eyeX - eyeSize, eyeY); ctx.stroke();
            } else if (acc === 'CROWN') {
                ctx.translate(-radius*0.2, 0);
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.moveTo(-radius*0.5, -radius*0.8);
                ctx.lineTo(-radius*0.8, -radius*1.2);
                ctx.lineTo(-radius*0.2, -radius*0.8);
                ctx.lineTo(0, -radius*1.4); // Top spike
                ctx.lineTo(radius*0.2, -radius*0.8);
                ctx.lineTo(radius*0.8, -radius*1.2);
                ctx.lineTo(radius*0.5, -radius*0.8);
                ctx.fill();
            } else if (acc === 'BOW_TIE') {
                ctx.fillStyle = '#ef4444';
                ctx.translate(radius*0.5, 0);
                ctx.beginPath();
                ctx.moveTo(0,0);
                ctx.lineTo(10, 10); ctx.lineTo(10, -10); ctx.fill();
                ctx.moveTo(0,0);
                ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill();
            } else if (acc === 'JADE_PENDANT') {
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * 0.7, radius * 0.8, 0, 0, Math.PI*2);
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke(); // Red string
                ctx.fillStyle = '#10b981'; // Jade
                ctx.beginPath(); ctx.arc(0, radius*0.6, radius*0.2, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#a7f3d0'; ctx.beginPath(); ctx.arc(0, radius*0.6, radius*0.05, 0, Math.PI*2); ctx.fill();
            } else if (acc === 'DIAMOND_RING') {
                // Giant ring on body?
                ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0,0, radius*0.5, 0, Math.PI*2); ctx.stroke();
                ctx.translate(radius*0.5, 0);
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(10,0); ctx.lineTo(0,10); ctx.lineTo(-10,0); ctx.fill();
            } else if (acc === 'HEADPHONES') {
                ctx.strokeStyle = '#333'; ctx.lineWidth = 8;
                ctx.beginPath(); ctx.arc(0,0, radius*0.9, Math.PI*0.5, Math.PI*1.5); ctx.stroke();
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(eyeX-10, -radius, 20, 40);
                ctx.fillRect(eyeX-10, radius-40, 20, 40);
            } else if (acc === 'HALO') {
                ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4;
                ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.ellipse(-radius*0.2, 0, radius*0.2, radius*0.8, 0, 0, Math.PI*2); ctx.stroke();
                ctx.shadowBlur = 0;
            } else if (acc === 'EYEPATCH') {
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.arc(eyeX, -eyeY, eyeSize*1.1, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(eyeX, -eyeY); ctx.lineTo(-radius, -radius); ctx.stroke();
            }

            ctx.restore();
        }
    }

    ctx.restore();
};

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawSpeechBubble = (ctx: CanvasRenderingContext2D, e: Entity | PlayerState) => {
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

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#020617'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(camera.zoom, camera.zoom);
            ctx.translate(-camera.x, -camera.y);

            drawMapBackground(ctx);

            if (hazards) {
                hazards.forEach(h => {
                    ctx.save();
                    ctx.translate(h.x, h.y);
                    if (h.stage === 'WARNING') {
                        const maxTime = 120;
                        const progress = Math.max(0, h.timer / maxTime);
                        const flashSpeed = 0.2 + (1 - progress) * 0.8; 
                        const alpha = 0.4 + Math.sin(visualTime * flashSpeed) * 0.4;
                        ctx.fillStyle = `rgba(220, 38, 38, ${0.2 + (1-progress)*0.3})`;
                        ctx.beginPath(); ctx.arc(0, 0, h.radius, 0, Math.PI * 2); ctx.fill();
                        ctx.save(); ctx.rotate(visualTime * 0.05); ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`; ctx.lineWidth = 8; ctx.setLineDash([40, 20]); ctx.beginPath(); ctx.arc(0, 0, h.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
                        ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, h.radius * progress, 0, Math.PI * 2); ctx.stroke();
                        ctx.strokeStyle = `rgba(255, 0, 0, 0.5)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-h.radius, 0); ctx.lineTo(h.radius, 0); ctx.moveTo(0, -h.radius); ctx.lineTo(0, h.radius); ctx.stroke();
                        ctx.shadowColor = 'black'; ctx.shadowBlur = 4; ctx.fillStyle = '#fca5a5'; ctx.font = "bold 32px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        const textScale = 1 + Math.sin(visualTime * flashSpeed) * 0.1; ctx.scale(textScale, textScale); ctx.fillText("⚠️ 危险区域 ⚠️", 0, -h.radius * 0.5); ctx.font = "bold 24px Arial"; ctx.fillText((h.timer / 60).toFixed(1) + "s", 0, h.radius * 0.5); ctx.shadowBlur = 0;
                    } else if (h.stage === 'STRIKE') {
                        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius);
                        grad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
                        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
                        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, h.radius, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                });
            }

            if (buildings) buildings.forEach(b => {
                ctx.save(); 
                ctx.translate(b.x, b.y); 
                
                if (b.type === BuildingType.SHOP) {
                     // DRAW SHOP HOUSE
                     const size = b.radius * 0.7;
                     const pulse = Math.sin(visualTime * 0.05) * 5;
                     
                     // Shadow
                     ctx.shadowColor = 'rgba(236, 72, 153, 0.5)';
                     ctx.shadowBlur = 20;
                     
                     // 1. Base (House Body)
                     ctx.fillStyle = '#fce7f3'; // Light pink walls
                     ctx.fillRect(-size, -size/2, size*2, size*1.5);
                     
                     // 2. Roof (Triangle)
                     ctx.fillStyle = '#db2777'; // Dark pink roof
                     ctx.beginPath();
                     ctx.moveTo(-size*1.2, -size/2);
                     ctx.lineTo(0, -size*1.5 - pulse);
                     ctx.lineTo(size*1.2, -size/2);
                     ctx.closePath();
                     ctx.fill();
                     // Roof detail
                     ctx.strokeStyle = '#be185d';
                     ctx.lineWidth = 4;
                     ctx.stroke();
                     
                     // 3. Door (Entrance)
                     ctx.fillStyle = '#831843';
                     ctx.beginPath();
                     ctx.roundRect(-size*0.3, size*0.2, size*0.6, size*0.8, [10, 10, 0, 0]);
                     ctx.fill();
                     
                     // 4. Sign
                     ctx.fillStyle = '#fdf2f8';
                     ctx.fillRect(-size*0.8, -size*0.2, size*1.6, size*0.3);
                     ctx.strokeStyle = '#db2777';
                     ctx.lineWidth = 2;
                     ctx.strokeRect(-size*0.8, -size*0.2, size*1.6, size*0.3);
                     
                     ctx.fillStyle = '#db2777';
                     ctx.font = "bold 24px Arial";
                     ctx.textAlign = "center";
                     ctx.textBaseline = "middle";
                     ctx.fillText("SHOP", 0, -size*0.05);
                     
                     // 5. Windows
                     ctx.fillStyle = '#bae6fd';
                     ctx.fillRect(-size*0.8, size*0.2, size*0.3, size*0.3);
                     ctx.fillRect(size*0.5, size*0.2, size*0.3, size*0.3);
                     
                     // Interaction Zone Ring
                     ctx.shadowBlur = 0;
                     ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
                     ctx.lineWidth = 4;
                     ctx.setLineDash([10, 10]);
                     ctx.beginPath();
                     ctx.arc(0, 0, b.radius, 0, Math.PI*2);
                     ctx.stroke();
                     ctx.setLineDash([]);

                } else {
                     // Other Buildings
                     ctx.fillStyle = BUILDING_CONFIGS[b.type].color; 
                     ctx.beginPath(); 
                     ctx.arc(0, 0, b.radius/2, 0, Math.PI*2); 
                     ctx.fill(); 
                     
                     // Simple Icon
                     ctx.fillStyle = 'white';
                     ctx.font = "bold 40px Arial";
                     ctx.textAlign = "center";
                     ctx.textBaseline = "middle";
                     let icon = "?";
                     if (b.type === BuildingType.HOSPITAL) icon = "+";
                     if (b.type === BuildingType.ARMORY) icon = "⚔️";
                     if (b.type === BuildingType.SHRINE) icon = "⛩️";
                     ctx.fillText(icon, 0, 0);
                }
                
                ctx.restore();
            });

            obstacles.forEach(obs => {
                ctx.fillStyle = obs.type === 'SEAWEED' ? '#4d7c0f' : '#475569';
                ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI*2); ctx.fill();
            });

            powerUps.forEach(p => {
                ctx.fillStyle = p.type === 'SPEED' ? 'yellow' : 'cyan';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            });

            particles.forEach(p => {
                 ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
            });

            entities.forEach(e => { drawCuteFish(ctx, e, visualTime, false); });
            drawCuteFish(ctx, player, visualTime, true);

            if (portals) { portals.forEach(p => drawPortalVortex(ctx, p, visualTime)); }

            entities.forEach(e => { if (e.speechBubble) drawSpeechBubble(ctx, e); });
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
