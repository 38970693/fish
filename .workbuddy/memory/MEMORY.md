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
- 收尾：菜单入口 + HUD 展示 + 单测 + `scripts/probe-<x>.mjs` + 开发计划/路线图同步。
- **向后兼容铁律**：新功能默认值 == 旧硬编码，旧调用点与既有测试零变化。

## 多鱼塘（阶段 1，2026-09-11 · feat 5df754a）
- `src/data/ponds.ts`：CLEAR/清水塘(×1.0，食物 0.40，tier +0) · CORAL/珊瑚塘(×1.5，0.30，+1) · ABYSS/深渊塘(×2.5，0.20，+2)。
- `state.pondId` 决定刷怪（`foodRatio` 取代写死的 0.4、`maxTierBonus` 加进刷怪 tier 上限）与**所有**得分倍率；
  出生点仍 (3000,3000)（阶段 1 故意不动位置）。
- 菜单选塘 / HUD 塘名+倍率 / 排行榜塘标签 / 规则面板「鱼塘」分节。
  **不要再用 `speechBubble` 报塘名** —— 会被 worldSystem 的「进入新海域」提示在开局第一帧顶掉。
- 阶段 2（塘际传送门）方案见《多鱼塘立项设计.md》：需先把 `WORLD_SIZE` / `MAP_SHAPE_CONFIG` / `BIOME_BOUNDS` /
  `createObstacles|createPortals|createBuildings` 参数化（改成按 pondId 查表），并分清「塘内门 vs 塘际门」+ 排行榜分塘。

## 本机环境坑（重要！）
- **⚠️ 同一文件的两处 Edit 放在同一条消息里会丢一处**（2026-09-11 实测：App.tsx 的 import 改动留下、
  `onStart` 改动没了，**两个工具调用都报 Success**，疑为并发读同版本+后写覆盖）。→ **一个文件一次只发一条 Edit**，改完 grep 复核。
- **这台机器 npm 被 "safe-delete" 包装器拦截**（非官方 npm），删除走回收站。npm ci 在 vite 占用 esbuild 文件锁时会 trash 失败中止。
- **⚠️ .git 会不明原因被清空/删除**：2026-09-08 objects+refs 全消失；2026-09-09 跑 `git stash create` 后整个 .git 目录消失。原因未明（疑 safe-delete 或某后台进程与 git 临时文件打架）。**动 git 前先 `tar -czf` 备份 .git**，备份在 E:\gitlab\git-backup\fish-git-20260910.tar.gz（+copy2）。
- **⚠️ 反向现象：已删除的文件会被还原回来**。2026-09-10 07:57，`git status` 里显示为 `D` 的 `components/*.tsx` 和 `e2e/startButton.spec.ts` 自己复活了（部分还原，同批的 App.tsx/constants.ts/gameEngine.ts 没复活）。**发现工作树里冒出"不该有的旧文件"时，先怀疑这个，不要以为是别人动过**。
- **⚠️ 嵌套 ref（带 `/` 的分支名）会被 git 静默删掉**：实测（2026-09-10）`git branch a/b` / `git update-ref refs/heads/a/b` 会 **把 ref 文件和父目录一起删掉，然后 exit 0 假装成功**。reflog 反而写成功了，所以现象是「日志有、引用没了」。仓库是纯 files 后端（format 0，无 reftable），git 是 WorkBuddy 自带 PortableGit 2.55.0，机器上没有第二个 git 可对照。
  - **规避：这台机器一律用扁平分支名**（如 `archive-broken-history`）。
  - 应急：确实要嵌套就手动 `echo <sha> > .git/refs/heads/<ns>/<name>`，git 读得出来；但**千万别再让 git 去写它**。
  - 触发条件与目录是否已存在无关——目录先建好也一样被删。
