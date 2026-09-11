# -*- coding: utf-8 -*-
"""
生成《交付说明.html》—— 单文件、内联全部样式与截图（base64 data URI）。

为什么用脚本生成而不是手写 HTML：
  截图是二进制，要内联就必须 base64；顺手用 Pillow 压成 JPEG，
  否则 8 张 PNG（约 1.7 MB）base64 后会到 2.3 MB，页面太重。
  压缩后约 0.55 MB。

用法（在仓库根目录）：
  <venv>/Scripts/python.exe scripts/gen-deliverable.py

依赖：Pillow（只用于压图，非项目运行依赖）。
"""

import base64
import io
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow：请先 pip install Pillow（仅生成文档需要，非项目依赖）")

# 脚本在 scripts/ 下，仓库根是它的父目录 —— 用相对定位，换机器也能跑
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(REPO, "scripts")
OUT = os.path.join(REPO, "交付说明.html")

TARGET_WIDTH = 1000
JPEG_QUALITY = 86


def data_uri(filename: str) -> str:
    """读图 → 等比缩到 TARGET_WIDTH → JPEG → base64 data URI。"""
    path = os.path.join(SHOTS, filename)
    with Image.open(path) as im:
        im = im.convert("RGB")
        if im.width > TARGET_WIDTH:
            ratio = TARGET_WIDTH / im.width
            im = im.resize((TARGET_WIDTH, max(1, round(im.height * ratio))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        raw = buf.getvalue()
    print(f"  {filename:34s} -> {len(raw) / 1024:6.1f} KB (jpeg)")
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


# ── 截图清单：(占位符, 文件名, 图注) ────────────────────────────────
SHOT_LIST = [
    ("IMG_MENU", "pond-menu.png",
     "开局选塘。三档难度直接写在卡片上：主生态区与得分倍率一眼可见。"),
    ("IMG_CLEAR", "pond-clear-hud.png",
     "清水塘（×1.0）。障碍密度 1.0，小鱼成群，HUD 左上角挂着塘名与倍率。"),
    ("IMG_ABYSS", "pond-abyss-hud.png",
     "深渊塘（×2.5）。障碍密度 0.6，塘面空旷、大鱼更早出现 —— 同一个花瓣地图，两种手感。"),
    ("IMG_PORTAL", "pond-portal-closeup.png",
     "塘际门（琥珀虚线环 + 目标塘配色）。左边那扇是普通门，只在本塘内随机传送。"),
    ("IMG_TRAVEL", "pond-travel-after.png",
     "换塘落地：气泡报「进入 珊瑚塘」，HUD 已切到 ×1.5，成长、战队、分数全部跟着走。"),
    ("IMG_LB_ALL", "leaderboard-pond-all.png",
     "排行榜「全部」：五条记录横跨三塘，每条带塘名标签。"),
    ("IMG_LB_FILTER", "leaderboard-pond-filter.png",
     "分塘筛选：点「深渊塘」只留本塘记录 —— 各塘倍率不同，混着比不公平。"),
    ("IMG_RULES", "pond-rules.png",
     "规则面板新增「鱼塘」分节，文案按真实机制写，不写没做的功能。"),
]

print("压缩并内联截图：")
URI = {token: data_uri(name) for token, name, _ in SHOT_LIST}
CAPTION = {token: cap for token, _, cap in SHOT_LIST}


def figure(token: str, caption: str) -> str:
    return (
        f'<figure class="shot">\n'
        f'  <img src="{URI[token]}" alt="{caption}" loading="lazy" />\n'
        f'  <figcaption>{caption}</figcaption>\n'
        f"</figure>"
    )


POND_ROWS = """
<tr>
  <td><span class="dot" style="background:#38bdf8"></span><b>清水塘</b><code>CLEAR</code></td>
  <td><span class="stars">★</span></td><td>阳光浅滩</td>
  <td class="num">+0</td><td class="num">0.40</td>
  <td class="num hot">×1.0</td><td class="num">1.0</td>
</tr>
<tr>
  <td><span class="dot" style="background:#2dd4bf"></span><b>珊瑚塘</b><code>CORAL</code></td>
  <td><span class="stars">★★</span></td><td>五彩珊瑚</td>
  <td class="num">+1</td><td class="num">0.30</td>
  <td class="num hot">×1.5</td><td class="num">1.6</td>
</tr>
<tr>
  <td><span class="dot" style="background:#6366f1"></span><b>深渊塘</b><code>ABYSS</code></td>
  <td><span class="stars">★★★</span></td><td>深渊海沟</td>
  <td class="num">+2</td><td class="num">0.20</td>
  <td class="num hot">×2.5</td><td class="num">0.6</td>
</tr>
"""

KEEP_ROWS = """
<tr><td class="k keep">保留</td><td>玩家全部成长（体重 / 等级 / 技能 / 进化点 / 装扮）、分数、计时、<b>战队成员</b></td></tr>
<tr><td class="k rebuild">重建</td><td>障碍物（按本塘 <code>obstacleScale</code>）、传送门、建筑</td></tr>
<tr><td class="k clear">清空</td><td>野鱼、道具、宝藏、危险事件、粒子、飘字</td></tr>
<tr><td class="k keep">落地</td><td>回塘中心、速度归零、落地保护、<code>currentBiome</code> 同步、铺底 12 条鱼</td></tr>
"""

FILES_ROWS = """
<tr><td><code>src/data/ponds.ts</code></td><td>新建</td><td>塘注册表 + <code>PondId</code> + <code>getPond()</code> + <code>scoreGain()</code> + <code>otherPonds()</code></td></tr>
<tr><td><code>src/systems/world.ts</code></td><td>重写</td><td><code>createObstacles/CreatePortals(pondId)</code>、<b><code>pondTravel()</code></b>、按门 <code>kind</code> 分流</td></tr>
<tr><td><code>src/systems/spawn.ts</code></td><td>改</td><td>写死的食物概率 <code>0.4</code> → 按塘 <code>foodRatio</code>；tier 上限加 <code>maxTierBonus</code></td></tr>
<tr><td><code>src/systems/events|items|combat.ts</code></td><td>改</td><td>4 处 <code>state.score += X</code> 收口到 <code>scoreGain(state.pondId, X)</code></td></tr>
<tr><td><code>src/systems/leaderboard.ts</code></td><td>改</td><td>条目带 <code>pond</code> 塘名（旧记录无该字段也兼容）</td></tr>
<tr><td><code>src/components/GameCanvas.tsx</code></td><td>改</td><td>塘际门独立造型（琥珀虚线环）、过场闪屏</td></tr>
<tr><td><code>src/components/MiniMap.tsx</code></td><td>改</td><td>塘际门用琥珀大点，和塘内门区分</td></tr>
<tr><td><code>src/components/UIOverlay.tsx</code></td><td>改</td><td>菜单「选择鱼塘」、HUD 塘名条、排行榜分塘筛选、规则面板「鱼塘」分节</td></tr>
<tr><td><code>src/factories/initialState.ts</code></td><td>改</td><td><code>options.pondId</code>（缺省清水塘，等于旧行为）</td></tr>
<tr><td><code>src/types.ts</code> · <code>constants.ts</code></td><td>改</td><td><code>GameState.pondId</code> / <code>Portal.kind</code> / <code>screenFlash</code>；门面转发</td></tr>
"""

TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>欢乐鱼塘 · 本轮交付说明（多鱼塘 阶段 1 + 2a）</title>
<style>
  :root{
    --bg:#050f1c; --bg2:#081a2c; --panel:#0c2237; --panel2:#0f2b44;
    --line:#1c3d59; --text:#e6f1fa; --muted:#8fb0c9; --dim:#6b8ba5;
    --cyan:#38bdf8; --amber:#fbbf24; --green:#34d399; --violet:#a78bfa;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{
    margin:0; background:
      radial-gradient(1200px 600px at 15% -10%, #0d3355 0%, transparent 60%),
      radial-gradient(900px 500px at 90% 0%, #14284a 0%, transparent 55%),
      var(--bg);
    color:var(--text);
    font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    padding:0 20px 80px;
  }
  .wrap{max-width:960px;margin:0 auto}

  header{padding:64px 0 20px;text-align:center}
  .kicker{color:var(--cyan);font-weight:700;letter-spacing:.16em;font-size:13px;text-transform:uppercase}
  h1{margin:14px 0 10px;font-size:clamp(30px,5vw,46px);line-height:1.2;font-weight:800;letter-spacing:-.01em}
  h1 .hl{background:linear-gradient(100deg,#38bdf8,#2dd4bf 45%,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:var(--muted);margin:0 auto;max-width:660px}

  h2{margin:56px 0 6px;font-size:23px;font-weight:800;display:flex;align-items:center;gap:11px}
  h2 .n{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 30px;
        border-radius:9px;background:linear-gradient(140deg,#1d6ea8,#2dd4bf);color:#03121f;font-size:15px;font-weight:900}
  h3{margin:30px 0 10px;font-size:17px;color:#cfe6f6}
  .lead{color:var(--muted);margin:0 0 18px}
  p{margin:12px 0}
  b{color:#fff}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:13px;margin:26px 0 8px}
  .card{background:linear-gradient(165deg,var(--panel2),var(--panel));border:1px solid var(--line);
        border-radius:15px;padding:17px 19px}
  .card .v{font-size:27px;font-weight:800;letter-spacing:-.02em}
  .card .l{color:var(--dim);font-size:13px;margin-top:3px}
  .card.c1 .v{color:var(--cyan)} .card.c2 .v{color:var(--green)} .card.c3 .v{color:var(--amber)} .card.c4 .v{color:var(--violet)}

  .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:6px 20px 14px;margin:20px 0}
  table{width:100%;border-collapse:collapse;font-size:14.5px}
  th,td{padding:10px 10px;text-align:left;border-bottom:1px solid rgba(28,61,89,.6);vertical-align:top}
  th{color:var(--dim);font-weight:700;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
  tbody tr:last-child td{border-bottom:none}
  td.num,th.num{text-align:center;font-variant-numeric:tabular-nums}
  .hot{color:var(--amber);font-weight:700}
  .stars{color:var(--amber);letter-spacing:1px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
  code{font-family:ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace;
       font-size:12.5px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.2);
       color:#9fdcff;padding:1px 5px;border-radius:5px}
  td code{font-size:12px}
  .k{font-weight:800;font-size:12.5px;white-space:nowrap}
  .k.keep{color:var(--green)} .k.rebuild{color:var(--amber)} .k.clear{color:#f87171}

  .shot{margin:22px 0 30px}
  .shot img{display:block;width:100%;height:auto;border-radius:13px;border:1px solid var(--line);
            background:#061423;box-shadow:0 16px 40px -20px rgba(0,0,0,.9)}
  .shot figcaption{color:var(--dim);font-size:13.5px;margin-top:9px;padding-left:3px}

  pre{background:#04101d;border:1px solid var(--line);border-left:3px solid var(--cyan);
      border-radius:11px;padding:15px 18px;overflow-x:auto;font-size:13.5px;line-height:1.85;margin:14px 0}
  pre code{background:none;border:none;padding:0;color:#bfe6ff;font-size:13px}
  .cmt{color:var(--dim)}

  .ok{list-style:none;padding:0;margin:14px 0}
  .ok li{position:relative;padding:7px 0 7px 30px;color:#d6e9f7}
  .ok li::before{content:"✔";position:absolute;left:4px;top:7px;color:var(--green);font-weight:800}

  .note{border-left:3px solid var(--amber);background:rgba(251,191,36,.06);border-radius:0 11px 11px 0;
        padding:13px 18px;margin:18px 0;color:#f5e6c8;font-size:14.5px}
  .note b{color:var(--amber)}

  footer{margin-top:64px;padding-top:22px;border-top:1px solid var(--line);color:var(--dim);font-size:13px;text-align:center}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media(max-width:660px){.two{grid-template-columns:1fr}header{padding-top:40px}}
</style>
</head>
<body>
<div class="wrap">

<header>
  <div class="kicker">欢乐鱼塘 · 交付说明</div>
  <h1>从一个世界，变成<span class="hl">三个可选的世界</span></h1>
  <p class="sub">本轮把「塘」从唯一的游戏世界提升为可选的多世界：开局选塘、走进塘际门换塘、世界整套重建。
  已全量验证并提交，工作树干净。</p>
</header>

<div class="cards">
  <div class="card c1"><div class="v">3</div><div class="l">鱼塘（清水 / 珊瑚 / 深渊）</div></div>
  <div class="card c2"><div class="v">227</div><div class="l">单测全通过 · 17 文件</div></div>
  <div class="card c3"><div class="v">×2.5</div><div class="l">深渊塘最高得分倍率</div></div>
  <div class="card c4"><div class="v">347.07<span style="font-size:15px">kB</span></div><div class="l">生产包（gzip 109.55 kB）</div></div>
</div>

<h2><span class="n">1</span>核心概念：塘 ≠ 海域</h2>
<p class="lead">动手前先把两个容易混的东西分清，否则会做出重复功能。</p>
<div class="panel">
<table>
  <thead><tr><th></th><th>海域 biome（早就有）</th><th>鱼塘 pond（本轮新增）</th></tr></thead>
  <tbody>
    <tr><td class="k clear">是什么</td><td>同一张地图内的四个生态区</td><td><b>相互独立的游戏世界</b></td></tr>
    <tr><td class="k clear">怎么切</td><td>游过去（位置决定）</td><td>开局选择；或走塘际门</td></tr>
    <tr><td class="k clear">影响</td><td>即时效果：速度 / 冷却 / 腐蚀 / 视野</td><td>刷怪构成、得分倍率、难度、障碍密度</td></tr>
  </tbody>
</table>
</div>
<p>所以「多鱼塘」不是「在一张图里再划几个塘」——那和已有海域重复了。正确做法是
<b>塘 = 一组世界参数</b>：换塘就换一整套开局参数与世界内容。</p>

<h2><span class="n">2</span>阶段 1 · 开局选塘</h2>
<p class="lead">低风险切片：塘只影响开局参数，不动世界结构。</p>
<div class="panel">
<table>
  <thead><tr>
    <th>鱼塘</th><th>难度</th><th>主生态区</th>
    <th class="num">刷怪 tier 加成</th><th class="num">食物比例</th>
    <th class="num">得分倍率</th><th class="num">障碍密度</th>
  </tr></thead>
  <tbody>__POND_ROWS__</tbody>
</table>
</div>
<p><b>tier 加成</b>让危险塘更早刷出大鱼；<b>食物比例</b>是刷浮游生物的概率——安全塘喂饱你，危险塘逼你自己去抢；
<b>得分倍率</b>是风险补偿，所有加分（吃鱼 / 金币 / 宝藏 / 逆转 / 通关）统一过 <code>scoreGain()</code> 这一个出口。</p>
__FIG_MENU__

<h2><span class="n">3</span>阶段 2a · 塘际传送门 + 世界重建</h2>
<p class="lead">同尺寸、同形状，但内容整套重建——「换塘」这套机制才是最值钱的部分。</p>
<p>传送门被区分为两种，靠一个 <code>kind</code> 字段分流，缺省视为 <code>LOCAL</code>，因此旧存档与旧测试构造的门完全不受影响：</p>
<div class="panel">
<table>
  <thead><tr><th>门</th><th class="num">kind</th><th>行为</th></tr></thead>
  <tbody>
    <tr><td class="k keep">塘内门</td><td class="num"><code>LOCAL</code></td><td>本塘内随机传送（老行为）。<b>只在本塘里挑目标</b>——否则会把你丢到塘际门上，下一帧被动换塘。</td></tr>
    <tr><td class="k rebuild">塘际门</td><td class="num"><code>POND</code></td><td>每个「别的塘」一扇，摆在距塘中心 1150px 的环上，踏入即 <code>pondTravel()</code>。</td></tr>
  </tbody>
</table>
</div>
__FIG_PORTAL__

<h3>换塘时保留什么、丢掉什么</h3>
<div class="panel">
<table><tbody>__KEEP_ROWS__</tbody></table>
</div>
__FIG_TRAVEL__

<h3>同一个花瓣地图，两种手感</h3>
<p>障碍密度按塘缩放（清水 1.0 / 珊瑚 1.6 / 深渊 0.6）。下面两张是同一个地图在清水塘与深渊塘下的样子：</p>
__FIG_CLEAR__
__FIG_ABYSS__

<h3>分塘排行榜</h3>
<p>各塘得分倍率不同，混在一起排名不公平，所以面板加了「全部 / 各塘」筛选：</p>
__FIG_LB_ALL__
__FIG_LB_FILTER__

<h2><span class="n">4</span>验证结果（全绿）</h2>
<ul class="ok">
  <li><code>npm run typecheck</code> —— 干净，无类型错误</li>
  <li><code>npm run test</code> —— <b>227 例 / 17 文件</b>全部通过</li>
  <li><code>npm run build</code> —— 347.07 kB（gzip 109.55 kB）</li>
  <li>生产包里 <code>__FISH_DEBUG__</code> 出现 <b>0</b> 次（调试钩子已被 DEV 守卫剔除）</li>
  <li>新增单测：<code>ponds.test.ts</code> 14 例 + <code>pondTravel.test.ts</code> 13 例</li>
  <li>新增浏览器探针：<code>probe-pond.mjs</code> / <code>probe-pond-travel.mjs</code> / <code>probe-wrapup.mjs</code>，全部通过且无页面错误</li>
</ul>

<h2><span class="n">5</span>怎么跑起来</h2>
<pre><code><span class="cmt"># 安装依赖</span>
npm install

<span class="cmt"># 起开发服务器 → http://localhost:3000</span>
npm run dev

<span class="cmt"># 验证三件套</span>
npm run typecheck
npm run test
npm run build</code></pre>
<p>操作：<b>鼠标</b>决定游向（鱼永远朝光标游）· <b>Space</b> 加速冲刺 · <b>Q</b> 流派技能 ·
<b>E</b> 进商场交互 · <b>R</b> 切换战队成员 · <b>G</b> 无敌（仅调试）。</p>
__FIG_RULES__

<h2><span class="n">6</span>变更清单</h2>
<div class="panel">
<table>
  <thead><tr><th>文件</th><th>类型</th><th>改动</th></tr></thead>
  <tbody>__FILES_ROWS__</tbody>
</table>
</div>

<h2><span class="n">7</span>还没做、以及为什么不顺手做</h2>
<div class="note">
<b>阶段 2b — 每塘独有地图尺寸 / 形状：暂缓。</b>
要参数化 <code>WORLD_SIZE</code> / <code>MAP_SHAPE_CONFIG</code> / <code>BIOME_BOUNDS</code>，
并改掉 6 处写死的 <code>Math.random() * WORLD_SIZE</code> 刷点范围。
<b>卡点</b>：<code>terrain.ts</code> 在模块级就解构了形状
（<code>const { BASE_RADIUS, PETAL_VARIANCE } = MAP_SHAPE_CONFIG</code>），等于把形状写死在函数里，
参数化意味着十余个调用点一起改。牵动相机、小地图与地形校验，属真重构，需要单独一轮。
</div>
<div class="two">
  <div class="panel">
    <h3 style="margin-top:14px">阶段 3a · 每塘独有内容</h3>
    <p style="font-size:14.5px;color:var(--muted);margin-bottom:14px">
    每塘独有生物 / 事件 / 建筑（深渊塘发光鱼群、沉船）。纯数据驱动，复用 2a 已建立的
    <code>obstacleScale</code> 套路，不碰全局常量——<b>成本最低、玩家感知最直接</b>。</p>
  </div>
  <div class="panel">
    <h3 style="margin-top:14px">多人联机 · 另行立项</h3>
    <p style="font-size:14.5px;color:var(--muted);margin-bottom:14px">
    需要 WebSocket 服务端 + 房间 / 状态同步架构。仓库当前是<b>纯静态 SPA，服务端早已不存在</b>，
    需从服务器、协议、断线重连从头设计，不在多鱼塘范围内。</p>
  </div>
</div>

<footer>
  欢乐鱼塘 · 多鱼塘阶段 1 + 阶段 2a · 2026-09-11<br />
  设计归档见《多鱼塘立项设计.md》 · 截图源文件在 <code>scripts/pond-*.png</code>
</footer>

</div>
</body>
</html>
"""

html = (
    TEMPLATE.replace("__POND_ROWS__", POND_ROWS.strip())
    .replace("__KEEP_ROWS__", KEEP_ROWS.strip())
    .replace("__FILES_ROWS__", FILES_ROWS.strip())
)
for token, _, _ in SHOT_LIST:
    html = html.replace("__FIG_" + token.replace("IMG_", "") + "__", figure(token, CAPTION[token]))

assert "__" not in html.replace("__FISH_DEBUG__", ""), "有占位符没替换掉"

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(html)

print(f"\n写出：{OUT}")
print(f"大小：{os.path.getsize(OUT) / 1024 / 1024:.2f} MB")
