# PXR-00 · PixiJS 渲染迁移基线记录

日期：2026-09-19  
代码基线：`dev` / `e2ed786`  
状态：✅ 放行

## 交付结果

- 锁定 `pixi.js@8.21.0`，依赖写入 `package.json` 与 lockfile。
- 新增 DEV 专用 Pixi 最小宿主 `src/rendering/pixi/PixiProbeCanvas.tsx`。
- `?renderer=pixi` 可创建 WebGL 舞台；默认入口继续使用现有 Canvas。
- Pixi ticker 保持停止，宿主只在初始化、resize 和上下文恢复时显式调用 `render()`，没有引入第二套玩法循环。
- 开发入口使用动态导入；生产构建会裁掉实验宿主，主包为 430.01 kB（gzip 137.35 kB），与引入 Pixi 前基本一致。
- WebGL 上下文丢失后由 Pixi 恢复，恢复后主动重绘；组件卸载时销毁舞台、监听器和上下文资源。

## Canvas 性能基线

环境：Chromium，1280×800，目标 16.7ms/帧。原始结果保存于 `scripts/perf-pxr00-canvas.json`。

| 场景 | 实体 | 活跃 AI | 逻辑 ms/帧 | 帧时间 p50 | 帧时间 p95 |
|---|---:|---:|---:|---:|---:|
| 自然平静 | 280 | 190 | 3.262 | 16.7ms | 17.0ms |
| 三队争夺 | 280 | 169 | 2.981 | 16.7ms | 17.0ms |

PXR-05 使用相同机器、视口、场景和负载复测。Pixi 完整场景的 p95 放行上限为 Canvas 基线的 110%，即 18.7ms。

## 验证

```bash
npm run typecheck
npm run test
npm run build
npx playwright test e2e/pixi-host.spec.ts --workers=1
```

浏览器验收覆盖：默认 Canvas 路径、WebGL 初始化、ticker 停止、显式渲染、窗口缩放、WebGL 上下文丢失与恢复。

## 下一步

执行 PXR-01：提取 `GameRenderer`、`Viewport`、相机与指标契约，把现有 Canvas 包装成保持行为不变的实现，并形成正式的 Canvas/Pixi 双入口。
