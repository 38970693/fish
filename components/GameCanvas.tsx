import React, { useRef, useEffect } from 'react';
import { GameState, Entity, Particle, CreatureType, Obstacle, PlayerState, PowerUp, Hazard } from '../types';
import { WORLD_SIZE } from '../constants';

interface GameCanvasProps {
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onMouseMove, onMouseDown, onMouseUp }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- CUTE & FUNNY FISH DRAWING ---
  
  const drawCuteFish = (ctx: CanvasRenderingContext2D, entity: Entity, time: number, isPlayer: boolean) => {
    const { type, radius, animOffset, mouthOpenValue, renderScale, isInvulnerable } = entity;
    
    const safeScale = Number.isFinite(renderScale) ? renderScale : 1;

    ctx.save();
    ctx.translate(entity.x, entity.y);
    
    ctx.scale(safeScale, safeScale);
    ctx.rotate(entity.angle);

    // --- CAMOUFLAGE (Octopus) ---
    if (entity.camoActive) {
      ctx.fillStyle = "#64748b"; 
      ctx.beginPath();
      for(let i=0; i<8; i++) {
        const ang = (Math.PI*2 * i)/8;
        const r = radius * (0.8 + Math.sin(time*0.05 + i * 132)*0.2);
        ctx.lineTo(Math.cos(ang)*r, Math.sin(ang)*r);
      }
      ctx.fill();
      ctx.stroke();
      
      const blink = Math.sin(time * 0.1) > 0.95;
      if (!blink) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(radius*0.3, -radius*0.2, radius*0.15, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(radius*0.3, -radius*0.2, radius*0.05, 0, Math.PI*2);
        ctx.fill();
      }
      
      if (time % 60 < 10) {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(radius * 0.5, -radius * 0.5);
        ctx.lineTo(radius * 0.7, -radius * 0.7);
        ctx.stroke();
      }

      ctx.restore();
      return; 
    }

    if (isInvulnerable || (isPlayer && (entity as PlayerState).isGodMode)) {
      ctx.save();
      ctx.rotate(time * 0.1);
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${(time * 5) % 360}, 100%, 70%)`;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 10]);
      ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    
    if (entity.speedBoostTimer && entity.speedBoostTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#fde047'; 
      ctx.beginPath();
      ctx.arc(-radius, 0, radius * 0.8, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    
    if (entity.ambushTimer > 0) {
       ctx.strokeStyle = "red";
       ctx.lineWidth = 3;
       ctx.beginPath();
       ctx.moveTo(radius * 1.2, 0);
       ctx.lineTo(radius * 1.5, 0);
       ctx.stroke();
    }

    if (entity.isHidden) ctx.globalAlpha = 0.5;

    const wobble = Math.sin(time * 0.3 + animOffset) * 0.05;
    const bodyStretch = 1 + wobble;
    
    if (type !== CreatureType.PLANKTON && type !== CreatureType.JELLYFISH) {
      const finFlap = Math.sin(time * 0.8 + animOffset) * 0.4;
      ctx.fillStyle = entity.config.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      
      if (type === CreatureType.OCTOPUS) {
         for(let i=0; i<8; i++) {
             ctx.save();
             const angle = (Math.PI / 4) * i + (Math.sin(time * 0.2 + i)*0.2);
             ctx.rotate(angle);
             ctx.beginPath();
             ctx.moveTo(0, 0);
             ctx.quadraticCurveTo(radius, 0, radius * 1.5, Math.sin(time * 0.5 + i)*10);
             ctx.lineWidth = radius * 0.2;
             ctx.stroke();
             ctx.restore();
         }
      } else {
        ctx.save();
        ctx.translate(radius * 0.3, radius * 0.6);
        ctx.rotate(Math.PI / 3 + finFlap);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.4, radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(radius * 0.3, -radius * 0.6);
        ctx.rotate(-Math.PI / 3 - finFlap);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.4, radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.lineWidth = 3; 
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; 

    ctx.fillStyle = entity.config.color;
    
    if (type === CreatureType.JELLYFISH) {
       ctx.beginPath();
       ctx.arc(0, 0, radius, Math.PI, 0); 
       ctx.lineTo(radius, radius * 0.5);
       ctx.lineTo(-radius, radius * 0.5);
       ctx.fill();
       ctx.stroke();
       ctx.strokeStyle = entity.config.color;
       for(let i=-2; i<=2; i++) {
         ctx.beginPath();
         ctx.moveTo(i * radius * 0.3, radius * 0.5);
         const sway = Math.sin(time * 0.2 + i + animOffset) * radius;
         ctx.quadraticCurveTo(i * radius * 0.3 + sway, radius * 1.5, i * radius * 0.1, radius * 2.5);
         ctx.stroke();
       }
    } else if (type === CreatureType.PLANKTON) {
       ctx.beginPath();
       ctx.arc(0, 0, radius, 0, Math.PI * 2);
       ctx.fill();
    } else if (type === CreatureType.OCTOPUS) {
       ctx.beginPath();
       ctx.arc(0, 0, radius, 0, Math.PI * 2);
       ctx.fill();
       ctx.stroke();
    } else {
       ctx.beginPath();
       ctx.ellipse(0, 0, radius * bodyStretch, radius * 0.85, 0, 0, Math.PI * 2);
       ctx.fill();
       ctx.stroke(); 
       
       const tailWag = Math.sin(time * 0.4 + animOffset) * 0.3;
       ctx.save();
       ctx.translate(-radius, 0);
       ctx.rotate(tailWag);
       ctx.beginPath();
       ctx.moveTo(0, 0);
       ctx.lineTo(-radius * 0.6, -radius * 0.5);
       ctx.lineTo(-radius * 0.6, radius * 0.5);
       ctx.closePath();
       ctx.fill();
       ctx.stroke();
       ctx.restore();
    }

    if (type === CreatureType.ANGLER_FISH) {
       ctx.strokeStyle = "black";
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.moveTo(radius * 0.5, -radius * 0.2);
       ctx.quadraticCurveTo(radius * 1.2, -radius * 0.8, radius * 1.5, -radius * 0.3);
       ctx.stroke();

       const lightX = radius * 1.5;
       const lightY = -radius * 0.3;
       const isLureActive = entity.lureActive;
       
       ctx.fillStyle = isLureActive ? "#fef08a" : "#4b5563";
       ctx.beginPath();
       ctx.arc(lightX, lightY, radius * 0.15, 0, Math.PI*2);
       ctx.fill();
       ctx.stroke();

       if (isLureActive) {
          ctx.shadowColor = "#fef08a";
          ctx.shadowBlur = 20 + Math.sin(time * 0.2) * 10;
          ctx.fillStyle = "rgba(254, 240, 138, 0.5)";
          ctx.beginPath();
          ctx.arc(lightX, lightY, radius * 0.3, 0, Math.PI*2);
          ctx.fill();
          ctx.shadowBlur = 0; 
       }
    }

    if (type !== CreatureType.PLANKTON && type !== CreatureType.JELLYFISH) {
      const eyeSizeBase = radius * 0.35;
      const eyeX = radius * 0.3;
      const eyeYOffset = radius * 0.35;
      
      const leftEyeSize = eyeSizeBase * 1.1;
      const rightEyeSize = eyeSizeBase * 0.8;

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'black';

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(eyeX, -eyeYOffset, leftEyeSize, 0, Math.PI * 2); 
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(eyeX, eyeYOffset, rightEyeSize, 0, Math.PI * 2); 
      ctx.fill();
      ctx.stroke();

      const lookX = Math.cos(time * 0.1 + animOffset) * leftEyeSize * 0.2;
      const lookY = Math.sin(time * 0.2 + animOffset) * leftEyeSize * 0.2;
      
      ctx.fillStyle = 'black';
      
      ctx.beginPath();
      ctx.arc(eyeX + lookX, -eyeYOffset + lookY, leftEyeSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(eyeX - lookY, eyeYOffset + lookX, rightEyeSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (type !== CreatureType.PLANKTON) {
       ctx.save();
       ctx.translate(radius * 0.6, 0); 
       const breath = 0.4 + 0.1 * Math.sin(time * 0.2 + animOffset);
       const effectiveOpen = Math.max(breath, mouthOpenValue);

       const openW = radius * 0.5; 
       const openH = effectiveOpen * radius * 0.8;
       
       ctx.fillStyle = '#450a0a'; 
       ctx.beginPath();
       ctx.ellipse(0, 0, openW, openH, 0, 0, Math.PI * 2);
       ctx.fill();
       ctx.lineWidth = 2;
       ctx.strokeStyle = 'rgba(0,0,0,0.5)';
       ctx.stroke();

       const toothColor = '#ffffff';
       const toothStroke = '#000000';
       ctx.fillStyle = toothColor;
       ctx.strokeStyle = toothStroke;
       ctx.lineWidth = 2;
       ctx.lineJoin = 'round'; 

       const seed = Math.floor(animOffset * 100);
       const rnd = (i: number) => {
         const x = Math.sin(seed + i * 132.1);
         return x * x; 
       };

       const drawTeethRow = (isTop: boolean) => {
          const numTeeth = (type === CreatureType.ANGLER_FISH || type === CreatureType.LEVIATHAN) ? 5 : 3; 
          const rowY = isTop ? -openH : openH;
          const dir = isTop ? 1 : -1;
          const totalW = openW * 1.6;
          const startX = -totalW / 2 + openW * 0.2;
          const step = totalW / numTeeth;

          ctx.beginPath();
          for(let i=0; i<numTeeth; i++) {
             const tX = startX + i * step;
             const tH = (openH * 0.6) + (openH * 0.6 * rnd(i + (isTop?0:10))); 
             
             const x1 = tX;
             const x2 = tX + step;
             const yBase = rowY;
             const tipX = tX + step * 0.5;
             const tipY = rowY + (tH * dir);

             ctx.moveTo(x1, yBase);
             ctx.quadraticCurveTo(tipX, tipY * 1.2, x2, yBase); 
          }
          ctx.fill();
          ctx.stroke();
       };

       drawTeethRow(true); 
       drawTeethRow(false); 

       ctx.restore();
    }

    if (entity.aggroTimer && entity.aggroTimer > 0 && !isPlayer) {
      ctx.save();
      ctx.translate(0, -radius * 1.5);
      ctx.fillStyle = '#ef4444';
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("💢", 0, 0);
      ctx.restore();
    }

    ctx.restore();
  };

  const drawPowerUp = (ctx: CanvasRenderingContext2D, p: PowerUp, time: number) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const floatY = Math.sin(time * 0.1) * 5;
    ctx.translate(0, floatY);

    if (p.type === 'SPEED') {
      ctx.fillStyle = '#fde047'; 
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b'; 
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, 0);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawHazard = (ctx: CanvasRenderingContext2D, h: Hazard, time: number) => {
     ctx.save();
     ctx.translate(h.x, h.y);
     const pulse = Math.sin(time * 0.5) * 10;

     if (h.stage === 'WARNING') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, h.radius + 20, 0, (Math.PI*2) * (h.timer / 120)); 
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚠️ 危险", 0, -h.radius - 20);
     } else if (h.stage === 'STRIKE') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24'; 
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-50, -150);
        ctx.lineTo(50, -150);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
     }
     ctx.restore();
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: Obstacle, time: number) => {
    ctx.save();
    ctx.translate(obs.x, obs.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';

    if (obs.type === 'ROCK') {
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(-obs.radius*0.3, -obs.radius*0.3, obs.radius*0.2, 0, Math.PI*2);
      ctx.fill();
    } else if (obs.type === 'CORAL') {
      ctx.fillStyle = '#db2777';
      ctx.beginPath();
      const spikes = 8;
      for (let i = 0; i < spikes * 2; i++) {
         const r = obs.radius + (i % 2 === 0 ? 0 : 20);
         const a = (Math.PI * 2 * i) / (spikes * 2);
         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fce7f3';
      ctx.beginPath(); ctx.arc(0,0, obs.radius*0.3, 0, Math.PI*2); ctx.fill();
    } else if (obs.type === 'SEAWEED') {
      ctx.fillStyle = '#14532d'; 
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      const strands = 12 + Math.floor(obs.radius / 15);
      ctx.lineCap = 'round';
      for(let i=0; i<strands; i++) {
        const offset = i * 1324.2;
        const length = obs.radius * (0.8 + Math.sin(offset) * 0.4);
        const angleBase = (Math.PI * 2 * i) / strands;
        const sway = Math.sin(time * 0.05 + offset) * 0.5;
        const tipX = Math.cos(angleBase + sway * 0.2) * length;
        const tipY = Math.sin(angleBase + sway * 0.2) * length;
        const midX = Math.cos(angleBase) * length * 0.5;
        const midY = Math.sin(angleBase) * length * 0.5;
        
        ctx.strokeStyle = '#65a30d'; 
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angleBase)*5, Math.sin(angleBase)*5);
        ctx.quadraticCurveTo(midX + sway * 20, midY, tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = '#a3e635'; 
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angleBase)*5, Math.sin(angleBase)*5);
        ctx.quadraticCurveTo(midX + sway * 20, midY, tipX, tipY);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawIndicators = (ctx: CanvasRenderingContext2D, entity: Entity, player: PlayerState) => {
    if (entity.isHidden || entity.id === player.id || entity.type === CreatureType.PLANKTON) return;

    if (entity.camoActive) return; 

    const isBig = entity.radius > player.radius * 1.5;

    if (isBig && !player.isGodMode && !player.isInvulnerable) {
      ctx.save();
      ctx.translate(entity.x, entity.y - entity.radius - 25);
      ctx.fillStyle = '#ef4444'; 
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", 0, 0);
      ctx.restore();
    }
  };
  
  const drawGrid = (ctx: CanvasRenderingContext2D, camX: number, camY: number, width: number, height: number, zoom: number) => {
    const gridSize = 100;
    
    // Removed border strokeRect
    
    ctx.strokeStyle = '#1e293b'; 
    ctx.lineWidth = 1;
    
    const viewW = width / zoom;
    const viewH = height / zoom;
    const startX = camX - viewW/2;
    const startY = camY - viewH/2;
    const endX = camX + viewW/2;
    const endY = camY + viewH/2;
    
    const snapStartX = Math.floor(startX / gridSize) * gridSize;
    const snapStartY = Math.floor(startY / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = snapStartX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = snapStartY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
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
      const { camera, player, entities, particles, obstacles, powerUps, hazards, time } = gameState;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0f172a'); 
      gradient.addColorStop(1, '#020617'); 
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      drawGrid(ctx, camera.x, camera.y, width, height, camera.zoom);
      obstacles.forEach(o => drawObstacle(ctx, o, time));
      hazards.forEach(h => drawHazard(ctx, h, time));
      powerUps.forEach(p => drawPowerUp(ctx, p, time));

      const sortedEntities = [...entities].sort((a,b) => (a.isHidden ? -1 : 1));
      
      sortedEntities.forEach(e => {
        drawCuteFish(ctx, e, time, false);
        drawIndicators(ctx, e, player);
      });
      
      if (!player.isHidden) {
         drawCuteFish(ctx, player, time, true);
      } else {
         ctx.globalAlpha = 0.5;
         drawCuteFish(ctx, player, time, true);
         ctx.globalAlpha = 1.0;
      }

      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      entities.forEach(e => {
        if (e.radius > 40 && !e.isHidden && !e.camoActive) {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          const textScale = 1 / camera.zoom;
          ctx.save();
          ctx.translate(e.x, e.y - e.radius - 40);
          ctx.scale(textScale, textScale);
          ctx.fillText(e.config.name, 0, 0); 
          ctx.restore();
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
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onMouseDown}
      onTouchEnd={onMouseUp}
      className="absolute top-0 left-0 w-full h-full cursor-crosshair"
    />
  );
};

export default GameCanvas;