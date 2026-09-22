# 欢乐鱼塘 · PixiJS 渲染迁移计划

版本：1.0  
日期：2026-09-19  
状态：已完成（PXR-00～06 全部放行）  
预计投入：单人全职 5～8 周；首个可评审原型 5～7 个工作日

## 1. 目标

保留现有 React 页面、`GameState`、60fps 固定步长逻辑循环、AI、战斗、生成、阵营、进化、音频和玩法规则，只把 `GameCanvas.tsx` 的 Canvas 2D 即时绘制逐步迁移到 PixiJS 的保留模式渲染。

迁移完成后应具备：

1. 现有 30 种生物、20 类形状、装扮、建筑、地形、事件和反馈全部可见且语义一致。
2. 渲染对象按实体 ID 复用，不在每帧创建完整场景树。
3. 近景生物可使用分段身体、动态鳍和触手；中远景自动降级。
4. 支持 RenderTexture、Mesh、遮罩和滤镜，为程序化鱼类生成留出接口。
5. 280～300 实体的自然世界与三队争夺场景不低于当前性能基线。
6. 迁移期间保留 Canvas 渲染器，可通过启动参数即时回退。

## 2. 明确边界

### 本次包含

- 引入 `pixi.js`，首版固定使用稳定的 WebGL 渲染路径。
- 建立与具体渲染库无关的渲染器接口、图层和对象生命周期。
- 迁移世界背景、边界、地形、建筑、生物、掉落、粒子、标签和事件提示。
- 将现有生物轮廓拆成可复用的身体部件描述。
- 加入视野裁剪、对象池、纹理缓存和三级细节 LOD。
- 建立视觉对照、截图回归、性能探针和上下文恢复验证。
- Canvas 旧实现保留到 Pixi 默认启用后至少一个稳定阶段。

### 本次不包含

- 不引入 Phaser，不替换现有游戏循环、物理或碰撞。
- 不重写 AI、战斗、阵营、成长和投食规则。
- 不把 React HUD 搬进 Pixi；菜单、HUD、进化和商店继续使用 React DOM。
- 不在等价迁移阶段增加新数值、新物种或改变判定半径。
- 不在首版启用 WebGPU；待 WebGL 版本通过兼容与性能门槛后单独评估。
- `simplex-noise.js`、复杂 Shader 和新美术属于视觉增强阶段，不作为迁移等价放行的前置条件。

## 3. 当前基线

| 项目 | 当前状态 |
|---|---|
| TypeScript 规模 | 约 28,336 行 |
| 主画布 | `src/components/GameCanvas.tsx`，2169 行 |
| 生物模板 | `src/components/fishShapes.ts`，888 行、20 类形状 |
| 小地图 | `src/components/MiniMap.tsx`，626 行，首轮继续使用 Canvas |
| Canvas 相关调用 | 约 1,686 处，主要集中在上述三个文件 |
| 游戏逻辑 | `App.tsx` 固定步长推进 `updateGame()`；逻辑与绘制已有独立 RAF |
| 世界负载 | 上限 300 实体；性能样本约 280 实体、177～191 个活跃 AI |
| 当前性能样本 | PXR-00 重测：平静/三队争夺逻辑 3.26/2.98ms/帧，浏览器帧时间 p95 均为 17.0ms |
| 自动验证 | PXR-06 后为 48 个文件、560 项单测；Pixi 专项 7/7；类型检查与生产构建通过 |

当前分离程度允许只替换渲染：`updateGame()` 不依赖 Canvas；主要耦合点是相机、输入坐标、绘制层级和 DEV 性能探针。

## 4. 架构决策

### 4.1 单一逻辑时钟

`App.tsx` 继续拥有唯一玩法时钟。PixiJS 自带 ticker 必须停止，渲染器只读取最新 `GameState` 并绘制，不推进任何玩法状态。

```text
App 固定步长循环 ──> updateGame(GameState)
                          │
                          ▼
                   Renderer.render(state)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       CanvasRenderer            PixiRenderer
       迁移期回退实现             新默认实现
```

不得让 React 100ms 的 `uiState` 快照驱动画面；渲染器继续读取 `gameStateRef.current`，避免位置跳动。

### 4.2 渲染器契约

新增最小接口，React 组件只管理挂载和输入：

```ts
interface GameRenderer {
  init(host: HTMLElement, viewport: Viewport): Promise<void>;
  resize(viewport: Viewport): void;
  render(state: GameState, now: number): RenderMetrics;
  destroy(): void;
}
```

`CanvasRenderer` 由现有 `GameCanvas` 提取；`PixiRenderer` 实现同一契约。选择参数建议为：

