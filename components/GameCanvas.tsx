import React, { useRef, useEffect } from 'react';
import { GameState, Entity, Particle, CreatureType, Obstacle, PlayerState } from '../types';
import { WORLD_SIZE } from '../constants';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- RENDER HELPERS ---

  // Draws a generic gradient body with custom shapes
  const drawBodyPath = (ctx: CanvasRenderingContext2D, entity: Entity, mouthGap: number) => {
    const { type, radius } = entity;
    
    // Special Shapes
    
    // Jellyfish (Dome)
    if (type === CreatureType.JELLYFISH) {
       ctx.beginPath();
       ctx.arc(0, 0, radius, Math.PI, 0); // Top dome
       ctx.bezierCurveTo(radius, radius * 0.5, -radius, radius * 0.5, -radius, 0); // Bottom curve
       ctx.fill();
       return;
    }

    // Boxy Armor Fish
    if (type === CreatureType.ARMOR_FISH) {
      ctx.beginPath();
      // Draw angular body
      // Top
      ctx.moveTo(radius * 0.8, -radius * 0.6);
      ctx.lineTo(radius * 1.0, 0); // Nose
      ctx.lineTo(radius * 0.8, radius * 0.6); // Bottom Nose
      ctx.lineTo(-radius * 0.8, radius * 0.6); // Bottom Back
      ctx.lineTo(-radius * 1.0, 0); // Tail connect
      ctx.lineTo(-radius * 0.8, -radius * 0.6); // Top Back
      ctx.closePath();

      // Cut mouth
      if (mouthGap > 0.1) {
         ctx.globalCompositeOperation = 'destination-out';
         ctx.beginPath();
         ctx.moveTo(0,0);
         ctx.arc(0,0, radius * 1.2, -mouthGap, mouthGap);
         ctx.fill();
         ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }

    // Streamlined / Sword / Needle
    if ([CreatureType.NEEDLE_FISH, CreatureType.SWORD_FISH].includes(type)) {
      ctx.beginPath();
      const noseLen = type === CreatureType.SWORD_FISH ? 2.5 : 1.8;
      
      // Upper body
      ctx.moveTo(radius * 0.5, -radius * 0.4);
      ctx.quadraticCurveTo(0, -radius * 0.4, -radius * 1.5, 0); // Tail point
      ctx.quadraticCurveTo(0, radius * 0.4, radius * 0.5, radius * 0.4); // Lower body
      
      // Nose
      ctx.lineTo(radius * noseLen, 0);
      ctx.closePath();
      
      // Cut mouth
      if (mouthGap > 0.1) {
         ctx.globalCompositeOperation = 'destination-out';
         ctx.beginPath();
         ctx.moveTo(radius * 0.5, 0);
         ctx.lineTo(radius * noseLen, radius * 0.2); 
         ctx.lineTo(0, radius);
         ctx.fill();
         ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }

    // Standard Fish Body (Teardrop / Oval)
    // Used for Player, Algae Fish, Poison Fish, Leviathan etc.
    ctx.beginPath();
    
    // Draw the main body as a distorted circle/ellipse
    // Using bezier curves for a smooth organic shape
    
    // Top curve (From nose to tail)
    ctx.moveTo(radius, 0); // Nose tip
    ctx.bezierCurveTo(radius * 0.5, -radius, -radius * 0.5, -radius, -radius * 1.2, 0); // Top curve to tail
    
    // Bottom curve (From tail to nose)
    ctx.bezierCurveTo(-radius * 0.5, radius, radius * 0.5, radius, radius, 0);
    
    ctx.closePath();

    // Cut mouth (Standard Wedge)
    if (mouthGap > 0.1) {
       ctx.globalCompositeOperation = 'destination-out';
       ctx.beginPath();
       ctx.moveTo(0,0);
       // Mouth opening - limited to 180 deg (PI) total, so half angle is PI/2
       ctx.arc(0,0, radius * 1.5, -mouthGap, mouthGap);
       ctx.fill();
       ctx.globalCompositeOperation = 'source-over';
    }
  };

  const drawTail = (ctx: CanvasRenderingContext2D, entity: Entity, time: number) => {
    const { type, radius, animOffset } = entity;
    const wag = Math.sin(time * 0.2 + animOffset) * 0.2;
    
    if (type === CreatureType.JELLYFISH) {
       // Tentacles
       ctx.strokeStyle = entity.config.color;
       ctx.globalAlpha = 0.6;
       ctx.lineWidth = 2;
       for(let i=-2; i<=2; i++) {
         ctx.beginPath();
         ctx.moveTo(i * radius * 0.3, 0);
         const sway = Math.sin(time * 0.1 + i + animOffset) * radius * 0.5;
         ctx.quadraticCurveTo(i * radius * 0.3 + sway, radius, i * radius * 0.1, radius * 2);
         ctx.stroke();
       }
       ctx.globalAlpha = 1.0;
       return;
    }

    if (type === CreatureType.PLANKTON) return; // No tail for plankton dots

    ctx.save();
    ctx.translate(-radius * (type === CreatureType.SWORD_FISH ? 1.5 : 1.0), 0);
    ctx.rotate(wag);

    ctx.fillStyle = entity.config.color;
    ctx.beginPath();
    
    if (type === CreatureType.NEEDLE_FISH || type === CreatureType.SWORD_FISH) {
       // Forked Tail
       ctx.moveTo(0,0);
       ctx.lineTo(-radius, -radius * 0.5);
       ctx.lineTo(-radius * 0.5, 0);
       ctx.lineTo(-radius, radius * 0.5);
    } else if (type === CreatureType.EEL) {
       // Long tail continuation
       ctx.moveTo(0, -radius * 0.4);
       ctx.lineTo(-radius * 2, 0);
       ctx.lineTo(0, radius * 0.4);
    } else {
       // Standard Fan Tail
       ctx.moveTo(0,0);
       ctx.lineTo(-radius * 0.8, -radius * 0.6);
       ctx.quadraticCurveTo(-radius * 1.2, 0, -radius * 0.8, radius * 0.6);
    }
    
    ctx.fill();
    ctx.restore();
  };

  const drawFins = (ctx: CanvasRenderingContext2D, entity: Entity, time: number) => {
    const { type, radius, animOffset } = entity;
    const flutter = Math.sin(time * 0.5 + animOffset) * 0.3;

    if ([CreatureType.PLANKTON, CreatureType.JELLYFISH, CreatureType.EEL].includes(type)) return;

    ctx.fillStyle = entity.config.color;
    
    // Right Fin
    ctx.save();
    ctx.translate(radius * 0.2, radius * 0.4);
    ctx.rotate(Math.PI / 4 + flutter);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.5, radius * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Left Fin
    ctx.save();
    ctx.translate(radius * 0.2, -radius * 0.4);
    ctx.rotate(-Math.PI / 4 - flutter);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.5, radius * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawPatterns = (ctx: CanvasRenderingContext2D, entity: Entity) => {
    const { type, radius } = entity;
    
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop'; // Draw only inside body
    
    if (type === CreatureType.POISON_FISH) {
       ctx.fillStyle = '#a3e635'; // Lighter green spots
       for(let i=0; i<3; i++) {
          ctx.beginPath();
          ctx.arc(-radius*0.5 + i*10, radius*0.3, radius*0.15, 0, Math.PI*2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-radius*0.2 + i*10, -radius*0.3, radius*0.1, 0, Math.PI*2);
          ctx.fill();
       }
    } else if (type === CreatureType.ARMOR_FISH) {
       ctx.fillStyle = 'rgba(0,0,0,0.2)';
       // Rivets
       ctx.beginPath(); ctx.arc(0,0, 2, 0, Math.PI*2); ctx.fill();
       ctx.beginPath(); ctx.arc(radius*0.5, 0, 2, 0, Math.PI*2); ctx.fill();
       ctx.beginPath(); ctx.arc(-radius*0.5, 0, 2, 0, Math.PI*2); ctx.fill();
    } else if (type === CreatureType.EEL) {
       ctx.strokeStyle = '#fef3c7';
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.moveTo(-radius, 0);
       ctx.lineTo(radius, 0); // Stripe
       ctx.stroke();
    } else if (type === CreatureType.ALGAE_FISH) {
       ctx.fillStyle = 'rgba(255,255,255,0.2)';
       ctx.beginPath();
       ctx.arc(-radius*0.3, -radius*0.2, radius*0.2, 0, Math.PI*2);
       ctx.fill();
    } else if (type === CreatureType.WORKER) {
       // Suit Collar
       ctx.fillStyle = "white";
       ctx.beginPath();
       ctx.moveTo(radius * 0.2, -radius * 0.5);
       ctx.lineTo(radius * 0.2, radius * 0.5);
       ctx.lineTo(-radius * 0.4, 0);
       ctx.fill();
       // Tie
       ctx.fillStyle = "#ef4444";
       ctx.beginPath();
       ctx.moveTo(0, 0);
       ctx.lineTo(radius * 0.3, 0);
       ctx.lineTo(radius * 0.3, radius * 0.2); // Short tie because fish
       ctx.fill();
    }

    ctx.restore();
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, entity: Entity, time: number, isPlayer = false) => {
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(entity.angle);

    if (entity.isHidden) ctx.globalAlpha = 0.5;

    // --- 1. Draw Tail (Behind body) ---
    drawTail(ctx, entity, time);

    // --- 2. Draw Body ---
    // Create Gradient for 3D look
    const grad = ctx.createRadialGradient(-entity.radius*0.2, -entity.radius*0.2, entity.radius*0.2, 0, 0, entity.radius);
    grad.addColorStop(0, '#ffffff'); // Highlight
    grad.addColorStop(0.3, entity.config.color);
    grad.addColorStop(1, '#000000'); // Shadow edge
    
    // Override gradient for specific flat styles (like Ghost)
    if (entity.type === CreatureType.GHOST) {
      ctx.fillStyle = 'rgba(200, 200, 255, 0.4)';
      ctx.shadowBlur = 15;
      ctx.shadowColor = entity.config.color;
    } else {
      ctx.fillStyle = entity.type === CreatureType.WORKER ? '#cbd5e1' : grad; // Worker wears a shirt
      if (isPlayer) {
         ctx.shadowBlur = 20;
         ctx.shadowColor = entity.config.color;
      }
    }

    // Calc Mouth (Max 180 degrees total = PI radians. Half angle is PI/2)
    const rawGap = (entity.mouthOpenValue || 0) * 2.5;
    const mouthGap = Math.min(Math.PI / 2, rawGap); 

    drawBodyPath(ctx, entity, mouthGap);
    
    // Only fill if not handled by custom logic in drawBodyPath (mostly standard shapes)
    if (![CreatureType.JELLYFISH].includes(entity.type)) {
       ctx.fill();
    }

    // --- 3. Patterns & Fins ---
    drawPatterns(ctx, entity);
    drawFins(ctx, entity, time);

    // --- 4. Eyes ---
    const isChomping = entity.mouthOpenValue > 0.3;
    const eyeSize = entity.radius * (isChomping ? 0.3 : 0.25);
    const eyeX = entity.radius * 0.3;
    const eyeY = -entity.radius * 0.4;

    if (entity.type === CreatureType.WORKER) {
       // Glasses
       ctx.strokeStyle = "black";
       ctx.lineWidth = 2;
       ctx.strokeRect(eyeX - 5, eyeY - 5, eyeSize + 10, eyeSize);
       ctx.fillStyle = "white";
       ctx.fillRect(eyeX - 5, eyeY - 5, eyeSize + 10, eyeSize);
    } else if (entity.type === CreatureType.GHOST) {
       ctx.fillStyle = "#000";
       ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
       ctx.fillStyle = "red";
       ctx.beginPath(); ctx.arc(eyeX, eyeY, 2, 0, Math.PI*2); ctx.fill();
    } else if (entity.type !== CreatureType.JELLYFISH) {
       ctx.fillStyle = "white";
       ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
       ctx.fillStyle = "black";
       ctx.beginPath(); ctx.arc(eyeX + 2, eyeY, eyeSize * 0.4, 0, Math.PI*2); ctx.fill();
    }

    // --- 5. Teeth (Top Layer) ---
    if (mouthGap > 0.2 && entity.type !== CreatureType.JELLYFISH) {
       ctx.fillStyle = "white";
       const tSize = entity.radius * 0.2;
       
       // Upper
       ctx.save();
       ctx.rotate(-mouthGap);
       ctx.beginPath();
       ctx.moveTo(entity.radius * 0.5, 0);
       ctx.lineTo(entity.radius * 0.7, tSize);
       ctx.lineTo(entity.radius * 0.9, 0);
       ctx.fill();
       ctx.restore();
       
       // Lower
       ctx.save();
       ctx.rotate(mouthGap);
       ctx.beginPath();
       ctx.moveTo(entity.radius * 0.5, 0);
       ctx.lineTo(entity.radius * 0.7, -tSize);
       ctx.lineTo(entity.radius * 0.9, 0);
       ctx.fill();
       ctx.restore();
    }

    // Boss Ring
    const isGod = isPlayer && (entity as PlayerState).isGodMode;
    if (entity.config.behavior === 'BOSS' || isGod) {
       ctx.strokeStyle = isGod ? '#f59e0b' : '#ef4444';
       ctx.lineWidth = 3;
       ctx.beginPath();
       ctx.arc(0, 0, entity.radius * 1.5, 0, Math.PI * 2);
       ctx.stroke();
    }

    ctx.restore();
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: Obstacle) => {
    ctx.save();
    ctx.translate(obs.x, obs.y);
    
    // Add gradients to obstacles too
    if (obs.type === 'ROCK') {
      const grad = ctx.createRadialGradient(-10, -10, 10, 0, 0, obs.radius);
      grad.addColorStop(0, '#94a3b8');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.type === 'CORAL') {
      const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, obs.radius);
      grad.addColorStop(0, '#f472b6');
      grad.addColorStop(1, '#9d174d');
      ctx.fillStyle = grad;
      ctx.beginPath();
      const spikes = 12;
      for (let i = 0; i < spikes * 2; i++) {
         const r = obs.radius + (i % 2 === 0 ? 0 : 15);
         const a = (Math.PI * 2 * i) / (spikes * 2);
         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    
    ctx.restore();
  };

  // NEW: Indicator Drawer
  const drawIndicators = (ctx: CanvasRenderingContext2D, entity: Entity, player: PlayerState) => {
    // Only show indicators for visible, non-player entities
    if (entity.isHidden || entity.id === player.id) return;

    const canEat = player.radius >= entity.radius * 1.1;
    const isDangerous = player.radius < entity.radius;
    
    // Ignore harmless small things that are not edible yet (between 1.0 and 1.1 size)
    // or things that are same size.
    // Plankton doesn't need indicators, too small/numerous
    if (entity.type === CreatureType.PLANKTON) return;

    if (canEat || player.isGodMode) {
      // Draw Green Target Arrow
      ctx.save();
      ctx.translate(entity.x, entity.y - entity.radius - 20);
      ctx.fillStyle = '#4ade80'; // Green
      ctx.beginPath();
      ctx.moveTo(-5, -10);
      ctx.lineTo(5, -10);
      ctx.lineTo(0, 0); // Point down
      ctx.fill();
      ctx.restore();
    } else if (isDangerous && !player.isGodMode) {
      // Draw Red Exclamation
      ctx.save();
      ctx.translate(entity.x, entity.y - entity.radius - 20);
      ctx.fillStyle = '#ef4444'; // Red
      
      // Exclamation Mark Body
      ctx.beginPath();
      ctx.rect(-2, -15, 4, 10);
      ctx.fill();
      
      // Dot
      ctx.beginPath();
      ctx.arc(0, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
  };

  // ... (Keep drawGrid as is)
  const drawGrid = (ctx: CanvasRenderingContext2D, camX: number, camY: number, width: number, height: number) => {
    const gridSize = 100;
    const offsetX = -camX % gridSize;
    const offsetY = -camY % gridSize;

    ctx.strokeStyle = '#1e293b'; 
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = offsetX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.strokeRect(-camX, -camY, WORLD_SIZE, WORLD_SIZE);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const { width, height } = canvas;
      const { camera, player, entities, particles, obstacles, time } = gameState;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0f172a'); 
      gradient.addColorStop(1, '#020617'); 
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      drawGrid(ctx, camera.x, camera.y, width, height);

      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      // --- Z-Sorting for Depth ---
      
      const hiddenEntities = entities.filter(e => e.isHidden);
      hiddenEntities.forEach(e => drawEntity(ctx, e, time));
      if (player.isHidden) drawEntity(ctx, player, time, true);

      obstacles.forEach(o => drawObstacle(ctx, o));

      const visibleEntities = entities.filter(e => !e.isHidden);
      visibleEntities.forEach(e => {
        drawEntity(ctx, e, time);
        // Draw Indicator above entity
        drawIndicators(ctx, e, player);
      });
      
      if (!player.isHidden) drawEntity(ctx, player, time, true);

      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      // Name tags
      entities.forEach(e => {
        if (e.radius > 40 && !e.isHidden) {
          ctx.fillStyle = "white";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(e.config.name, e.x, e.y - e.radius - 30); // Raised slightly to make room for indicators
          
          if (e.health < e.maxHealth) {
             ctx.fillStyle = "red";
             ctx.fillRect(e.x - 20, e.y - e.radius - 25, 40, 4);
             ctx.fillStyle = "#22c55e";
             ctx.fillRect(e.x - 20, e.y - e.radius - 25, 40 * (e.health / e.maxHealth), 4);
          }
        }
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  const handleMouseMove = (e: React.MouseEvent) => {
    onMouseMove(e.clientX, e.clientY);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    onMouseMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      className="absolute top-0 left-0 w-full h-full cursor-crosshair"
    />
  );
};

export default GameCanvas;