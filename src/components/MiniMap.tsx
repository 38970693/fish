import React, { useEffect, useRef, useState } from 'react';
import { GameState, Portal, Treasure, Hazard, BiomeType } from '../types';
import { WORLD_SIZE, MAP_SHAPE_CONFIG, BIOME_CONFIGS, TREASURE_CONFIG } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface MiniMapProps {
  gameState: GameState;
}

const MINIMAP_SIZE = 200;
const MINIMAP_PADDING = 10;

const MiniMap: React.FC<MiniMapProps> = ({ gameState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blinkState, setBlinkState] = useState<boolean>(true);
  const { player, portals, treasures, hazards } = gameState;

  // 闪烁效果定时器（用于宝贝预告闪烁）
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkState(prev => !prev);
    }, 300); // 300ms 闪烁一次
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / WORLD_SIZE;
    const offset = MINIMAP_PADDING;

    // 清除画布
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // 绘制背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // 绘制花瓣形地图边界
    ctx.beginPath();
    const cx = WORLD_SIZE / 2;
    const cy = WORLD_SIZE / 2;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const radius = getMapBoundaryRadius(angle) * scale;
      const x = cx * scale + Math.cos(angle) * radius + offset;
      const y = cy * scale + Math.sin(angle) * radius + offset;
      if (angle === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 58, 95, 0.6)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制生态区
    const biomeAlpha = 0.15;
    Object.entries(BIOME_CONFIGS).forEach(([key, config]) => {
      const biome = key as BiomeType;
      const x = (config.xRange[0] + (config.xRange[1] - config.xRange[0]) / 2) * scale + offset;
      const y = (config.yRange[0] + (config.yRange[1] - config.yRange[0]) / 2) * scale + offset;
      const w = (config.xRange[1] - config.xRange[0]) * scale;
      const h = (config.yRange[1] - config.yRange[0]) * scale;

      ctx.fillStyle = hexToRgba(config.color, biomeAlpha);
      ctx.beginPath();
      ctx.arc(x, y, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // 绘制传送门
    portals.forEach((portal: Portal) => {
      const x = portal.x * scale + offset;
      const y = portal.y * scale + offset;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#d8b4fe';
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 绘制宝藏（带有闪烁效果）
    treasures.forEach((treasure: Treasure) => {
      const x = treasure.x * scale + offset;
      const y = treasure.y * scale + offset;

      if (treasure.status === 'WARNING') {
        // 预告状态：闪烁效果
        if (blinkState) {
          // 外层光环
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(252, 211, 77, 0.5)';
          ctx.fill();

          // 核心
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#fcd34d';
          ctx.fill();

          // 脉动效果
          ctx.beginPath();
          ctx.arc(x, y, 10 + Math.sin(Date.now() * 0.01) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(252, 211, 77, 0.3)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        // 激活状态：静态显示
        const color = treasure.type === 'FEAST' ? '#fcd34d' :
                      treasure.type === 'CHEST' ? '#f59e0b' :
                      treasure.type === 'GEM' ? '#a855f7' : '#10b981';

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // 光芒效果
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // 绘制危险事件（陨石）
    hazards.forEach((hazard: Hazard) => {
      const x = hazard.x * scale + offset;
      const y = hazard.y * scale + offset;
      if (hazard.stage === 'WARNING') {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (hazard.stage === 'STRIKE') {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
      }
    });

    // 绘制玩家位置
    const playerX = player.x * scale + offset;
    const playerY = player.y * scale + offset;

    // 玩家外圈
    ctx.beginPath();
    ctx.arc(playerX, playerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 玩家方向指示
    const dirX = playerX + Math.cos(player.angle) * 7;
    const dirY = playerY + Math.sin(player.angle) * 7;
    ctx.beginPath();
    ctx.arc(dirX, dirY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

  }, [player, portals, treasures, hazards, blinkState]);

  return (
    <div className="absolute bottom-20 right-8 pointer-events-none">
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="rounded-xl border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20"
      />
      <div className="absolute -top-6 left-0 right-0 text-center">
        <span className="text-cyan-400 text-xs font-bold bg-slate-900/80 px-2 py-0.5 rounded">
          小地图
        </span>
      </div>
    </div>
  );
};

// 辅助函数：将 HEX 颜色转换为带 alpha 的 rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default MiniMap;