```text
?renderer=canvas
?renderer=pixi
```

迁移期曾默认 `canvas`；PXR-06 已改为默认 `pixi`，仍保留 `?renderer=canvas` 参数回退。

### 4.3 不复制整份 GameState

渲染适配层直接读取只读状态，并维护 `Map<EntityId, DisplayObject>`：

- 新 ID：从对象池领取并创建显示节点。
- 已有 ID：更新位置、旋转、缩放、生命和外观差量。
- 消失 ID：解绑引用并归还对象池。
- 外观签名未变化：复用纹理和几何。
- 只有外观、进化或 LOD 改变时才重建生物视觉。

禁止每帧把 300 个实体映射成新的深拷贝快照。

### 4.4 固定图层

Pixi Stage 使用稳定容器顺序：

1. `background`：海水渐变、远景装饰。
2. `terrain`：边界、障碍、建筑、传送门、喷泉。
3. `underEffects`：尾迹、阴影、藏身和事件底圈。
4. `creatures`：玩家、普通实体、队伍和敌队。
5. `worldItems`：食物、宝藏、掉落和技能物。
6. `overEffects`：粒子、伤害范围、危险预告和光效。
7. `worldLabels`：气泡、浮字、队名和事件名称。

React HUD 保持在 Canvas DOM 容器上方，不进入上述层级。

### 4.5 相机与输入

`GameState.camera` 继续作为唯一真值。Pixi 世界根容器按现有公式设置 pivot、position 和 scale；`screenToWorld()` 与 `worldToScreen()` 保留为公共数学函数，并增加 Pixi 相机一致性测试。

Pixi 不注册玩法输入监听。鼠标、右键和键盘继续由 `App.tsx` 接收，避免 DOM、Pixi EventSystem 和游戏状态出现三套输入路径。

## 5. 生物渲染设计

### 5.1 等价阶段

先把现有 `fishShapes.ts` 的绘制语义转换为声明式部件：

```ts
interface CreatureVisualSpec {
  silhouette: ShapeGeometry;
  rearParts: VisualPart[];
  frontParts: VisualPart[];
  eyeAnchors: Anchor[];
  mouthAnchor: Anchor;
  tailAnchor?: Anchor;
  patternMask: ShapeGeometry;
}
```

20 类形状必须逐个迁移，不允许用一个圆形占位后直接进入默认渲染器。

### 5.2 纹理与几何缓存

缓存键至少包含：

```text
shape + skinColor + pattern + scaleType + mouthType + eyeType
+ eyebrowType + tailType + bodyType + accessory + teeth + LOD
```

- 静态身体与花纹优先合成为 RenderTexture。
- 眼睛、嘴、鳍、尾巴和触手保留独立节点，以便动画。
- 同外观实体共享纹理，不共享位置、动画相位或生命状态。
- 缓存设置数量和显存上限，采用 LRU 释放；换塘和回主菜单主动清理无引用资源。

### 5.3 三级细节

| 等级 | 建议范围 | 表现 |
|---|---:|---|
| LOD 0 | 玩家附近约 900px | 完整身体部件、眼睛、嘴、鳍、触手、阴影和有限滤镜 |
| LOD 1 | 约 900～1800px | 简化关节、关闭细小装饰和高成本滤镜 |
| LOD 2 | 更远或小地图级别 | 单张缓存纹理，只更新位置、旋转和基础透明度 |

具体距离在性能探针后调整，不写入玩法规则。

### 5.4 触手升级接口

KRAKEN、章鱼、水母和头足纲共用 `AppendageRig`：

- 每条附肢由根节点、4～10 个关节、宽度曲线和相位组成。
- 根部跟随身体，波形沿关节传播，末端叠加速度惯性。
- LOD 0 使用 Mesh 或分段带状几何；LOD 1 使用简化曲线；LOD 2 烘焙进纹理。
- 所有局部坐标必须受 `radius * maxExtent` 约束，延续现有 KRAKEN 射线回归测试。
- 首轮只做视觉，不让触手参与额外碰撞和伤害判定。

## 6. 分阶段执行

### PXR-00 · 基线冻结与依赖验证（1～2 天）

- 固定 Node、浏览器、视口、场景种子和 280/300 实体负载。
- 保存 Canvas 的开局、争夺、高危险、商店和战斗测试截图。
- 分别记录逻辑、纯渲染、rAF 帧时间、对象数量和内存趋势。
- 安装并锁定通过验证的 PixiJS v8 版本，只提交最小空画布实验。
- 验证开发、生产构建、HMR、窗口缩放和 WebGL 上下文恢复。

