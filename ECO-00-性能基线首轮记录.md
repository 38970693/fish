# ECO-00 · 三场景性能首轮记录

日期：2026-09-23。状态：基线测量中，**未验收**。探针：`node scripts/probe-eco00-baseline.mjs`（需本地 dev server）。默认每场 60 秒；输出 `scripts/perf-eco00-baseline.json`。同一 1280×800 视口、同一探针随机种子分别打开 Canvas/Pixi 页面，记录启动重试、页面错误、场景前后负载、帧间隔和渲染耗时。短时烟测由 `ECO00_DURATION_MS=2000` 控制，不用于性能结论。

| 场景 | Canvas 实体数（首→末） | Canvas 整帧 p95 | Pixi 实体数（首→末） | Pixi 整帧 p95 | 可比性 |
|---|---:|---:|---:|---:|---|
| 自然局 | 110→280 | 36.1ms | 142→279 | 35.9ms | 不可逐值比较：自然生成节奏、初始实体数不同 |
| 密集近景争夺 | 300→300 | 125.6ms | 299→299 | 178.9ms | 压力场景相近，仍差 1 实体；需同组成复测 |
| 超广角 | 300→280 | 90.7ms | 300→280 | 36.6ms | 数量相同，但需检查其他对象与重试/顺序效应 |

首轮六场均无页面错误、无启动重试。此表的“整帧”是浏览器 rAF 间隔，包含逻辑、渲染、合成与调度，**不是**纯渲染耗时；设备负载和顺序也会影响它。旧 `probe-rivals-fq09.mjs` 的入口按钮已修复，但该脚本把投食 `WARNING` 场景称为 `natural-calm`，且只采几秒，不能用于 ECO-00 验收。运行该脚本时刷新了历史 `scripts/perf-rivals-fq09.json`，其新数值只作诊断。

新增探针的 2 秒烟测中，密集近景逻辑约 10.3～10.8ms/帧，其中 AI 约 8.9～9.3ms/帧；这只说明 **逻辑内部** AI 占大头，不能解释全部整帧延迟。首轮 60 秒报告尚未带逻辑拆分，后续需要同负载长测和浏览器调度/GC 观察，再决定优化位置。

下一步：固定三场景的实体**组成和位置**、障碍/特效数量，而非只固定随机种子；复测 Canvas/Pixi 同负载；视觉检查近景敌我标签、超广角 LOD 与渲染异常，并记录重试。ECO-00 仍为进行中。G1/G2 真人试玩及“热闹好玩”判断另行记录，性能自动探针不能代替。

## 第二轮：固定组成的 60 秒压力对照

探针现将固定分散、密集近景争夺、超广角三场的鱼种/装扮/坐标和 36 个障碍确定化，并为 Canvas/Pixi 的初始场景计算组成指纹。三对指纹逐一相同；每段无页面错误、无启动重试，实体数首尾不变。结果在 `scripts/perf-eco00-fixed.json`。这三个场景是**合成固定负载**，不是自然游玩的替代品；上表真实自然局仍只供观察。

| 固定场景 | 实体数 Canvas/Pixi | Canvas 整帧 p95 / 绘制 p95 / 逻辑均值 | Pixi 整帧 p95 / 绘制 p95 / 逻辑均值 |
|---|---:|---:|---:|
| 分散（普通视角） | 300/300 | 19.5 / 4.9 / 4.2ms | 18.5 / 9.1 / 2.0ms |
| 密集近景争夺 | 299/299 | 143.9 / 27.7 / 10.9ms | 50.3 / 28.6 / 6.1ms |
| 超广角 | 300/300 | 127.3 / 27.3 / 5.6ms | 50.1 / 27.9 / 2.8ms |

注意：逻辑均值是在 60 秒取样**之后**同步推进 120 帧所得，不与整帧 p95 逐帧配对，不能直接相减归因。固定场景与此前 V3 分散式 300 实体预算的视野/近邻比例不同；密集和超广角明显未达到 18.7ms 既有目标，不能放行。Pixi 密集场景前次短测与本次长测差异明显，仍需重复、交错顺序或浏览器追踪，避免把运行次序/设备波动误判为优化。

开启 `ECO00_CAPTURE=1` 可截图。静态检查 `eco00-canvas-dense-contest.png`、`eco00-pixi-dense-contest.png`：两者均画出大量近景鱼、敌队名称与投食 HUD，未见整层缺失；但 299 条鱼严重遮挡，普通鱼眼睛/鱼身和危险标记相互拥挤，无法据此声称“敌我可读”。`eco00-pixi-ultrawide.png` 中远景鱼仍有颜色与轮廓，单体过小无法辨认，属于超广角信息层级待设计。以上只是静帧观察，不是运动体验或 Canvas/Pixi 像素一致性验收。

下一步优先定位整帧与逻辑/绘制之间的长尾来源，并把近景可读性作为 G2 真人试玩观察点；不靠减少场景中的近景鱼来伪造性能达标。ECO-00 继续保持进行中。

## 长帧定位：CPU 采样与 10 秒分段

用 `ECO00_ONLY=dense-contest`、`ECO00_RENDERER=canvas|pixi`、`ECO00_CPU_PROFILE=1` 可对同一组成的场景采 Chrome CPU profile；`scripts/analyze-eco00-cpu.mjs` 汇总自耗时样本。采样会扰动速度，仅用于定位，不纳入预算对照。10 秒样本中两种渲染器的 `findNearest` 与 `QuadTree.queryCircle` 合计各约占 CPU 样本的 20%；Canvas 另有原生 fill/stroke，Pixi 另有几何打包与约 7.7% 的 GC 样本。说明共享 AI 邻近搜索与各自绘制均有成本，单独优化一个热点不足以保证从约 50ms 降到 18.7ms。

