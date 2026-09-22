import type { RendererKind } from './types';

export const RENDERER_STORAGE_KEY = 'happy-fish.renderer';

interface RendererSelectionOptions {
  search: string;
  stored: string | null;
  pixiAvailable: boolean;
}

export interface RendererSelection {
  kind: RendererKind;
  requested: RendererKind;
  source: 'query' | 'storage' | 'default';
  fellBack: boolean;
}

const isRendererKind = (value: string | null): value is RendererKind =>
  value === 'canvas' || value === 'pixi';

export const resolveRendererSelection = ({
  search,
  stored,
  pixiAvailable,
}: RendererSelectionOptions): RendererSelection => {
  const query = new URLSearchParams(search).get('renderer');
  const source = isRendererKind(query) ? 'query' : isRendererKind(stored) ? 'storage' : 'default';
  const requested: RendererKind = isRendererKind(query)
    ? query
    : isRendererKind(stored)
      ? stored
      : 'pixi';
  const kind = requested === 'pixi' && !pixiAvailable ? 'canvas' : requested;
  return { kind, requested, source, fellBack: kind !== requested };
};

export const selectBrowserRenderer = (pixiAvailable: boolean): RendererSelection => {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(RENDERER_STORAGE_KEY);
  } catch {
    // 禁用存储或隐私模式下继续使用 URL / 默认值。
  }
  const selection = resolveRendererSelection({ search: window.location.search, stored, pixiAvailable });
  if (selection.source === 'query') {
    try {
      window.localStorage.setItem(RENDERER_STORAGE_KEY, selection.requested);
    } catch {
      // 选择仍对当前页面有效。
    }
  }
  return selection;
};
