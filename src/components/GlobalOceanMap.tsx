import React from 'react';
import { Anchor, Compass, Navigation, Waves } from 'lucide-react';
import { BIOME_CONFIGS } from '../constants';
import { POND_DATA, type PondId } from '../data/ponds';
import { OCEAN_REGIONS, OCEAN_ROUTES, getOceanRegion } from '../data/oceanRegions';
import { getPondSpecialties } from '../data/pondEvents';

interface GlobalOceanMapProps {
  selected: PondId;
  onSelect: (id: PondId) => void;
}

export const GlobalOceanMap: React.FC<GlobalOceanMapProps> = ({ selected, onSelect }) => {
  const selectedRegion = getOceanRegion(selected);
  const selectedPond = POND_DATA[selected];
  const specialties = getPondSpecialties(selected);
  const fishText = specialties.fish.length > 3
    ? `${specialties.fish.slice(0, 3).join('、')}等 ${specialties.fish.length} 种`
    : specialties.fish.join('、');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(480px,1.65fr)_minmax(280px,0.85fr)] gap-3 w-full max-w-6xl">
      <div className="relative h-[230px] sm:h-[250px] overflow-hidden rounded-2xl border border-cyan-700/60 bg-gradient-to-b from-slate-950 via-[#082d50] to-[#0c4a6e] shadow-inner">
        <div className="absolute left-4 top-3 z-20 flex items-center gap-2 text-cyan-200">
          <Compass size={18} />
          <span className="text-xs font-black tracking-[0.2em]">全球海域航图</span>
        </div>

        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="oceanGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#oceanGlow)" />
          <path d="M1 20 C10 8,18 12,20 25 C18 34,10 36,7 48 C3 43,1 35,1 20Z" fill="#64748b" opacity="0.26" />
          <path d="M37 6 C45 4,50 13,48 22 C44 27,48 34,44 42 C38 38,35 29,37 20Z" fill="#64748b" opacity="0.22" />
          <path d="M63 8 C78 3,94 13,98 28 C91 36,82 31,76 42 C70 39,63 31,61 20Z" fill="#64748b" opacity="0.25" />
          <path d="M69 66 C78 58,91 64,94 77 C87 91,73 94,66 82Z" fill="#64748b" opacity="0.22" />
          {OCEAN_ROUTES.map(route => {
            const from = OCEAN_REGIONS[route.from];
            const to = OCEAN_REGIONS[route.to];
            const active = route.from === selected || route.to === selected;
            return (
              <line
                key={`${route.from}-${route.to}`}
                x1={from.mapX} y1={from.mapY} x2={to.mapX} y2={to.mapY}
                stroke={active ? '#67e8f9' : '#64748b'}
                strokeWidth={active ? 0.9 : 0.55}
                strokeDasharray="2.4 1.8"
                opacity={active ? 0.9 : 0.45}
              />
            );
          })}
        </svg>

        {(Object.keys(OCEAN_REGIONS) as PondId[]).map(id => {
          const region = OCEAN_REGIONS[id];
          const pond = POND_DATA[id];
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={`选择海域 ${region.name}`}
              onClick={() => onSelect(id)}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${region.mapX}%`, top: `${region.mapY}%` }}
            >
              <span
                className={`absolute inset-1 rounded-full transition-all ${isSelected ? 'animate-ping opacity-35' : 'opacity-0 group-hover:opacity-20'}`}
                style={{ backgroundColor: pond.color }}
              />
              <span
                className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'scale-110 shadow-[0_0_24px_currentColor]' : 'bg-slate-900/90 hover:scale-105'}`}
                style={{ borderColor: pond.color, color: pond.color, backgroundColor: isSelected ? `${pond.color}33` : undefined }}
              >
                {id === 'ABYSS' ? <Anchor size={20} /> : id === 'CORAL' ? <Waves size={21} /> : <Navigation size={20} />}
              </span>
              <span className={`absolute top-12 sm:top-13 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-black border ${isSelected ? 'bg-slate-950 text-white border-cyan-400' : 'bg-slate-950/80 text-slate-300 border-slate-600'}`}>
                {region.name}
              </span>
            </button>
          );
        })}

        <div className="absolute bottom-2 left-3 text-[10px] text-cyan-100/50">航线将在远航阶段加入距离、补给与动态天气</div>
      </div>

      <div className="rounded-2xl border bg-slate-900/90 p-3.5 text-left flex flex-col" style={{ borderColor: `${selectedPond.color}99` }}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-3 h-3 rounded-full shrink-0 shadow-[0_0_12px_currentColor]" style={{ color: selectedPond.color, backgroundColor: selectedPond.color }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black text-white">{selectedRegion.name}</h3>
              <span className="text-[10px] rounded-full border border-slate-600 px-2 py-0.5 text-slate-400">{selectedRegion.localName}</span>
            </div>
            <p className="text-[11px] text-cyan-300">{selectedRegion.ocean}</p>
          </div>
          <span className="ml-auto text-xs font-black text-amber-300">{'★'.repeat(selectedPond.difficulty)}</span>
        </div>
        <p className="mt-2 text-sm font-bold" style={{ color: selectedPond.color }}>{selectedRegion.gameplay}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">{selectedRegion.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedRegion.environment.map(item => (
            <span key={item} className="rounded-full bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] text-slate-300">{item}</span>
          ))}
        </div>
        <div className="mt-auto pt-2 border-t border-slate-700/80 grid grid-cols-2 gap-2 text-[10px]">
          <div className="text-slate-400">主生态区<br/><b className="text-white">{BIOME_CONFIGS[selectedPond.signatureBiome].name}</b></div>
          <div className="text-slate-400">远航收益<br/><b className="text-amber-300">得分 ×{selectedPond.scoreMult}</b></div>
          <div className="col-span-2 text-slate-400">特产<br/><b className="text-cyan-200">{[fishText, specialties.building, specialties.event].filter(Boolean).join(' · ') || '待发现'}</b></div>
        </div>
      </div>
    </div>
  );
};