探针增加每 10 秒帧间隔和负载快照。单独重跑密集场景 60 秒：Canvas 总体 p95 50.1ms，0～50 秒各段约 50～53ms，实体/活跃 AI 始终 299；Pixi 总体 p95 54.1ms，各段约 54ms，实体/活跃 AI 主要 299（40 秒快照短暂 300）。这**不支持**“越跑越慢/实体持续增长”假设。此前 Canvas 143.9ms 的对照轮与本轮差异较大，在同样静态组成下仍有运行环境或浏览器调度波动，不能选择最快轮宣布达标。分段数据分别在 `scripts/perf-eco00-segments-canvas.json` 和 `scripts/perf-eco00-segments-pixi.json`。

当前可复现的下界风险是密集 299 活跃实体时两种渲染器都约每 3 个 60Hz 刷新周期出一帧（p95≈50ms），显著超过预算。下一次改动应针对**不改变近景数量与行为**的热点做最小实验，并用相同组成、交错顺序的长测和原有玩法/视觉测试共同复核；G1/G2 真人体验门槛不受性能探针替代。

## 邻近目标筛选的最小实验

在 `findNearest` 中先计算距离并跳过不可能胜出的候选，再执行阵营/行为谓词和隐蔽判定；严格半径边界、原数组下标平局、锁定迟滞均保留。新增 `ai-nearest-pruning.test.ts` 通过真实 `aiSystem` 钉住等距选择、隐蔽换目标和严格半径边界；全量 66 文件/663 单测、类型检查、构建、G2/战队端到端 5/5 通过。

同一固定密集场景的 10 秒 Chrome CPU 采样中，Canvas `findNearest` 自耗时由约 1379ms/13.5% 降至约 936ms/9.1%；`queryCircle` 本身几乎不变。这支持“剪掉无效谓词”这一局部假设。**但** 60 秒原场景复跑 Canvas p95 53.3ms、Pixi p95 53.9ms，与剪枝前约 50.1/54.1ms 同量级，未证明整帧改善，更未达到 18.7ms。结果分别在 `scripts/perf-eco00-pruned-60s-canvas.json` 和 `scripts/perf-eco00-pruned-60s-pixi.json`；不应据此完成 ECO-00。

下一步需针对约 27～29ms 的近景绘制 p95 和仍昂贵的 `queryCircle` 做**分别**可回退的实验；禁止以减少近景实体、缩短样本或挑最快的一轮伪造达标。用户对 G1/G2 可读性与乐趣的主观观察仍未取得。

## Pixi 尾鳍路径缓存实验（未采纳）

在不降低更新频率或近景数量的前提下，试过让标准鱼的尾鳍 `Graphics` 路径只建立一次，逐帧用上下等比缩放表达摆动。定向测试和类型检查通过；同一密集固定场景 60 秒为 299 活跃 AI、Pixi 整帧 p95 53.6ms、渲染 p95 25.4ms（`scripts/perf-eco00-tail-cache-pixi-dense.json`）。与此前整帧约 53.9～54.1ms 相比无可确认的收益，且尾鳍根部也被缩放，存在视觉差异；已撤回实现和测试，不把它计入性能改善。下一步应先细分 `queryCircle` 的调用来源、候选数量和渲染阶段长尾，再选不会改变鱼体对称或玩法的切口。

## 四叉树采样按调用方归因

`scripts/analyze-eco00-cpu.mjs` 现从 Chrome profile 节点的父子关系汇总 `queryCircle` 的**包含式采样**。既有 10 秒密集记录中，Pixi 的 `queryCircle` 样本约 719.8ms，其中 `findNearest` 538.7ms、战斗 126.8ms、障碍物 54.3ms；Canvas 分别为总 744.5ms、`findNearest` 568.5ms、战斗 120.1ms、障碍物 54.2ms。两种渲染器的查询热点主要来自 AI 目标搜索，而非地形。此处是历史 profile 的采样归因，不是最新剪枝后的整帧耗时；CPU 自耗时和包含式时间不可相加。全局最大半径导致的额外扫描仍属待测假设，不能仅凭这张表认定为根因。

## 局部最大半径查询实验（未采纳）

先写固定分布的红灯用例：400 条小鱼构成网格，一条远处巨鱼把全局查询半径撑大；近角查询旧实现读取坐标 138 次。实验版为每个四叉树节点预计算子树最大半径，定向用例转绿，并用混合半径、空树和多次重建的 160 组查询与穷举比对，全部一致；全量 67 文件/665 单测与类型检查通过。**但**同一 Pixi 密集场景 60 秒复测为整帧 p95 53.9ms、渲染 p95 27.5ms（`scripts/perf-eco00-local-radius-pixi-60s.json`），改前剪枝版分别 53.9ms、27.3ms。局部候选减少没有转化为整帧收益，节点折叠还增加了重建复杂度；因此已撤回实验实现和专用测试。下一步不再把 `queryCircle` 的局部访问量等同于帧瓶颈，应核对绘制、React 更新与实际帧时间之间的长尾关系。

## Canvas 静态形态解析复用（保留，未达整帧预算）

Canvas 的 `drawCuteFish` 原先每帧对每条标准鱼重新 `resolveMorphology`，包括几何、花纹及稳定签名生成；此前 Canvas CPU 样本中 `stableObject` 和它的映射回调合计约 7.7%。现只在 Canvas 绘制入口复用同一实体未变的解析结果，动态动作仍逐帧计算；缓存键包含身份、种类、形状、颜色、旧装扮及完整 V2 输入，因此位置/血量变化不重算，旧装扮与 V2 嵌套字段的原地修改会失效。定向红绿用例已覆盖这些路径；全量 67 文件/665 单测、类型检查和生产构建通过。

同一 299 活跃 AI 的 Canvas 密集固定场景 60 秒：绘制 p95 从此前 13.0ms 降到 7.9ms，但整帧 p95 为 53.4ms（此前 53.3ms），样本在 `scripts/perf-eco00-morph-cache-canvas-60s.json`。因此只认定**Canvas 绘制局部成本下降**，不宣称帧预算、G1/G2 可读性或发布门槛达标。后续需把浏览器 rAF 间隔、主线程任务和实际绘制分开跟踪，解释局部节省为何未变成整帧改善。

