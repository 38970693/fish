/**
 * 鱼外观预览画布 —— 装扮面板的「试衣镜」。
 *
 * 关键点：它**复用游戏里那个 `drawCuteFish`**，不另写一套简化画法。
 * 这是刻意为之 —— 预览一旦和游戏里长得不一样，玩家换完装回到水里就会发现被骗了，
 * 预览还不如没有。所以这里只负责「造一个假 entity + 摆好画布」，画法全部交给游戏本体。
 *
 * 用法：
 *   <FishPreview type={player.type} cosmetics={cos} animate />      大预览（动画）
 *   <FishPreview type={player.type} cosmetics={optCos} size={44} /> 选项缩略图（静态帧）
 */

import React, { useEffect, useRef } from 'react';
import { CREATURES } from '../data/creatures';
import type { Cosmetics, CreatureType, Entity } from '../types';
import { drawCuteFish } from './GameCanvas';

interface FishPreviewProps {
  /** 要预览的鱼种（玩家当前鱼种） */
  type: CreatureType;
  /** 要预览的装扮 */
  cosmetics: Cosmetics;
  /** 正方形边长（CSS px）。给 width/height 则用它们 */
  size?: number;
  width?: number;
  height?: number;
  /** 是否逐帧动画（大预览开、缩略图关 —— 几十个小画布同时跑 rAF 没必要） */
  animate?: boolean;
  className?: string;
  /** 无障碍标签 */
  title?: string;
}

/**
 * 静态帧用的时间值：不为 0 是为了让嘴张开一点、尾巴带点摆动，
 * 静止的「闭嘴立正」看着像图标而不像活鱼。
 */
const STATIC_VISUAL_TIME = 14;

/** 造一个够 drawCuteFish 用的最小 entity（不进场、不参与任何系统） */
const makePreviewEntity = (
  type: CreatureType,
  cosmetics: Cosmetics,
  radius: number,
  x: number,
  y: number
): Entity =>
  ({
    id: '__preview__',
    type,
    x,
    y,
    radius,
    angle: 0,
    vx: 0,
    vy: 0,
    health: 1,
    maxHealth: 1,
    level: 1,
    animOffset: 0,
    renderScale: 1,
    cosmetics,
    semiGhostTimer: 0,
    config: CREATURES[type],
  }) as unknown as Entity;

const FishPreview: React.FC<FishPreviewProps> = ({
  type,
  cosmetics,
  size,
  width,
  height,
  animate = false,
  className,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const w = width ?? size ?? 48;
  const h = height ?? size ?? 48;

  // 依赖里只放真正影响画面的东西；cosmetics 是每次改动新建的对象，身份变了才重画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高清屏按 devicePixelRatio 放大位图，否则预览糊得像贴纸
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const radius = Math.min(w, h) * 0.3;
    const entity = makePreviewEntity(type, cosmetics, radius, w / 2, h / 2);

    const paint = (visualTime: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // isPlayer=false：预览不需要玩家那圈光环，它会盖住配饰、也让缩略图变得花
      drawCuteFish(ctx, entity, visualTime, false);
    };

    if (!animate) {
      paint(STATIC_VISUAL_TIME);
      return;
    }

    // 用真实时钟推进 visualTime，和游戏里 dt 累积出来的观感一致
    let raf = 0;
    let alive = true;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // 先同步画一帧再进循环：等第一个 rAF 才上色的话，
    // 挂载瞬间画布是空的 —— 用户会看到一帧白板，探针也会采到全透明像素
    paint(STATIC_VISUAL_TIME);
    const loop = () => {
      if (!alive) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      paint(STATIC_VISUAL_TIME + (now - start) / 16.67);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [type, cosmetics, w, h, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      title={title}
      style={{ width: w, height: h, display: 'block' }}
      aria-label={title}
      role="img"
    />
  );
};

export default FishPreview;