放行：空 Pixi 舞台可由现有 React 页面创建和销毁，零额外逻辑循环、零控制台错误。

### PXR-01 · 渲染边界和双入口（2～4 天）

- 提取 `GameRenderer`、`Viewport`、相机适配器和指标接口。
- 将当前 Canvas 实现包进 `CanvasGameRenderer`，保持像素与行为不变。
- 新增 URL/localStorage 渲染器选择，测试中可明确指定。
- DEV 钩子增加当前渲染器、显示对象数、纹理数和同步绘制耗时。

放行：Canvas 路径全量测试不退化；Canvas/Pixi 可重复切换，卸载后无 RAF、事件监听或 WebGL 资源泄漏。

### PXR-02 · Pixi 世界骨架（3～5 天）

- 接入 Renderer、Stage 和七层容器。
- 迁移背景、相机、地图边界、障碍物、建筑和传送门。
- 完成视野裁剪和 resize；MiniMap 暂时保持旧 Canvas。
- 接通现有输入坐标，不启用 Pixi EventSystem 的玩法输入。

放行：玩家移动、缩放、边界位置、建筑交互命中与 Canvas 一致；世界静态层截图通过人工对照。

### PXR-03 · 生物等价迁移（8～12 天）

- 建立 `CreatureVisualSpec`、对象池、外观签名和纹理缓存。
- 先迁移标准鱼形，再覆盖其余 19 类形状。
- 迁移所有眼睛、嘴型、牙齿、眉毛、尾巴、体型、花纹、鳞片、配饰和尾迹。
- 接入玩家状态：受伤、无敌、藏身、半幽灵、冲刺、技能与附身。
- 把现有绘制指纹测试改造成“视觉规格完整性 + 几何范围”测试；保留 Canvas 测试直到旧渲染器移除。

放行：30 种生物和全部上架装扮无缺失；20 类形状两两可辨；碰撞半径与视觉中心不漂移。

### PXR-04 · 动态世界和反馈（5～8 天）

- 迁移食物、宝藏、投食、敌队轮廓、伤害范围、反击预告和建筑效果。
- 迁移粒子、浮字、气泡、队名和屏幕外方向提示。
- 校准透明度、混合模式、遮罩与绘制顺序。
- 为关键反馈建立 e2e 截图场景，不依赖自然随机世界碰运气。

放行：现有完整 e2e 在 Pixi 路径通过；玩家能分辨投食区、两支敌队、受伤来源、藏身和技能范围。

### PXR-05 · 触手、鱼体与性能（4～7 天）

- 实现 `AppendageRig` 和首版分段身体摆动。
- 加入三级 LOD、对象池统计、纹理 LRU 和离屏缓存。
- 同屏 300 实体做 60 秒压力测试，分别记录平静生态与三队争夺。
- 处理上下文丢失、后台切回、频繁重开、换塘和 HMR。

放行：无全屏几何、无持续显存增长、无对象数量单调增长；性能达到第 8 节门槛。

### PXR-06 · 默认切换与清理（3～5 天）

- 将默认渲染器改为 Pixi。
- 保留 `?renderer=canvas` 回退入口至少一个稳定阶段。
- 完成完整测试、真人视觉检查和低性能设备抽样。
- 更新 AGENTS、架构文档、调试探针与故障排查说明。
- 下一阶段再决定是否删除 Canvas 生物绘制代码。

放行：默认 Pixi 连续试玩无阻断；Canvas 回退仍能进入完整对局；迁移报告包含性能、视觉差异和遗留项。

## 7. 任务清单

| ID | 任务 | 依赖 | 状态 |
|---|---|---|---|
| PXR-00 | 冻结基线并验证 Pixi 最小宿主 | 无 | ✅ |
| PXR-01 | `GameRenderer` 契约与双入口 | PXR-00 | ✅ |
| PXR-02 | Pixi 舞台、相机与静态世界 | PXR-01 | ✅ |
| PXR-03A | 标准鱼形与基础装扮 | PXR-02 | ✅ |
| PXR-03B | 其余 19 类生物形状 | PXR-03A | ✅ |
| PXR-03C | 外观缓存与对象池 | PXR-03A | ✅ |
| PXR-04A | 道具、事件和战斗提示 | PXR-03B | ✅ |
| PXR-04B | 粒子、气泡和世界标签 | PXR-04A | ✅ |
| PXR-05A | 分段触手与鱼体动画 | PXR-03C | ✅ |
| PXR-05B | LOD、缓存预算和性能调优 | PXR-04B、PXR-05A | ✅ |
| PXR-06 | 默认切换、回退与交付记录 | 全部 | ✅ |

