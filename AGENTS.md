# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A browser-based fish evolution game ("Happy Fish Pond") built with React + TypeScript + Vite. Players control a fish that can eat smaller creatures to gain weight and evolve into more powerful forms.

## Commands

```bash
npm run dev     # Start dev server (port 3000)
npm run build   # Production build to dist/
npm run preview # Preview production build
```

**Environment**: Set `GEMINI_API_KEY` in `.env.local` for AI features.

## Architecture

### Core Game Loop

The game runs at 60fps in `src/gameEngine.ts` via `requestAnimationFrame`. Each frame processes:
1. Input handling
2. AI behavior updates (all entities)
3. Physics/movement
4. Collision detection
5. Spawning logic
6. Particle updates
7. State cleanup

### Key Types (`src/types.ts`)

- `PlayerState extends Entity` - Player fish with game-specific properties (weight, evolutionPoints, basket, boost system)
- `Entity` - Base creature with position, velocity, health, behavior AI, cosmetics
- `CreatureType` enum - Fish types from PLANKTON (Tier 0) to KRAKEN (Tier 4 Boss)
- `BuildingType` enum - HOSPITAL, ARMORY, SHRINE, SHOP
- `GameState` - Central state object containing all game entities

### Component Structure

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root component managing game state and status screens |
| `GameCanvas.tsx` | Main rendering canvas (entities, UI, effects) |
| `UIOverlay.tsx` | HUD elements (stats, minimap, controls) |
| `MiniMap.tsx` | Canvas-based minimap showing world overview |

### Constants (`src/constants.ts`)

- `CREATURE_CONFIGS` - Stats for each creature type (radius, speed, health, damage, behavior)
- `BIOME_CONFIGS` - Four biomes (SHALLOWS, REEF, SWAMP, ABYSS) with terrain bonuses
- `BUILDING_CONFIGS` - Building properties (HOSPITAL heals, ARMORY upgrades, etc.)
- `MAP_SHAPE_CONFIG` - World boundary shape (flower/circle hybrid via `getMapBoundaryRadius()`)

### AI Behavior System

Creatures use behavior enum: `PASSIVE`, `FLEE`, `AGGRESSIVE`, `AMBUSH`, `BOSS`, `MASCOT`

Key behavior functions in `gameEngine.ts`:
- `updateCreatureBehavior()` - Main AI decision loop
- `handleAggressiveBehavior()`, `handleFleeBehavior()` - Behavior-specific logic
- `findNearestTarget()` - Threat assessment and targeting
- Ambush fish use `ambushTimer` and `aggroTimer` for stealth attacks

### Coordinate System

- World coordinates (0 to `WORLD_SIZE` = 4000)
- Camera follows player with smooth interpolation
- MiniMap zooms out 3x (`MINIMAP_ZOOM_LEVEL`)
- Use `screenToWorld()`/`worldToScreen()` for coordinate transformation

### Cosmetics System

Each fish has `Cosmetics` with: teeth, skinColor, pattern, scaleType, accessory, tailType, bodyType, mouthType, eyeType, eyebrowType, trailType. These are rendered in `drawCreature()` with specific drawing order.

## File Organization

```
src/
├── App.tsx           # Root, game status routing
├── gameEngine.ts     # Core game loop, AI, physics (56KB)
├── types.ts          # All TypeScript types/enums
├── constants.ts      # Game configuration constants
├── components/
│   ├── GameCanvas.tsx    # Main canvas renderer
│   ├── UIOverlay.tsx     # HUD components
│   └── MiniMap.tsx       # World minimap
└── test/
    └── setup.ts          # Mock implementations for testing
```

## Key Patterns

### State Updates

Use immutable patterns - spread operators for entity updates:
```typescript
setEntities(prev => prev.map(e => e.id === id ? { ...e, health: newHealth } : e));
```

### Game Status Flow

`MENU` → `PLAYING` → (EVOLVING | SHOP) → `VICTORY` | `GAME_OVER`

### Treasure System

Treasures spawn with `WARNING` status (3 sec blink) then become `ACTIVE`. Types: FEAST (XP), CHEST (gold), GEM (2x exp multiplier), FOOD (heal). Colors defined in `TREASURE_COLORS`.

## Testing

Tests are in `src/__tests__/`:
- `gameEngine.test.ts` - Game engine logic tests
- `constants.test.ts` - Configuration tests
- `MiniMap.test.tsx` - Component tests

Test mocks for Canvas API are in `src/test/setup.ts`. Some TypeScript errors in test files are expected due to incomplete JSDOM canvas mocks.