import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Portal, Treasure, Hazard, BiomeType, Building, CreatureType, Entity } from '../types';
import { WORLD_SIZE, MAP_SHAPE_CONFIG, BIOME_CONFIGS, TREASURE_CONFIG, BUILDING_CONFIGS, TREASURE_COLORS } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';

interface MiniMapProps {
  gameState: GameState;
  onNavigate?: (worldX: number, worldY: number) => void;
  isExpanded?: boolean;
}

const MINIMAP_SIZE = 200;
const MINIMAP_PADDING = 10;
const MINIMAP_ZOOM_LEVEL = 3; // How much the minimap zooms out

// Threat level colors
const THREAT_COLORS = {
  SAFE: '#22c55e',      // Green - can eat
  NEUTRAL: '#f59e0b',   // Orange - similar size
  DANGER: '#ef4444',    // Red - predator
};

// Building type labels
const BUILDING_LABELS: Record<string, string> = {
  HOSPITAL: '医院',
  SHRINE: '圣地',
  SHOP: '商店'
};

const BUILDING_COLORS: Record<string, string> = {
  HOSPITAL: BUILDING_CONFIGS.HOSPITAL.color,
  SHRINE: BUILDING_CONFIGS.SHRINE.color,
  SHOP: BUILDING_CONFIGS.SHOP.color
};

