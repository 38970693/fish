/**
 * 进化面板：候选不再抖动（用户可见症状的直证）。
 *
 * 症状（2026-09-13 用户反馈「选择进化方向，后面两个选项一直在变化」）：
 * UIOverlay 每 100ms 随 uiState 同步重渲染一次，而候选抽取**写在渲染期**里，
 * 于是每次都重掷洗牌 → 后两个卡片每秒换脸 10 次。
 *
 * 本文件的判据不是「看起来稳不稳」，而是**根因级**的：
 *   ① 渲染期一次都不许调 Math.random（配阳性对照，证明这条断言有威力）；
 *   ② 反复 rerender（模拟 100ms 一次的状态同步）后卡片文字完全不变；
 *   ③ 兜底路径（state 里没候选）同样是确定性的。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import UIOverlay from '../components/UIOverlay';
import { createInitialState } from '../factories/initialState';
import { CreatureType, pickEvolveOptions } from '../data/creatures';
import { GameStatus, type GameState } from '../types';

/* ── 依赖全部隔离，只留真实的 UIOverlay 渲染逻辑 ── */

// lucide 图标：所有具名导出都渲染成 null（列表内联，避免 vi.mock 提升导致的 TDZ）
vi.mock('lucide-react', () => {
  const names = [
    'Shield', 'Zap', 'Wind', 'Skull', 'Crown', 'Play', 'RefreshCw', 'AlertTriangle',
    'ChevronRight', 'Bot', 'Target', 'Users', 'Shuffle', 'Fish', 'Utensils', 'MapPin',
    'ShoppingBag', 'X', 'Check', 'Palette', 'Gem', 'Box', 'Sparkles', 'Frown', 'BookOpen',
    'Clock', 'Gift', 'Star', 'Eye', 'Diamond', 'Sword', 'Heart', 'Volume2', 'VolumeX',
    'Repeat', 'Trophy',
  ];
  return Object.fromEntries(names.map((n) => [n, () => null]));
});

vi.mock('../components/MiniMap', () => ({ default: () => null }));
vi.mock('../components/CosmeticsPanel', () => ({ default: () => null }));
vi.mock('../gameEngine', () => ({
  getMapBoundaryRadius: () => 2000,
  isConcealed: () => false,
  // FQ-05：战队面板要读「R 下一个会附身到谁」，必须补进 mock（工厂式 mock 未列出的导出全是 undefined）
  peekNextSwitchTarget: () => null,
  gameEvents: { on: () => () => {}, emit: () => {} },
}));
vi.mock('../systems/achievements', () => ({
  getUnlockedCount: () => 0,
  getAchievementView: () => [],
}));
vi.mock('../systems/leaderboard', () => ({
  getLeaderboard: () => [],
  getLastRunRank: () => 0,
  clearLeaderboard: () => {},
}));

const makeEvolvingState = (evolveOptions: CreatureType[]): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.EVOLVING;
  state.evolveOptions = evolveOptions;
  return state;
};

const propsFor = (gameState: GameState): ComponentProps<typeof UIOverlay> => ({
  gameState,
  onStart: vi.fn(),
  onStartBattleTest: vi.fn(),
  onEvolve: vi.fn(),
  onRestart: vi.fn(),
  onRevive: vi.fn(),
  onToggleGodMode: vi.fn(),
  onUpdateCosmetics: vi.fn(),
  setGameStatus: vi.fn(),
  onSwitchSquad: vi.fn(),
  muted: false,
  onToggleMute: vi.fn(),
});

const optionLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('h3')).map((el) => el.textContent);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('进化面板：候选不再抖动', () => {
  it('阳性对照 —— 底层抽取函数确实会掷骰子（证明下面那条「零调用」不是因为 spy 失效）', () => {
    const spy = vi.spyOn(Math, 'random');
    pickEvolveOptions({ nextTier: 2 });
    expect(spy).toHaveBeenCalled();
  });

  it('渲染期一次都不掷骰子（根因：候选不能现算）', () => {
    const state = makeEvolvingState([CreatureType.KOI, CreatureType.CRAB, CreatureType.SEAHORSE]);
    const spy = vi.spyOn(Math, 'random');
    render(<UIOverlay {...propsFor(state)} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('反复重渲染（模拟 100ms 一次的状态同步）后，卡片文字完全不变', () => {
    const opts = [CreatureType.KOI, CreatureType.CRAB, CreatureType.SEAHORSE];
    const { container, rerender } = render(<UIOverlay {...propsFor(makeEvolvingState(opts))} />);

    const first = optionLabels(container);
    expect(first).toEqual(['锦鲤', '帝王蟹', '海马']);

    // 每次传一个「新的 gameState 对象」（这正是 App.tsx `setUiState({...})` 干的事）
    for (let i = 0; i < 5; i += 1) {
      rerender(<UIOverlay {...propsFor(makeEvolvingState(opts))} />);
    }
    expect(optionLabels(container)).toEqual(first);
  });

  it('兜底路径（state 里没候选）也不掷骰子、也不抖', () => {
    const spy = vi.spyOn(Math, 'random');
    const { container, rerender } = render(<UIOverlay {...propsFor(makeEvolvingState([]))} />);

    const first = optionLabels(container);
    expect(first.length).toBe(3); // 绝不能是空面板（会软锁）

    rerender(<UIOverlay {...propsFor(makeEvolvingState([]))} />);
    expect(optionLabels(container)).toEqual(first);
    expect(spy).not.toHaveBeenCalled();
  });
});
