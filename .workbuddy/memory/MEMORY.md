# 欢乐鱼塘（E:\gitlab\fish）长期笔记

## 架构（v2 重构后）
- 兼容门面：`src/constants.ts`/`types.ts`/`gameEngine.ts` 聚合 `src/data/*` 与 `src/systems/*`，旧导入路径不变。
- 数据驱动：CreatureType = keyof CREATURE_DATA；系统注册表 `systems/index.ts` 顺序执行，每个套 safe()。
- EventBus 解耦逻辑→表现（audio/achievements 订阅 gameEvents）；技能处理器表 SKILL_HANDLERS；AI 行为表 AI_HANDLERS。
- 输入：鱼永远朝鼠标游（mouseRef，屏幕系坐标），E=商场交互，Q=流派技能，Space=加速，G=无敌。
- updateGame 第 9 参 isInteractPressed（E 键），worldSystem 用模块级 prevInteract 做上升沿检测。

## 内容扩展套路（2026-09-11 起统一）—— 加「塘 / 成就 / 道具 / 排行」都走这套
- 数据层 `src/data/<x>.ts`：`as const` 注册表 + `keyof typeof` 推类型 + 冻结常量对象（`XxxId.KEY` 写法仍可用）
  + 取值函数（未知 id 回退默认，**绝不返回 undefined**）；`constants.ts` 门面 `export *`。
- 状态层：`GameState.<x>` 字段（`types.ts` 转发类型）；`createInitialState(options)` 允许外部传入。
- 系统层：在 `systems/` 读写 `state.<x>`；**加分一律走 `scoreGain(state.pondId, base)`，别再直接 `state.score +=`**。
- 收尾：菜单入口 + HUD 展示 + 单测 + `scripts/probe-<x>.mjs` + 开发计划/路线图同步；
  大改动再补 `交付说明.html`（单文件、内联截图，见 `scripts/gen-deliverable.py`）。
- **向后兼容铁律**：新功能默认值 == 旧硬编码，旧调用点与既有测试零变化。

## 多鱼塘（阶段 1 + 2a 已落地；2b 暂缓，2026-09-11）
- `src/data/ponds.ts`：CLEAR/清水塘(×1.0，食物 0.40，tier +0，障碍 ×1.0) · CORAL/珊瑚塘(×1.5，0.30，+1，×1.6) ·
  ABYSS/深渊塘(×2.5，0.20，+2，×0.6)。
- `state.pondId` 决定刷怪（`foodRatio` / `maxTierBonus`）、**所有**得分倍率（`scoreGain` 收口 4 处加分点）、
  障碍密度（`createObstacles(pondId)`）；出生点仍 (3000,3000)。
- **阶段 2a 塘际传送门**：`Portal.kind` = `LOCAL`（塘内门，本塘内随机传送）/ `POND`（塘际门，换塘）。
  `world.ts` 的 `pondTravel(state, 目标塘, ctx?)` 重建世界：保留玩家成长 + 分数 + 计时 + **战队成员**；
  重建障碍/门/建筑；清空野鱼/道具/宝藏/危险/粒子/飘字；玩家回中心 + 落地保护 + 过场闪屏；
  传了 ctx 就复用 `spawnSystem` 铺底 12 条鱼。塘际门摆在距中心 1150px 环上，琥珀虚线环造型。
  - 塘内门只在 `LOCAL` 里挑目标 —— 否则随机传送会把人丢到塘际门上，下一帧被动换塘。
  - **`teleportLockUntilFrame` 是模块级状态，单测用例间会泄漏 → 用例开头调 `__resetTeleportLock()`**。
  - **换塘必须同步 `player.currentBiome`**，否则「进入新海域」气泡会顶掉「进入 XX塘」。
- 菜单选塘 / HUD 塘名+倍率 / 排行榜塘标签+**分塘筛选** / 规则面板「鱼塘」分节。
  **不要再用 `speechBubble` 报塘名**（会被「进入新海域」提示顶掉）。
- **阶段 2b（尺寸/形状差异化）决策：暂缓**（2026-09-11 实测）。卡点：`terrain.ts` 在**模块级**解构
  `MAP_SHAPE_CONFIG`（形状写死进函数）；另有 6 处写死的 `Math.random() * WORLD_SIZE` 刷点
  （spawn / events×3 / items×2 / world）。合计约 **8 源 + 4 测试文件**，且失败症状隐蔽
  （刷点落塘外 → `spawnCreature` 静默返回 null，只表现为「鱼变少」）。
  → **优先做阶段 3「每塘独有内容」**（纯数据驱动，复用 `obstacleScale` 套路，成本低一个量级）。
  完整推演见《多鱼塘立项设计.md》第四节决策记录。