// MiniMap component
const MiniMap: React.FC<MiniMapProps> = ({ gameState, onNavigate, isExpanded = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blinkState, setBlinkState] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [hoveredEntity, setHoveredEntity] = useState<{x: number, y: number, type: string} | null>(null);
  const [navigationHint, setNavigationHint] = useState<{x: number, y: number} | null>(null);
  const { player, portals, treasures, hazards, buildings, entities, fountains } = gameState;

  // Blinking effect timer (for treasure warning)
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkState(prev => !prev);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Calculate entities within minimap view range
  const getVisibleEntities = useCallback(() => {
    const viewRange = (WORLD_SIZE / MINIMAP_ZOOM_LEVEL);
    return entities.filter(entity => {
      const dx = entity.x - player.x;
      const dy = entity.y - player.y;
      return Math.sqrt(dx * dx + dy * dy) < viewRange;
    });
  }, [entities, player.x, player.y]);

  // Determine threat level of an entity relative to player
  const getThreatLevel = useCallback((entity: Entity | { radius: number }) => {
    const sizeRatio = player.radius / entity.radius;
    if (sizeRatio >= 1.5) return THREAT_COLORS.SAFE; // Can eat
    if (sizeRatio >= 0.7) return THREAT_COLORS.NEUTRAL; // Similar size
    return THREAT_COLORS.DANGER; // Predator
  }, [player.radius]);

  // Handle click to navigate
  const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onNavigate) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / WORLD_SIZE;
    const worldX = (clickX - MINIMAP_PADDING) / scale;
    const worldY = (clickY - MINIMAP_PADDING) / scale;

    // Only navigate if within boundary
    const angle = Math.atan2(worldY - WORLD_SIZE / 2, worldX - WORLD_SIZE / 2);
    const boundaryRadius = getMapBoundaryRadius(angle);
    const distanceFromCenter = Math.sqrt(
      Math.pow(worldX - WORLD_SIZE / 2, 2) + Math.pow(worldY - WORLD_SIZE / 2, 2)
    );

    if (distanceFromCenter < boundaryRadius) {
      onNavigate(worldX, worldY);
    }
  }, [onNavigate]);

  // Handle mouse move for hover effect
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsHovered(true);

    // Detect hovered entity
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / WORLD_SIZE;
    const offset = MINIMAP_PADDING;

    // Convert mouse position to world coordinates
    const worldX = (mouseX - offset) / scale;
    const worldY = (mouseY - offset) / scale;

    // Check for entities near mouse
    const allDots = [
      ...entities.map(e => ({ ...e, type: 'entity' })),
      ...portals.map(p => ({ ...p, type: 'portal' })),
      ...treasures.map(t => ({ ...t, type: `treasure-${t.type}` })),
      ...hazards.map(h => ({ ...h, type: 'hazard' })),
      ...buildings.map(b => ({ ...b, type: `building-${b.type}` })),
    ];

    let found: {x: number, y: number, type: string} | null = null;
    for (const dot of allDots) {
      const dx = dot.x - worldX;
      const dy = dot.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) < 50) { // 50 world units threshold
        found = { x: dot.x, y: dot.y, type: dot.type };
        break;
      }
    }
    setHoveredEntity(found);

    // Set navigation hint
    if (onNavigate) {
      const angle = Math.atan2(worldY - WORLD_SIZE / 2, worldX - WORLD_SIZE / 2);
      const boundaryRadius = getMapBoundaryRadius(angle);
      const distanceFromCenter = Math.sqrt(
        Math.pow(worldX - WORLD_SIZE / 2, 2) + Math.pow(worldY - WORLD_SIZE / 2, 2)
      );
      if (distanceFromCenter < boundaryRadius) {
        setNavigationHint({ x: worldX, y: worldY });
      } else {
        setNavigationHint(null);
      }
    }
  }, [onNavigate, entities, portals, treasures, hazards, buildings]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setHoveredEntity(null);
    setNavigationHint(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / WORLD_SIZE;
    const offset = MINIMAP_PADDING;
    const visibleEntities = getVisibleEntities();

    // Clear canvas
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw flower-shaped map boundary
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

    // Draw biome regions
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

      // Draw biome name label (only when expanded)
      if (isExpanded) {
        ctx.fillStyle = hexToRgba(config.color, 0.6);
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(config.name, x, y + 2);
      }
    });

    // Draw entities as dots (with hover highlight)
    visibleEntities.forEach((entity) => {
      const x = entity.x * scale + offset;
      const y = entity.y * scale + offset;
      const threatColor = getThreatLevel(entity);

      // Highlight if hovered
      if (hoveredEntity && Math.hypot(entity.x - hoveredEntity.x, entity.y - hoveredEntity.y) < 50) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = threatColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = threatColor;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Entity size indicator
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = threatColor;
        ctx.fill();
      }
    });

    // Draw portals (with hover highlight)
    portals.forEach((portal: Portal) => {
      const x = portal.x * scale + offset;
      const y = portal.y * scale + offset;

      // Highlight if hovered
      const isHoveredPortal = hoveredEntity && Math.hypot(portal.x - hoveredEntity.x, portal.y - hoveredEntity.y) < 50;

      if (isHoveredPortal) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#d8b4fe';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#a855f7';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Portal name label
        if (portal.name) {
          ctx.fillStyle = '#d8b4fe';
          ctx.font = 'bold 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(portal.name, x, y - 12);
        }
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#d8b4fe';
        ctx.fill();
      }
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw treasures (with blinking effect and hover)
    treasures.forEach((treasure: Treasure) => {
      const x = treasure.x * scale + offset;
      const y = treasure.y * scale + offset;
      const baseColor = TREASURE_COLORS[treasure.type as keyof typeof TREASURE_COLORS] || TREASURE_COLORS.DEFAULT;

      // Highlight if hovered
      const isHoveredTreasure = hoveredEntity && Math.hypot(treasure.x - hoveredEntity.x, treasure.y - hoveredEntity.y) < 50;

      if (treasure.status === 'WARNING') {
        if (blinkState) {
          // Outer glow
          ctx.beginPath();
          ctx.arc(x, y, isHoveredTreasure ? 10 : 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(252, 211, 77, 0.5)';
          ctx.shadowBlur = 8;
          ctx.shadowColor = TREASURE_COLORS.DEFAULT;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Core
          ctx.beginPath();
          ctx.arc(x, y, isHoveredTreasure ? 5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = TREASURE_COLORS.DEFAULT;
          ctx.fill();

          // Pulse effect
          ctx.beginPath();
          ctx.arc(x, y, 12 + Math.sin(Date.now() * 0.01) * 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(252, 211, 77, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Type label
          if (isHoveredTreasure) {
            ctx.fillStyle = '#fef3c7';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('即将出现', x, y - 14);
          }
        }
      } else {
        // Active state with enhanced colors
        if (isHoveredTreasure) {
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = baseColor;
          ctx.shadowBlur = 12;
          ctx.shadowColor = baseColor;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();

        // Glow effect
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Type label
        if (isHoveredTreasure) {
          const typeNames = { FEAST: '盛宴', CHEST: '宝箱', GEM: '宝石', FOOD: '美食' };
          ctx.fillStyle = baseColor;
          ctx.font = 'bold 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(typeNames[treasure.type as keyof typeof typeNames] || '宝藏', x, y - 12);
        }
      }
    });

    // Draw hazards (meteors) with hover effect
    hazards.forEach((hazard: Hazard) => {
      const x = hazard.x * scale + offset;
      const y = hazard.y * scale + offset;
      const isHoveredHazard = hoveredEntity && Math.hypot(hazard.x - hoveredEntity.x, hazard.y - hoveredEntity.y) < 50;

      if (hazard.stage === 'WARNING') {
        if (isHoveredHazard) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ef4444';
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (hazard.stage === 'STRIKE') {
        ctx.beginPath();
        ctx.arc(x, y, isHoveredHazard ? 10 : 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Show countdown timer when hovered
      if (isHoveredHazard && hazard.countdown !== undefined) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(hazard.countdown / 60)}s`, x, y - 12);
      }
    });

    // Draw buildings with hover effect
    buildings.forEach((building: Building) => {
      const x = building.x * scale + offset;
      const y = building.y * scale + offset;
      const color = BUILDING_COLORS[building.type as keyof typeof BUILDING_COLORS] || '#06b6d4';
      const isHoveredBuilding = hoveredEntity && Math.hypot(building.x - hoveredEntity.x, building.y - hoveredEntity.y) < 50;

      if (isHoveredBuilding) {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Building name
        ctx.fillStyle = color;
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(BUILDING_LABELS[building.type] || '建筑', x, y - 12);
      }

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw fountains (饼干秘境：金色闪烁标记，提醒玩家去吃饼干)
    fountains.forEach((fountain) => {
      const x = fountain.x * scale + offset;
      const y = fountain.y * scale + offset;
      const blink = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;

      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#fbbf24';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 剩余时间环：一圈弧表示秘境还剩多久关闭
      const remain = Math.max(0, fountain.timer) / 3600;
      ctx.beginPath();
      ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw navigation hint when hovering with click destination
    if (navigationHint && onNavigate) {
      const hintX = navigationHint.x * scale + offset;
      const hintY = navigationHint.y * scale + offset;

      // Draw crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hintX - 8, hintY);
      ctx.lineTo(hintX + 8, hintY);
      ctx.moveTo(hintX, hintY - 8);
      ctx.lineTo(hintX, hintY + 8);
      ctx.stroke();

      // Draw circle
      ctx.beginPath();
      ctx.arc(hintX, hintY, 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw player viewport indicator (only when expanded)
    if (isExpanded && gameState.camera) {
      const viewW = 800 / gameState.camera.zoom;
      const viewH = 600 / gameState.camera.zoom;
      const viewX = (gameState.camera.x - viewW / 2) * scale + offset;
      const viewY = (gameState.camera.y - viewH / 2) * scale + offset;
      const viewW2 = viewW * scale;
      const viewH2 = viewH * scale;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(viewX, viewY, viewW2, viewH2);
    }

    // Draw player position
    const playerX = player.x * scale + offset;
    const playerY = player.y * scale + offset;

    // Player outer ring
    ctx.beginPath();
    ctx.arc(playerX, playerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player direction indicator
    const dirX = playerX + Math.cos(player.angle) * 7;
    const dirY = playerY + Math.sin(player.angle) * 7;
    ctx.beginPath();
    ctx.arc(dirX, dirY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

    // Hover effect - show click hint
    if (isHovered && onNavigate) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    }

  }, [player, portals, treasures, hazards, buildings, entities, blinkState, isExpanded, isHovered, hoveredEntity, navigationHint, getVisibleEntities, getThreatLevel, gameState.camera]);

  return (
    <div className={`absolute bottom-20 right-8 ${isHovered ? 'z-50' : ''}`}>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`rounded-xl border-2 transition-all duration-200 ${
          onNavigate ? 'cursor-pointer' : 'pointer-events-none'
        } ${
          isHovered
            ? 'border-cyan-400 shadow-lg shadow-cyan-500/40'
            : 'border-cyan-500/50 shadow-lg shadow-cyan-500/20'
        }`}
      />
      <div className="absolute -top-6 left-0 right-0 text-center">
        <span className="text-cyan-400 text-xs font-bold bg-slate-900/80 px-2 py-0.5 rounded">
          {isExpanded ? '小地图 (展开)' : '小地图'}
        </span>
      </div>

      {/* Hover tooltip */}
      {hoveredEntity && (
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-900/95 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
          {getEntityLabel(hoveredEntity.type)}
        </div>
      )}

      {/* Legend - only show when expanded */}
      {isExpanded && (
        <div className="absolute -left-8 top-8 bg-slate-900/90 rounded-lg p-2 text-xs">
          <div className="flex items-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span>可食用</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <span>相近</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>危险</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function: get label for entity type
function getEntityLabel(type: string): string {
  if (type === 'entity') return '其他玩家';
  if (type === 'portal') return '传送门';
  if (type === 'hazard') return '陨石预警';
  if (type.startsWith('treasure-')) {
    const treasureNames: Record<string, string> = {
      'treasure-FEAST': '盛宴宝藏',
      'treasure-CHEST': '宝箱宝藏',
      'treasure-GEM': '宝石宝藏',
      'treasure-FOOD': '美食宝藏',
    };
    return treasureNames[type] || '宝藏';
  }
  if (type.startsWith('building-')) {
    const buildingType = type.replace('building-', '') as keyof typeof BUILDING_LABELS;
    return BUILDING_LABELS[buildingType] || '建筑';
  }
  return type;
}

// Helper function: convert HEX color to rgba with alpha
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default MiniMap;

// Re-export for testing
export { MINIMAP_SIZE, MINIMAP_PADDING, THREAT_COLORS };