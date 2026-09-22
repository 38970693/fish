# PXR-04B 粒子与标签记录

日期：2026-09-20  
状态：完成

## 交付范围

- 普通粒子和饼干碎屑进入 `underEffects`，保持生命周期透明度。
- 世界浮字使用带描边的暗色气泡背景，支持自定义字号。
- 玩家、普通生物、队员和敌队的 `speechBubble` 均进入 `worldLabels`，背景和尾巴位于 `overEffects`。
- 玩家队员使用青色动态虚线环和“己”字标记。
- 非空心境徽章继续按玩家 900px 范围显示。
- 陨石危险区包含阶段颜色、动态虚线边界和倒计时标签。
- 建筑交互提示、塘际屏幕闪光接入 Pixi。
- 世界标签节点上限为 128，达到容量后复用隐藏节点，避免历史 ID 造成对象数量持续增长。

## 固定场景

`pixiLabelsGallery()` 在 PXR-04A 画廊上增加：10 个粒子、2 条浮字、3 条对话气泡、1 个队员标记和 1 个陨石危险区。

截图：`scripts/pxr04b-labels-gallery.png`

## 验证

- `npm run typecheck`：通过。
- `npm run test`：46 个文件、553/553 通过。
- `npm run build`：通过。
- `npx playwright test e2e/pixi-host.spec.ts --workers=1`：7/7 通过。
- 固定画廊：10 粒子、6 个世界标签、3 个气泡、1 个队员标记、1 个危险区，页面错误为 0。

## 下一步

PXR-05A 将把 KRAKEN、章鱼、水母和头足类附肢统一到分段 `AppendageRig`，并为长体鱼加入分段摆动。
