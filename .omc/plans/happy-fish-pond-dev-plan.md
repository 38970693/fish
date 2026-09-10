# Happy Fish Pond 开发计划

## 背景

项目已实现性能优化（QuadTree、Viewport Culling、AI Culling）和测试框架。接下来需要：
1. 完善测试覆盖（进化、战斗、建筑、宝藏、生物群系）
2. 验证现有功能实现完整性

## 需求总结

### 已完成
- ✅ QuadTree 空间分区
- ✅ Viewport Culling
- ✅ AI Update Culling
- ✅ Vitest + Playwright 测试框架
- ✅ 基础单元测试（gameEngine, constants, MiniMap）

### 待完成（测试覆盖）
1. **Evolution flow tests** - 进化流程测试
2. **Combat/eating mechanics tests** - 战斗/吃食机制测试
3. **Building interaction tests** - 建筑交互测试
4. **Treasure event tests** - 宝藏事件测试
5. **Biome effects tests** - 生物群系效果测试

### 待验证（功能完整性）
6. **Projectile 系统** - 鱼雷实现验证
7. **Skill cooldown 系统** - 技能冷却逻辑验证
8. **Cosmetic 渲染** - 所有妆容类型渲染验证

## 验收标准

1. 所有新测试用例通过
2. 覆盖率报告 ≥ 60%（新增部分）
3. 无 TypeScript 编译错误
4. Playwright E2E 测试通过

## 实施步骤

### 阶段 1：游戏逻辑测试

#### 1.1 Evolution flow tests
- 测试文件：`src/__tests__/evolution.test.ts`
- 测试场景：
  - 吃食获得进化点数
  - 达到进化阈值触发进化
  - 进化后属性变化（weight, level, size）
  - 不同进化阶段的外观变化

#### 1.2 Combat/eating mechanics tests
- 测试文件：`src/__tests__/combat.test.ts`
- 测试场景：
  - 大鱼吃小鱼判定（size comparison）
  - 伤害计算（damage, health reduction）
  - 死亡判定和实体移除
  - 攻击冷却（attackCooldown）

#### 1.3 Building interaction tests
- 测试文件：`src/__tests__/building.test.ts`
- 测试场景：
  - HOSPITAL 治疗效果
  - ARMORY 升级效果
  - SHRINE 技能增强
  - SHOP 购买逻辑

### 阶段 2：事件系统测试

#### 2.1 Treasure event tests
- 测试文件：`src/__tests__/treasure.test.ts`
- 测试场景：
  - 宝藏生成（WARNING → ACTIVE）
  - 不同类型效果（FEAST/CHEST/GEM/FOOD）
  - 拾取判定和效果应用

#### 2.2 Biome effects tests
- 测试文件：`src/__tests__/biome.test.ts`
- 测试场景：
  - 不同 biome 类型识别
  - biome 属性加成（speed, damage）
  - biome 减益效果（debuff）
  - biome 过渡效果

### 阶段 3：功能验证

#### 3.1 Projectile 系统验证
- 检查文件：`src/types.ts`, `src/gameEngine.ts`
- 验证内容：
  - Projectile 接口定义完整性
  - 鱼雷发射逻辑
  - 鱼雷碰撞检测
  - 鱼雷对实体的伤害

#### 3.2 Skill cooldown 系统验证
- 检查文件：`src/gameEngine.ts` (line 542-546, 704)
- 验证内容：
  - 冷却时间计算（180 - skillLevel * 10）
  - 冷却状态显示
  - 冷却完成后技能可释放

#### 3.3 Cosmetic 渲染验证
- 检查文件：`src/components/GameCanvas.tsx` - `drawCreature()`
- 验证内容：
  - 所有 Cosmetics 字段都有渲染逻辑
  - 渲染顺序正确（body → pattern → accessories → effects）

### 阶段 4：E2E 测试补充

- 文件：`e2e/game.spec.ts`
- 补充测试：
  - 进化流程 E2E
  - 建筑交互 E2E
  - 宝藏拾取 E2E

## 风险和缓解

| 风险 | 缓解 |
|------|------|
| Canvas API mock 不完整 | 使用更完整的 setup.ts mock |
| 游戏状态依赖复杂 | 使用 `gameEngine.test.ts` 中的测试辅助函数 |
| 异步测试不稳定 | 使用 fake timers 避免 timing issues |

## 验证步骤

1. 运行单元测试：`npm run test`
2. 运行覆盖率：`npm run test -- --coverage`
3. 运行 E2E：`npx playwright test`
4. TypeScript 检查：`npx tsc --noEmit`
5. 手动验证：启动 `npm run dev` 检查游戏功能

## 文件结构

```
src/__tests__/
├── evolution.test.ts      # 新增
├── combat.test.ts         # 新增
├── building.test.ts       # 新增
├── treasure.test.ts       # 新增
├── biome.test.ts          # 新增
├── gameEngine.test.ts     # 已存在
├── constants.test.ts      # 已存在
└── MiniMap.test.tsx       # 已存在

e2e/
└── game.spec.ts           # 补充 E2E 测试
```

## 估计工作量

| 阶段 | 测试数 | 复杂度 |
|------|--------|--------|
| 1.1 Evolution | 5-8 | Medium |
| 1.2 Combat | 8-10 | High |
| 1.3 Building | 4-6 | Medium |
| 2.1 Treasure | 5-7 | Medium |
| 2.2 Biome | 4-6 | Low |
| 3.x 验证 | 3 | Low |
| 4. E2E | 4-6 | Medium |
| **总计** | **33-48** | - |