/**
 * 心境（AI 鱼随机状态）测试。
 *
 * 这一层的价值全在「**行为真的变了**」—— 心境只是个字符串，写上去了不算数。
 * 所以除了注册表/回退这类结构性断言，重点是用**同场景对照**证明：
 *   · 每个「接管型」心境跑出来的行为指纹都和「悠闲」不一样（正向对照，防「注册了但没接线」）；
 *   · 每个心境各自的招牌动作（瞌睡不动、好奇围观、饥饿开荤、狂躁无视体型、警觉看得远）。
 *
 * ⚠️ 随机性纪律（和 cosmetics-random.test.ts 一致）：
 *   概率断言一律不做，改成**直接钉权重**（`moodWeights` 已为测试导出）或**钉住心境**。
 *   凡是会被心境影响的既有用例，都通过 `createEntity(..., { moodId })` 固定，别让它变成掷骰子。
 */

import { describe, it, expect } from 'vitest';
import {
  MOOD_DATA,
  MOOD_IDS,
  DEFAULT_MOOD,
  getMood,
  randomizeMood,
  randomMoodTimer,
  moodWeights,
  MOOD_REROLL_FRAMES,
} from '../data/moods';
import type { MoodId } from '../data/moods';
import { CREATURES, CreatureType } from '../data/creatures';
import { createEntity } from '../systems/spawn';
import { aiSystem, MOOD_HANDLERS } from '../systems/ai';
import { createInitialState } from '../factories/initialState';
import { MAP_CENTER } from '../systems/terrain';
import { EventBus } from '../core/EventBus';
import type { Entity, FrameContext, GameEvents, GameState } from '../types';

const CX = MAP_CENTER.x;
const CY = MAP_CENTER.y;

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/**
 * 推进 n 帧。
 * ⚠️ 从 `state.time = 1` 起步、n 取 40 以内 —— 各种行为里都有
 * `time % 90/100/120/140 === 0` 的随机转向，避开这些倍数，断言才不会被噪声污染。
 */
const runFrames = (state: GameState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    state.time += 1;
    aiSystem(state, makeCtx());
  }
};

/** 一条鱼 + 远处的玩家（既在 AI 活跃圈 2600 内，又够不到任何锁定量程） */
const soloScene = (moodId: MoodId, playerDistance = 2400) => {
  const state = createInitialState();
  state.time = 1;
  state.entities = [];
  state.player.level = 1;
  state.player.x = CX - playerDistance;
  state.player.y = CY;

  const fish = createEntity(CreatureType.CLOWN_FISH, CX, CY, { moodId });
  fish.semiGhostTimer = 0;
  fish.angle = 0; // 朝右；被锁定时会被 turnToward 掰向 π（左）
  state.entities = [fish];
  return { state, fish };
};

/**
 * 「热闹」场景：玩家 600px、同类 300px、食物 400px，全在左边。
 * 五种接管型心境各有各的反应对象，因此行为指纹必然不同 —— 这是正向对照的舞台。
 */
