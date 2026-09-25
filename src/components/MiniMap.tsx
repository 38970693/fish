import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Portal, Treasure, Hazard, BiomeType, Building, CreatureType, Entity } from '../types';
import { WORLD_SIZE, MAP_SHAPE_CONFIG, BIOME_CONFIGS, TREASURE_CONFIG, BUILDING_CONFIGS, TREASURE_COLORS } from '../constants';
import { getMapBoundaryRadius } from '../gameEngine';
import { getPond } from '../data/ponds';
import { ENDLESS_WORLD_CONFIG, formatEndlessGlobalCoordinate } from '../data/endlessWorld';

interface MiniMapProps {
  gameState: GameState;
  onNavigate?: (worldX: number, worldY: number) => void;
  isExpanded?: boolean;
}

const MINIMAP_SIZE = 200;
const MINIMAP_PADDING = 10;
const MINIMAP_ZOOM_LEVEL = 3; // How much the minimap zooms out

export const createEndlessMiniMapProjection = (
  player: { x: number; y: number },
  isExpanded = false,
) => {
  const range = ENDLESS_WORLD_CONFIG.RADAR_RANGE * (isExpanded ? 1.35 : 1);
  const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / (range * 2);
  return {
    range,
    scale,
    toMap: (x: number, y: number) => ({
      x: MINIMAP_SIZE / 2 + (x - player.x) * scale,
      y: MINIMAP_SIZE / 2 + (y - player.y) * scale,
    }),
    toWorld: (x: number, y: number) => ({
      x: player.x + (x - MINIMAP_SIZE / 2) / scale,
      y: player.y + (y - MINIMAP_SIZE / 2) / scale,
    }),
  };
};

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
  SHOP: '商店',
  WISHING_WELL: '许愿池',
  PEARL_FARM: '珍珠场',
  SHIPWRECK: '沉船'
};

const BUILDING_COLORS: Record<string, string> = {
  HOSPITAL: BUILDING_CONFIGS.HOSPITAL.color,
  SHRINE: BUILDING_CONFIGS.SHRINE.color,
  SHOP: BUILDING_CONFIGS.SHOP.color,
  WISHING_WELL: BUILDING_CONFIGS.WISHING_WELL.color,
  PEARL_FARM: BUILDING_CONFIGS.PEARL_FARM.color,
  SHIPWRECK: BUILDING_CONFIGS.SHIPWRECK.color
};