## rAF 补步与绘制口径

开发期游戏循环现暴露每次逻辑回调的步数/墙钟耗时，ECO-00 探针与 rAF 间隔、渲染耗时一起采集。Canvas 密集场景 60 秒记录：rAF 间隔 p95 53.0ms，游戏逻辑回调 p95 15.0ms，Canvas 绘制 p95 7.9ms；1621 次采样中，补 2 步有 1287 次、补 3 步 294 次、补 4 步 34 次，另有 1/6 步少量样本。完整记录见 `scripts/perf-eco00-loop-canvas-60s.json`。这确认固定步长补算确实存在，也解释为何原先同步 `profile(120)` 的约 4.7ms/逻辑步不能直接当作一次 rAF 的逻辑耗时。

三组 p95 **不是同帧配对数据，不能相加或相减归因**；此处仍未证明浏览器合成、Canvas 提交或调度哪一个占主导。下一步应取 Chrome trace 中的主线程任务与绘制/合成事件，再决定是否改游戏循环或渲染实现，不能仅凭 53ms 间隔擅自降低逻辑频率。

## Chrome 时间线：同一帧间隔、两种不同瓶颈

探针新增 `ECO00_TRACE=1`：采集 Chrome tracing 并只保存线程、事件累计（嵌套，不可相加）和最长事件的摘要；追踪本身会扰动性能，因此不用于预算验收。用相同场景指纹 `389fd3de` 各跑 10 秒，Canvas rAF p95 53.6ms、Pixi 53.9ms。报告在 `scripts/perf-eco00-trace-{canvas,pixi}-10s.json` 与 `scripts/eco00-trace-{canvas,pixi}-dense-contest.json`。

- Canvas：GPU 主线程 `CommandBuffer::Flush`/栅格链累计约 9.9 秒（嵌套事件），最久一次约 95ms；渲染器主线程的 `BeginMainFrame` 累计约 5.3 秒。Canvas JavaScript 绘制 p95 8.7ms 并不能代表 GPU 完成绘制的时间。
- Pixi：渲染器主线程 `BeginMainFrame`/rAF 回调累计约 9.3 秒，单次最长约 57ms；GPU 侧 WebGL 命令链累计约 1.6 秒。Pixi 的主要压力更偏主线程图形构建与提交，不是同一个 Canvas 栅格瓶颈。

两者达到相似的 rAF p95 **不意味着有一个共享的 53ms 根因**。下一步应分别处理 Canvas 的 GPU 栅格工作量和 Pixi 的逐帧图形构建；仍须保持近景数量、敌我可读性与鱼体对称，不能通过暗中降细节或缩短负载宣布达标。

## Pixi 中景 LOD 阈值实验（未采纳）

密集夹具虽沿用原 `pixiLodStressScene` 的“预计 5/15/280”字段，但探针随后把鱼重新摆到距玩家约 90～850 世界单位；原 LOD0 阈值 900，所以实际约 299/1/0，字段仅描述重排前状态。实验把 LOD0 阈值降到 600，约 132 条维持 LOD0、168 条进入 LOD1；同一 60 秒 Pixi 密集场景渲染 p95 从 27.3ms 降到 24.3ms，整帧 p95 从约 53.9ms 到 52.7ms（`scripts/perf-eco00-lod600-pixi-60s.json`），仍未达标。

截图对照 `scripts/eco00-pixi-dense-contest.png` 与 `scripts/eco00-pixi-dense-contest-lod600.png` 显示：不少视觉尺寸仍大的鱼进入 LOD1 后失去眼睛等 `details` 层，呈现“空脸”，敌我与表情可读性受损。**已撤回阈值与专用断言**，不将该数值收益视为可采纳优化。后续若改 LOD，须同时按屏幕投影尺寸和关键五官保护定义档位，并通过视觉对照及真人 G2 观察；不能只按世界距离调一个常数。

## Canvas 体积细节预绘缓存（保留，未达整帧预算）

同一固定夹具的短时消融：只关鱼体渐变或只关成对解剖线，rAF p95 均仍约 53ms；两者同时关为约 36ms。说明两类栅格工作合起来会跨过刷新周期阈值，不能把其中一类单独指认为唯一根因。消融开关仅用于诊断，已从正式代码清除；记录分别在 `scripts/perf-eco00-no-gradients-canvas-10s.json`、`scripts/perf-eco00-no-lines-canvas-10s.json`、`scripts/perf-eco00-no-gradients-lines-canvas-10s.json`，对应 Chrome trace 摘要另存 `scripts/eco00-trace-canvas-dense-contest-no-{gradients,lines,surface}.json`。

正式改动并未删体积层：`MorphologyDetailCache` 在不透明鱼身之上把渐变与成对解剖线预绘到带轮廓裁切的离屏 Canvas，后续按外观签名、半径、LOD 和可见层复用；位置/朝向仍用主画布变换，眼睛、花纹、尾鳍和敌我标记保持原渲染路径。缓存限制为 32 MiB，过大图像、无 2D 上下文或缺 `drawImage` 的记录型上下文回退原路径。固定像素浏览器对照用小丑鱼和河豚验证：不透明鱼身背景上 Alpha 无偏差，最大色差 3/255、超出 2 级的颜色通道最多 8 个；大场景截图保留眼睛和轮廓，仍需真人观察运动体验。

同一 299 活跃 AI / 指纹 `389fd3de` 的 60 秒 Canvas 密集场景：rAF p95 从改前约 53.0～53.4ms 降到 36.1ms（`scripts/perf-eco00-surface-cache-canvas-60s.json`），未调整实体数量与 AI。全量 68 文件/666 单测、类型检查、生产构建和关键 G1/G2/像素 E2E 6/6 通过；随后新增预算淘汰单测单独通过。**仍超过 18.7ms 预算，ECO-00 不放行**；Pixi 的主线程图形瓶颈也未因此解决。