## 8. 验收门槛

### 功能

- `LEGACY`、`RIVALS`、战斗测试、进化、商店、胜负和重开流程均可运行。
- 玩法逻辑测试结果不因渲染器改变；相同种子下实体状态逐字段一致。
- 30 种生物、20 类形状和全部已上架装扮无静默降级。
- 投食、敌队、藏身、反击、技能和危险提示不缺失、不遮住核心 HUD。
- 右键、左键、Q/E/R、1/2/3 和屏幕坐标选靶与 Canvas 路径一致。

### 性能

在相同机器、1280×800、相同种子和工作负载下：

- 280～300 实体场景浏览器帧时间 p95 不高于 Canvas 基线的 110%。
- 纯渲染 CPU 时间不高于 Canvas 基线；若 GPU 效果提升导致 CPU 指标不可直接比较，必须同时报告完整帧时间和工作负载。
- 60 秒压力测试没有持续增长的 DisplayObject、纹理或监听器。
- 远景实体进入 LOD 2 后不继续更新高成本关节和滤镜。
- 页面后台停留后返回，不出现逻辑加速、重复 ticker 或多条渲染循环。

### 视觉

- 1280×800 与至少一个窄屏尺寸完成开局、争夺、高危险、商店、进化和 Boss 截图对照。
- 生物中心、朝向、嘴部、眼睛和尾部没有明显漂移。
- 附肢局部坐标不超过形状规定的最大半径；异常几何测试自动失败。
- 近景轮廓边缘、透明触手和文字在深色与浅色背景均可读。

### 回归

- `npm test -- --run`
- `npm run typecheck`
- `npm run build`
- Canvas 与 Pixi 两条路径的关键 e2e
- 现有三分钟 RIVALS 切片和性能探针
- WebGL 上下文恢复、窗口 resize、重开 20 次的资源稳定性脚本

## 9. 风险与控制

| 风险 | 影响 | 控制方式 |
|---|---|---|
| 迁移时顺便改美术导致无法判断回归 | 高 | PXR-02～04 只追求等价；增强集中到 PXR-05 |
| 每帧重建 Graphics/纹理 | 高 | ID 映射、外观签名、对象池和 RenderTexture 缓存 |
| Pixi ticker 与现有 RAF 重复 | 高 | 初始化后停止 ticker；DEV 统计每帧渲染次数 |
| WebGL 滤镜造成批次爆炸 | 高 | 滤镜限定近景与关键角色；按材质排序并测 draw calls |
| React 重渲染驱动画面 | 中 | Pixi 使用命令式宿主，直接读取 `gameStateRef` |
| 视觉半径与碰撞半径不一致 | 高 | 碰撞仍用现有数据；渲染锚点和范围自动测试 |
| 低端设备或 WebGL 不可用 | 中 | 迁移期保留 Canvas 回退；记录失败原因，不静默黑屏 |
| 缓存组合数量失控 | 高 | LRU、显存预算、组合计数监控；远景合并外观维度 |
| 旧截图测试过度依赖像素 | 中 | 几何/层级测试为主，少量固定环境截图为辅 |

## 10. 回退策略

1. 每个阶段都保持 `?renderer=canvas` 可运行。
2. Pixi 初始化、上下文或资源加载失败时，展示明确错误并允许用户切回 Canvas。
3. 不在迁移中改写 `GameState`，因此回退不需要存档转换。
4. PXR-06 前不删除 `drawCuteFish()`、`fishShapes.ts` 和现有性能探针。
5. 若 PXR-05 无法达到性能门槛，默认继续使用 Canvas，同时保留 Pixi 生物实验室，不强行切换。

## 11. 后续增强入口

完成等价迁移后，再单独立项：

- 使用 `simplex-noise.js` 生成带种子的斑纹、鳞片扰动和发光器官分布。
- 用 Mesh 实现脊柱波、软体触手和鳍膜变形。
- 使用有限的 Bloom、Displacement、Lightmap 和水下焦散效果。
- 建立“身体基因”系统，将身体比例、鳍位、尾型、花纹和动作组合成稳定可复现的鱼类外观。
- 增强阶段仍遵守 LOD、缓存预算和玩法判定不随视觉漂移的约束。

## 12. 参考

- [PixiJS GitHub](https://github.com/pixijs/pixijs)
- [PixiJS Render Loop](https://pixijs.com/8.x/guides/concepts/render-loop)
- [PixiJS Filters](https://github.com/pixijs/filters)
- [simplex-noise.js](https://github.com/jwagner/simplex-noise.js)
