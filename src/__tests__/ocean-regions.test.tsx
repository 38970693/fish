import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalOceanMap } from '../components/GlobalOceanMap';
import { OCEAN_REGIONS, OCEAN_ROUTES, getConnectedRegions, getOceanRegion } from '../data/oceanRegions';
import { POND_DATA, type PondId } from '../data/ponds';

describe('全球海域注册表', () => {
  it('为每个现有区域提供唯一且有效的海图坐标', () => {
    const pondIds = Object.keys(POND_DATA).sort();
    const regionIds = Object.keys(OCEAN_REGIONS).sort();
    expect(regionIds).toEqual(pondIds);
    const positions = new Set<string>();
    for (const region of Object.values(OCEAN_REGIONS)) {
      expect(region.mapX).toBeGreaterThan(5);
      expect(region.mapX).toBeLessThan(95);
      expect(region.mapY).toBeGreaterThan(5);
      expect(region.mapY).toBeLessThan(95);
      expect(region.gameplay.length).toBeGreaterThan(3);
      expect(region.environment.length).toBeGreaterThanOrEqual(3);
      positions.add(`${region.mapX},${region.mapY}`);
    }
    expect(positions.size).toBe(regionIds.length);
  });

  it('所有开放海域通过航线相互可达', () => {
    const ids = Object.keys(OCEAN_REGIONS) as PondId[];
    const visited = new Set<PondId>([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of getConnectedRegions(current)) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    expect(visited.size).toBe(ids.length);
    expect(OCEAN_ROUTES.every(route => route.distance > 0 && route.from !== route.to)).toBe(true);
  });

  it('未知海域安全回退到赤道暖海', () => {
    expect(getOceanRegion('UNKNOWN').id).toBe('CLEAR');
    expect(getOceanRegion(null).name).toBe('赤道暖海');
  });
});

describe('全球海图组件', () => {
  it('展示所有节点并允许切换海域', () => {
    const onSelect = vi.fn();
    render(<GlobalOceanMap selected="CLEAR" onSelect={onSelect} />);
    expect(screen.getByText('全球海域航图')).toBeInTheDocument();
    expect(screen.getByText('成长与收集')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选择海域 马里亚纳深海' }));
    expect(onSelect).toHaveBeenCalledWith('ABYSS');
  });
});