高 DPI 补验暴露了缓存的初版缺陷：固定 2× 画布直接矢量绘制与 1× 预绘放大相比，单通道最大色差达到 37/255。现按当前 Canvas 变换选择 1～3× 预绘密度并纳入缓存键；超过 3× 或无法获得有限缩放时直接绘制。浏览器 1×/2×、小丑鱼/河豚的固定像素对照均通过（不透明鱼身上 Alpha 无差异、最大色差 ≤3/255），单测钉住密度换档与 32 MiB 淘汰。修正后重跑相同密集 60 秒：rAF p95 仍为 36.1ms（`scripts/perf-eco00-density-aware-canvas-60s.json`），清晰度保护没有吞掉已测帧收益。

本次修正后的全量验证为 68 文件/667 单测、类型检查、生产构建、体积像素/G1 指令/G2 投食相关 E2E 6/6 通过。上述都不替代 G1/G2 真人试玩；Canvas 高密度性能仍未达到 18.7ms，Pixi 路径尚未修正。

## Pixi 柔性网格静态截面复用（仅局部整理）

新一轮 10 秒 Pixi CPU 采样（`scripts/perf-eco00-pixi-current-cpu-10s.json`）中，`buildLine`、`packAttributes`、`updateGpuContext`、`stroke` 等图形构建与打包入口占据大量主线程样本，GC 自耗时约 8.7%；`queryCircle` 包含式样本的主要调用方仍为 AI 的 `findNearest`。采样有扰动，只用于排查。

柔性网格以前每帧为每个脊柱截面扫描同一静态轮廓并分配交点数组。现把截面半宽随 `SpineMeshData` 复用；形态或 LOD 变化时重算，波形、转向和上下对称公式均不变。单测用新建/复用网格的逐顶点完全一致和形态切换失效作保护。**但**同一密集场景 60 秒 Pixi rAF p95 为 53.8ms（`scripts/perf-eco00-pixi-width-cache-60s.json`），与此前约 53.9ms 同量级，未证明整帧改善。该改动只保留为无视觉变化的重复计算清理，不计入 ECO-00 达标成果。后续需直接定位和减少 Pixi 每帧 Graphics 构建/打包，而非把局部数组减少误算为帧收益。

## Pixi 空效果层实验与采样口径修正

另以“普通鱼的空 `effects` 每帧 `clear()` 导致长帧”为可证伪假设，只在前一帧含效果时清空。相同指纹、60 秒 Pixi 密集场景测得 rAF p95 53.7ms（`scripts/perf-eco00-pixi-effects-clear-60s.json`），与复用截面后的 53.8ms 无可确认差异；**已撤回实验代码**。这不能证明 `clear` 零成本，但不支持将其作为当前主瓶颈。

CPU 分析脚本现额外按 Pixi 阶段计算**包含式**样本，避免把某个 `stroke` 栈（例如障碍 `drawRock`）误判成全部 `buildLine` 来源。当前 10 秒 profile 中，`syncCreatures` 包含式约 1193ms/11.5%，其内 `drawAnimated` 约 773ms/7.4%；`drawTerrain` 仅约 72ms/0.7%，`updateFlexibleBody` 约 66ms/0.6%。Pixi 图形几何的 GPU context 更新主要发生在 `app.render()` 的渲染遍历中，**不归到**前述图形命令创建阶段；阶段样本不相加，也不能拿 11.5% 断言其余图形工作免费。下一步需要针对渲染提交时的节点/几何失效数量建立归因，再决定是否重构动态尾鳍路径。

## Pixi 动画路径消融：瓶颈定位（均未采纳）

固定密集场景指纹 `389fd3de`，只做 10 秒**诊断性**消融，原版近景鱼、AI 与障碍组成不变。静态岩石/珊瑚不画：p95 53.6ms；尾鳍的 5 条鳍线不画：53.3ms；整条尾鳍不画、只剩动态嘴：52.9ms；嘴不画、保留动态尾：53.6ms。对应原始数据在 `scripts/perf-eco00-pixi-no-static-obstacles-10s.json`、`scripts/perf-eco00-pixi-no-tail-rays-10s.json`、`scripts/perf-eco00-pixi-no-tail-10s.json`、`scripts/perf-eco00-pixi-no-mouth-10s.json`。

相反，暂停 `drawAnimated` 整段后 p95 降至 18.1ms；保留 `rear/effects/frontAnimated.clear()` 但不重新创建任何动画路径，也为 18.1ms（`scripts/perf-eco00-pixi-no-animation-10s.json`、`scripts/perf-eco00-pixi-clear-only-10s.json`）。这些版本**没有尾鳍、嘴和部分特效，视觉不合格，绝不可作为性能优化发布**；所有诊断代码已撤回。证据支持“大量鱼的动态图形路径共同触发每帧几何重建”，而非某一条鳍线、空 `clear()` 或静态障碍独自导致长帧。下一步若重构，须同时让标准鱼的尾与嘴保持动画和近景可读性，并用屏幕对照、对称测试及 60 秒原始场景复测；单独缓存尾鳍的前次实验无整帧收益，与此次消融一致。

## Pixi 物种构成与分组归因

探针现把可见数、标准鱼、带触腕/附肢的特殊鱼和分段体形数量与 LOD 一起记录。原样固定场景 300 可见实体中只有 **100 条标准鱼**，另有 200 条特殊形态（其中约 50 条带多关节附肢、30 条分段身体），原版 10 秒 p95 53.6ms，见 `scripts/perf-eco00-pixi-mix-audit-10s.json`。这解释了只缓存标准鱼尾与嘴的试验为何几乎不动整帧：该试验为 p95 52.7ms（`scripts/perf-eco00-pixi-static-parts-10s.json`），且尾根和鼻孔中景呈现存在偏差，**已撤回**。

分组消融进一步确认两类动画都贡献长帧：仅暂停特殊鱼动画、保留标准鱼动画，p95 18.1ms（`scripts/perf-eco00-pixi-no-special-animation-10s.json`）；仅暂停标准鱼动画、保留特殊鱼动画，p95 36.6ms（`scripts/perf-eco00-pixi-no-standard-animation-10s.json`）。此处是 10 秒缺动画诊断，不能据此发版，也不能把两种节省量相加；所有诊断代码已恢复。后续方案必须覆盖标准鱼和特殊形态的逐帧 Graphics 提交，同时保留尾鳍、嘴、触腕/身体摆动及上下对称，不再只对 100 条标准鱼做局部缓存并期待达标。