## 隐蔽 / 掩体（水草躲追杀，2026-09-11 · feat c9442ba）
- `src/systems/concealment.ts`：每帧算 `entity.inCover`（**水草半径 85% 内**算藏住）。
  - 只判定 `Obstacle.type === 'SEAWEED'`；用**模块级 buffer** 缓存水草列表避免每帧分配。
  - 系统顺序必须挂在 `skills` 与 `ai` **之间** —— 保证 AI 读到的是当帧的 `inCover`。
- `world.ts` 碰撞前 `obstacles.filter(o => o.type !== 'SEAWEED')`：**水草从「墙」变成「草丛」**，
  仍留在 `state.obstacles` 里供渲染与掩体判定。
- `ai.ts` 的 **`canPerceive(seeker, target, distSq)` 是所有锁定判定的唯一收口**
  （6 种行为 + 大鱼反制全走 `findNearest(..., ignoreConcealment?)`）。隐蔽目标只在两种情况下可见：
  **贴脸 `CONCEAL_REVEAL_RANGE = 150px`** 或 **猎手 `sonarTimer > 0`**。
  收口一处就不会出现「A 行为尊重隐蔽、B 行为照追」的半吊子状态。
  副作用（有意为之）：躲草丛的**大鱼小鱼也看不见** → 天然伏击。
- 「甩掉追杀」的落点在 `ai.ts` 愤怒分支：`tryCounterSkill` 后若**找不到敌人且玩家在草丛**
  → `angerTimer = 0` + 冒「?」气泡。定位是「让咬过你的那条鱼**死心**」，不是让你无敌。
- `skills.ts`：`SONAR_SCAN` 补写 `caster.sonarTimer = 420`。**它以前只清别人的标记**，
  而 `inCover` 每帧重算 → 清标记等于空操作，声呐从来没真正生效过。
- ⚠️ **设计分工（别当成 bug 改）**：隐身技能 ← 被声呐反制；**水草掩体 ← 只能靠贴脸 150px 破解**。
  所以 `tryCounterSkill` 里刻意**只认 `camoActive || isHidden`，不认 `inCover`** ——
  若声呐能反制草丛，躲草丛要先硬挨 7 秒才生效，这个修复就等于没做。
- 新增契约：**「隐蔽」= `isConcealed(e) = camoActive || inCover`**（`gameEngine` 已 re-export）。
  表现层：藏身时玩家画绿虚线藏身环 + 半透明，HUD 挂「隐蔽中 · 未被发现」，规则面板有「水草掩体」分节。

## 装扮 / 预览（2026-09-11 · feat 029ed2b）
- **预览必须复用 `drawCuteFish`**（从 `components/GameCanvas.tsx` `export`）。绝不另写简化画法 ——
  预览与游戏里不一致 = 骗玩家。组件 `components/FishPreview.tsx`：
  `{ type, cosmetics, size|width/height, animate }`，内部造一个最小 mock entity。
  动画模式**先同步画一帧再进 rAF**，否则挂载瞬间是空白画布。
- 选项清单收在 `src/data/cosmeticsOptions.ts`（`TEETH_OPTIONS`/`PATTERN_OPTIONS`/`SCALE_OPTIONS`/
  `ACCESSORY_OPTIONS`/`EYE_OPTIONS`/`SKIN_COLOR_OPTIONS` + `AI_COSMETICS_PRESETS` + `withOption()`）；
  `constants.ts` 门面已 `export *`。**加选项 = 改这里 → 面板和测试自动跟上**。
- 面板元素带 `data-cosmetic-key` / `data-cosmetic-value` / `data-tab`，
  探针用它们精确定位，**别再用 `text=`**。
- ⚠️ **已知缺口**：`types.ts` 的装扮联合类型远大于面板暴露的集合
  （`PatternType` 24 个值、`ScaleType` 15、`TeethType` 13、`AccessoryType` 15、`EyeType` 12），
  眉毛 / 尾巴 / 体型 / 嘴型 / 拖尾 **在面板上完全没有入口**。
  缺的都是**没写渲染分支**的 —— 想放出某个值，必须先在 `drawPattern`/`drawScaleEffect`/
  `drawAccessory`/`drawEyes`/`drawTail` 里补分支，否则就是「按钮在、纹样没有」。
