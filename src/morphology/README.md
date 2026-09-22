# 鱼类形态系统作者指南

形态系统遵守“解析一次，多处渲染”：内容数据只描述鱼，`resolveMorphology()` 生成 `ResolvedMorphology`，Canvas、PixiJS、LOD 和实验室消费同一结果。不要在 `GameCanvas.tsx` 或 `CreatureDisplay.ts` 中按新鱼种 ID 增加分支。

## 增加一种同原型鱼

1. 在 `registry.ts` 的 `MORPHOLOGY_RECIPES` 添加配方。
2. 选择已有 `archetype`，填写标准化默认基因与允许范围。
3. 给背鳍、左胸鳍、左腹鳍和尾鳍指定部件；右侧成对鳍由解析器生成，随后填写材质和动作配置。
4. 在形态实验室用至少 20 个种子检查极值、锚点和 LOD。
5. 运行 `morphology*.test.ts`、类型检查、构建和 `probe-morphology-lab.mjs`。

同原型鱼不得新增渲染器代码。确实需要全新身体语法时，在 `geometry/buildGeometry.ts` 增加一个原型生成器，并同时补 Canvas/PixiJS 语义测试。

## 增加部件

在 `MORPHOLOGY_PARTS` 注册：

- 唯一 `id` 与唯一 `slot`；
- 可使用它的物种标签；
- `geometry.kind`、长度、展开度、分叉和柔软度；
- 绘制层级、最大边界比例与同插槽回退 ID。
- 成对鳍左、右定义使用互指的 `pairId`，几何参数必须一致；配方和常规存档只保存左侧。
- `rootWidth` 与 `blendDepth` 控制鳍根连接区，不得用渲染器里的物种分支修补悬空。

已有 `DORSAL`、`PECTORAL`、`PELVIC`、`TAIL` 几何语法可以仅加数据。当前成对鳍包含短圆、镰刀和飘带三种参数组。只有出现不能由现有参数表达的新部件类别时才扩展渲染适配器。

## 搭配模式

- `SPECIES`：默认模式，部件必须匹配插槽和物种标签。
- `CREATIVE`：允许跨物种标签，但仍要求插槽正确，并在解析结果记录警告。
- `DEVELOPER`：用于开发工具和故障样本；当前仍保护插槽，避免生成不可渲染结构。

所有非法 ID 都必须确定性回退，不允许返回 `undefined`。禁止使用全局 `Math.random()` 生成外观。

## 增加花纹

花纹先在 `materials/patternGrammar.ts` 解析为 `ResolvedPatternLayer`，再由 Canvas/PixiJS 消费。不要在渲染器里按鱼种或 `patternId` 写坐标。

- `BANDS` 使用带状图元表达横带、弯带；
- `SPOTS` 使用圆/环图元并按真实轮廓检查完整边界；
- `LATERAL` 使用成对点列或路径表达装饰侧带；
- `EDGE` 使用共享路径表达身体、鳍和尾缘；
- `SCALES` 使用沿身体流线排列的稀疏椭圆图元。

一条鱼最多三层、48 个图元。每层种子由外观种子和稳定层 ID 派生；修改一层不得扰动其他层。新增语法时同时实现 Canvas/PixiJS 图元适配、LOD 优先级、真实轮廓测试和固定样板。实验室的六套样板由 `PATTERN_SAMPLE_MATERIALS` 注册。

用户覆盖写入 `FishAppearanceV2.patternLayers`，只保存需要调整的层字段。层 ID 必须稳定；修改随机布局时使用 `seedOffset`，不要改全局种子。实验室可直接验证逐层开关、顺序、密度、尺度、颜色、对称和种子偏移，并用“仅看此层”“显示遮罩”“显示图元边界”定位问题。JSON 导入后应保持相同外观签名和图元。

## 保存与迁移

保存 `FishAppearanceV2` 的 `schemaVersion`、配方、种子和用户覆盖项。旧 `Cosmetics` 用 `legacyCosmeticsToAppearance()` 转换。收编和附身时外观跟随身体移动；新字段也必须加入这两条路径的回归测试。

## 动作状态

渲染器通过 `resolveMorphologyMotion(entity, morphology)` 获取每帧动作状态，不各自推导速度或转向。`speedRatio`、`turn`、`tailAmplitude`、`tailFrequency`、`breathAmplitude`、`bodyStretch` 与成对鳍幅度都已限幅；新增动作表现应扩展这份渲染中立结果，再由 Canvas/PixiJS 分别消费。动作状态不得写回实体，也不得改变碰撞和战斗数值。

刹停由“非待机且速度比处于低速区间”识别，两侧鳍同步等幅展开。成对器官始终镜像，转向只由脊柱、尾摆和整体朝向表达。受击只由成功的 `dealDamage()` 写入 8 帧 `hitReactionTimer`，无敌、护盾计算和伤害归属仍由战斗系统负责。渲染器只读取计时器并生成短促压缩，不自行修改计时器。

## 验证命令

```bash
npm run typecheck
npx vitest run src/__tests__/morphology.test.ts src/__tests__/morphology-mesh.test.ts src/__tests__/morphology-archetypes.test.ts src/__tests__/pattern-grammar.test.ts
node scripts/probe-morphology-lab.mjs
node scripts/probe-v3-03-dynamics.mjs
# 启动开发服务器后执行正式性能验收：
$env:PIXI_STRESS_MS='60000'; $env:PIXI_STRESS_OUTPUT='scripts/perf-v3-03-final.json'; node scripts/probe-pixi-stress.mjs
npm run build
```

开发入口：`http://127.0.0.1:3000/previews/morphology-lab.html`。
