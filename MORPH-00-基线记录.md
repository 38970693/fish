# MORPH-00 · 鱼类形态系统基线记录

> 记录日期：2026-09-21  
> 作用：为 MORPH 队列提供固定入口、代表样本与性能对照。后续视觉变化必须说明是设计变化还是回归。

## 固定入口与样本

- 形态实验室：`http://127.0.0.1:3000/previews/morphology-lab.html`
- 自动探针：`node scripts/probe-morphology-lab.mjs`
- 输出证据：`scripts/morphology-lab.png`
- 默认固定样本：`CLOWN_FISH`，seed `20260921`，星夜材质，长背鳍、长胸鳍、飘带尾。
- 原型样本：`STANDARD_FISH`、`DEEP_BODY`、`PUFFER`、`EEL`，均可在实验室切换。

## 开工前性能对照

PXR-05B 的 300 实体 PixiJS 基线（`scripts/perf-pxr05b-pixi.json`）：

| 场景 | frame p95 | render p95 | 显示对象稳定区间 | 纹理 | LOD 缓存 |
|---|---:|---:|---:|---:|---:|
| natural-calm | 18.6 ms | 6.6 ms | 2082～2086 | 30 | 30 / 1,422,508 B |
| three-team-contest | 18.6 ms | 7.8 ms | 2088～2092 | 30 | 30 / 1,422,508 B |

形态系统放行线：同设备同探针 p95 回退不超过 10%，LOD2 动画更新保持 0，LOD 缓存不超过 64 项 / 32 MiB，长期运行显示对象不持续增长。

## 当前契约

- Canvas 与 PixiJS 都从 `ResolvedMorphology` 读取标准鱼轮廓、锚点、部件和材质身份。
- 外观稳定种子不读取玩法 `Math.random()`。
- 逻辑碰撞圆不随形态变化；实验室用黄色虚线显示逻辑半径。
- V2 外观随收编和附身身体迁移；旧 `Cosmetics` 可确定性转换。
- LOD0 使用完整柔性脊柱，LOD1 减段，LOD2 使用纹理快照且不更新脊柱。

## 完成后性能复测

正式结果见 `scripts/perf-morphology-pixi.json`，两组各运行 60 秒：

| 场景 | frame p95 | 相对旧基线 | render p95 | 显示对象稳定区间 | 纹理 / LOD2 更新 |
|---|---:|---:|---:|---:|---:|
| natural-calm | 18.1 ms | -2.7% | 9.4 ms | 2099～2102 | 30 / 0 |
| three-team-contest | 18.1 ms | -2.7% | 5.8 ms | 2099～2103 | 30 / 0 |

两场景 frame p95 均未回退；纹理与缓存字节稳定，显示对象无持续增长。自然场景的内部 render p95 高于旧值，但仍未推高实际 frame p95，保留为后续材质批处理优化观察项。

## 已知差异

- Canvas 使用二次曲线近似轮廓，PixiJS 近景使用三角条带，因此边缘抗锯齿和弯曲细节不会逐像素相同。
- 非鱼形旧模板仍保留原渲染路径；当前只将标准鱼族作为生产路径，其他原型先在实验室验证。
- 小型装扮仍由旧 `Cosmetics` 绘制；V2 已接管形态、主要部件、材质身份与缓存签名。