- `bodyType` 曾经是死代码（`getBodyTypeParams` 定义了从没调用），现已接进鱼身 `ctx.scale`
  ——  缩放必须放在**玩家光环之后**，否则正圆光环被压扁。

## 本机环境坑（重要！）
- **⚠️ 同一文件的两处 Edit 放在同一条消息里会丢一处**（2026-09-11 实测：App.tsx 的 import 改动留下、
  `onStart` 改动没了，**两个工具调用都报 Success**，疑为并发读同版本+后写覆盖）。→ **一个文件一次只发一条 Edit**，改完 grep 复核。
  同一文件要改多处时，`Read` 全文 + `Write` 整文件是最稳的单次操作。
- **⚠️ bash 偶发抽风**（`shell-runtime-bash-env.sh: dirname: command not found`）：简单前景命令还能跑，
  但**后台任务会直接启动失败**（vite dev server 起不来）。规避：改用 **PowerShell** 跑，
  且 PowerShell 工具本会话**不回显 stdout** → 一律 `2>&1 | Out-File -Encoding utf8 <文件>` 再用 Read 读文件。
- **⚠️ PowerShell 工具另有两道拦截**：① 禁用 `cmd /c`（"cmd.exe cannot be used from the PowerShell tool"），
  一律写原生 cmdlet；② 命令里出现 `%VAR%` 样式的 token 会被安全策略拦掉（`git log --format="SUBJECT:%s%nBODY:%b"`
  就此被拦）→ 换不带 `%` 的写法；若同一命令里既要删临时文件又含 `%`，会被连坐，拆两条发。
- **`Get-Content` 不加 `-Encoding utf8` 读 UTF-8 文件会乱码**，据它数行数也不准
  （路线图实际 358 行，`(Get-Content).Count` 报 265）→ 读内容/数行优先用 **Read 工具**。
- `git commit -F <UTF-8 文件>` 提交中文 message 没问题（落库是正确的 UTF-8，控制台乱码只是显示问题）；
  验证方法：`git log -1` 重定向到文件再用 Read 看。
  ⚠️ 给 git 传 **Git Bash 的 `/c/...` 路径会读不到文件**（`could not read log file`），
  但 `cd /e/gitlab/fish` 是好的 → **传 Windows 正斜杠路径 `C:/Users/...`**。
- **这台机器 npm 被 "safe-delete" 包装器拦截**（非官方 npm），删除走回收站。npm ci 在 vite 占用 esbuild 文件锁时会 trash 失败中止。
- **⚠️ .git 会不明原因被清空/删除**：2026-09-08 objects+refs 全消失；2026-09-09 跑 `git stash create` 后整个 .git 目录消失。原因未明（疑 safe-delete 或某后台进程与 git 临时文件打架）。**动 git 前先 `tar -czf` 备份 .git**，备份在 E:\gitlab\git-backup\（最新 fish-git-20260911-231438.tar.gz）。
- **⚠️ 反向现象：已删除的文件会被还原回来**。2026-09-10 07:57，`git status` 里显示为 `D` 的 `components/*.tsx` 和 `e2e/startButton.spec.ts` 自己复活了（部分还原，同批的 App.tsx/constants.ts/gameEngine.ts 没复活）。**发现工作树里冒出"不该有的旧文件"时，先怀疑这个，不要以为是别人动过**。
- **⚠️ 嵌套 ref（带 `/` 的分支名）会被 git 静默删掉**：实测（2026-09-10）`git branch a/b` / `git update-ref refs/heads/a/b` 会 **把 ref 文件和父目录一起删掉，然后 exit 0 假装成功**。reflog 反而写成功了，所以现象是「日志有、引用没了」。仓库是纯 files 后端（format 0，无 reftable），git 是 WorkBuddy 自带 PortableGit 2.55.0，机器上没有第二个 git 可对照。
  - **规避：这台机器一律用扁平分支名**（如 `archive-broken-history`）。
  - 应急：确实要嵌套就手动 `echo <sha> > .git/refs/heads/<ns>/<name>`，git 读得出来；但**千万别再让 git 去写它**。
  - 触发条件与目录是否已存在无关——目录先建好也一样被删。
