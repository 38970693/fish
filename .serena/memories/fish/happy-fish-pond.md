# Happy Fish Pond 项目 (happy-fish-pond)

## 项目信息
- GitLab 仓库: e:\gitlab\fish
- 技术栈: React 19 + TypeScript + Vite 6
- 游戏类型: 浏览器鱼类进化游戏

## 关键文件
- `src/gameEngine.ts` - 核心游戏循环 (56KB)
- `src/types.ts` - 所有类型定义
- `src/constants.ts` - 游戏配置常量
- `src/components/MiniMap.tsx` - 迷你地图组件

## 重要配置
- TREASURE_COLORS 已统一到 constants.ts
- WORLD_SIZE = 4000
- 60fps 游戏循环

## 最新提交
- CLAUDE.md 创建完成
- TREASURE_COLORS 重构（从 MiniMap 移到 constants.ts）