## Pixi 多关节附肢改用逐帧顶点网格（保留，待体验验收）

进一步按特殊形态消融：只暂停约 50 条水母/乌贼/章鱼/海怪的触腕动画，10 秒密集 p95 从 53.6ms 到 35.6ms；只暂停约 30 条鳗鱼/皇带鱼的分段动画到 36.6ms；暂停其他特殊鱼仍为 53.6ms。原始报告在 `scripts/perf-eco00-pixi-no-{rigged,segmented,other-special}-animation-10s.json`。这些版本均缺动画，已撤回，仅用于定位。

正式实现保留原 `buildAppendageRig` 的逐帧关节、惯性和范围限制，把每段带圆头的描边改由一个可更新的 `MeshSimple` 提交，不再每帧清空并重建几十个 Pixi `Graphics` stroke。附肢仍位于身体背后；LOD2 快照显式拷贝该网格。第一版连续带状网格使触腕过细，已放弃；现用每段 10 顶点的圆端胶囊近似原描边。单测验证多附肢索引不串联、坐标有限、缓冲复用和 LOD2 快照确实带网格。截图 `scripts/eco00-pixi-appendage-capsule-seeded.png` 与 `scripts/eco00-pixi-appendage-legacy-seeded.png` 可作定性对照；尽管固定了初始随机种子，实时游戏消耗随机数与动画相位仍不同，**不能宣称像素等同**。圆端、可见性和摆动保留，角色颜色/相位不同，仍需真人审视运动质感。

相同 299 活跃 AI / 指纹 `389fd3de` 的 60 秒 Pixi 密集场景，rAF p95 从旧版约 53.8ms 降至 **18.1ms**，渲染 p95 约 12.2ms（`scripts/perf-eco00-pixi-rig-capsule-60s.json`）。三个固定视角的 Pixi 10 秒复测 p95 分别为 18.1/18.1/18.3ms，页面错误均 0（`scripts/perf-eco00-pixi-rig-capsule-all-10s.json`）。另有 69 文件/670 单测、类型检查、生产构建通过；其后新增的 LOD2 快照单测和端到端测试分别通过，完整 Pixi e2e 原有 7/7 通过。新 LOD2 e2e 的初始 `>=250` 断言因实际视野裁剪到约 229 而失败，调整为仍覆盖大量远景的 `>=150` 后通过；它证明快照路径运行和缓存稳定，网格内容由单测直接验证。

这只证明 **Pixi 固定负载的性能门槛有进展**，不等于 ECO-00 全项完成：Canvas 密集 60 秒仍约 36.1ms，Pixi 三场其余两场目前只有 10 秒样本，圆端网格与旧描边也没有运动中的真人对照。G1/G2 真人试玩未取得，不能由本性能结果替代放行。

## Canvas 剩余成本的分层消融（均未采纳）

Pixi 优化后同一密集组成重跑 Canvas 10 秒，rAF p95 仍为 36.1ms（`scripts/perf-eco00-canvas-post-pixi-10s.json`）。对 200 条特殊形态逐层消融：不画六种多关节/分段形态的背后附肢为 36.2ms；不画**全部**特殊形态背后附肢为 36.1ms；不画特殊鱼身体填充与轮廓为 36.1ms；不画身体之后的表面层为 35.9ms。对应 `scripts/perf-eco00-canvas-{no-rigged-back,no-special-back,no-special-body,no-special-postbody}-10s.json`。单删一个部件或一组层不能让 Canvas 跳出约 36ms 档位。

按鱼类整体隔离：不画约 100 条标准鱼为 35.2ms；不画约 200 条特殊鱼为 18.1ms；将特殊鱼仅画成同半径纯色圆点为 18.2ms（`scripts/perf-eco00-canvas-{no-standard-fish,no-special-fish,special-circles}-10s.json`）。这些缺鱼/圆点版本均为**诊断性画面，已撤回，绝不可发布**。证据表明 Canvas 剩余风险来自特殊形态完整的多层矢量栅格工作量，而非实体计数本身或单条触腕。下一步若做正式优化，需同时覆盖背后附肢、身体、表面细节，并保留随机装扮、动态嘴/附肢及近景可读性；仅给一层加缓存预计不够。

归因纠错：`scripts/perf-eco00-canvas-special-back-only-10s.json` 原标作“只留背后附肢”，但复查发现当时前一项“关掉全部背后附肢”的临时开关尚未撤回；它实际只走了更早的尾迹/半虚绘制等入口，**该样本无效，不用于附肢归因**。恢复正式画面后分别暂停特殊鱼尾迹和半虚状态绘制，p95 仍为 36.2/36.1ms（`scripts/perf-eco00-canvas-no-special-{trail,ghost}-10s.json`），因此不能把单个效果指为主因。所有诊断开关现已撤回。

## Pixi 三场长测补验：超广角仍未过线

附肢胶囊网格版补跑剩余两场 60 秒：分散普通视角 p95 **18.1ms**、渲染 p95 2.2ms、约 50 个可见实体，报告 `scripts/perf-eco00-pixi-rig-capsule-natural-60s.json`；超广角 p95 **35.3ms**、渲染 p95 15.0ms、约 300 个可见实体（LOD0 约 65～68，LOD1 约 232～235），报告 `scripts/perf-eco00-pixi-rig-capsule-ultrawide-60s.json`。超广角六个完整 10 秒分段 p95 都在 35.0～35.6ms，未发现持续增长；短测曾为 18.3ms，**不能用短测替代长测验收**。分散与超广角均无页面错误，实体数首尾稳定。