- **git 报 `unable to read tree <sha>` 的两层根因**：① `.git/index` 的 cache-tree 指向丢失对象 → `mv .git/index .git/index.bak` + `git add -A` 重建；② HEAD 的 tree 本身缺子树（不可修）。**`git commit` 不需要读父提交的 tree，直接提交就能绕过，提交后 status 自动恢复**（提交时那句 fatal 是噪音）。
- 分支形态（2026-09-10 事故后）：`dev` = 无父根提交起、当前 HEAD 见 `git log`；老历史留在 `archive-broken-history`（26 条 message，内容全损）；`main`/`test` 仍指向损坏 commit。备份 E:\gitlab\git-backup\fish-git-20260910-FINAL.tar.gz。
- **⚠️ 远端 github.com/38970693/fish 已不存在**（API 404 / git 协议 "Repository not found"），云端历史彻底没了。本地 25 个 commit（2026-01-15 → 2026-09-07）是全部家底，从 `.git/objects/pack/tmp_pack_TuOylB`（fetch 中断的临时 pack）用 `git unpack-objects -r` 抢救出来的。部分旧 tree 仍缺，老版本能看 log 但 checkout 会失败。
- **⚠️ 代理环境变量常驻，且端口会变**（2026-09-11 实测已从 10356 变成 **9053**）：
  `http_proxy/https_proxy/HTTP_PROXY = http://127.0.0.1:9053`。
  ① git/curl 会被吞成 401；② **Playwright 打开的 Chromium 会继承它，连 `localhost:3000` 的 `page.goto` 都会无限超时**，
  而服务端 `Invoke-WebRequest` 探是健康的 —— 极易误判成「vite 卡住了」。
  → **跑探针前先清**：PowerShell `$env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null`；
  Python/curl 用 `env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY <cmd>`。
  **排查顺序：先 `Invoke-WebRequest` 测服务端拿 200 → 再怀疑代理 → 最后才怀疑代码。**
- 源码备份：E:\gitlab\fish-backup-20260908.tar.gz（含 src 45 文件，09-09 复核仅 3 个文件与工作区不同，均为主动修改）。
- **vitest 必须钉在 ^3.2.7**：v4.x/v5.x 在本机套件级崩溃（"reading 'config'"，空测试也崩，全新 node_modules 复现）——worker runner 状态与测试文件的模块副本不一致，疑似 Windows 特定。v3 一次通过。升级前必须先验证。
- WorkBuddy shell 会注入 NODE_OPTIONS=--require=node-language-shim.cjs，排查工具链问题时记得 `env -u NODE_OPTIONS` 对照。
- vite 6.4.2 的 html-inline-proxy 偶发 "No matching HTML proxy module"：index.html 别用内联 <style>，抽成 css 文件用 link。
- headless 浏览器 RAF 不限帧：游戏已改固定步长累加器（16.67ms/步，追帧上限 250ms），speedRatio=1.0；144Hz 真实屏也一致了（2026-09-09 修复，此前 2.4 倍速）。
- `index.html` 从 CDN 取依赖：`cdn.tailwindcss.com` + importmap 把 react/react-dom/lucide-react 指向 `esm.sh`。
  页面那两条「404 但 `page.on('response')` 抓不到」的幽灵报错 = **浏览器自动请求 `/favicon.ico`**
  （index.html 没有 favicon link）。favicon 请求不作为 page response 暴露 → **无害，不是 bug**。

## 游戏手感约定
- 花瓣地图：r(angle)=2000+1200*|sin(2a)|，中心(3000,3000)，WORLD_SIZE 6000。
- 商场深海商场在 (1500,1500)，E 键进入（1.5 倍交互圈）；出生点 (3000,3000)。
- 障碍物生成：整块含边缘在界内（buffer=radius+80）+ 拒绝 dist<0.7*(r1+r2) 重叠；resolveObstacles 两遍。
- 边界处理顺序：先 resolveObstacles 后 clampToMap（边界最终决定权）。
- React RAF 循环必须用 alive 生命标记（gameLoop 自排下一帧，cancelAnimationFrame 只能取消第一帧）。
- 水草（SEAWEED）只长在 SWAMP 生态区，**可穿行、可藏身**（见「隐蔽 / 掩体」节）；ROCK/CORAL 仍是实心障碍。

