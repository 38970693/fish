import { drawCartoonGloss } from '../rendering/cartoonStyle';
import { cuteOval, cuteRoundRect } from '../rendering/cuteCosmeticShapes';
/**
 * ★ 生物形状模板库 —— 让水母像水母、蟹像蟹 ★
 *
 * 主流程 drawCuteFish 按生物的 shape 把绘制分发给这里的模板。
 * 每个形状提供三件套：
 *   ① defineShapePath —— 身体轮廓（完整闭合 path，供身体 fill 与花纹/鳞片 clip）
 *   ② drawShapeBack   —— 背景附属（触须/腿/尾鳍等，画在身体 fill **之前**，根部被身体盖住只露外段）
 *   ③ drawShapeFront  —— 前景附属（灯笼/独角/剑/钳/壳纹等，画在身体 fill **之后**，盖在身上）
 *
 * 非 FISH 形状的公约（见 creatureShapes.ts）：
 *   · 嘴画成「表面五官」（drawSurfaceMouth），没有轮廓缺口 → 不画口腔内壁、不画装扮牙齿
 *   · 不使用装扮尾巴（drawTail）—— 尾/触须由模板自带
 *   · 眼睛/眉毛/皮肤色/花纹/鳞片/配饰由主流程照常画（花纹 clip 在模板轮廓内）
 *
 * 坐标系与 drawCuteFish 一致：鱼头朝 +x，身体中心 (0,0)，radius 为基准半径。
 * 所有函数内部自行 save/restore；附属尽量用 bodyFill 同色系，对比色手选。
 */

import type { CreatureShapeId } from '../data/creatureShapes';
import type { MouthType } from '../types';

type Ctx = CanvasRenderingContext2D;

/* ════════════════════════ ① 轮廓 ════════════════════════ */