因此 Pixi 的密集近景和普通视角已分别在当前固定负载长测中到达 18.7ms 预算以内，**超广角仍超标，Pixi 整体不能放行**。超广角渲染 p95 约 15ms、逻辑回调 p95 约 6.4ms，但这些 p95 不逐帧配对，不能相加归因；16.7ms 刷新周期临界附近的长尾需再用逐帧配对或 Chrome trace 确认。若调整 LOD，必须保护屏幕尺寸仍大的鱼的眼睛与敌我标记，避免重演中景“空脸”实验。

## Pixi 超广角障碍缓存补验（固定夹具已过线）

为查超广角长尾，探针补充相邻 rAF 帧与 Pixi 指标配对、首尾渲染计数/错误检查。20 秒配对样本中，慢间隔常伴随本帧两次逻辑补步；它更像错过刷新后的补偿，不能仅凭相关性归咎逻辑。CPU 采样中超广角 `drawTerrain` 包含式约占 5.0%，高于密集近景约 0.7%；超广角 36 个障碍均在视野内。**仅用于诊断**的“不画障碍”使超广角 10 秒 p95 从约 35ms 降至 18.1ms，随后撤回该删画面开关。配对、profile 和消融原始数据分别见 `scripts/perf-eco00-pixi-ultrawide-frame-pairs-20s.json`、`scripts/eco00-cpu-pixi-ultrawide.json`、`scripts/perf-eco00-pixi-ultrawide-no-obstacles-10s.json`。

正式修复把水流、障碍、建筑分层，静态岩石/珊瑚/闲置喷口按障碍外观签名复用 Pixi 图形；位置、半径、生态状态变化时重建，水草及预警/激活喷口仍逐帧绘制。层序继续是水流→障碍→建筑，不删除画面。先写的端到端回归在旧实现下失败，修复后验证“静态缓存命中、改半径重建”通过；完整 Pixi e2e 9/9、69 文件/671 单测、类型检查和生产构建通过。相同超广角夹具指纹 `3511909b` 的独立 60 秒复测，p95 从 **35.3ms 降到 18.1ms**，六个完整 10 秒分段均为 18.1ms，实体/障碍负载稳定，渲染错误首尾没有增加（`scripts/perf-eco00-pixi-terrain-cache-ultrawide-60s.json`）。密集夹具指纹 `389fd3de` 独立 60 秒 p95 仍为 **18.1ms**（`scripts/perf-eco00-pixi-terrain-cache-dense-60s.json`）；普通视角 10 秒 p95 18.2ms。一次与 8 个浏览器测试并行的密集 10 秒样本为 36.1ms，存在明显资源干扰，**不用于回归判断**（`scripts/perf-eco00-pixi-terrain-cache-all-10s.json`）。

普通视角随后在无并发干扰下补跑修复后 60 秒，p95 **18.2ms**（`scripts/perf-eco00-pixi-terrain-cache-natural-60s.json`）。因此三个 Pixi 固定场景目前分别有不超过 18.7ms 的修复后长测证据，但这不是 ECO-00 全项放行：Canvas 密集仍约 36.1ms，附肢运动质感和 G1/G2 仍需真人观察；还需审视缓存画面随生态状态切换的实际表现。

## Canvas 画布提交方式排查（均未采纳）

再次独立复现密集夹具指纹 `389fd3de`：10 秒 p95 **36.1ms**，Canvas 绘制回调 p95 约 7.2ms、游戏循环 p95 约 14.6ms，两者并非逐帧可加。CPU profile 中 `fill`/`stroke` 等原生绘制调用仍占样本，既有 Chrome trace 则显示 GPU 线程的 `RasterDecoderImpl::DoEndRasterCHROMIUM` 总计约 6.3 秒/10 秒；这是诊断线索，不等于每帧精确阻塞时间。报告和 profile 为 `scripts/perf-eco00-canvas-next-baseline-10s.json`、`scripts/perf-eco00-canvas-next-cpu-10s.json`、`scripts/eco00-cpu-canvas-dense-contest.json`。

逐项只改 2D context 属性：`desynchronized: true` p95 **54.1ms**，`willReadFrequently: true` **36.2ms**，`alpha: false` **36.1ms**；同场景短测不支持任一项作为正式修复。三个实验均已从代码撤回，原始报告分别为 `scripts/perf-eco00-canvas-{desync,cpu-raster,opaque}-dense-10s.json`。后续须针对特殊鱼完整画面（背后附肢、身体、表面层）做保真分层/缓存并测浏览器实际帧耗时；不能靠画布参数或删掉鱼、眼睛、对称结构换取数字。

## Canvas 特殊鱼整帧位图诊断（缺动画，未采纳）

为了测量“特殊形态完整多层重画”的上限，把约 200 条特殊鱼的首次绘制**临时冻结**为离屏位图，之后仅按位置提交；这个版本失去朝向和动画，绝不符合游戏视觉要求。相同固定密集夹具 10 秒内出帧数从基线 307 增至 504，中位间隔从 35.3ms 降到 17.8ms，但 p95 仍 **35.5ms**；渲染回调 p95 从约 7.2ms 降到 5.2ms。改用预生成 `ImageBitmap` 后出帧数 510、渲染 p95 5.0ms，整帧 p95 仍 **35.5ms**。报告：`scripts/perf-eco00-canvas-frozen-special-dense-10s.json`、`scripts/perf-eco00-canvas-frozen-imagebitmap-dense-10s.json`。两种冻结代码均已撤回。

这支持“重画特殊鱼贡献大量常态成本”，但**否定**“只把鱼换成静态位图即可让 p95 达标”。半数左右帧回到一个刷新周期，剩余长尾仍跨两个周期；下一步应使用逐帧配对与浏览器 trace 定位残余长帧，再设计保留动态与对称的分层绘制，不能直接移植冻结方案。