## 测试约定
- React 事件测试：dispatchEvent 到 canvas 且 bubbles:true；E 类轮询键 keydown/keyup 要隔帧；G 类 toggle 键连发有效。
- worldSystem 的 prevInteract 是模块级状态，单测用例间泄漏——用例开头先来一帧 interact:false 归位。
- agent-browser 页面状态跨 Bash 调用会重置：全流程必须单条命令完成。
- e2e 用 channel:'chromium'（完整 Chromium 新 headless），text 正则括号要转义。
- **Playwright `text=复活` 是子串匹配**，会命中「已复活 0 次」那个 `<p>` 而不是按钮 → 点了个空气、误判"按钮坏了"。**点按钮一律用 `button:has-text("...")`**。
- **`text=` 的污染不止点击，计数同样中招**（2026-09-11）：`locator('text=得分').count()` 会把弹窗**背后**
  菜单卡片上的「得分 ×1.5」也算进来，导致差值**恒定**（数出 11/7，实际 5/1）。
  → **先锁定容器再数行**：`locator('div.rounded-3xl').filter({ hasText: '名人堂' })` →
  `modal.locator('div.rounded-2xl').count()`；精确相等用 `:text-is()`；先断言容器唯一。
  **看到「差值恒定」先怀疑作用域，别去查逻辑。**
- 死亡/胜利等全屏遮罩的验证脚本：scripts/probe-stuck.mjs（开局→采样→死亡→点复活→验证回到 PLAYING）。
- 隐蔽相关探针：scripts/probe-concealment.mjs（对照「无草丛愤怒持续」/ 掩体「愤怒清零+冒?」/ 贴脸「不清零」）。
- **钉 `Math.random` 要按系统真实取数顺序给序列**（spawn：`tier → 食物判定 → 池内选择 → 刷点 x,y`）；
  全程用同一个定值会算出花瓣地图外的刷点，`spawnCreature` 返回 null，症状是 `entities[0]` undefined。
- **`scripts/` 下的探针截图不提交** —— 一律命名成 `*-probe.png`，正好落进 `.gitignore` 的
  `scripts/*-probe.png`。（仓库里那 18 个其它名字的 png 是**加忽略规则之前**提交的历史遗留，别照抄那种命名。）
- **探针断言四条纪律**：
  ① 别用严格相等断言「玩家回到某点」—— 世界还在跑，鼠标转向会推走几像素 → 用容差；
  ② 别用即时 `count()` 读 HUD —— `uiState` 每 100ms 才同步一次，会读到过期快照 → 用 `waitForSelector`；
  ③ **断言「瞬时表现」要按 timer 帧数倒推采样时机** —— 气泡 timer 只有 45 帧（0.75s），等 900ms 再读就只剩 `null`，
  会误判成「功能没生效」（踩过：水草的「?」）→ 早采样（~250ms）+ 晚复采样看稳定性；
  ④ **搭实验台时先把「实验台自己」的干扰关掉** —— 探针借场上某条鱼当追兵时，玩家会一口把它**吃了**，
  `read()` 回来 `anger = -1`，症状像「AI 崩了」→ 给玩家 `biteCooldown = 9999` 闭嘴，
  再给追兵 `biteCooldown / schoolSkillCooldown = 9999` 屏蔽反制技。
- **模块级状态的系统要先加 `__resetXxx()` 再写用例**（已踩过：world 的 `prevInteract`、`teleportLockUntilFrame`，
  squad 的 `switchCursor`）—— 否则用例顺序一换就假失败。
- **测「每个选项都真的画得出来」= 记录型 canvas context 指纹**（`cosmetics-render.test.ts` 21 例）：
  假 ctx 记录所有绘制调用 + **样式属性赋值**（必须用 setter，颜色差异全靠它）串成指纹；
  断言 ① 同类别选项**两两不同** ② 每个非「无」选项**画得比「渲染层未实现的选项」基准多**。
  ⚠️ 必须配 **positive control** 钉住测法有效（第一版写成「未实现 == `NONE`」是错的：
  `pattern !== 'NONE'` 外层还有 `clip()`+`globalAlpha` 留下痕迹；真正撞车的是**两个都未实现的选项**）。
  e2e 侧（`probe-cosmetics.mjs`）用缩略图 `toDataURL()` 去重 + 大预览 `getImageData` **平均色**判断颜色
  （动画 canvas 的 dataURL 每帧都在变，「变了」不算证据）。
  **这类 bug 的形态是「按钮在、点击对、状态也写回了，只有渲染是空的」，DOM 断言抓不到。**
- **临时诊断脚本统一 `scripts/_` 前缀**（`_diag-*.mjs` / `_*.log`），收尾即删，别让它们进 git status；
  **探针截图一律以 `-probe.png` 结尾**（匹配 `.gitignore` 的 `scripts/*-probe.png`，不提交）。