/** 身体轮廓：完整闭合 path（beginPath 由本函数负责）。未知形状回退标准椭圆 */
export const defineShapePath = (ctx: Ctx, shape: CreatureShapeId, radius: number) => {
  const r = radius;
  ctx.beginPath();
  switch (shape) {
    case 'TURTLE':
      ctx.ellipse(0, 0, r * 1.05, r * 0.82, 0, 0, Math.PI * 2);
      break;
    case 'JELLY': {
      // 半圆伞 + 波浪裙边
      ctx.arc(0, 0, r * 0.92, Math.PI, Math.PI * 2);
      const hemY = r * 0.58;
      const w = r * 0.92;
      ctx.quadraticCurveTo(w * 0.72, hemY + r * 0.16, w * 0.5, hemY);
      ctx.quadraticCurveTo(w * 0.25, hemY - r * 0.14, 0, hemY + r * 0.04);
      ctx.quadraticCurveTo(-w * 0.25, hemY + r * 0.18, -w * 0.5, hemY);
      ctx.quadraticCurveTo(-w * 0.72, hemY - r * 0.1, -w, 0);
      ctx.closePath();
      break;
    }
    case 'SEAHORSE':
      ctx.ellipse(0, 0, r * 1.15, r * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'CRAB':
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
      break;
    case 'PUFFER':
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      break;
    case 'CEPHALOPOD': {
      // 泪滴套膜：后端 -x 收尖，前端 +x 圆润
      ctx.moveTo(-r * 1.25, 0);
      ctx.quadraticCurveTo(-r * 0.55, -r * 0.78, r * 0.4, -r * 0.62);
      ctx.quadraticCurveTo(r * 0.98, -r * 0.4, r * 0.98, 0);
      ctx.quadraticCurveTo(r * 0.98, r * 0.4, r * 0.4, r * 0.62);
      ctx.quadraticCurveTo(-r * 0.55, r * 0.78, -r * 1.25, 0);
      ctx.closePath();
      break;
    }
    case 'OCTOPUS':
      ctx.ellipse(0, 0, r * 0.92, r * 0.85, 0, 0, Math.PI * 2);
      break;
    case 'EEL':
      ctx.ellipse(0, 0, r * 1.55, r * 0.4, 0, 0, Math.PI * 2);
      break;
    case 'RAY': {
      // 菱形翼：前缘尖、两翼张、后端收
      ctx.moveTo(r * 0.78, 0);
      ctx.quadraticCurveTo(r * 0.25, -r * 0.85, -r * 0.5, -r * 1.02);
      ctx.quadraticCurveTo(-r * 0.28, -r * 0.3, -r * 0.95, 0);
      ctx.quadraticCurveTo(-r * 0.28, r * 0.3, -r * 0.5, r * 1.02);
      ctx.quadraticCurveTo(r * 0.25, r * 0.85, r * 0.78, 0);
      ctx.closePath();
      break;
    }
    case 'BILLFISH':
      ctx.ellipse(0, 0, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'ANGLER':
      ctx.ellipse(0, 0, r, r * 0.88, 0, 0, Math.PI * 2);
      break;
    case 'HAMMERHEAD':
      ctx.ellipse(0, 0, r * 1.15, r * 0.48, 0, 0, Math.PI * 2);
      break;
    case 'SEAL':
      ctx.ellipse(0, 0, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
      break;
    case 'SHARK':
      ctx.ellipse(0, 0, r * 1.2, r * 0.52, 0, 0, Math.PI * 2);
      break;
    case 'ORCA':
      ctx.ellipse(0, 0, r * 1.2, r * 0.58, 0, 0, Math.PI * 2);
      break;
    case 'NARWHAL':
      ctx.ellipse(0, 0, r * 1.1, r * 0.52, 0, 0, Math.PI * 2);
      break;
    case 'MERMAID':
      ctx.ellipse(0, 0, r * 1.05, r * 0.68, 0, 0, Math.PI * 2);
      break;
    case 'KRAKEN':
      ctx.ellipse(0, 0, r * 0.88, r * 0.82, 0, 0, Math.PI * 2);
      break;
    case 'OARFISH':
      ctx.ellipse(0, 0, r * 1.7, r * 0.34, 0, 0, Math.PI * 2);
      break;
    default:
      ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
  }
  ctx.closePath();
};

/* ══════════════ 可复用小部件 ══════════════ */

/** 月牙尾（画在 -x 端）：鱼形系形状通用 */
const crescentTail = (ctx: Ctx, r: number, spread = 0.5, len = 0.55) => {
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, 0);
  ctx.quadraticCurveTo(-r * (0.95 + len * 0.55), -r * spread, -r * (0.95 + len), -r * spread * 1.25);
  ctx.quadraticCurveTo(-r * (0.95 + len * 0.5), -r * 0.06, -r * (0.95 + len * 0.5), 0);
  ctx.quadraticCurveTo(-r * (0.95 + len * 0.5), r * 0.06, -r * (0.95 + len), r * spread * 1.25);
  ctx.quadraticCurveTo(-r * (0.95 + len * 0.55), r * spread, -r * 0.95, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
};

/** 俯视背鳍：沿身体中轴形成双侧等宽的脊线。 */
const dorsalRidge = (ctx: Ctx, r: number, x: number, length = 0.62, width = 0.08) =>
  drawCartoonGloss(ctx, r, x, length, width);

/* ════════════════════════ ② 背景附属 ════════════════════════ */

export const drawShapeBack = (
  ctx: Ctx,
  shape: CreatureShapeId,
  radius: number,
  visualTime: number,
  animOffset: number,
  bodyFill: string
) => {
  const r = radius;
  const t = visualTime + animOffset * 7; // 每条鱼相位错开
  ctx.save();

  switch (shape) {
    case 'TURTLE': {
      // 四只桨鳍 + 小脑袋 + 短尾（脑袋露在轮廓前，画在身后只露前半）
      ctx.fillStyle = bodyFill;
      for (const sy of [-1, 1]) {
        const flap = Math.sin(t * 0.1) * 0.18;
        ctx.save();
        ctx.translate(r * 0.3, sy * r * 0.72);
        ctx.rotate(sy * (0.7 + flap));
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(-r * 0.55, sy * r * 0.62);
        ctx.rotate(sy * (1.05 - flap));
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(r * 1.02, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.1); ctx.lineTo(-r * 1.22, 0); ctx.lineTo(-r * 1.0, r * 0.1);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'JELLY': {
      // 5 条飘动触须
      ctx.strokeStyle = bodyFill;
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 5; i++) {
        const bx = (i / 4 - 0.5) * r * 1.3;
        const len = r * (1.05 + (i % 3) * 0.22);
        const sway = Math.sin(t * 0.09 + i * 1.4) * r * 0.24;
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.beginPath();
        ctx.moveTo(bx, r * 0.5);
        ctx.quadraticCurveTo(bx + sway * 0.5, r * 0.5 + len * 0.5, bx + sway, r * 0.5 + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'SEAHORSE': {
      // 螺旋卷尾：从尾端向内卷两圈
      ctx.strokeStyle = bodyFill;
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.lineCap = 'round';
      ctx.beginPath();
      let cx = -r * 1.05;
      let cy = 0;
      let ang = Math.PI;
      ctx.moveTo(cx, cy);
      for (let step = 0; step < 26; step++) {
        const rad = r * 0.34 * (1 - step / 30);
        ang += 0.42;
        cx += Math.cos(ang) * rad * 0.42;
        cy += Math.sin(ang) * rad * 0.42;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }
    case 'CRAB': {
      // 两侧各三条关节腿
      ctx.strokeStyle = bodyFill;
      ctx.lineWidth = Math.max(2, r * 0.11);
      for (const sy of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const kick = Math.sin(t * 0.14 + i * 1.1) * r * 0.07;
          const bx = r * (0.35 - i * 0.38);
          ctx.beginPath();
          ctx.moveTo(bx, sy * r * 0.55);
          ctx.lineTo(bx - r * 0.16, sy * (r * 0.95 + kick));
          ctx.lineTo(bx - r * 0.38, sy * (r * 1.2 + kick));
          ctx.stroke();
        }
      }
      break;
    }
    case 'CEPHALOPOD': {
      // 前伸触腕 6 条（根部被套膜盖住）
      ctx.strokeStyle = bodyFill;
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const sy = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const bx = r * 0.72;
        const by = sy * r * (0.16 + row * 0.2);
        const reach = r * (0.55 + (i % 3) * 0.12);
        const sway = Math.sin(t * 0.13 + i * 1.7) * r * 0.16;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + reach * 0.5, by + sway * 0.4, bx + reach, by + sy * r * 0.14 + sway);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      break;
    }
    case 'OCTOPUS': {
      // 裙状短触手：头下一圈下垂小瓣
      ctx.fillStyle = bodyFill;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.25 + (i / 5) * 0.5); // 朝 -x 半区扇形
        const bx = Math.cos(a) * r * 0.75;
        const by = Math.sin(a) * r * 0.78;
        const wig = Math.sin(t * 0.12 + i * 1.3) * r * 0.08;
        ctx.beginPath();
        ctx.ellipse(bx, by + r * 0.18 + wig, r * 0.13, r * 0.26, a + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'EEL': {
      // 鳗形的背鳍在俯视下与中轴重合，放到前景层绘制。
      break;
    }
    case 'RAY': {
      // 细长尾 + 末端毒刺钩
      const whip = Math.sin(t * 0.11) * r * 0.16;
      ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.05);
      ctx.quadraticCurveTo(-r * 1.35, whip * 0.5, -r * 1.7, whip);
      ctx.lineTo(-r * 1.66, whip + r * 0.05);
      ctx.quadraticCurveTo(-r * 1.3, whip * 0.5 + r * 0.12, -r * 0.9, r * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.62, whip - r * 0.03);
      ctx.lineTo(-r * 1.85, whip - r * 0.1);
      ctx.lineTo(-r * 1.64, whip + r * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'BILLFISH':
      ctx.fillStyle = bodyFill;
      crescentTail(ctx, r, 0.42, 0.5);
      break;
    case 'ANGLER': {
      ctx.fillStyle = bodyFill;
      // 小尾鳍
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(-r * 1.25, -r * 0.3);
      ctx.lineTo(-r * 1.18, 0);
      ctx.lineTo(-r * 1.25, r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'HAMMERHEAD':
    case 'SHARK': {
      ctx.fillStyle = bodyFill;
      crescentTail(ctx, r, shape === 'SHARK' ? 0.46 : 0.4, 0.55);
      // 胸鳍
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.1, sy * r * 0.4);
        ctx.lineTo(-r * 0.25, sy * r * 0.85);
        ctx.lineTo(r * 0.28, sy * r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'ORCA': {
      ctx.fillStyle = bodyFill;
      crescentTail(ctx, r, 0.52, 0.58);
      break;
    }
    case 'SEAL': {
      ctx.fillStyle = bodyFill;
      // 后尾鳍：两小横椭圆
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-r * 1.08, sy * r * 0.16, r * 0.22, r * 0.1, sy * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'NARWHAL':
      ctx.fillStyle = bodyFill;
      crescentTail(ctx, r, 0.42, 0.52);
      break;
    case 'MERMAID': {
      // 双叶尾鳍
      ctx.fillStyle = bodyFill;
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.98, 0);
        ctx.quadraticCurveTo(-r * 1.5, sy * r * 0.5, -r * 1.62, sy * r * 0.72);
        ctx.quadraticCurveTo(-r * 1.2, sy * r * 0.42, -r * 0.98, r * 0.08 * sy);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'KRAKEN': {
      // 8 条粗壮触手：从头下半圈放射，锥形 + 末端卷
      // ⚠️ 长度收紧（2026-09-13，用户报「射线满屏」）：1.66r → 1.04r，摆动 0.18r → 0.12r；
      //    触手原先是「从圆心放射的射线」观感，r=120 时单只视觉跨度 ~700px。
      ctx.fillStyle = bodyFill;
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * (0.55 + (i / 7) * 0.9); // 朝 -x 半区
        const sway = Math.sin(t * 0.08 + i * 1.15) * r * 0.12;
        const len = r * (0.72 + (i % 3) * 0.16);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        // len 已经是像素长度，不能再乘一次 r；否则大体型 KRAKEN 会把触手放大到 r²，形成贯穿屏幕的三角射线。
        const tipX = dx * len + sway * dy;
        const tipY = dy * len + sway * dx;
        const perpX = -dy;
        const perpY = dx;
        const w = r * 0.16;
        ctx.beginPath();
        ctx.moveTo(dx * r * 0.55 + perpX * w, dy * r * 0.55 + perpY * w);
        ctx.quadraticCurveTo(tipX * 0.6 + perpX * w * 1.6, tipY * 0.6 + perpY * w * 1.6, tipX + perpX * w * 0.7, tipY + perpY * w * 0.7);
        ctx.quadraticCurveTo(tipX * 0.62, tipY * 0.62, dx * r * 0.55 - perpX * w, dy * r * 0.55 - perpY * w);
        ctx.closePath();
        ctx.fill();
        // 末端卷曲小圆
        ctx.beginPath();
        ctx.arc(tipX + perpX * w * 0.5, tipY + perpY * w * 0.5, w * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'OARFISH': {
      ctx.fillStyle = bodyFill;
      crescentTail(ctx, r * 1.2, 0.3, 0.3);
      break;
    }
    default:
      break;
  }
  ctx.restore();
};

/* ════════════════════════ ③ 前景附属 ════════════════════════ */

export const drawShapeFront = (
  ctx: Ctx,
  shape: CreatureShapeId,
  radius: number,
  visualTime: number,
  animOffset: number,
  bodyFill: string,
  opts?: { lureActive?: boolean }
) => {
  const r = radius;
  const t = visualTime + animOffset * 7;
  ctx.save();

  switch (shape) {
    case 'TURTLE': {
      // 壳纹：中央盾 + 十字弧
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.6, r * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.44); ctx.lineTo(0, r * 0.44);
      ctx.moveTo(-r * 0.42, -r * 0.14); ctx.quadraticCurveTo(0, -r * 0.3, r * 0.42, -r * 0.14);
      ctx.moveTo(-r * 0.42, r * 0.14); ctx.quadraticCurveTo(0, r * 0.3, r * 0.42, r * 0.14);
      ctx.stroke();
      break;
    }
    case 'JELLY': {
      // 伞内高光弧
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, Math.PI * 1.15, Math.PI * 1.75);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, Math.PI * 1.2, Math.PI * 1.7);
      ctx.stroke();
      break;
    }
    case 'SEAHORSE': {
      // 管嘴 + 头冠 + 腹纹
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1.2, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.05); ctx.lineTo(r * 1.42, -r * 0.1);
      ctx.moveTo(r * 0.95, r * 0.09); ctx.lineTo(r * 1.42, r * 0.05);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (const [cx2, cy2, s] of [[-r * 0.15, -r * 0.48, 1], [-r * 0.02, -r * 0.52, 0.7]] as const) {
        ctx.beginPath();
        ctx.moveTo(cx2, cy2);
        ctx.lineTo(cx2 + r * 0.06 * s, cy2 - r * 0.2 * s);
        ctx.lineTo(cx2 + r * 0.14 * s, cy2 - r * 0.02);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * (0.5 + i * 0.28), -r * 0.28);
        ctx.quadraticCurveTo(-r * (0.38 + i * 0.28), 0, -r * (0.5 + i * 0.28), r * 0.28);
        ctx.stroke();
      }
      break;
    }
    case 'CRAB': {
      // 两只大钳 + 壳高光
      ctx.fillStyle = bodyFill;
      for (const sy of [-1, 1]) {
        const open = 0.25 + Math.sin(t * 0.2) * 0.12;
        ctx.save();
        ctx.translate(r * 1.0, sy * r * 0.52);
        ctx.rotate(sy * -0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.2; ctx.stroke();
        // 爪缺口
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.moveTo(r * 0.28, 0);
        ctx.lineTo(r * 0.05, -sy * r * 0.12 * (1 - open * 2));
        ctx.lineTo(r * 0.02, sy * r * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath();
      ctx.ellipse(-r * 0.1, -r * 0.12, r * 0.6, r * 0.34, 0, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
      break;
    }
    case 'PUFFER': {
      // 满身短刺 + 腹白
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = Math.max(1.2, r * 0.06);
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + Math.sin(t * 0.15 + i) * 0.03;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(cos * r * 0.9, sin * r * 0.9);
        ctx.lineTo(cos * r * 1.16, sin * r * 1.16);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(r * 0.1, r * 0.35, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'CEPHALOPOD': {
      // 后端三角套膜鳍 + 体表斑点
      ctx.fillStyle = bodyFill;
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.75, sy * r * 0.32);
        ctx.quadraticCurveTo(-r * 1.2, sy * r * 0.68, -r * 1.32, sy * r * 0.3);
        ctx.quadraticCurveTo(-r * 1.05, sy * r * 0.2, -r * 0.75, sy * r * 0.1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const [sx, sy, s] of [[-r * 0.35, -r * 0.2, 0.12], [-r * 0.7, r * 0.12, 0.09], [r * 0.1, r * 0.28, 0.07]] as const) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'OCTOPUS': {
      // 两片耳鳍（小飞象的耳朵），上下扇动
      ctx.fillStyle = bodyFill;
      const flap = Math.sin(t * 0.18) * 0.22;
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.translate(r * 0.05, sy * r * 0.74);
        ctx.rotate(sy * (0.55 + flap));
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.36, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'EEL': {
      // 体侧斑纹
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      for (let i = 0; i < 5; i++) {
        const bx = -r * 1.1 + i * r * 0.42;
        ctx.beginPath();
        ctx.moveTo(bx, -r * 0.22);
        ctx.quadraticCurveTo(bx + r * 0.1, 0, bx, r * 0.22);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      dorsalRidge(ctx, r, -r * 0.35, 1.25, 0.045);
      break;
    }
    case 'RAY': {
      // 翼上放射纹 + 背部水孔
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      for (const sy of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(-r * 0.05 - i * r * 0.3, 0);
          ctx.quadraticCurveTo(-r * 0.2 - i * r * 0.3, sy * r * 0.5, -r * 0.42 - i * r * 0.28, sy * r * 0.9);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.12, r * 0.05, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'BILLFISH': {
      // 上颌长剑
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(r * 0.85, -r * 0.08);
      ctx.lineTo(r * 1.9, 0);
      ctx.lineTo(r * 0.85, r * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = bodyFill;
      dorsalRidge(ctx, r, -r * 0.05, 0.9, 0.09);
      break;
    }
    case 'ANGLER': {
      // 头顶灯笼：弯杆 + 发光灯泡（lureActive 时光晕增强）
      const glow = 0.7 + Math.sin(t * 0.3) * 0.3;
      const boost = opts?.lureActive ? 1.9 : 1;
      ctx.strokeStyle = '#71717a';
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(r * 0.05, 0);
      ctx.quadraticCurveTo(r * 0.5, 0, r * 1.18, 0);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = `rgba(253,224,71,${Math.min(1, 0.85 * glow * boost)})`;
      ctx.shadowBlur = r * 0.8 * boost;
      ctx.fillStyle = `rgba(253,224,71,${Math.min(1, 0.75 + glow * 0.25)})`;
      ctx.beginPath();
      ctx.arc(r * 1.28, 0, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 獠牙 4 颗
      ctx.fillStyle = '#ffffff';
      for (const [tx, ty, s] of [[r * 0.52, r * 0.3, 1], [r * 0.68, r * 0.34, 0.8], [r * 0.42, r * 0.26, 0.7], [r * 0.82, r * 0.3, 0.6]] as const) {
        ctx.beginPath();
        ctx.moveTo(tx - r * 0.06 * s, ty);
        ctx.lineTo(tx + r * 0.02 * s, ty + r * 0.2 * s);
        ctx.lineTo(tx + r * 0.09 * s, ty - r * 0.02 * s);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'HAMMERHEAD': {
      // 锤形头
      ctx.fillStyle = bodyFill;
      const swing = Math.sin(t * 0.16) * 0.05;
      ctx.save();
      ctx.translate(r * 1.12, 0);
      ctx.rotate(swing);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.16, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // 锤两端的眼点
      ctx.fillStyle = '#111827';
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(-r * 0.02, sy * r * 0.24, r * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = bodyFill;
      dorsalRidge(ctx, r, -r * 0.05, 0.62, 0.07);
      break;
    }
    case 'SEAL': {
      // 前鳍桨 + 胡须
      ctx.fillStyle = bodyFill;
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.translate(r * 0.15, sy * r * 0.42);
        ctx.rotate(sy * (0.6 + Math.sin(t * 0.13) * 0.12));
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.26, r * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.03);
      for (const sy of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(r * 0.5, sy * r * 0.14);
          ctx.lineTo(r * 0.82, sy * (r * 0.1 + i * r * 0.06) - sy * r * 0.1);
          ctx.stroke();
        }
      }
      break;
    }
    case 'SHARK': {
      // 鳃裂 3 条
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      for (let i = 0; i < 3; i++) {
        const bx = r * (0.18 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(bx, -r * 0.22);
        ctx.quadraticCurveTo(bx - r * 0.05, 0, bx, r * 0.22);
        ctx.stroke();
      }
      ctx.fillStyle = bodyFill;
      dorsalRidge(ctx, r, -r * 0.05, 0.72, 0.085);
      break;
    }
    case 'ORCA': {
      // 成对眼后白斑与中轴背脊。
      ctx.fillStyle = 'rgba(245,245,245,0.92)';
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(r * 0.5, sy * r * 0.16, r * 0.2, r * 0.09, sy * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-r * 0.32, sy * r * 0.4, r * 0.16, r * 0.07, -sy * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = bodyFill;
      dorsalRidge(ctx, r, r * 0.08, 0.7, 0.09);
      break;
    }
    case 'NARWHAL': {
      // 螺旋长角
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(r * 0.78, -r * 0.1);
      ctx.lineTo(r * 1.95, 0);
      ctx.lineTo(r * 0.78, r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,116,139,0.6)';
      ctx.lineWidth = Math.max(1, r * 0.035);
      for (let i = 0; i < 5; i++) {
        const f0 = 0.12 + i * 0.17;
        const f1 = f0 + 0.08;
        ctx.beginPath();
        ctx.moveTo(r * (0.78 + f0 * 1.17), -r * 0.07);
        ctx.lineTo(r * (0.78 + f1 * 1.17), r * 0.07);
        ctx.stroke();
      }
      ctx.fillStyle = bodyFill;
      dorsalRidge(ctx, r, -r * 0.12, 0.48, 0.055);
      break;
    }
    case 'MERMAID': {
      // 发束 + 胸衣弧 + 腰链
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const bx = -r * 0.42 + i * r * 0.24;
        ctx.beginPath();
        ctx.moveTo(bx, -r * 0.52);
        ctx.quadraticCurveTo(bx - r * 0.12, -r * 0.2, bx - r * 0.05, r * 0.08);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath();
      ctx.arc(-r * 0.1, -r * 0.05, r * 0.32, Math.PI * 0.25, Math.PI * 0.85);
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-r * (0.15 + i * 0.16), r * 0.3 + Math.sin(i) * r * 0.02, r * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'KRAKEN': {
      // 头部凶纹
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      for (const [ox, oy, rad] of [[-r * 0.2, -r * 0.35, r * 0.3], [-r * 0.35, -r * 0.1, r * 0.22]] as const) {
        ctx.beginPath();
        ctx.arc(ox, oy, rad, Math.PI * 1.15, Math.PI * 1.8);
        ctx.stroke();
      }
      break;
    }
    case 'OARFISH': {
      // 红色背鳍冠在俯视下压缩为沿中轴的脊线。
      ctx.fillStyle = '#ef4444';
      dorsalRidge(ctx, r, r * 0.18, 0.9, 0.075);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.3, sy * r * 0.06);
        ctx.quadraticCurveTo(0, sy * r * 0.16, r * 1.2, sy * r * 0.04);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
};

/* ════════════════════════ ④ 表面嘴 ════════════════════════ */

/**
 * 非鱼形的嘴：贴在头部前缘的小图形（没有轮廓缺口）。
 * mouthOpen ∈ [0.05, 0.6]，来自主流程的呼吸张合。
 */
export const drawSurfaceMouth = (ctx: Ctx, mType: MouthType, radius: number, mouthOpen: number) => {
  const r = radius;
  const mx = r * 0.55;
  const my = r * 0.14;
  ctx.save();
  ctx.strokeStyle = '#655064';
  ctx.fillStyle = '#655064';
  ctx.lineWidth = Math.max(0.9, r * 0.038);
  ctx.lineCap = 'round';

  switch (mType) {
    case 'CIRCLE': {
      const size = r * (0.063 + mouthOpen * 0.045);
      cuteOval(ctx, mx, my, size * 0.82, size, '#655064');
      cuteOval(ctx, mx + size * 0.32, my, size * 0.32, size * 0.62, '#f7afc1');
      break;
    }
    case 'SQUARE': {
      const s = r * (0.065 + mouthOpen * 0.045);
      cuteRoundRect(ctx, mx - s * 0.55, my - s, s * 1.1, s * 2, s * 0.4); ctx.fill();
      cuteOval(ctx, mx + s * 0.2, my, s * 0.2, s * 0.65, '#f7afc1');
      break;
    }
    case 'FLAT': {
      ctx.beginPath();
      ctx.moveTo(mx, my - r * 0.075);
      ctx.quadraticCurveTo(mx + r * 0.02, my, mx, my + r * 0.075);
      ctx.stroke();
      break;
    }
    case 'BEAK': {
      cuteOval(ctx, mx, my, r * 0.095, r * 0.075, '#ffc58c');
      ctx.beginPath(); ctx.moveTo(mx - r * 0.015, my - r * 0.06);
      ctx.quadraticCurveTo(mx + r * 0.035, my, mx - r * 0.015, my + r * 0.06); ctx.stroke();
      cuteOval(ctx, mx - r * 0.035, my - r * 0.025, r * 0.02, r * 0.015, '#fff0d3');
      break;
    }
    case 'CURVE': {
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.015, my - r * 0.11);
      ctx.quadraticCurveTo(mx + r * 0.08, my - r * 0.065, mx + r * 0.015, my);
      ctx.quadraticCurveTo(mx + r * 0.08, my + r * 0.065, mx - r * 0.015, my + r * 0.11);
      ctx.stroke();
      break;
    }
    case 'TRIANGLE':
    default: {
      // A small smiling bean mouth replaces the pointed bite wedge.
      const g = r * (0.075 + mouthOpen * 0.065);
      ctx.beginPath();
      ctx.moveTo(mx - g * 0.35, my - g);
      ctx.quadraticCurveTo(mx + g * 1.15, my - g, mx + g * 1.15, my);
      ctx.quadraticCurveTo(mx + g * 1.15, my + g, mx - g * 0.35, my + g);
      ctx.quadraticCurveTo(mx + g * 0.08, my, mx - g * 0.35, my - g);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f3a0ad';
      ctx.beginPath(); ctx.ellipse(mx + g * 0.7, my, g * 0.32, g * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - g * 0.35, my - g * 1.4);
      ctx.quadraticCurveTo(mx + g * 0.08, my - g * 1.3, mx - g * 0.35, my - g * 0.7);
      ctx.moveTo(mx - g * 0.35, my + g * 1.4);
      ctx.quadraticCurveTo(mx + g * 0.08, my + g * 1.3, mx - g * 0.35, my + g * 0.7);
      ctx.stroke();
      break;
    }
  }
  ctx.lineCap = 'butt';
  ctx.restore();
};