补做未冻结原画面的 20 秒逐帧配对（`scripts/perf-eco00-canvas-next-frame-pairs-20s.json`）：635 个间隔中，148 个低于 25ms，487 个不低于 25ms。快/慢组**本帧**绘制中位数同为约 6.2ms；逻辑回调中位数分别约 4.8/9.5ms、补步 1/2 次。**前一帧**逻辑中位数约 9.6/9.3ms、补步同为 2 次，未显示“前一帧补步多才错过本次刷新”的证据。补步更可能随已错过的刷新周期增加，不能把相关性误写成因果。此配对仍不能直接测量 GPU 栅格完成时刻，后续如要归因长尾需同轮 trace 而非继续只看 JS 绘制计时。

同轮 10 秒 Canvas trace 与配对复核（`scripts/perf-eco00-canvas-next-trace-10s.json`、`scripts/eco00-trace-canvas-dense-contest.json`）：固定负载 p95 再次为 36.1ms；Chrome GPU 线程的 `RasterDecoderImpl::DoEndRasterCHROMIUM` 共 443 次、包含式累计约 6.13 秒、最长约 46.2ms，主线程 `ProxyMain::BeginMainFrame` 311 次、包含式累计约 5.48 秒。事件总时间跨线程且层级嵌套，**不可直接相加或断言单帧因果**；但与“JS 绘制 p95 只有约 7ms、rAF 却跨两次刷新”一致，下一版正式优化必须盯浏览器栅格提交及帧节奏，而非只优化 `drawCuteFish` 的 JS 自耗时。该轮 trace 只保存聚合/长事件，尚不能配对具体帧；后续补了逐帧标记开关。

探针现可用 `ECO00_TRACE=1 ECO00_TRACE_FRAMES=1 ECO00_FRAME_PAIRS=1` 在同一 Chrome trace 里为每次 rAF 加用户时间标记，并保留标记及主要 GPU/主线程事件的时间戳；普通测量不开此开关。首次加标记的 10 秒样本有 308 个帧标记、p95 36.2ms（`scripts/perf-eco00-canvas-timeline-paired-10s.json`）。按相邻标记区间粗分，低于 25ms 的 18 个间隔 GPU 栅格事件覆盖时间中位约 10.7ms；25～40ms 的 266 个间隔约 19.9ms。由于追踪标记明显改变了快/慢帧比例、GPU 和主线程可并行、且事件可跨标记边界，**这只是占用相关性，不是 GPU 导致某一帧慢的证明**。正式基线仍采用未标记的独立 60 秒测量。

另试把海水背景渐变预绘一次后每帧按原尺寸贴图：同一密集场景 10 秒 p95 仍 **36.1ms**（`scripts/perf-eco00-canvas-background-cache-10s.json`），已撤回。背景不是当前可单独跨过刷新周期的切口；继续优化应针对鱼层/画布栅格的实际组合成本，而不是继续对单个静态装饰加缓存。

## 开发服务器新鲜度纠错与生态动画回归

为障碍状态切换新增的浏览器测试起初读到缺少 `obstacleAnimatedBuilds` 的旧模块；本地文件已有字段，而端口 3000 的 Vite 响应仍是旧版，说明长驻开发服务器的文件监听/变换缓存失效。只重启属于本仓库的 Vite 进程后，HTTP 返回了当前字段，测试通过。**旧服务期间的临时 Canvas 消融结果不能单凭当时数字视作改动已生效**；固定基线与诊断结论需用新鲜服务复核。ECO-00 探针现每次自启独立、随机端口的 Vite 实例，不再复用长驻服务器；2 秒烟测与浏览器加载通过。

用独立服务器复查 Canvas 密集原画面 10 秒 p95 **36.1ms**（`scripts/perf-eco00-canvas-fresh-server-baseline-10s.json`）；再复做“冻结特殊鱼”的缺动画诊断，10 秒 500 帧、p95 **35.5ms**（`scripts/perf-eco00-canvas-frozen-special-fresh-server-10s.json`），与旧结果同量级，实验代码已撤回。其他此前依赖临时源码切换的短测仍按**待新鲜服务复核**处理，不借它们宣称因果或放行。Pixi 新回归通过真实浏览器验证：水草与预警喷口持续重建，喷口回到 `IDLE` 后恢复静态复用；完整 Pixi e2e **10/10**、类型检查与生产构建通过。此项验证增强了优化后的动画保护，但不代替运动质感的真人观察。

独立服务器下再跑当前 Pixi 超广角固定负载 60 秒，3386 帧、p95 **18.1ms**（`scripts/perf-eco00-pixi-ultrawide-fresh-server-60s.json`），与此前缓存优化后的 18.1ms 一致。至此该性能结论不依赖端口 3000 的旧模块；Canvas 密集场景和 G1/G2 真人体验门槛仍未通过，ECO-00 不作全项放行。

## Canvas 冻结位图尺寸上限实验（缺动画且部分裁切，未采纳）

独立服务器再次测当前原画面 10 秒 p95 **36.1ms**（`scripts/perf-eco00-canvas-screen-sprite-baseline-10s.json`）。在此前“冻结特殊鱼”诊断上只把离屏源分辨率改为与 0.65 倍镜头的屏幕像素一致，原有世界边界不变：491 帧、p95 **35.6ms**（`scripts/perf-eco00-canvas-screen-sprite-10s.json`）。随后只把位图半边界从鱼半径的 3 倍收紧到 1.6 倍，允许裁掉触腕等长附肢来测试目标像素面积上限：498 帧、p95 **35.6ms**（`scripts/perf-eco00-canvas-tight-sprite-10s.json`）。这些画面缺少方向/摆动，第二项还裁切鱼形，绝不符合视觉验收；全部诊断代码已撤回。

结果不支持把 Canvas 剩余 p95 长帧归结为“冻结鱼位图源尺寸太大”或“透明目标边界太宽”。即使牺牲动画和部分轮廓，尾部仍约 35.6ms；下一步不能把这一路缓存包装成保真优化，需重新考虑 Canvas 2D 全屏提交与主线程/合成节奏的组合，或明确默认 Pixi 与回退 Canvas 的分级性能/发布策略。后者会改变验收范围，须在发布判断时显式确认，不能擅自把 Canvas 失败视为通过。

## Pixi 密集固定负载 5 分钟稳定性补验

