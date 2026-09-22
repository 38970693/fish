# 鱼类形态系统作者指南

形态系统遵守“解析一次，多处渲染”：内容数据只描述鱼，`resolveMorphology()` 生成 `ResolvedMorphology`，Canvas、PixiJS、LOD 和实验室消费同一结果。不要在 `GameCanvas.tsx` 或 `CreatureDisplay.ts` 中按新鱼种 ID 增加分支。

## 增加一种同原型鱼

1. 在 `registry.ts` 的 `MORPHOLOGY_RECIPES` 添加配方。
2. 选择已有 `archetype`，填写标准化默认基因与允许范围。
3. 给四个必要插槽指定部件，填写材质和动作配置。
4. 在形态实验室用至少 20 个种子检查极值、锚点和 LOD。
5. 运行 `morphology*.test.ts`、类型检查、构建和 `probe-morphology-lab.mjs`。

同原型鱼不得新增渲染器代码。确实需要全新身体语法时，在 `geometry/buildGeometry.ts` 增加一个原型生成器，并同时补 Canvas/PixiJS 语义测试。

## 增加部件

在 `MORPHOLOGY_PARTS` 注册：

- 唯一 `id` 与唯一 `slot`；
- 可使用它的物种标签；
- `geometry.kind`、长度、展开度、分叉和柔软度；
- 绘制层级、最大边界比例与同插槽回退 ID。

已有 `DORSAL`、`PECTORAL`、`TAIL` 几何语法可以仅加数据。只有出现不能由现有参数表达的新部件类别时才扩展渲染适配器。

## 搭配模式

- `SPECIES`：默认模式，部件必须匹配插槽和物种标签。
- `CREATIVE`：允许跨物种标签，但仍要求插槽正确，并在解析结果记录警告。
- `DEVELOPER`：用于开发工具和故障样本；当前仍保护插槽，避免生成不可渲染结构。

所有非法 ID 都必须确定性回退，不允许返回 `undefined`。禁止使用全局 `Math.random()` 生成外观。

## 保存与迁移

保存 `FishAppearanceV2` 的 `schemaVersion`、配方、种子和用户覆盖项。旧 `Cosmetics` 用 `legacyCosmeticsToAppearance()` 转换。收编和附身时外观跟随身体移动；新字段也必须加入这两条路径的回归测试。

## 验证命令

```bash
npm run typecheck
npx vitest run src/__tests__/morphology.test.ts src/__tests__/morphology-mesh.test.ts src/__tests__/morphology-archetypes.test.ts
node scripts/probe-morphology-lab.mjs
npm run build
```

开发入口：`http://127.0.0.1:3000/previews/morphology-lab.html`。

