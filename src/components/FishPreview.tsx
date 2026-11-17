/**
 * 鱼外观预览画布 —— 装扮面板的「试衣镜」。
 *
 * 与当前渔场使用相同的渲染引擎，并保留玩家的外观种子和 V2 数据。
 *
 * 用法：
 *   <FishPreview type={player.type} cosmetics={cos} animate />      大预览（动画）
 *   <FishPreview type={player.type} cosmetics={optCos} size={44} /> 选项缩略图（静态帧）
 */

import React, { createContext, useContext, useEffect, useRef } from 'react';
import type { Cosmetics, CreatureType, Entity } from '../types';
import { drawCuteFish } from './GameCanvas';
import { drawBoostTrailCanvas } from '../rendering/boostTrail';
import { makePreviewEntity, previewBoostParticles } from '../rendering/fishPreviewEntity';
import type { RendererKind } from '../rendering/types';
import type { CreatureDisplay } from '../rendering/pixi/CreatureDisplay';

export const FishPreviewContext = createContext<{ fish?: Entity; renderer: RendererKind }>({ renderer: 'canvas' });

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
  boosting?: boolean;
  className?: string;
  /** 无障碍标签 */
  title?: string;
}

/**
 * 静态帧用的时间值：不为 0 是为了让嘴张开一点、尾巴带点摆动，
 * 静止的「闭嘴立正」看着像图标而不像活鱼。
 */
const STATIC_VISUAL_TIME = 14;

const FishPreview: React.FC<FishPreviewProps> = ({
  type,
  cosmetics,
  size,
  width,
  height,
  animate = false,
  boosting = false,
  className,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { fish, renderer } = useContext(FishPreviewContext);

  const w = width ?? size ?? 48;
  const h = height ?? size ?? 48;
  const cosmeticsSignature = JSON.stringify(cosmetics);

  // HUD 定时刷新会新建缩略图的装扮对象；只在内容变化时重建绘图节点。
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

    const entity = makePreviewEntity(type, cosmetics, w, h, boosting, fish);
    let alive = true;
    let raf = 0;
    let display: CreatureDisplay | undefined;
    let release: (() => void) | undefined;
    delete canvas.dataset.renderer;

    const paintCanvas = (visualTime: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (boosting) {
        for (const p of previewBoostParticles(entity, visualTime)) drawBoostTrailCanvas(ctx, p);
      }
      // isPlayer=false：预览不需要玩家那圈光环，它会盖住配饰、也让缩略图变得花
      drawCuteFish(ctx, entity, visualTime, false);
    };

    const startPainting = (paint: (visualTime: number) => void) => {
      if (!alive) return;
      const start = performance.now();
      const frame = (visualTime: number) => {
        paint(visualTime);
        canvas.dataset.renderer = renderer;
        canvas.dataset.visualTime = String(visualTime);
        canvas.dataset.boosting = String(boosting);
      };
      frame(STATIC_VISUAL_TIME);
      if (!animate) return;
      const loop = () => {
        if (!alive) return;
        frame(STATIC_VISUAL_TIME + (performance.now() - start) / (1000 / 60));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    if (renderer === 'pixi') {
      void import('../rendering/pixi/FishPreviewRenderer').then(async ({ acquireFishPreviewRenderer }) => {
        if (!alive) return;
        const lease = acquireFishPreviewRenderer();
        release = lease.release;
        const backend = await lease.ready;
        if (!alive) return;
        display = backend.createDisplay(entity.id);
        startPainting(time => backend.paint(canvas, display!, entity, time, w, h, dpr, boosting));
      }).catch(error => {
        if (alive) console.error('Fish preview renderer failed', error);
      });
    } else {
      startPainting(paintCanvas);
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      display?.destroy();
      release?.();
    };
  }, [type, cosmeticsSignature, w, h, animate, boosting, renderer, fish?.id, fish?.type, fish?.config, fish?.appearanceV2, fish?.animOffset]);

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
