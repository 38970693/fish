# PXR-01 · 渲染边界与双入口记录

日期：2026-09-19  
状态：✅ 放行

## 交付结果

- `src/rendering/types.ts` 定义统一的 `GameRenderer`、`Viewport`、`RenderMetrics` 和渲染器类型。
- `CanvasGameRenderer` 接管 Canvas 初始化、resize、单帧计时、指标和销毁；原绘制函数保持原样，像素语义不变。
- `GameCanvas` 在挂载周期内只创建一个渲染器和一条绘制 RAF，HUD 的 100ms React 刷新只更新状态引用，不再重建绘制循环。
- `CameraAdapter` 统一世界/屏幕坐标互转，并输出 Pixi 容器可直接使用的 pivot、position 和 scale。
- `RendererSurface` 成为 React 的唯一渲染挂载入口。
- `?renderer=canvas|pixi` 优先选择渲染器，选择写入 `localStorage`；没有 URL 时读取偏好，没有偏好时默认 Canvas。
- 当前生产构建尚未开放 Pixi，收到 Pixi 偏好会安全回退 Canvas；DEV 可反复切换并验证卸载。
- DEV 调试钩子提供当前选择和 Canvas 渲染指标：`__FISH_DEBUG__.renderer()`、`__FISH_RENDER_METRICS__()`。

## 验证结果

- TypeScript：通过。
- 单元测试：545/545（44 个文件），新增选择规则、视口、相机可逆性和 Canvas 生命周期测试。
- 专项浏览器测试：3/3；完整浏览器回归：26/26。覆盖默认 Canvas、URL 与持久偏好、Canvas/Pixi 连续切换、Pixi 卸载、resize、WebGL 上下文恢复，以及既有菜单、对局、投食和三分钟争霸流程。
- 生产构建：通过，主包 431.72 kB（gzip 138.08 kB）；Pixi 动态实验块未进入生产输出。

## 下一步

执行 PXR-02：让 Pixi 宿主实现七层舞台和共享相机，迁移海水背景、地图边界、障碍、建筑、喷泉及传送门，并接入视野裁剪。
