import React from 'react';
import type { GameState } from '../types';
import GameCanvas from '../components/GameCanvas';
import type { RendererKind } from './types';

const PixiGameCanvas = import.meta.env.DEV
  ? React.lazy(() => import('./pixi/PixiGameCanvas'))
  : null;

export interface RendererSurfaceProps {
  kind: RendererKind;
  gameState: GameState;
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: (event: { button: number }) => void;
  onMouseUp: (event: { button: number }) => void;
}

/** React 只负责选择和挂载；玩法循环与具体渲染库都留在边界外。 */
const RendererSurface: React.FC<RendererSurfaceProps> = (props) => {
  const { kind, gameState, onMouseMove, onMouseDown, onMouseUp } = props;
  if (kind === 'pixi' && PixiGameCanvas) {
    return (
      <React.Suspense fallback={<div className="absolute inset-0 bg-[#071c3d]" />}>
        <PixiGameCanvas gameState={gameState} onMouseMove={onMouseMove} onMouseDown={onMouseDown} onMouseUp={onMouseUp} />
      </React.Suspense>
    );
  }
  return (
    <GameCanvas
      gameState={gameState}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    />
  );
};

export default RendererSurface;
