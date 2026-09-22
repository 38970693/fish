# PXR-04A 动态反馈记录

日期：2026-09-20  
状态：完成

## 交付范围

- `underEffects`：投食预告/争夺区域、脉冲底色和虚线边界。
- `worldItems`：投食饼干、宝藏预告、盛宴/宝箱/宝石/美食，以及金币、贝壳、漂流瓶、加速和护盾道具。
- `overEffects`：抢食帮实线轮廓、伏击帮虚线轮廓、大鱼反击判定范围、贴身倒计时环和进度弧。
- `worldLabels`：投食阶段、宝藏名称和敌队稳定名称。
- DEV 探针新增可见世界物品、战斗预告和敌队标记计数。

## 几何与稳定性

Pixi 的同一 `Graphics` 路径会把相邻 `arc()` 自动连线。所有分段虚线圆、反击进度弧和贝壳半圆均显式 `moveTo` 圆弧起点，固定画廊确认没有跨屏连线。

三个动态图层在没有内容时设为不可见，避免 Pixi v8 连续提交空 `Graphics` 上下文时触发 batcher 异常。

## 固定场景

`pixiFeedbackGallery()` 同屏布置：

- 1 个投食争夺区与 5 个饼干；
- 1 个宝藏预告与 4 种激活宝藏；
- 5 种世界道具；
- 2 种敌队标记；
- 2 个反击预告。

截图：`scripts/pxr04a-feedback-gallery.png`

## 验证

- `npm run typecheck`：通过。
- `npm run test`：46 个文件、553/553 通过。
- `npm run build`：通过。
- `npx playwright test e2e/pixi-host.spec.ts --workers=1`：6/6 通过。
- 固定画廊探针：15 个可见世界物品、2 个反击预告、2 个敌队标记，页面错误为 0。

## 下一步

PXR-04B 将迁移粒子、浮字、对话气泡、队伍标记和其余世界标签。
