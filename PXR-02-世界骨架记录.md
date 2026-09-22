# PXR-02 · Pixi 世界骨架记录

日期：2026-09-19  
状态：✅ 放行

## 交付结果

- `PixiGameRenderer` 正式实现 `GameRenderer`，替换 PXR-00 的空舞台探针。
- 建立固定七层：`background`、`terrain`、`underEffects`、`creatures`、`worldItems`、`overEffects`、`worldLabels`。
- Pixi 世界根容器使用共享 `CameraAdapter`，直接读取 `GameState.camera` 设置 pivot、position 和 scale。
- 迁移海水背景、花瓣地图边界、岩石、珊瑚、海草、建筑、喷泉和传送门。
- 静态地图边界只在初始化时构建一次；地形按当前视口裁剪。
- 建筑字标与传送门名称按 ID 池化复用。世界切换时隐藏闲置标签，避免帧内销毁仍被 GPU 批处理引用的节点。
- PXR-03 生物迁移前，玩家使用小型圆形标记保证相机和输入可观察；完整鱼形仍由下一阶段实现。
- Pixi ticker 继续保持停止，React HUD、MiniMap 和玩法输入保持原实现。

## 验证结果

- TypeScript：通过。
- 单元测试：546/546（44 个文件）。
- Pixi 专项浏览器测试：4/4，覆盖双入口、七层舞台、resize、上下文恢复、真实 `GameState.camera` 和静态物件裁剪。
- 完整 e2e 首轮 25/27；失败项是既有页面导航超时和随机争霸时序。页面用例隔离复跑通过，争霸用例第二次隔离复跑通过；Pixi 专项未失败。
- 独立视觉探针连续渲染 73 帧无页面异常；样本为 14 个可见静态物件、18 个显示对象。
- 生产构建：通过，主包 431.72 kB（gzip 138.08 kB）；DEV Pixi 实现仍未进入生产主包。

视觉样本：`scripts/pxr02-pixi-world.png`。复现命令：

```bash
npm run dev -- --host 127.0.0.1
node scripts/probe-pixi-world.mjs
```

## 下一步

执行 PXR-03A：建立 `CreatureVisualSpec`、生物显示对象生命周期和标准鱼形，迁移基础身体、尾巴、眼睛、嘴、花纹及玩家状态表现。
