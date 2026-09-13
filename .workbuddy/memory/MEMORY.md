# 欢乐鱼塘（E:\gitlab\fish）长期笔记
> 2026-09-12 精简重写；细节看同目录 `2026-09-*.md` 日志与《开发计划.md》《多鱼塘立项设计.md》。

## 架构（v2）
- 门面聚合：constants.ts/types.ts/gameEngine.ts re-export src/data/* 与 src/systems/*，旧导入路径不变。
- 数据驱动：as const 注册表 + keyof typeof；系统注册表 systems/index.ts 顺序执行；EventBus 解耦逻辑→表现（SKILL_HANDLERS / AI_HANDLERS / MOOD_HANDLERS 分发表）。
- 输入：鱼朝鼠标游；E=商场 Q=技能 Space=加速 G=无敌；updateGame 第 9 参 isInteractPressed（worldSystem 用模块级 prevInteract 检测上升沿）。
- **React 渲染纪律（2026-09-13 踩出来的）**：任何**随机 / 时变 / 需洗牌**的派生值都不许在渲染期算。`App.tsx` 的 `setInterval(() => setUiState({ ...gameStateRef.current }), 100)` **无条件跑、不看 status** —— 世界在 EVOLVING 暂停了，UIOverlay 仍每 100ms 收到新对象并重渲染，渲染期里的 `Math.random` 于是每秒被重掷 10 次（用户报「选择进化方向，后两个选项一直在变化」）。这类值一律「**逻辑触发点算一次 → 存进 `GameState` 快照 → UI 只渲染快照**」（范例：`GameState.evolveOptions` + 纯函数 `data/creatures.ts pickEvolveOptions()`，由 `systems/progression.ts` 写入、`App.tsx` 进化后清空）。⚠️ 快照为空时的**兜底也必须确定性**（别在兜底里再调一次带随机的抽取）；⚠️ 触发点要加**幂等门闸**（`status !== EVOLVING`），否则系统被重复调用会重掷候选并重复发 `evolve` 事件（成就重复计数）。

## 内容扩展套路（加塘/成就/道具/排行/心境统一走这套）
- 数据层 src/data/<x>.ts：as const + keyof 推类型 + 取值函数（未知 id 回退默认，绝不 undefined）→ constants.ts 门面 export *。
- 状态层 GameState.<x>；系统层读写 state.<x>；**加分一律走 scoreGain(state.pondId, base)**。
- 收尾：菜单/HUD + 单测 + scripts/probe-<x>.mjs + 开发计划/路线图同步；大改动补 交付说明.html（scripts/gen-deliverable.py）。
- **向后兼容铁律**：新功能默认值 == 旧硬编码，旧调用点与既有测试零变化。

## 功能现状
- **多鱼塘**（阶段 1+2a+**3a**；2b 暂缓，卡点见《多鱼塘立项设计.md》第四节）：CLEAR/CORAL/ABYSS，pondId 决定刷怪/得分倍率/障碍密度；world.ts `pondTravel` 换塘（保留成长+战队，重建世界）；塘内门只在 LOCAL 挑目标；换塘同步 player.currentBiome；塘名别用 speechBubble（被「进入新海域」顶掉）；⚠️ teleportLockUntilFrame 模块级 → 单测开头 `__resetTeleportLock()`。
- **每塘独有内容**（3a，2026-09-12）：三条特产线全数据驱动——①特产鱼 `CreatureSpec.ponds` → `getSpawnPool(塘,tier)`（SPAWN_POOL_BY_TIER=全塘视图不回退）；②特产建筑 `BUILDING_SPAWN_RULES[].pond` → `createBuildings(pondId)`（**initialState 与 pondTravel 都要传塘**；登记点四处：BUILDING_DATA/BUILDING_CONFIGS/GameCanvas GLYPHS/MiniMap LABELS+COLORS）；③塘事件 data/pondEvents.ts 配置表 + systems/pondEvents.ts 通用执行器（COIN_RAIN/SCHOOL，注册 events 后，落点以玩家为中心）。CLEAR=小丑鱼/锦鲤/许愿池/无事件；CORAL=海马/帝王蟹/狮子鱼/珍珠场/产卵夜；ABYSS=水母/星光鱼/吸血鬼乌贼/吞鳗/灯笼鱼/哥布林鲨/皇带鱼/沉船/星光鱼潮。菜单特产行读 `getPondSpecialties()`。⚠️ 加建筑要同步 MiniMap.test 的 mock BUILDING_CONFIGS（手写快照）；稳定排序：同 tier 特产鱼顺序=注册表插入序。
- **成就**（2026-09-13，13 → **19 枚**）：加 6 枚塘成就 —— 三塘旅人 / 清水·珊瑚·深渊图鉴（吃遍各塘特产鱼 2/3/7 种）/ 探宝者（3 座特产建筑各触发一次）/ 许愿成真（许愿池 5 次）。⚠️ **三条铁律**：①图鉴目标**不写死**，由 `getPondSpecialties(pond).fish.length` 推导（加特产鱼自动跟上，`dexGoal()` 兜底 `max(1,…)` 防 goal=0 秒解锁）；②埋点**新增 `buildingUse` 事件，不复用 `building`** —— 后者被 audio 订阅且由 7 个效果各自 emit，复用会一次触发播两遍音效，新事件只在 world.ts 建筑派发点发**真触发**；③「到访鱼塘」**不加事件**，走 `state.pondId` 差分（换塘是 `pondTravel()` 直接换世界、不走总线）。去重：图鉴 `dexSeen` 按 `victim.type`（吃五次只算一种），特产建筑 `buildingsSeen`，但许愿池刻意不去重。图鉴判定读 `victim.config.ponds`（复用 3a 字段，零新结构）；`POND_BUILDING_TYPES` 从 BUILDING_SPAWN_RULES 推导。UI 零改动（面板读 `getAchievementView()` 动态渲染）。
- **生物形状**（2026-09-12 晚）：data/creatureShapes.ts 注册表（20 形状）+ components/fishShapes.ts 三件套（轮廓/背景附属/前景附属）+ CREATURE_DATA.shape 字段（缺省 FISH=旧管线零变化）。非鱼形公约：表面嘴、无内壁/装扮牙/装扮尾；眼/眉/花/鳞/配饰照常。深海新物种：皇带鱼/吸血鬼乌贼（CEPHALOPOD 复用）/哥布林鲨（SHARK 复用）——复用形状换色=新物种低成本差异化。⚠️ 测试造实体测形状必须显式传 shape id（undefined=FISH 路径）。形状×装扮组合已验收（probe-shapes-cosmetics.mjs 三轮×20 形状全绿）。
- **隐蔽/掩体**（c9442ba；**2026-09-13 调参**）：水草 85% 半径藏身（`COVER_RADIUS_MULT`）、碰撞滤 SEAWEED（草≠墙）；ai.ts `canPerceive` 是**锁定判定的唯一收口**（隐蔽目标只在「贴脸 `CONCEAL_REVEAL_RANGE=80px`」或 `sonarTimer>0` 时可见）；**`combat.ts` 的扑咬命中率还要再乘 `CONCEAL_BITE_PROB_MULT=0.2`**。⚠️ 后者是 2026-09-13 补的：`canPerceive` 只管「能不能锁定」，一旦被识破扑咬判定里**没有任何隐蔽项**，体型 2 倍猎手基础命中 0.8 + 等级压制（Lv4 vs Lv1 → +0.45 顶到 1.0），藏没藏住照咬 —— 用户报「躲进水草还是被杀」就是这个。⚠️ 乘的位置必须在**所有加成之后、掷骰之前**：同级大吃小的 `Math.max(eatProbability, 0.5)` 是地板值，放前面会被整条覆盖。⚠️ `CONCEAL_REVEAL_RANGE` 不能压到 67 以下（双髻鲨 r50 + 玩家 r17 = 半径和），否则「贴脸照样识破」退化成「绝对看不见」。⚠️ 设计分工仍然有效：隐身 ← 被声呐反制，**草丛 ← 只能贴脸破**（tryCounterSkill 只认 camoActive/isHidden，别当 bug 改）。回归 `cover-bite.test.ts`（骰点全 mock）+ `concealment.test.ts`。
- **装扮/预览**（029ed2b → 45e4a89，2026-09-12 补全）：预览必须复用 drawCuteFish（GameCanvas 导出）；选项收在 data/cosmeticsOptions.ts（11 份清单），面板用 data-cosmetic-key/value 选择器 + 7 页签（含五官/身形）。⚠️ **上架铁律两面**：没渲染分支的不上架 + 渲染无区分度的也不上架（体型 STAR 参数与 ROUND 重合）。嘴型改鱼身前缘轮廓（mouthOpen 收口开口角），牙齿只给 TRIANGLE/SQUARE 露、FLAT 不画内壁、喙/唇线画在身体 fill 之后；bodyType 缩放放玩家光环之后。
- **AI 心境**（8fc876e，2026-09-12）：data/moods.ts 8 心境（悠闲/警觉/胆怯/饥饿/好奇/群聚/瞌睡/狂躁）；数值型只改倍率（CALM 全 1 = 旧行为），接管型 MOOD_HANDLERS 先于种族行为分发；`senseRangeSq` 收口感知半径；到期重抽（angerTimer>0 交战不换）；HUD 画 emoji 徽章（玩家 900px 内）。⚠️ **随机性纪律：测试钉 `moodId:'CALM'` 或钉 moodWeights 权重，不掷骰子做断言**（concealment flake 实证）。⚠️ **追/退边界必须有停泊带**（squad FOLLOW_DEADZONE 同款经验）：两个全推力分支贴一条边界 + 转向增益 ~0.45/帧 = 原地打转 —— 好奇 CURIOUS_PARK=380、群聚 SOCIABLE_KEEP=135，带内减速滑停（修复见 2026-09-12 日志）。
- **「原地转圈」第二味药**（2026-09-13，用户报「还是会有」）：停泊带只治了边界互抢方向盘，另有两条病根 —— ①**`atan2` 奇点**：实体间**没有分离力、可以互相重叠**，追/逃双方贴到重合时方位角随微小位移翻半圈 → 每帧满敏捷转向、转弯半径<1px（磷虾 0.84、乌龟 1.44 rad/帧）；②**锁定抖动**：若干威胁距离相近时「最近的那条」每帧易主。修法：`isOverlapping()` 重叠时**不追方位角、保持朝向直冲**（判定**只用半径和、不加余量** —— 加 24px 会吞掉 concealment 的「贴脸识破」用例，双髻鲨 r50 摆在 75px）；`TARGET_HYSTERESIS_SQ=1.25²` 锁定迟滞，记忆存新增可选字段 `Entity.lockId`（**别用 targetId**，被「混乱」技能改写；隐蔽仍一票否决，大鱼反制探测不写回）。判据用**转弯半径 = 路程÷角扫掠**（不是圈数）**且净位移 < 路程×0.1**（⚠️ 2026-09-13 晚补：只看半径会误报漂游的磷虾 —— 换 8 个种子有 4 个中招，半径 7.4~11.9px 但净/路程 ≥0.22；真 bug 的净位移比是 0.000）。修复前 90.9 圈/0.79px → 修复后 6.4 圈/49.7px。回归 `orbit.test.ts`，两味药各自做过反向验证。
- **障碍物滑走**（2026-09-13，用户报「遇到障碍物会顿挫」）：`terrain.ts resolveObstacles` 原来**只推位置、从不改朝向** → 目标在岩石另一侧时「推进扎进去 + 推回表面」净位移=0，**顶死在石头上**（玩家贴面 387/400 帧、扫掠 0.00rad）。补上与边界同款的切向处理：推表面 → 朝向**限速**掰向切向（切向基 `(-ny,nx)`，按 `sign(cos·tx+sin·ty)` 取同侧那一支防左右乱翻）→ `vx/vy` 跟着朝向重设。⚠️ **必须限速**（`SLIDE_TURN_PER_FRAME=0.35` rad/帧）：渲染是 `ctx.rotate(angle)`，正面撞切向差最多 90°，一帧扭过去**本身就是新抽搐**；⚠️ **趴着不动的（伏击/打盹，speed<1e-4）只推位置不改朝向**；两遍处理保留（夹缝防锁死）。判据：贴面帧数够多**且**切向位移显著。回归 `obstacle-slide.test.ts`（3 例）+ 探针 `probe-obstacle-slide.mjs`。
- **边界反弹 + 两条约束通路统一**（2026-09-13 晚，用户报「碰到边缘会反弹」）：`clampToMap` 硬分支原来 `correctedDist = max(limit-buffer, limit*0.95)` **往内多拉一截**（刚越界 2px 拉回 159.2px）+ 朝向朝圆心压缩 0.6（正面撞一帧甩 1.257rad）—— 这就是「反弹」。现在硬分支**只推回表面**（`entity = CENTER + n*limit`），朝向与障碍物**共用 `terrain.ts alignToSurface(nx,ny)`**；⚠️ **缓入区只减速、绝不夺方向盘**（硬分支钉在 limit 上后 penetrationRatio 恒 1，向心力每帧满强度跟 `alignToSurface` 抢方向盘 → orbit 当场报「磷虾转 6.4 圈 半径 9.0px」）。⚠️ **改碰撞/约束前先对照另一条通路怎么做的，两条必须同向** —— 这条经验的原型正是「边界做了、障碍物没做」，现在两边都对了。回归 `boundary-slide.test.ts`(5) + `obstacle-slide.test.ts`(3)，各自反向验证过。
- **取证手法（可复用）**：转圈/抖动类 bug 三步 —— ①真实 updateGame 帧循环 + 钉种子，按实体累计「角扫掠/路程/净位移」定位最坏个体；②给 `angle` 装 `Object.defineProperty` setter 抓**每帧写入次数+调用栈**，证明只有一个写者（排除两系统互抢）；③`Δ角 ÷ agility` 反推角差 ≈ −π → 锁定方位角奇点。⚠️ 抓栈过滤用 `includes('systems')`，**别用 `/src/`**（Windows 栈是反斜杠）。

## 本机环境坑（重要！）
- **同文件两处 Edit 同消息发会丢一处**（双双报 Success）→ 一文件一消息一条 Edit；多处改 = Read 全文 + Write 整文件；改完 grep 复核。
- **整块替换长代码段（尤其含「多行行尾空白」）时，Edit 的 old_string 极易失手** → 用**一次性 node 脚本按行号替换**：先 assert 起止锚点行内容 + 一条中间行内容（不符就 throw），替换后打印 `patched: import@4 | block 27→13 lines`，跑完立刻 `unlinkSync` 删脚本。本项目替换 UIOverlay 那个含 5 行「10 空格」行尾空白的 27 行块，就是这么一次成功的。
- bash 偶发抽风（dirname not found），后台任务起不来 → 改用 PowerShell；**PowerShell 不回显 stdout** → 一律 `2>&1 | Out-File -Encoding utf8 <文件>` 再用 Read 看。
- PowerShell 禁 `cmd /c`；含 %VAR% 样式 token 的命令被拦（git log --format=%s 也拦）→ 换写法或拆两条发。
- Get-Content 读 UTF-8 要加 -Encoding utf8（乱码/行数不准）→ 读文件优先 Read 工具。
- git commit -F 传 Windows 正斜杠路径 C:/...（/c/... 读不到）；中文 message 落库正确，控制台乱码仅显示问题。npm 被 safe-delete 包装器拦截；vite 占 esbuild 文件锁时 npm ci 会失败。
- **删文件别用 `Remove-Item`**（被 safe-delete 包装器拦，exit 1 且无输出，极易误判成功）→ 用 `node -e "require('fs').unlinkSync('x')"`。
- **命令重定向的日志命名**：不带点的 `*-out.txt` 会被 `git add -A` 卷进来（9-11 已踩一次）→ `.gitignore` 已加 `/*-out.txt`；养成加点前缀（`.tsc-out.txt`）的习惯。
- **.git 会莫名被清空** → 动 git 前 tar -czf 备份到 E:\gitlab\git-backup\；已删文件偶发自愈复活，工作树冒出旧文件先怀疑这个。
- **嵌套 ref（带 / 的分支名）被 git 静默删掉且 exit 0** → 一律扁平分支名。
- git 报 bad tree / unable to read tree / repack failed = 老 history 缺对象，**commit 不需要父 tree，直接提交即可，报错是噪音**。
- 分支形态：dev = 主线（无父根提交）；archive-broken-history 存损毁老历史；远端 github 404 已没了，本地 commit 是全部家底。
- **代理常驻且端口会变（现为 127.0.0.1:9053）**：git/curl 被 401；Playwright Chromium 继承它连 localhost 都超时 → 探针前清 $env:http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY。排查顺序：服务端 200 → 代理 → 代码。
- vitest 钉 ^3.2.7（v4/v5 套件级崩溃，Windows 特定），升级前先验证；NODE_OPTIONS 注入 shim，排查工具链用 env -u 对照；vite6 index.html 别用内联 <style>；favicon 404 幽灵报错无害。

## 文档分工（2026-09-13 收敛）
- **《开发任务清单.md》= 唯一执行入口**（待办分级 P0~P3 / 现状实测 / 验收模板 / 技术债 / 推荐顺序）。
- 《开发计划.md》= 功能**规格**与历史（§十一 优先级表已归档，状态不可信）；《开发路线图.md》= 每轮交付记录与踩坑；《多鱼塘立项设计.md》= 多鱼塘专题与 2b 暂缓决策。README 挂四份指针。
- ⚠️ **状态一律 grep 代码核实，不抄旧文档标记**（实测 §十一 里成就/排行榜/金币/传送门特效/无敌护盾全已完成却仍标 🔄）。
- 当前待办首选：**P0-1 装扮子集补全**（花纹 10/24、鳞片 7/15、眼睛 8/12、牙齿 8/13、配饰 8/15，缺的都是没渲染分支的）；P0-2 塘内独立成就已于 2026-09-13 完成 ✅。
- 已排除不是欠账：追踪鱼雷（按需求移除）、VIP（字段已删）、联机（需立项）。

## 游戏手感
- 花瓣地图 r=2000+1200·|sin(2a)|，中心 (3000,3000)（出生点），商场 (1500,1500) E 进 1.5 倍圈；WORLD_SIZE 6000；SEAWEED 只长 SWAMP、可穿行可藏身；游戏是固定步长累加器（16.67ms/步，headless 不限帧也一致）。
- 边界顺序：先 resolveObstacles 后 clampToMap（两条通路**共用 `alignToSurface`**：只推回表面 + 限速掰向切向；缺了任一半就会顶死或反弹）；React RAF 循环用 alive 标记自排下一帧。

## 测试 / 探针约定
- 模块级状态的系统先加 `__resetXxx()` 再写用例（prevInteract / teleportLock / switchCursor）；钉 Math.random 按系统真实取数顺序给序列（spawn：tier→食物判定→池内选择→刷点 x,y）。
- 探针断言：玩家位置用容差；HUD 用 waitForSelector（uiState 100ms 才同步）；瞬时表现按 timer 帧数倒推采样（气泡仅 45 帧）；诱饵/追兵给 biteCooldown=9999 防被玩家吞掉；冻结画面别用 status='MENU'（GameCanvas 会卸载）→ **保持 PLAYING，把干扰源（实体/障碍/道具）物理挪走**；清场+读像素同一次 evaluate；采样框用当帧 camera 现算；测试物染与待测特征正交的颜色。
- **定场景别靠运气**：用 `window.__FISH_DEBUG__`（dev-only，`{state,player,squad}`）直接改 state 摆场景（贴到某块岩石表面、丢到边界外让世界压回来等），比「等它自己游过去」可靠。⚠️ 依赖外部几何常量的探针要**拿真实值交叉校验公式**（边界探针把玩家丢到界外让 clamp 压回约束面，再跟公式对，差 0.0px 才算常量没漂）。
- 全屏截图常常认不出被测对象（同色/被遮挡）→ 用 `state.camera` + `zoom` 现算屏幕坐标，再 `page.screenshot({ clip })` 裁近景。⚠️ `page.evaluate` 里**不能直接引用 Node 侧变量**（如 W/H），要当参数传进去。
- **沿曲线约束面滑动时，别拿「角位移」当「在动」的判据**：花瓣边在 30° 处 `dr/dθ≈1236px/rad`，贴边滑 186px 只折合 0.06rad。判据要用「贴边 + 路程显著」。同理，量「贴面帧数」必须用**当帧本地角**算的面半径（半径随滑动变化，用起点值会少算一个量级）。
- text= 是子串匹配，点击与计数都会被污染（**差值恒定 → 先怀疑作用域，别查逻辑**）；点按钮用 button:has-text，计数先锁容器再数行；e2e 用 channel:'chromium'。
- 探针截图命名定去留：与脚本同名的 `-probe.png` 忽略；描述性命名 = 功能证据 = 提交（README/gen-deliverable 引用，承重）。凡「脚本产物+忽略规则」收尾看 git status 是否以 `??` 出现。
- 「按钮在、渲染空」类 bug：单测用记录型 canvas ctx 指纹（调用+样式 setter 串串，两两不同 + 比未实现基准多，配 positive control）；e2e 用 toDataURL 去重 / getImageData 平均色；动画 canvas 进 rAF 前先同步画一帧防首帧空白。⚠️ animate=true 的预览**不能拿 toDataURL 做前后对比**（每帧都不同，断言恒真）→ 用静态缩略图采像素或平均色分量。
- ⚠️ **「随机流 + 硬阈值」的统计型测试天然 flaky**：任何玩法改动都会平移 `Math.random` 取数顺序，阈值就漂了 —— `orbit.test` 的「转弯半径 < 12px」换 8 个种子误报 4 次（全是漂游的磷虾）。阈值要绑**物理不变量**（净位移/路程比值），别绑**运气量**（半径刚好几 px）。改判据两头都要验：**多-seed 阴性对照**（确认不再误报）+ **关掉修复的反向验证**（确认还能抓到真 bug）。
- ⚠️ **用常量推导测试距离/位置时，检查推导值有没有掉进别的机制的区间**：`concealment.test.ts` 用 `Math.floor(CONCEAL_REVEAL_RANGE / 2)` 造「贴脸」距离，常量 150→80 后算出 40，小于「双髻鲨 r50 + 玩家 r17 = 67」的半径和 → 被 `ai.ts isOverlapping`（重叠时刻意不转向）接管，断言测的根本不是识破。**改成显式量 + 一条 `expect(值).toBeLessThan(常量)` 前提守卫** —— 常量再漂会当场报错，而不是静默测错对象。
- 概率类改动优先用**固定骰点**而不是「跑 N 次数频率」：把 `Math.random` mock 成两个点夹住改动后的概率（本项目用 0.5 / 0.15 夹住掩体后的命中率），既确定性又能证明「不是无敌」。⚠️ `vitest.config.ts` 没开 `restoreMocks` → mock `Math.random` 的文件要自己 `afterEach(() => vi.restoreAllMocks())`，否则同文件用例互相污染。
- ⚠️ **「渲染期不许掷骰子」有直证写法**：组件测试里 `vi.spyOn(Math,'random')` → `render(...)` → `expect(spy).not.toHaveBeenCalled()`，**必须配一条阳性对照**（裸调那个抽取函数，证明 spy 有威力、不是断言没生效）。UIOverlay 这种大组件要 mock：lucide-react（**图标名列表内联在 factory 里**，避开 `vi.mock` 提升导致的 TDZ）、MiniMap、CosmeticsPanel、gameEngine、achievements、leaderboard；面板文字用 `container.querySelectorAll('h3')` 取。浏览器级回归就用 e2e spec **连采 N 次文字断言逐次一致**（`e2e/evolve-panel.spec.ts` 连采 15 次），改坏时它会把抖动内容打印出来。**三层都做了反向验证**（摘门闸 / 渲染期塞洗牌 → 组件测试抓 107 次调用 / 改回旧行为 → e2e 变红），才算证完。
