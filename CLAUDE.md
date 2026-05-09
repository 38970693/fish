# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Happy Fish Pond (欢乐鱼塘)** - An eat-or-be-eaten survival game where players control fish, eat smaller creatures to grow, evolve through tiers, and unlock skills.

Tech Stack: React 19 + Vite + TypeScript + HTML5 Canvas

## Common Commands

```bash
npm install        # Install dependencies
npm run dev       # Start dev server (port 3000)
npm run build     # Production build
npm run preview   # Preview production build
```

**Environment**: Create `.env.local` with `GEMINI_API_KEY` for AI features.

## Architecture

### Game Loop Pattern

The game uses a dual-update pattern in `src/App.tsx`:
1. **Game Engine** (`gameStateRef`) - Runs at 60fps via `requestAnimationFrame`, handles all physics/AI/collision
2. **React State** (`uiState`) - Syncs every 100ms for UI rendering only

```typescript
// src/App.tsx:67-78
const gameLoop = useCallback(() => {
  gameStateRef.current = updateGame(gameStateRef.current, ...);
  requestAnimationFrame(gameLoop);
}, []);
```

### Core Modules

| File | Responsibility |
|------|----------------|
| `src/App.tsx` | Entry point, game loop, input handling (mouse/keyboard) |
| `src/gameEngine.ts` | Core logic: spawning, AI, collision, skills, player control |
| `src/constants.ts` | Creature configs (20+ types), biome definitions, game mechanics |
| `src/types.ts` | TypeScript types for GameState, Entity, PlayerState, enums |
| `src/components/GameCanvas.tsx` | Canvas rendering (creatures, particles, effects) |
| `src/components/UIOverlay.tsx` | React UI (menus, HUD, evolution screen) |

### Data Flow

```
User Input → App.tsx → gameEngine.ts → gameStateRef → GameCanvas.tsx (direct)
                           ↓
                     uiState (100ms sync)
                           ↓
                     UIOverlay.tsx
```

### Key Game Concepts

**Creature Tiers**: 0 (Plankton) → 1 (Starters) → 2 (Medium) → 3 (Large) → 4 (Apex)
**Biomes**: Shallows, Reef, Swamp, Abyss - each with unique mechanics
**Skills**: Triggered by right-click when level >= 3, cooldown-based
**Evolution**: Reaching weight thresholds prompts evolution choice screen
**Cosmetics**: Extensive customization (teeth, patterns, accessories, etc.)

### Canvas Rendering

`drawCuteFish()` in `GameCanvas.tsx` handles all creature rendering. Special modes:
- **Mecha mode**: When collecting shells (30% chance)
- **Lure mode**: Angler fish ability to attract prey
- **MASCOT**: Special celebration entity with floating animation

## File Organization

**Source directory is `src/`** - Root contains duplicate legacy files, ignore them.

```
src/
├── App.tsx              # Main component + game loop
├── index.tsx           # React entry point
├── gameEngine.ts        # Pure game logic (no React deps)
├── constants.ts         # Configuration constants
├── types.ts            # TypeScript interfaces/enums
└── components/
    ├── GameCanvas.tsx   # Canvas rendering
    └── UIOverlay.tsx    # UI screens
```

## Game State Structure

```typescript
// src/types.ts:317-337
interface GameState {
  status: GameStatus;           // MENU | PLAYING | EVOLVING | GAME_OVER | BATTLE_TEST | SHOP
  player: PlayerState;
  entities: Entity[];            // AI creatures
  particles: Particle[];
  obstacles: Obstacle[];
  powerUps: PowerUp[];           // Bottles, shells
  hazards: Hazard[];             // Meteors
  projectiles: Projectile[];      // Torpedoes (mecha mode)
  portals: Portal[];
  buildings: Building[];         // Hospital, Shrine, Shop
  treasures: Treasure[];
  camera: { x, y, zoom };
}
```

## Important Constants

**World**: 6000x6000 pixels, flower-petal shaped map boundary
**Combat**: Level-based eating (higher level eats lower), size tiebreaker
**Boost**: Space bar activates speed boost (drains energy)
**Skills**: Right-click triggers, skill level from bottle pickups saved to localStorage

## Development Notes

- No test framework currently configured
- Uses Tailwind CSS for UI styling
- Game runs at ~60fps via requestAnimationFrame
- Collision detection uses circle-circle distance checks
- AI behavior varies by creature type (FLEE, AGGRESSIVE, AMBUSH, BOSS)
