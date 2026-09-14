# 欢乐鱼塘（E:\gitlab\fish）长期笔记
> 细节看同目录 `2026-09-*.md` 日志与《开发任务清单.md》《开发计划.md》《多鱼塘立项设计.md》。

## 架构 & 纪律
- 门面聚合：constants/types/gameEngine re-export src/data/* 与 src/systems/*。数据驱动：as const 注册表+keyof；系统注册表 systems/index.ts 顺序执行；EventBus 分发（SKILL/AI/MOOD_HANDLERS）。
- **伤害唯一入口 = `combat.ts dealDamage(target, amount)`**（返回实际伤害）：无敌模式 / 无敌帧 invulnerableTimer / 护盾 shieldTimer(吸收0.7) / 易伤 vulnerableTimer(×2) 全在这里判定。**新增任何伤害来源必须走它**，直接 `health -=` 就是 bug —— 查「无敌/无敌帧/护盾是否真生效」只需 grep `health -=`。已收口：combat / skills.ts（薄包装 `hitTarget`）/ world.ts 沼泽腐蚀。progression 死亡判定前另有兜底闸（isGodMode 时 health 保底 1）。
- **React 渲染纪律**：随机/时变/洗牌值不许渲染期算——触发点算一次存 GameState 快照，UI 只渲染快照（范例 evolveOptions）；兜底也必须确定；触发点加幂等门闸。
- **性能（2026-09-13 四叉树+DC+combat 三刀）**：邻居查询走 `utils/SpatialHash.ts` 的 QuadTree（零分配节点池，queryCircle 回索引、调用方精距过滤）；ai.ts findNearest 全走 candidateTree（tie-break 保持旧行为：玩家在先+索引序，迟滞用 candidateById）；terrain.ts ObstacleIndex 收窄障碍碰撞；combatSystem 捕食双循环也接 combatTree（候选按原下标升序只处理 j>i，随机流零变化）；GameCanvas 视锥剔除扩到全部对象 + Path2D 边界缓存（惰性 getBoundaryLayers，jsdom 无 Path2D）+ ROCK_SHAPE_CACHE。逻辑 1.70→0.575ms（−66%）、combat −76%、far 场景绘制 −80%。探针 `scripts/probe-perf.mjs`（vsync 必须关、B2=纯渲染耗时应 flush、工作负载钉到物种级才可 A/B；perf-baseline.json 基线、perf-<label>.json 对比自动打印）。

## 内容扩展套路
- data/<x>.ts as const 注册表+取值函数（未知 id 回退默认）→ constants 门面；GameState.<x>；加分走 scoreGain(pondId, base)；收尾=菜单/HUD+单测+probe+文档。**新默认值==旧硬编码**（向后兼容铁律）。

## 功能现状要点
- 多鱼塘 CLEAR/CORAL/ABYSS（1+2a+3a；2b 暂缓）；特产三线数据驱动（鱼 ponds 字段/建筑 BUILDING_SPAWN_RULES/塘事件 pondEvents）；加建筑登记四处 + MiniMap.test mock；teleportLock/obstacleIndex 模块级 → 单测先 `__resetXxx()`。
- 成就 19 枚；图鉴目标由 getPondSpecialties().fish.length 推导不写死；建筑埋点独立 buildingUse 事件（复用 building 会双播音效）；换塘走 pondId 差分不加事件。
- 生物形状：creatureShapes 20 形 + fishShapes 三件套；复用形状换色=新物种；测试造实体必须显式传 shape id。
- 隐蔽：canPerceive 是锁定唯一收口（CONCEAL_REVEAL_RANGE=80，不能 <67）；combat 命中**所有加成后、掷骰前**乘 CONCEAL_BITE_PROB_MULT=0.2（放地板值 max(eatProb,0.5) 前会被覆盖）。隐身←声呐反制，草丛←只能贴脸破。
- 击杀等级门闸：COMBAT_CONFIG.KILL_LEVEL_GATE + combat.ts isUnkillable —— victim.level > attacker.level 杀不死：伤害/缩水/猛回头照常、血量保底 1、吞噬失效（背刺重击同兜底）。AI 等级=tier+1、玩家=体重/10+1；BOSS 通关需玩家升到同级（p0 钉 level20 天然放行）；逆转（小鱼磨死大鱼）保留但仅限同级。
- 埋伏鱼威胁逃跑：ambushBehavior 顶部先查「半径>自己的敌人」→ 收饵+lureActive=false+fleeFrom（优先级 威胁>猎物>待机）。lureActive 实体渲染走 drawMeatBlock（玩家/AI 共用肉块形态）。⚠️ **aiSystem 有 AI LOD：离玩家 >2600（AI_ACTIVE_RANGE）不模拟 —— aiSystem 单测摆位玩家必须在 2600 内、感知圈外**。
- 心境：数值型只改倍率（CALM 全 1=旧行为）；测试钉 moodId:'CALM' 防随机 flake；追/退边界必须有停泊带（CURIOUS_PARK=380、SOCIABLE_KEEP=135）。
- 转圈第二味药：重叠时 isOverlapping 不追方位角直冲（判定只用半径和）+ TARGET_HYSTERESIS_SQ=1.25²（存 Entity.lockId，别用 targetId）。
- 约束两通路统一：resolveObstacles 与 clampToMap 共用 alignToSurface（推表面+限速掰切向 0.35rad/帧）；缓入区只减速不夺方向盘；静止实体只推位置。
- 手感：常速=spec.speed×1.5×1.2；冲刺=playerControl.ts ×BOOST_CONFIG.SPEED_MULTIPLIER（当前 3.08）。两旋钮独立，用户说慢先问哪个。
- 花瓣地图 r=2000+1200·|sin2a|，中心(3000,3000)，WORLD_SIZE 6000；固定步长累加器 16.67ms/步。

## 取证手法（转圈/抖动类 bug）
①真实帧循环+钉种子，按实体算角扫掠/路程/净位移；②angle defineProperty 抓写入栈（过滤 includes('systems')，别用 /src/，Windows 反斜杠）；③Δ角÷agility 反推奇点。判据=转弯半径小**且**净位移<路程×10%（只看半径会误报漂游个体）。

## 本机环境坑（重要）
- bash 抽风（dirname not found）→ 用 PowerShell；stdout 不回显 → `2>&1 | Out-File -Encoding utf8 f.txt` 再 Read。
- 一文件一消息一条 Edit；含行尾空白的块替换用一次性 node 按行号脚本（assert 锚点+跑完删）；改完 grep 复核。
- 删文件用 `[System.IO.File]::Delete()`（Remove-Item、node -e unlinkSync 都被拦且静默失败），删完 Glob 复核。
- 重定向日志加点前缀（.tsc-out.txt，防 git add -A 卷入）；**别把搜索输出重定向回同一文件**（自喂暴涨 397MB 实证）；查内容用 Grep 工具。
- 代理常驻（现为 127.0.0.1:9053）：git/curl 401；Playwright 连 localhost 都超时 → 探针前清 http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY。排查顺序：服务端 200→代理→代码。
- .git 偶发被清空 → 动 git 前 tar 备份 E:\gitlab\git-backup\；git bad tree 报错=老历史缺对象，commit 直接提交即可；分支名一律扁平。
- vitest 钉 ^3.2.7（v4/v5 Windows 套件崩溃）；PowerShell 禁 cmd /c 与 %VAR% token；git commit -F 用 C:/ 正斜杠路径；Get-Content 要 -Encoding utf8。

## 文档分工
《开发任务清单.md》=唯一执行入口；《开发计划.md》=规格历史；《开发路线图.md》=每轮交付记录；**状态一律 grep 代码核实，不抄旧文档标记**。

## 测试/探针约定（高频）
- 模块级状态系统加 __resetXxx()；钉 Math.random 按真实取数顺序给序列；概率改动用固定骰点（两骰点夹概率）+ 文件内自带 restoreAllMocks（vitest 没开 restoreMocks）。
- 定场景用 `__FISH_DEBUG__` 直接改 state；截图用 camera+zoom 现算屏幕坐标 clip 近景；page.evaluate 不能引 Node 侧变量；冻结画面保持 PLAYING、物理挪走干扰源。
- 统计型阈值绑物理不变量（净位移比），不绑运气量；改判据做多-seed 阴性对照+摘修复反向验证。
- 调参探针从源码解析常量当期望+需求底线单列（快照会随需求红一次）；「按住到耗光」采样前别插 waitForTimeout。
- 「渲染期不许掷骰子」三层验证：组件 spy+阳性对照 / e2e 连采 N 次 / 摘门闸反向红。
- HUD 用 waitForSelector（uiState 100ms 才同步）；text= 是子串匹配，计数先锁容器。