- **git 报 `unable to read tree <sha>` 的两层根因**：① `.git/index` 的 cache-tree 指向丢失对象 → `mv .git/index .git/index.bak` + `git add -A` 重建；② HEAD 的 tree 本身缺子树（不可修）。**`git commit` 不需要读父提交的 tree，直接提交就能绕过，提交后 status 自动恢复**（提交时那句 fatal 是噪音）。
- 现状（2026-09-10）：`dev` = **3281854** 无父根提交（76 文件，全绿）；老历史留在 `archive-broken-history`（26 条 message，内容全损）；`main`/`test` 分支仍指向损坏 commit。备份 `E:\gitlab\git-backup\fish-git-20260910-FINAL.tar.gz`。
- **⚠️ 远端 github.com/38970693/fish 已不存在**（API 404 / git 协议 "Repository not found"），云端历史彻底没了。本地 25 个 commit（2026-01-15 → 2026-09-07）是全部家底，从 `.git/objects/pack/tmp_pack_TuOylB`（fetch 中断的临时 pack）用 `git unpack-objects -r` 抢救出来的。部分旧 tree 仍缺，老版本能看 log 但 checkout 会失败。
- **`https_proxy=http://127.0.0.1:10356` 环境变量常驻**，git/curl 会被吞成 401。直连要 `env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY <cmd>`。
- 源码备份：E:\gitlab\fish-backup-20260908.tar.gz（含 src 45 文件，09-09 复核仅 3 个文件与工作区不同，均为主动修改）。
- **vitest 必须钉在 ^3.2.7**：v4.x/v5.x 在本机套件级崩溃（"reading 'config'"，空测试也崩，全新 node_modules 复现）——worker runner 状态与测试文件的模块副本不一致，疑似 Windows 特定。v3 一次通过。升级前必须先验证。
- WorkBuddy shell 会注入 NODE_OPTIONS=--require=node-language-shim.cjs，排查工具链问题时记得 `env -u NODE_OPTIONS` 对照。
- vite 6.4.2 的 html-inline-proxy 偶发 "No matching HTML proxy module"：index.html 别用内联 <style>，抽成 css 文件用 link。
- headless 浏览器 RAF 不限帧：游戏已改固定步长累加器（16.67ms/步，追帧上限 250ms），speedRatio=1.0；144Hz 真实屏也一致了（2026-09-09 修复，此前 2.4 倍速）。

## 游戏手感约定
- 花瓣地图：r(angle)=2000+1200*|sin(2a)|，中心(3000,3000)，WORLD_SIZE 6000。
- 商场深海商场在 (1500,1500)，E 键进入（1.5 倍交互圈）；出生点 (3000,3000)。
- 障碍物生成：整块含边缘在界内（buffer=radius+80）+ 拒绝 dist<0.7*(r1+r2) 重叠；resolveObstacles 两遍。
- 边界处理顺序：先 resolveObstacles 后 clampToMap（边界最终决定权）。
- React RAF 循环必须用 alive 生命标记（gameLoop 自排下一帧，cancelAnimationFrame 只能取消第一帧）。

## 测试约定
- React 事件测试：dispatchEvent 到 canvas 且 bubbles:true；E 类轮询键 keydown/keyup 要隔帧；G 类 toggle 键连发有效。
- worldSystem 的 prevInteract 是模块级状态，单测用例间泄漏——用例开头先来一帧 interact:false 归位。
- agent-browser 页面状态跨 Bash 调用会重置：全流程必须单条命令完成。
- e2e 用 channel:'chromium'（完整 Chromium 新 headless），text 正则括号要转义。
- **Playwright `text=复活` 是子串匹配**，会命中「已复活 0 次」那个 `<p>` 而不是按钮 → 点了个空气、误判"按钮坏了"。**点按钮一律用 `button:has-text("...")`**。
- 死亡/胜利等全屏遮罩的验证脚本：scripts/probe-stuck.mjs（开局→采样→死亡→点复活→验证回到 PLAYING）。
- **钉 `Math.random` 要按系统真实取数顺序给序列**（spawn：`tier → 食物判定 → 池内选择 → 刷点 x,y`）；
  全程用同一个定值会算出花瓣地图外的刷点，`spawnCreature` 返回 null，症状是 `entities[0]` undefined。
- **`scripts/` 下的探针截图按仓库惯例要提交**（`.gitignore` 只忽略了 `scripts/*-probe.png` 一种命名）。