探针首尾快照增加显示对象、鱼显示池、LOD 纹理字节与障碍静态/动态构建计数；独立 Vite 实例 2 秒烟测验证字段可读。相同密集近景夹具再跑 **300 秒**：16,853 帧，总体 rAF p95 **18.1ms**、p99 **18.5ms**，30 个完整 10 秒段的 p95 均约 **18.1ms**；页面/渲染错误均为 0，渲染计数从 73 增至 16,942。原始数据 `scripts/perf-eco00-pixi-dense-stability-5m.json`。

实体/活跃 AI 首尾均为 299，障碍均为 36；可见鱼约 300，标准鱼 100、带附肢 50、分段形态 30。Pixi 显示对象 3403→3413、鱼显示池始终 19、LOD 纹理字节始终 0、静态障碍构建始终 14，静态缓存命中持续增加。道具 0→40，正好达到 `MAX_POWERUPS = 40` 的既有上限；喷泉/粒子与可见物也随世界运行变化，因此对象 +10 **不能单独判为泄漏**，但后续 15 分钟自然局仍要观察。此为固定合成压力场景，既不覆盖塘主战，也不替代真人 G1/G2 试玩或 Canvas 回退性能判断。

## Canvas 屏幕尺寸细节分层试验（未采纳）

在独立 Vite 实例的同一密集夹具中，原画面 10 秒 p95 **36.1ms**（`scripts/perf-eco00-canvas-lod-baseline.json`）。试验只对非玩家鱼按屏幕半径分层：低于 20px 去掉鳞片和配饰、低于 10px 再去掉花纹；鱼身轮廓、成对眼睛、形态附肢、嘴和敌我标记保持。红灯测试先确认分层函数缺失，随后 34 项相关单测与类型检查通过。但 10 秒复测 p95 **36.2ms**（`scripts/perf-eco00-canvas-lod-probe.json`），在波动范围内没有收益，且小鱼装饰确实减少。试验代码和测试已撤回；这排除了“仅删低投影尺寸的表面装饰即可修好 Canvas p95”的捷径，不构成正式 LOD 实现。Canvas 回退预算与真人验收仍待解决。

## Canvas/Pixi 同场景浏览器追踪对照（归因，尚无修复）

独立 Vite 实例与同一 `dense-contest` 固定夹具，各跑 10 秒并记录帧配对和 Chrome trace。Canvas 308 帧、rAF p95 **36.2ms**、JS 渲染 p95 **7.2ms**、逻辑回调 p95 **14.7ms**；Pixi 560 帧、rAF p95 **18.1ms**、渲染 p95 **11.9ms**、逻辑回调 p95 **9.4ms**。报告为 `scripts/perf-eco00-{canvas,pixi}-trace-fresh-10s.json`，摘要追踪为 `scripts/eco00-trace-{canvas,pixi}-dense-contest.json`。两者均零页面错误。帧配对显示 Canvas 的 244 个 ≥30ms 间隔与 64 个 <20ms 间隔，其 JS 渲染中位数约 **6.4/6.3ms**，每个间隔都只对应一次渲染计数增长；慢间隔 244/244 带 2～5 次逻辑补步，快间隔 60/64 仅 1 次。补步是长间隔后可能发生的补偿，不能据此倒置因果。

同一追踪窗口的 GPU `RasterDecoderImpl::DoEndRasterCHROMIUM` 包含式累计约 **6134ms / 445 次**，Pixi 对照约 **51ms / 157 次**；Canvas 的慢间隔内该事件累计中位数约 **38.9ms**，快间隔约 **20.5ms**。这些事件可能嵌套/跨帧、耗时不可与 JS 或 rAF 数字直接相加，但它们支持“Canvas 2D 大量特殊鱼栅格工作使刷新周期吃紧”的方向，反驳“只削减 JS 花纹调用就能解决”或“只是游戏逻辑自身变慢”的简单解释。此前删去 200 条特殊鱼才降至约 18.2ms，也与这一方向一致；那种删鱼画面绝不可发布。尚未定位出既保留对称形态和动画又能把 Canvas 回退压到预算内的实现，因此 ECO-00 仍未整体放行。

## Pixi 自然世界无人值守 15 分钟稳定性（通过此项，不代替真人）

独立 Vite 实例、1280×800、Chromium、固定初始随机种子 `20260923`，通过 `ECO00_NATURAL_RUN=1 ECO00_RENDERER=pixi ECO00_DURATION_MS=900000 node scripts/probe-eco00-baseline.mjs` 运行。未注入固定鱼群或投食事件，保持自然生成、AI 和阶段推进；仅将玩家设为无敌、静止且不进化，使无人操作不会提前结束。此模式在探针报告中显式记为 `natural-unattended`，**不是**真人连续游玩或塘主战。

原始报告 `scripts/perf-eco00-pixi-natural-unattended-15m.json`：900 秒共 **50,820 帧**，rAF p50 **17.7ms**、p95 **18.1ms**、p99 **18.5ms**；90 个完整 10 秒段的 p95 最大约 **18.2ms**，末尾另有 1 帧的不完整段，不计入分段结论。Pixi 渲染 p95 约 **5.6ms**，逻辑回调 p95 约 **4.0ms**（两项 p95 不逐帧相加）。页面错误和 Pixi 渲染错误均为 0，全部分段状态为 `PLAYING`，规则阶段时钟从约 114 推进到 54,114 帧。采样中投食事件出现 WAITING/WARNING/DROPPING/LINGERING/COOLDOWN 五个阶段，实体范围 **112～300**、粒子峰值 **477**；起点 111 鱼、终点 299 鱼，近邻活跃 AI 从 107 到 173。显示对象 695→1431 同期生态/粒子和道具亦自然增加（道具 0→40），不能仅凭首尾差值判为泄漏；LOD 纹理字节均为 0，终点可见鱼约 50。此项补足自然生态长时运行的自动稳定性证据，**不证明**三队近景混战或塘主战连续 15 分钟均达标，也不解除 Canvas 回退与 G1/G2 真人试玩门槛。
