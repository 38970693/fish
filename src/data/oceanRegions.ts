import { POND_DATA, type PondId } from './ponds';

export interface OceanRegionConfig {
  id: PondId;
  name: string;
  localName: string;
  ocean: string;
  gameplay: string;
  description: string;
  environment: readonly string[];
  mapX: number;
  mapY: number;
}

export interface OceanRoute {
  from: PondId;
  to: PondId;
  name: string;
  distance: number;
}

export const OCEAN_REGIONS: Record<PondId, OceanRegionConfig> = {
  CLEAR: {
    id: 'CLEAR',
    name: '赤道暖海',
    localName: POND_DATA.CLEAR.name,
    ocean: '西太平洋暖流区',
    gameplay: '成长与收集',
    description: '水温稳定、食物充足，适合扩充鱼群并寻找温水鱼特产。',
    environment: ['浅滩', '暖流', '许愿池'],
    mapX: 25,
    mapY: 48,
  },
  CORAL: {
    id: 'CORAL',
    name: '珊瑚群岛',
    localName: POND_DATA.CORAL.name,
    ocean: '珊瑚海航区',
    gameplay: '地形与领地争夺',
    description: '礁石和珊瑚切割航道，鱼群围绕产卵场与珍珠资源展开争夺。',
    environment: ['珊瑚迷宫', '产卵夜', '珍珠场'],
    mapX: 55,
    mapY: 63,
  },
  ABYSS: {
    id: 'ABYSS',
    name: '马里亚纳深海',
    localName: POND_DATA.ABYSS.name,
    ocean: '西太平洋海沟区',
    gameplay: '黑暗探索与巨物生存',
    description: '食物稀少、巨物横行，热泉、沉船和发光鱼群藏在黑暗深处。',
    environment: ['深海热泉', '沉船搜索', '星光鱼群潮'],
    mapX: 82,
    mapY: 38,
  },
};

export const OCEAN_ROUTES: readonly OceanRoute[] = [
  { from: 'CLEAR', to: 'CORAL', name: '赤道暖流', distance: 1260 },
  { from: 'CORAL', to: 'ABYSS', name: '海沟下潜线', distance: 1840 },
  { from: 'CLEAR', to: 'ABYSS', name: '西太平洋远航线', distance: 2380 },
];

export const getOceanRegion = (id?: string | null): OceanRegionConfig =>
  OCEAN_REGIONS[(id ?? '') as PondId] ?? OCEAN_REGIONS.CLEAR;

export const getRegionRoutes = (id: PondId): OceanRoute[] =>
  OCEAN_ROUTES.filter(route => route.from === id || route.to === id);

export const getConnectedRegions = (id: PondId): PondId[] =>
  getRegionRoutes(id).map(route => route.from === id ? route.to : route.from);