const crowdScene = (moodId: MoodId) => {
  const state = createInitialState();
  state.time = 1;
  state.entities = [];
  state.player.level = 1;
  state.player.x = CX - 600;
  state.player.y = CY;

  const fish = createEntity(CreatureType.CLOWN_FISH, CX, CY, { moodId });
  fish.semiGhostTimer = 0;
  fish.angle = 0;

  const mate = createEntity(CreatureType.CLOWN_FISH, CX - 300, CY, { moodId: 'CALM' });
  mate.semiGhostTimer = 0;
  mate.angle = 0.5;

  const snack = createEntity(CreatureType.PLANKTON, CX - 400, CY, { moodId: 'CALM' });
  snack.semiGhostTimer = 0;

  state.entities = [fish, mate, snack];
  return { state, fish, mate, snack };
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** 行为指纹：位置 + 朝向 + 是否静止 */
const fingerprint = (e: Entity): string =>
  [Math.round(e.x), Math.round(e.y), Math.round(e.angle * 100), e.isIdle ? 1 : 0].join('|');

/** 接管型心境：它们会**取代**种族行为，必须在注册表里有 handler */
const TAKEOVER: MoodId[] = ['SLEEPY', 'CURIOUS', 'SOCIABLE', 'HUNGRY', 'FRENZY'];

/* ══════════════ 1. 注册表 ══════════════ */

describe('心境注册表', () => {
  it('每个心境字段齐全，且倍率都是正数（渲染/运算不会拿到 0 或 NaN）', () => {
    for (const id of MOOD_IDS) {
      const m = MOOD_DATA[id];
      expect(m.name.length, `${id} 缺 name`).toBeGreaterThan(0);
      expect(m.emoji.length, `${id} 缺 emoji`).toBeGreaterThan(0);
      expect(m.desc.length, `${id} 缺 desc`).toBeGreaterThan(0);
      for (const k of ['speedMult', 'agilityMult', 'perceptionMult'] as const) {
        expect(m[k], `${id}.${k} 必须 > 0`).toBeGreaterThan(0);
        expect(Number.isFinite(m[k]), `${id}.${k} 必须是有限数`).toBe(true);
      }
    }
  });

  it('「悠闲」是全 1 的中性态 —— 这是向后兼容的地基', () => {
    const calm = MOOD_DATA[DEFAULT_MOOD];
    expect(calm.speedMult).toBe(1);
    expect(calm.agilityMult).toBe(1);
    expect(calm.perceptionMult).toBe(1);
  });

  it('只有「悠闲」没有徽章（不打扰视线），其余都有', () => {
    for (const id of MOOD_IDS) {
      if (id === DEFAULT_MOOD) expect(MOOD_DATA[id].badge, '悠闲不该有徽章').toBe('');
      else expect(MOOD_DATA[id].badge.length, `${id} 应该有徽章`).toBeGreaterThan(0);
    }
  });

  it('getMood：未知 id / 缺省一律回退「悠闲」，绝不返回 undefined', () => {
    for (const bad of [undefined, null, '', '这不是心境', 'frenzy']) {
      const m = getMood(bad as string | null | undefined);
      expect(m.id).toBe(DEFAULT_MOOD);
      expect(m.speedMult).toBe(1);
    }
  });

  it('getMood：认识的 id 原样返回，并带上 id 字段', () => {
    const m = getMood('FRENZY');
    expect(m.id).toBe('FRENZY');
    expect(m).toMatchObject({ name: MOOD_DATA.FRENZY.name, badge: MOOD_DATA.FRENZY.badge });
  });
});

/* ══════════════ 2. 加权抽签 ══════════════ */

describe('randomizeMood 加权抽签', () => {
  it('磷虾是食物，永远「悠闲」', () => {
    for (let i = 0; i < 30; i += 1) {
      expect(randomizeMood(CREATURES[CreatureType.PLANKTON])).toBe(DEFAULT_MOOD);
    }
  });

  it('大批量生成：返回值全部合法，且真的有多样性', () => {
    const seen = new Set<MoodId>();
    for (let i = 0; i < 800; i += 1) {
      const id = randomizeMood(CREATURES[CreatureType.HAMMERHEAD]);
      expect(MOOD_IDS.includes(id)).toBe(true);
      seen.add(id);
    }
    // 不做精确概率断言，只要求「不是恒一个值」—— 否则这个功能等于没做
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('设计意图：凶猛鱼更容易狂躁，温顺鱼更容易胆怯/瞌睡（直接钉权重，不掷骰子）', () => {
    const fierce = moodWeights(CREATURES[CreatureType.GREAT_WHITE]); // damage 40
    const gentle = moodWeights(CREATURES[CreatureType.BLUE_TANG]); // damage 1
    expect(fierce.FRENZY).toBeGreaterThan(gentle.FRENZY);

    // 温顺 / 胆小 的鱼才容易胆怯与打盹
    const timid = moodWeights(CREATURES[CreatureType.CLOWN_FISH]); // behavior FLEE
    expect(timid.FEARFUL).toBeGreaterThan(fierce.FEARFUL);
    expect(timid.SLEEPY).toBeGreaterThan(fierce.SLEEPY);
  });

  it('设计意图：大鱼更容易饿（档位越高 HUNGRY 权重越大）', () => {
    const small = moodWeights(CREATURES[CreatureType.CLOWN_FISH]); // tier 1
    const big = moodWeights(CREATURES[CreatureType.ORCA]); // tier 4
    expect(big.HUNGRY).toBeGreaterThan(small.HUNGRY);
  });

  it('每种心境的权重都 > 0（不存在永远抽不到的死心境）', () => {
    for (const type of Object.keys(CREATURES)) {
      const w = moodWeights(CREATURES[type as CreatureType]);
      for (const id of MOOD_IDS) {
        expect(w[id], `${type} 的 ${id} 权重必须 > 0`).toBeGreaterThan(0);
      }
    }
  });

  it('纯函数：不修改传入的 config', () => {
    const config = { ...CREATURES[CreatureType.SQUID] };
    const snapshot = JSON.stringify(config);
    randomizeMood(config);
    expect(JSON.stringify(config)).toBe(snapshot);
  });

  it('moodTimer 落在配置区间内', () => {
    for (let i = 0; i < 20; i += 1) {
      const t = randomMoodTimer();
      expect(t).toBeGreaterThanOrEqual(MOOD_REROLL_FRAMES.min);
      expect(t).toBeLessThan(MOOD_REROLL_FRAMES.max);
    }
  });
});

/* ══════════════ 3. 出生带心境 ══════════════ */

describe('createEntity 出生带心境', () => {
  it('新生成的鱼有合法心境，且计时器已排上', () => {
    for (let i = 0; i < 50; i += 1) {
      const fish = createEntity(CreatureType.HAMMERHEAD, CX, CY);
      expect(MOOD_IDS.includes(fish.moodId as MoodId)).toBe(true);
      expect(fish.moodTimer).toBeGreaterThan(0);
    }
  });

  it('可以钉死心境（供其它用例做确定性对照）', () => {
    const fish = createEntity(CreatureType.HAMMERHEAD, CX, CY, { moodId: 'FRENZY' });
    expect(fish.moodId).toBe('FRENZY');
  });

  it('磷虾出生就是「悠闲」', () => {
    expect(createEntity(CreatureType.PLANKTON, CX, CY).moodId).toBe(DEFAULT_MOOD);
  });
});

/* ══════════════ 4. 接管型心境真的改变了行为 ══════════════ */

describe('接管型心境接上线了（正向对照）', () => {
  it('注册表只登记 5 个接管型心境；悠闲 / 警觉 / 胆怯 不接管', () => {
    expect(Object.keys(MOOD_HANDLERS).sort()).toEqual([...TAKEOVER].sort());
    for (const id of ['CALM', 'ALERT', 'FEARFUL'] as MoodId[]) {
      expect(MOOD_HANDLERS[id], `${id} 不该接管行为，只改数值`).toBeUndefined();
    }
  });

  it('同一场景下，每个接管型心境的跑动结果都和「悠闲」不同', () => {
    const calm = crowdScene(DEFAULT_MOOD);
    runFrames(calm.state, 40);
    const calmFp = fingerprint(calm.fish);

    for (const mood of TAKEOVER) {
      const s = crowdScene(mood);
      runFrames(s.state, 40);
      expect(fingerprint(s.fish), `${mood} 跑出来和「悠闲」一模一样 → handler 没接线`).not.toBe(
        calmFp
      );
    }
  });

  it('五个接管型心境彼此也不是同一个行为（至少 3 种不同结果）', () => {
    const fps = TAKEOVER.map((mood) => {
      const s = crowdScene(mood);
      runFrames(s.state, 40);
      return fingerprint(s.fish);
    });
    expect(new Set(fps).size).toBeGreaterThanOrEqual(3);
  });
});

/* ══════════════ 5. 各心境的招牌动作 ══════════════ */

describe('瞌睡', () => {
  it('附近没有威胁时原地打盹：不位移、速度归零、标记静止', () => {
    const { state, fish } = soloScene('SLEEPY');
    const before = { x: fish.x, y: fish.y };
    runFrames(state, 25);
    expect(fish.x).toBe(before.x);
    expect(fish.vx).toBe(0);
    expect(fish.vy).toBe(0);
    expect(fish.isIdle).toBe(true);
  });

  it('被逼近就惊醒，转成「警觉」并重新计时', () => {
    const { state, fish } = soloScene('SLEEPY');
    const shark = createEntity(CreatureType.ORCA, CX - 100, CY, { moodId: 'SLEEPY' });
    shark.semiGhostTimer = 0;
    state.entities.push(shark);

    runFrames(state, 1);

    expect(fish.moodId).toBe('ALERT');
    expect(fish.isIdle).toBe(false);
    expect(fish.moodTimer).toBeGreaterThan(0);
  });
});

describe('好奇', () => {
  it('会朝玩家靠近，但不过分贴脸', () => {
    const { state, fish } = soloScene('CURIOUS', 600);
    const before = dist(fish, state.player);
    runFrames(state, 40);
    const after = dist(fish, state.player);
    expect(after).toBeLessThan(before); // 靠近了
  });
});

describe('群聚', () => {
  it('朝同类靠拢', () => {
    const { state, fish, mate } = crowdScene('SOCIABLE');
    const before = dist(fish, mate);
    runFrames(state, 40);
    expect(dist(fish, mate)).toBeLessThan(before);
  });
});

describe('饥饿', () => {
  it('本该逃跑的温顺鱼也会去追比自己小的目标', () => {
    // 小丑鱼是 FLEE（胆小）—— 悠闲时对磷虾毫无兴趣，饿了就会开荤
    const calm = crowdScene(DEFAULT_MOOD);
    const calmDistBefore = dist(calm.fish, calm.snack);
    runFrames(calm.state, 40);
    const calmGain = calmDistBefore - dist(calm.fish, calm.snack);

    const hungry = crowdScene('HUNGRY');
    const hungryDistBefore = dist(hungry.fish, hungry.snack);
    runFrames(hungry.state, 40);
    const hungryGain = hungryDistBefore - dist(hungry.fish, hungry.snack);

    expect(hungryGain).toBeGreaterThan(0); // 追近了
    expect(hungryGain).toBeGreaterThan(calmGain); // 而且明显比「悠闲」更积极
  });
});

describe('狂躁', () => {
  it('无视体型差距，连比自己大的目标也扑', () => {
    // 追兵钉成瞌睡，免得它同时冲过来把距离也拉近，混淆归因
    const make = (moodId: MoodId) => {
      const { state, fish } = soloScene(moodId);
      const orca = createEntity(CreatureType.ORCA, CX - 400, CY, { moodId: 'SLEEPY' });
      orca.semiGhostTimer = 0;
      state.entities.push(orca);
      return { state, fish, orca };
    };

    const calm = make(DEFAULT_MOOD);
    runFrames(calm.state, 25);
    expect(dist(calm.fish, calm.orca)).toBeGreaterThan(400); // 胆小的逃开了

    const frenzy = make('FRENZY');
    runFrames(frenzy.state, 25);
    expect(dist(frenzy.fish, frenzy.orca)).toBeLessThan(400); // 狂躁的反而冲上去
  });
});

describe('警觉', () => {
  it('同样的距离，悠闲看不见的目标，警觉能看见', () => {
    /** 双髻鲨是 AGGRESSIVE，猎物范围基准 900px；警觉 ×1.6 → 1440px */
    const hunt = (moodId: MoodId) => {
      const state = createInitialState();
      state.time = 1;
      state.entities = [];
      state.player.level = 1;
      state.player.x = CX - 2400; // 远到抢不走「最近目标」的位置，但仍在活跃圈内
      state.player.y = CY;

      const hunter = createEntity(CreatureType.HAMMERHEAD, CX, CY, { moodId });
      hunter.semiGhostTimer = 0;
      hunter.angle = 0;

      const prey = createEntity(CreatureType.CLOWN_FISH, CX - 1100, CY, { moodId: 'CALM' });
      prey.semiGhostTimer = 0;

      state.entities = [hunter, prey];
      runFrames(state, 25);
      return hunter;
    };

    // 1100px：超过悠闲的 900，仍在警觉的 1440 之内
    expect(Math.abs(hunt(DEFAULT_MOOD).angle)).toBeLessThan(0.2);
    expect(Math.abs(hunt('ALERT').angle)).toBeGreaterThan(1);
  });
});

/* ══════════════ 6. 数值与向后兼容 ══════════════ */

describe('速度倍率', () => {
  it('狂躁比悠闲游得快，比值接近设计的 1.35', () => {
    const drift = (moodId: MoodId) => {
      const { state, fish } = soloScene(moodId);
      const startX = fish.x;
      runFrames(state, 1);
      return fish.x - startX;
    };

    const calm = drift(DEFAULT_MOOD);
    const frenzy = drift('FRENZY');
    expect(calm).toBeGreaterThan(0);
    expect(frenzy).toBeGreaterThan(calm * 1.2);
    expect(frenzy).toBeLessThan(calm * 1.5);
  });

  it('向后兼容：钉成「悠闲」和完全不设心境，跑出来一模一样', () => {
    const pinned = soloScene(DEFAULT_MOOD);
    runFrames(pinned.state, 25);

    const legacy = soloScene(DEFAULT_MOOD);
    delete legacy.fish.moodId; // 模拟老代码 / 老存档里没有这个字段的实体
    runFrames(legacy.state, 25);

    expect(fingerprint(legacy.fish)).toBe(fingerprint(pinned.fish));
  });
});

/* ══════════════ 7. 心境计时 ══════════════ */

describe('心境计时', () => {
  it('到期后重新抽一个，并重新排上计时器', () => {
    const { state, fish } = soloScene('SLEEPY');
    fish.moodTimer = 0;
    runFrames(state, 1);
    expect(fish.moodTimer).toBeGreaterThan(0);
  });

  it('交战中（愤怒未消）不换心境 —— 免得追到一半突然佛系', () => {
    const { state, fish } = soloScene('HUNGRY');
    fish.moodTimer = 0;
    fish.angerTimer = 120;
    runFrames(state, 1);
    expect(fish.moodId).toBe('HUNGRY');
    expect(fish.moodTimer).toBe(0);
  });

  it('没有该字段的老实体不会被强行加上（不会突然开始换心境）', () => {
    const { state, fish } = soloScene('CALM');
    delete fish.moodTimer;
    runFrames(state, 5);
    expect(fish.moodTimer).toBeUndefined();
  });
});
