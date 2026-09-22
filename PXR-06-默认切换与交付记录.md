# PXR-06 · 默认切换与交付记录

完成时间：2026-09-20

## 交付状态

- 无 URL 和本地偏好时默认使用 PixiJS WebGL。
- `?renderer=canvas` 继续提供完整 Canvas 回退，并写入本地偏好。
- Pixi 初始化不可用时的 Canvas 安全回退规则保留。
- React HUD 与 Canvas 小地图保持原实现；玩法循环、物理、碰撞、AI 和输入未迁移。
- README 已更新默认渲染器、回退参数和 `src/rendering/` 架构入口。

## 验证

- `npm test -- --run`：48 个文件、560 项通过。
- `npm run typecheck`：通过。
- `npm run build`：通过，生产入口包含默认 Pixi 路径。
- `npx playwright test e2e/pixi-host.spec.ts --workers=1`：7/7 通过。
- PXR-05B 两组 60 秒压力测试和 20 次重开验证通过。

## 保留项

- Canvas 生物绘制代码继续保留一个稳定阶段，便于低性能设备和 WebGL 异常时回退。
- Pixi v8 首个 WebGL 批次偶发瞬时错误已用单帧恢复处理并公开计数；后续升级 Pixi 时应复测并尝试移除兼容逻辑。
- MiniMap 仍使用 Canvas，复杂 Shader、噪声纹理和新的程序化鱼类属于后续视觉增强项目。

