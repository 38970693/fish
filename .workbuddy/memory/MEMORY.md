# 欢乐鱼塘（E:\gitlab\fish）长期笔记
> 细节看同目录 `2026-09-*.md` 日志与《开发任务清单.md》《鱼群争霸开发计划.md》《多鱼塘立项设计.md》《G0-基线记录.md》。
> **文档分工**：《开发任务清单.md》=唯一执行入口；《开发计划.md》=规格历史；《开发路线图.md》=每轮交付记录；《鱼群争霸开发计划.md》=新主模式规格；《G0-基线记录.md》=各阶段开工对照基线。**状态一律 grep 代码核实，不抄旧文档标记。**

## 架构 & 纪律
- 门面聚合：constants/types/gameEngine re-export src/data/* 与 src/systems/*。数据驱动：as const 注册表 + keyof；系统按 `systems/index.ts` 顺序执行；EventBus 分发（SKILL/AI/MOOD_HANDLERS）。
- **伤害唯一入口 = `combat.ts dealDamage(target, amount, source?)`**（返回实际伤害）：无敌模式 / 无敌帧 invulnerableTimer / 护盾 shieldTimer(吸收 0.7) / 易伤 vulnerableTimer(×2) 全在这里判定；第三参只记 `lastHitById`（致命归属，不改任何数值）。**新增任何伤害来源必须走它** —— 直接 `health -=` 就是 bug，查「无敌/无敌帧/护盾是否真生效」只需 grep `health -=`。已收口：combat / skills.ts（薄包装 `hitTarget`）/ world.ts 沼泽腐蚀；progression 死亡判定前另有 isGodMode 保底 1 血的兜底闸。
- **唯一可攻击判定 = `systems/factions.ts` 的 `canHarm`**（combat / ai / skills 三处共用，别再各写 isFriendly/isEnemy）；自伤一律用**对象同一性 `a===b`** —— 单测钉 Math.random 时 `uuid()` 全场同 id，按 id 判会让战斗判定整段失效。
- **一次性死亡收口 = `combat.resolveDeath`**（`deathSettled` 幂等）：奖励 / death 事件 / `checkVictory` 全在里面，按 `isPlayerFaction` 记阵营（队友击杀进玩家账、队友杀 BOSS 也算通关）。技能 / 中毒 / 环境致死由 combatSystem 尸体清理前补结算 —— 否则会被末尾静默 filter（零收益零事件）。中毒速率 `COMBAT_CONFIG.POISON_DPS_RATIO`（ai / playerControl 共用），VENOM 写 `poisonSourceId` 让毒死有凶手。
- **React 渲染纪律**：随机 / 时变 / 洗牌值不许渲染期算 —— 触发点算一次存 GameState 快照，UI 只渲染快照（范例 evolveOptions）；兜底也必须确定；触发点加幂等门闸。
- **UI 布局纪律（菜单溢出实证）**：根容器是 `App.tsx` 的 `w-full h-screen overflow-hidden`。**居中且不滚的容器一旦内容超出视口就会「上下同时溢出 → 被裁掉且滚不到」**（父级滚动条只能滚到下方那一半）。修法固定成两层：外层 `absolute inset-0 overflow-y-auto overscroll-contain` 负责滚 + 内层 `min-h-full flex items-center justify-center` 负责「矮时居中」。回归锚 `e2e/game-flow.spec.ts`「矮视口下菜单不裁切」（压 1280×560 制造溢出，要求标题与开始按钮都能滚进视口；**只比几何量、不认 Tailwind 类名**）；摘掉修复时标题 y = **−132.75**，与用户截图现象一致。面板（规则 / 成就 / 排行榜 / 装扮）都是 `fixed inset-0`，不受滚动容器影响。

## 性能与探针
- **2026-09-13 三刀**：邻居查询走 `utils/SpatialHash.ts` QuadTree（零分配节点池，queryCircle 回索引、调用方精距过滤）；ai.ts findNearest 全走 candidateTree（tie-break 保持旧行为：玩家在先 + 索引序；迟滞用 candidateById）；terrain.ts ObstacleIndex 收窄障碍碰撞；combatSystem 捕食双循环接 combatTree（候选按原下标升序、只处理 j>i，随机流零变化）；GameCanvas 视锥剔除扩到全部对象 + Path2D 边界缓存（惰性 getBoundaryLayers，jsdom 无 Path2D）+ ROCK_SHAPE_CACHE。逻辑 1.70→0.575ms（−66%）、combat −76%、far 场景绘制 −80%。
- **`scripts/probe-perf.mjs` 规矩**：vsync 必须关；B2=纯渲染耗时应 flush；工作负载钉到物种级才可 A/B。**基线用 `perf-g0-baseline.json`**（旧的 perf-baseline.json 是 180 实体时代，MAX_ENTITIES 提到 300 后会标「不可比」）；可点名基线：`node scripts/probe-perf.mjs <label> <baselineLabel>`。
- ⚠️ **本机轮间方差可达 ±2×**（同一份代码一轮 +97%、一轮 −50%）→ **判据是 warmup ms**（整机负载最灵敏：同一基线 4.76s，两轮分别 7.93s / 2.86s），与基线不同档就**整轮作废重跑**；**自相矛盾的读数直接判噪声**（「渲染 +97% 但绘制调用 −40%」不可能同时成立）。
- **flaky 只用来判「是不是回归」，不用来结案** —— 真结案要么抓到现场 dump、要么证明物理不可能。首轮 `goto('/')` 集体超时 = 环境（dev server 冷启动 1749 个未打包模块 + 本机插件进程抢 CPU），不是回归 → `playwright.config.ts` 的 `navigationTimeout` 已放宽到 60s（只放宽导航，断言仍 5s，不掩盖「页面坏了」）。0.5% 这类偶发（跑一遍看不见、跑一千遍必现）→ **循环抓现场 dump 是唯一高效手法**，多跑几次不算；实例见 `2026-09-14.md`「传送门压在商场」（修法 `SHOP_PORTAL_KEEPOUT` 禁区 + LOCAL 门重掷/推出）。

## 内容扩展套路
data/<x>.ts as const 注册表 + 取值函数（未知 id 回退默认）→ constants 门面；GameState.<x>；加分走 `scoreGain(pondId, base)`；收尾 = 菜单/HUD + 单测 + probe + 文档。**新默认值 == 旧硬编码**（向后兼容铁律）。

## 功能现状要点
- 多鱼塘 CLEAR/CORAL/ABYSS（1+2a+3a；2b 暂缓）；特产三线数据驱动（鱼 ponds 字段 / 建筑 BUILDING_SPAWN_RULES / 塘事件 pondEvents）；加建筑登记四处 + MiniMap.test mock；teleportLock / obstacleIndex 是模块级 → 单测先 `__resetXxx()`。
- **「鱼群争霸」新模式入口（G0/FQ-02）**：`data/runRules.ts`(RUN_MODE/阶段表/规则参数) + `systems/runFlow.ts`(阶段时钟，注册在 SYSTEMS 最前)。**旧模式零改动 = `state.run === undefined`**，消费点一律 `if (!state.run) return;`（别写满地 `if (mode==='RIVALS')`）；默认 LEGACY，开发期 `?mode=rivals` 切换（写 localStorage）；时间一律存帧、`sec()` 是唯一换算入口；RIVALS 下 allowPondTravel=false 不生成塘际门；isGodMode / 手动续命 → 粘性 `run.practice` → recordRun 返回未上榜且不动 currentRunState；排行榜条目带可选 mode/ruleVersion（旧档按 LEGACY/0 兜底）。测试资产 `src/test/scenario.ts`（withSeededRandom / createSeededScenario，mulberry32，finally 还原 Math.random）。
- **G1/FQ-03 阵营**：`systems/factions.ts`（FACTION.PLAYER/WILD · factionOf/canHarm/isPlayerFaction）。⚠️ **WILD 是「无阵营」不是「中立阵营」**：野鱼互吃必须保留（套「同阵营不可互伤」世界当场静止）。战队**收编**仍只认玩家本体（G3/FQ-10）。
- **G1/FQ-04 战斗规格（§5.1/§5.2）**：`combat.processCollision` 拆成**两条互不相干**的量 —— `facingDiff`=(攻击者→猎物方位 − attacker.angle) 只管「**能不能咬到**」（正前 ±60° 或后弧 > BACK_ANGLE_THRESHOLD），`tailDiff`=(猎物→攻击者方位 − **victim.angle**) 只管「**是不是背刺**」（绕到**猎物尾部**才算，方向反判已由 FQ-04 修正）。**咬中不再掷骰子**：唯一保留的随机落空是 `isConcealed(victim) && Math.random() >= CONCEAL_BITE_PROB_MULT(0.2) → return`（掩体机制，不是贴身闪避）；原挂在命中率上的加成改乘伤害 —— `LEVEL_DAMAGE_STEP 0.15` / `LEVEL_DAMAGE_CAP 0.9`（`attacker.level > victim.level`，步数 = min(差, cap/step)）、`LURE_DAMAGE_MULT`、`CLOWN_PREY_DAMAGE_MULT`、`BACK_BITE_BONUS 0.5`。**大鱼反击**：`startCounter`（只起 `counterWindup` + `counterCooldown` + 回头 + 飘「猛回头!」，**当帧零伤害**）→ `tickCounterOne`（先减冷却再减前摇；**前摇归零那一帧**按**当下站位**结算 `COUNTER_RANGE_MULT × radius` 内 `canHarm` 的目标）→ `tickCounters` 遍历 entities + player；**`tickCounters` 必须在碰撞之前调用**，否则伤害时点被拖后一帧。渲染 `GameCanvas.drawCounterTelegraph`（`windup<=0` 早退 = 无前摇零开销）。
- **数值型战斗单测三坑（FQ-04 连红 5 例全出在这）**：① **猎物必须拉满血**（`maxHealth/health = 1e6`）—— 大白鲨对大蓝唐鱼一口 ≈120 而对方只有 20 血，会走 `DEVOUR_HP_RATIO` 被**吞掉**，量到的是「整条血 20」不是伤害；② **`SHRINK_ON_BITE=0.995`** 让「咬完再算期望值」偏 0.5% → 基准值要在**咬之前**算；同一对鱼连咬两口（比背刺 ×1.5）必须先 `victim.radius = r0` 还原；③ **玩家初始体重 = `tier×10+5`（默认小丑鱼 = 15，不是 0）**，断言「收益没进玩家账」要用 `weightBefore` 比。
- **击杀等级门闸**：COMBAT_CONFIG.KILL_LEVEL_GATE + combat.ts `isUnkillable` —— victim.level > attacker.level 杀不死：伤害 / 缩水 / 猛回头照常、血量保底 1、吞噬失效（背刺重击同兜底）。**FQ-04 后仅 LEGACY 生效**（`!state.run`），RIVALS 取消硬门槛、等级优势转为伤害倍率；`isUnkillable` 是本轮**唯一按模式分叉**处。AI 等级 = tier+1、玩家 = 体重/10+1；BOSS 通关需玩家升到同级（p0 钉 level20 天然放行）；逆转（小鱼磨死大鱼）保留但仅限同级。
- 成就 19 枚；图鉴目标由 `getPondSpecialties().fish.length` 推导不写死；建筑埋点走独立 buildingUse 事件（复用 building 会双播音效）；换塘走 pondId 差分不加事件。
- 生物形状：creatureShapes 20 形 + fishShapes 三件套；复用形状换色 = 新物种；测试造实体必须显式传 shape id。
- 隐蔽：`canPerceive` 是锁定唯一收口（CONCEAL_REVEAL_RANGE=80，不能 <67），已从 ai.ts 搬出并导出，可感知一律走它；隐身 ← 声呐反制，草丛 ← 只能贴脸破。
- 埋伏鱼威胁逃跑：ambushBehavior 顶部先查「半径 > 自己的敌人」→ 收饵 + lureActive=false + fleeFrom（优先级 威胁 > 猎物 > 待机）；lureActive 实体渲染走 drawMeatBlock（玩家 / AI 共用肉块形态）。⚠️ **aiSystem 有 AI LOD：离玩家 > 2600（AI_ACTIVE_RANGE）不模拟 —— aiSystem 单测摆位玩家必须在 2600 内、感知圈外**。
- 心境：数值型只改倍率（CALM 全 1 = 旧行为）；测试钉 moodId:'CALM' 防随机 flake；追/退边界必须有停泊带（CURIOUS_PARK=380、SOCIABLE_KEEP=135）。
- 转圈第二味药：重叠时 isOverlapping 不追方位角直冲（判定只用半径和）+ `TARGET_HYSTERESIS_SQ=1.25²`（存 `Entity.lockId`，别用 targetId）。
- 约束两通路统一：resolveObstacles 与 clampToMap 共用 `alignToSurface`（推表面 + 限速掰切向 0.35rad/帧）；缓入区只减速不夺方向盘；静止实体只推位置。
- 手感：常速 = spec.speed ×1.5×1.2；冲刺 = playerControl.ts × `BOOST_CONFIG.SPEED_MULTIPLIER`（当前 3.08）。两旋钮独立，用户说慢先问哪个。
- 地图：花瓣形 r=2000+1200·|sin2a|，中心 (3000,3000)，WORLD_SIZE 6000；固定步长累加器 16.67ms/步。
- **G1/FQ-05 战队指令与指定附身（§6.2）**：`data/squadRoles.ts`（指令注册表 FOCUS/GUARD/RETREAT + `SQUAD_COMMAND_CONFIG`）+ `squad.ts` 的 issueCommand / pickFocusTarget / queueSquadAction / requestPossess / consumeSquadActions / validateFocusTarget / swapAttackTimers / pickMoveTarget。三条纪律：**① 指令是状态不是动作**（`squad.command`/`commandTargetId` 挂 state，队员每帧照着动，UI 只读快照）；**② 离散输入走队列**（AR-03：键盘 / 头像点击只入队，`squadSystem` 帧内 splice 执行一次，上限 `ACTION_QUEUE_MAX=8`）；**③ 指定附身绝不做兜底**（成员没了 = 什么都不做 + 给原因，悄悄换人比失败更糟）。GUARD 是缺省指令且**队形数学与 FQ-05 之前逐字一致**；脱队判据用**离玩家**距离（用离队员的会让跑远的队员被脚边猎物越带越远）；RETREAT = 收紧(40) + 小死区(110) + **完全无视敌人**。冷却归属：**灵魂** = 技能 / 流派 / 切换冷却（挂 player，附身刷不掉）；**身体** = bite/counter（`swapAttackTimers` **对调**，不是清零）。鼠标→世界坐标用 `core/math.screenToWorld`（与 GameCanvas 相机互为反解）。`SquadState` 新字段全可选 → 老夹具不带也不炸。
- **G1/FQ-06 三个核心角色（§6.1）**：角色仍是 `data/squadRoles.ts` 里的**行为配置，不新增物种**（复用池子里已有的鱼）。GUARD 河豚护卫（PUFFER_FISH，speedMult 0.85）/ CONTROL 电鳗控制（ELECTRIC_EEL，healthMult 0.7）/ SCOUT 机动鱼（SWORD_FISH，speedMult 1.1 · damageMult 0.6）—— 每个都配一条 `weakness`（否则选谁都一样）。**核心位 `SQUAD_ROLE_CONFIG.CORE_SLOTS=3`，能力的唯一开关是 `entity.coreRole`，普通成员永远 undefined**（首版硬规则：普通鱼不能触发专属能力，否则收满 10 条控制鱼 = 同时放十个控制，正对计划 §12 头号风险）。`getSquadRoleConfig` 无角色**返回 undefined**，别塞默认角色（会让所有鱼变核心）。能力：GUARD 找「受威胁自己人」`GUARD_THREAT_RANGE 420`、要贴到 `GUARD_PROTECT_RANGE 260` 内才给盾（`GUARD_SHIELD_FRAMES 180`、`GUARD_COOLDOWN 600`）；CONTROL 优先控集火目标（`CONTROL_RANGE 520`）否则控玩家周边威胁（`CONTROL_THREAT_RANGE 380`），效果是给目标 `speedBoostTimer = -CONTROL_SLOW_FRAMES`（90 帧短控，与「无限控死」划清界限）、`CONTROL_COOLDOWN 420`；SCOUT 集火时额外 `SCOUT_FOCUS_SPEED_MULT 1.25`、撤退时从敌人质心反向拉开 `SCOUT_BREAKOUT_OFFSET 260`。角色数值改的是**克隆 config**（`member.config`），不污染数据表；`roleCooldown` 挂身体、随身体交换。HUD 核心成员 = `getCoreMembers()`（`ownerId==='player' && health>0 && !!coreRole`，与 UIOverlay 同一判据）。
- 附身交换身体**不含 level**（level 是灵魂的：吃鱼推进 + 解锁流派技能；跟着身体走会让 Q 技能消失），但**要带上 coreRole**。

## 取证手法（转圈 / 抖动类 bug）
① 真实帧循环 + 钉种子，按实体算角扫掠 / 路程 / 净位移；② `angle` defineProperty 抓写入栈（过滤 `includes('systems')`，别用 `/src/`，Windows 反斜杠）；③ Δ角÷agility 反推奇点。判据 = 转弯半径小**且**净位移 < 路程×10%（只看半径会误报漂游个体）。

## 本机环境坑（重要）
- **bash 抽风（dirname / ls / grep not found）→ 一律改用 PowerShell**；stdout 不回显 → `2>&1 | Out-File -Encoding utf8 f.txt` 再 Read。
- 一文件一消息一条 Edit；含行尾空白的块替换用一次性 node 按行号脚本（assert 锚点 + 跑完删）；改完 grep 复核。
- 删文件用 `[System.IO.File]::Delete()`（Remove-Item、node -e unlinkSync 都被拦且静默失败），删完 Glob 复核。
- 重定向日志加点前缀（`.tsc-out.txt`，防 `git add -A` 卷入）；**别把搜索输出重定向回同一文件**（自喂暴涨 397MB 实证）；查内容用 Grep 工具。
- 代理常驻（现为 127.0.0.1:9053）：git / curl 401；Playwright 连 localhost 都超时 → 跑探针前清 `http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY`。排查顺序：服务端 200 → 代理 → 代码。
- `.git` 偶发被清空 → 动 git 前 tar 备份 `E:\gitlab\git-backup\`；`bad tree object` = 老历史缺对象，commit 直接提交即可；分支名一律扁平。
- vitest 钉 ^3.2.7（v4/v5 Windows 套件崩溃）；PowerShell 禁 `cmd /c` 与 `%VAR%` token；`git commit -F` 用正斜杠**且盘符要对**（本项目在 E:，写成 C:/ 会 fatal: could not read log file）；Get-Content 要 `-Encoding utf8`。

## 测试 / 探针约定（高频）
- 模块级状态系统加 `__resetXxx()`；钉 Math.random 按**真实取数顺序**给序列；概率改动用固定骰点（两骰点夹概率）+ 文件内自带 restoreAllMocks（vitest 没开 restoreMocks）。
- 定场景用 `__FISH_DEBUG__` 直接改 state；截图用 camera+zoom 现算屏幕坐标 clip 近景；page.evaluate 不能引 Node 侧变量；冻结画面保持 PLAYING、物理挪走干扰源。
- 统计型阈值绑物理不变量（净位移比），不绑运气量；改判据做多-seed 阴性对照 + 摘修复反向验证。
- 调参探针从源码解析常量当期望 + 需求底线单列（快照会随需求红一次）；「按住到耗光」采样前别插 waitForTimeout。
- 「渲染期不许掷骰子」三层验证：组件 spy + 阳性对照 / e2e 连采 N 次 / 摘门闸反向红。
- **移动 / 位置类单测必须「钉 speed + 冻 time」**（FQ-05）：① `createEntity` 给的是物种速度（小丑鱼 1.1 → ×1.25 = 1.375px/帧，跑 800px 要 580 帧），夹具显式 `speed = 4`；② 队形角含 `state.time * 0.01` 自转项，推 time 会让目标点绕圈、任何「停在多少像素」都不成立 → 冻住 time；③ 想断言「A 比 B 更紧」做成**与体型无关的差值不变量**（两次运行半径项抵消：护卫距离−撤退距离 == `FOLLOW_GAP+FOLLOW_DEADZONE − (RALLY_GAP+RETREAT_DEADZONE)`）。
- **e2e 夹具必须把不确定性按死**（FQ-05 跑第二遍才红）：注入实体后若靠「就近取目标」，世界里随机刷出的野鱼会比注入的更近 → 用相机变换把鼠标真的压到目标身上（`(world - camera) * zoom + size/2`）。
- HUD 用 waitForSelector（uiState 100ms 才同步）；`text=` 是子串匹配，计数先锁容器。