// MiniMap component
const MiniMap: React.FC<MiniMapProps> = ({ gameState, onNavigate, isExpanded = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blinkState, setBlinkState] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [hoveredEntity, setHoveredEntity] = useState<{x: number, y: number, type: string} | null>(null);
  const [navigationHint, setNavigationHint] = useState<{x: number, y: number} | null>(null);
  const { player, portals, treasures, hazards, buildings, entities, fountains } = gameState;
  const currents = gameState.currents ?? [];

  // Blinking effect timer (for treasure warning)
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkState(prev => !prev);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Calculate entities within minimap view range
  const getVisibleEntities = useCallback(() => {
    const viewRange = gameState.worldMode === 'ENDLESS'
      ? ENDLESS_WORLD_CONFIG.RADAR_RANGE * (isExpanded ? 1.35 : 1)
      : (WORLD_SIZE / MINIMAP_ZOOM_LEVEL);
    return entities.filter(entity => {
      const dx = entity.x - player.x;
      const dy = entity.y - player.y;
      return Math.sqrt(dx * dx + dy * dy) < viewRange;
    });
  }, [entities, player.x, player.y, gameState.worldMode, isExpanded]);

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

    if (gameState.worldMode === 'ENDLESS') {
      const world = createEndlessMiniMapProjection(player, isExpanded).toWorld(clickX, clickY);
      onNavigate(world.x, world.y);
      return;
    }

    // Convert minimap coordinates to world coordinates
    const scale = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / WORLD_SIZE;
    const worldX = (clickX - MINIMAP_PADDING) / scale;
    const worldY = (clickY - MINIMAP_PADDING) / scale;

    // Only navigate if within boundary
    const angle = Math.atan2(worldY - WORLD_SIZE / 2, worldX - WORLD_SIZE / 2);
    const boundaryRadius = getMapBoundaryRadius(angle, gameState.pondId);
    const distanceFromCenter = Math.sqrt(
      Math.pow(worldX - WORLD_SIZE / 2, 2) + Math.pow(worldY - WORLD_SIZE / 2, 2)
    );

    if (distanceFromCenter < boundaryRadius) {
      onNavigate(worldX, worldY);
    }
  }, [onNavigate, gameState.pondId, gameState.worldMode, player, isExpanded]);

  // Handle mouse move for hover effect
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsHovered(true);

    // Detect hovered entity
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (gameState.worldMode === 'ENDLESS') {
      const projection = createEndlessMiniMapProjection(player, isExpanded);
      const world = projection.toWorld(mouseX, mouseY);
      const allDots = [
        ...entities.map(e => ({ ...e, type: 'entity' })),
        ...treasures.map(t => ({ ...t, type: `treasure-${t.type}` })),
        ...hazards.map(h => ({ ...h, type: 'hazard' })),
        ...buildings.map(b => ({ ...b, type: `building-${b.type}` })),
      ];
      const found = allDots.find(dot => Math.hypot(dot.x - world.x, dot.y - world.y) < 70);
      setHoveredEntity(found ? { x: found.x, y: found.y, type: found.type } : null);
      if (onNavigate) setNavigationHint(world);
      return;
    }
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
      const boundaryRadius = getMapBoundaryRadius(angle, gameState.pondId);
      const distanceFromCenter = Math.sqrt(
        Math.pow(worldX - WORLD_SIZE / 2, 2) + Math.pow(worldY - WORLD_SIZE / 2, 2)
      );
      if (distanceFromCenter < boundaryRadius) {
        setNavigationHint({ x: worldX, y: worldY });
      } else {
        setNavigationHint(null);
      }
    }
  }, [onNavigate, entities, portals, treasures, hazards, buildings, gameState.pondId, gameState.worldMode, player, isExpanded]);

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

    if (gameState.worldMode === 'ENDLESS') {
      const projection = createEndlessMiniMapProjection(player, isExpanded);
      const center = MINIMAP_SIZE / 2;
      const { range, scale: radarScale, toMap } = projection;

      // 无限地图没有“全图缩略图”，小地图改成玩家中心局部雷达。
      ctx.save();
      ctx.strokeStyle = 'rgba(103,232,249,0.16)';
      ctx.lineWidth = 1;
      for (const fraction of [0.33, 0.66, 1]) {
        ctx.beginPath();
        ctx.arc(center, center, (MINIMAP_SIZE / 2 - MINIMAP_PADDING) * fraction, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.beginPath();
      ctx.moveTo(MINIMAP_PADDING, center); ctx.lineTo(MINIMAP_SIZE - MINIMAP_PADDING, center);
      ctx.moveTo(center, MINIMAP_PADDING); ctx.lineTo(center, MINIMAP_SIZE - MINIMAP_PADDING);
      ctx.stroke();
      ctx.restore();

      for (const zone of currents) {
        if (Math.hypot(zone.x - player.x, zone.y - player.y) > range * 1.25) continue;
        const p = toMap(zone.x, zone.y);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(zone.angle);
        ctx.fillStyle = hexToRgba(zone.color, 0.22);
        ctx.fillRect(-zone.length * radarScale / 2, -Math.max(3, zone.width * radarScale) / 2, zone.length * radarScale, Math.max(3, zone.width * radarScale));
        ctx.restore();
      }

      for (const entity of visibleEntities) {
        const p = toMap(entity.x, entity.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = getThreatLevel(entity); ctx.fill();
      }
      for (const building of buildings) {
        if (Math.hypot(building.x - player.x, building.y - player.y) > range) continue;
        const p = toMap(building.x, building.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = BUILDING_COLORS[building.type] ?? '#06b6d4'; ctx.fill();
      }
      for (const treasure of treasures) {
        if (Math.hypot(treasure.x - player.x, treasure.y - player.y) > range) continue;
        const p = toMap(treasure.x, treasure.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = TREASURE_COLORS[treasure.type] ?? TREASURE_COLORS.DEFAULT; ctx.fill();
      }
      for (const hazard of hazards) {
        if (Math.hypot(hazard.x - player.x, hazard.y - player.y) > range) continue;
        const p = toMap(hazard.x, hazard.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
      }

      if (navigationHint && onNavigate) {
        const p = toMap(navigationHint.x, navigationHint.y);
        ctx.strokeStyle = 'rgba(34,211,238,0.7)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(center, center, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      ctx.arc(center + Math.cos(player.angle) * 7, center + Math.sin(player.angle) * 7, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee'; ctx.fill();

      if (isExpanded) {
        const globalX = formatEndlessGlobalCoordinate(player.x, gameState.endlessWorld?.originChunkX ?? '0');
        const globalY = formatEndlessGlobalCoordinate(player.y, gameState.endlessWorld?.originChunkY ?? '0');
        ctx.fillStyle = 'rgba(226,232,240,0.72)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`X ${globalX}  Y ${globalY}`, 8, MINIMAP_SIZE - 8);
      }
      return;
    }

    // Draw the active pond silhouette used by collision and spawning.
    ctx.beginPath();
    const cx = WORLD_SIZE / 2;
    const cy = WORLD_SIZE / 2;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const radius = getMapBoundaryRadius(angle, gameState.pondId) * scale;
      const x = cx * scale + Math.cos(angle) * radius + offset;
      const y = cy * scale + Math.sin(angle) * radius + offset;
      if (angle === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = getPond(gameState.pondId).waterColor;
    ctx.fill();
    ctx.strokeStyle = getPond(gameState.pondId).shoreColor;
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

    // 洋流用一条带箭头的短水道标出，让玩家可以主动规划顺流路线。
    currents.forEach(zone => {
      const x = zone.x * scale + offset;
      const y = zone.y * scale + offset;
      const length = zone.length * scale;
      const width = Math.max(4, zone.width * scale);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(zone.angle);
      ctx.fillStyle = hexToRgba(zone.color, 0.22);
      ctx.strokeStyle = hexToRgba(zone.color, 0.8);
      ctx.lineWidth = 1.5;
      ctx.fillRect(-length / 2, -width / 2, length, width);
      ctx.strokeRect(-length / 2, -width / 2, length, width);
      ctx.beginPath();
      ctx.moveTo(length * 0.12, -3);
      ctx.lineTo(length * 0.24, 0);
      ctx.lineTo(length * 0.12, 3);
      ctx.stroke();
      ctx.restore();
    });

    if (gameState.pondLayout) {
      const discovered = new Set(gameState.discoveredLandmarks ?? []);
      // 稀疏路线提示：只画布局给出的主路线，不揭示动态事件答案。
      ctx.save();
      ctx.strokeStyle = 'rgba(226,232,240,0.18)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      for (const route of gameState.pondLayout.routes) {
        ctx.beginPath();
        route.points.forEach((p, i) => {
          const x = p.x * scale + offset;
          const y = p.y * scale + offset;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // 出生点始终可见；互动地标发现后才显示完整标记，未发现只给方向提示。
      const sx = gameState.pondLayout.spawn.x * scale + offset;
      const sy = gameState.pondLayout.spawn.y * scale + offset;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);

      for (const landmark of gameState.pondLayout.landmarks) {
        const lx = landmark.x * scale + offset;
        const ly = landmark.y * scale + offset;
        const color = landmark.kind === 'LILY' ? '#86efac'
          : landmark.kind === 'NURSERY' || landmark.kind === 'PEARL_BED' ? '#5eead4' : '#c4b5fd';
        if (discovered.has(landmark.id)) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(lx, ly, 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);
          if (isExpanded) {
            const label = landmark.kind === 'LILY' ? '睡莲' : landmark.kind === 'NURSERY' ? '产卵场' : landmark.kind === 'PEARL_BED' ? '珍珠场' : landmark.kind === 'WRECK' ? '沉船' : '热泉';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, lx, ly - 8);
          }
        } else {
          const dx = landmark.x - player.x;
          const dy = landmark.y - player.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const hintRadius = MINIMAP_SIZE * 0.38;
          const hx = MINIMAP_SIZE / 2 + dx / len * hintRadius;
          const hy = MINIMAP_SIZE / 2 + dy / len * hintRadius;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(hx + dx / len * 4, hy + dy / len * 4);
          ctx.lineTo(hx - dy / len * 3, hy + dx / len * 3);
          ctx.lineTo(hx + dy / len * 3, hy - dx / len * 3);
          ctx.closePath();
          ctx.fill();
          if (isExpanded) {
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(len)}m`, hx, hy + 10);
          }
        }
      }
      ctx.restore();
    }

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
        // 塘际门：琥珀色大一圈，一眼和塘内门分开（「多鱼塘」阶段 2a）
        const isPondPortal = portal.kind === 'POND';
        ctx.beginPath();
        ctx.arc(x, y, isPondPortal ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isPondPortal ? '#fcd34d' : '#d8b4fe';
        ctx.fill();
        if (isPondPortal) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      if (portal.kind !== 'POND') {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
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

  }, [
    player, player.x, player.y, player.angle,
    portals, treasures, hazards, buildings, entities, currents,
    blinkState, isExpanded, isHovered, hoveredEntity, navigationHint,
    getVisibleEntities, getThreatLevel,
    gameState.camera, gameState.pondId, gameState.pondLayout, gameState.discoveredLandmarks,
    gameState.worldMode, gameState.endlessWorld?.originChunkX, gameState.endlessWorld?.originChunkY,
  ]);

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
          {gameState.worldMode === 'ENDLESS'
            ? (isExpanded ? '局部雷达 (展开)' : '局部雷达')
            : (isExpanded ? '小地图 (展开)' : '小地图')}
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
