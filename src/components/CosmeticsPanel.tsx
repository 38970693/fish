/**
 * 装扮定制面板 —— 带「试衣镜」的版本。
 *
 * 以前这个面板只有色块、文字和 emoji，玩家完全不知道自己选完长什么样，
 * 得关掉面板游回水里才看得见「哦，原来这个花纹是长这样的」。
 *
 * 现在两处预览，都直接画**穿着它的鱼**：
 *   ① 左侧大预览：玩家当前的鱼种 + 当前装扮，逐帧动画，改一项立刻变；
 *   ② 每个选项按钮里一张缩略图：`{...当前装扮, [该项]: 该选项}` —— 只动一个变量，
 *      所以选项之间的差别就是「换上它之后鱼的变化」，对比才有意义。
 *
 * 所有预览使用当前渔场的渲染引擎与玩家的真实外观数据。
 */

import React, { useMemo, useState } from 'react';
import { DEFAULT_COSMETICS, type BoostEffect, type Cosmetics, type CreatureType, type Entity } from '../types';
import type { RendererKind } from '../rendering/types';
import { BOOST_COLOR_OPTIONS, BOOST_STYLE_OPTIONS, DEFAULT_BOOST_EFFECT, getBoostEffect } from '../data/boostEffects';
import { CREATURES } from '../data/creatures';
import {
  ACCESSORY_OPTIONS,
  AI_COSMETICS_PRESETS,
  BODY_OPTIONS,
  COSMETIC_TABS,
  EYE_OPTIONS,
  EYEBROW_OPTIONS,
  MOUTH_OPTIONS,
  PATTERN_OPTIONS,
  SCALE_OPTIONS,
  SKIN_COLOR_OPTIONS,
  TAIL_OPTIONS,
  TEETH_OPTIONS,
  TRAIL_OPTIONS,
  withOption,
  type CosmeticTabId,
} from '../data/cosmeticsOptions';
import { Sparkles, Palette, Crown, Eye as EyeIcon, Check, RotateCcw, Smile, Fish, Zap } from 'lucide-react';
import FishPreview, { FishPreviewContext } from './FishPreview';
import './CosmeticsPanel.css';

interface CosmeticsPanelProps {
  cosmetics: Cosmetics;
  onChange: (cosmetics: Cosmetics) => void;
  onClose: () => void;
  /** 要预览的鱼种。装扮面板在菜单和商场里都可能开，玩家鱼种由调用方给 */
  fishType?: CreatureType;
  fish?: Entity;
  renderer?: RendererKind;
  mode?: 'player' | 'ai-fish';
  onModeChange?: (mode: 'player' | 'ai-fish') => void;
}

/** 标签页图标（数据层不引 React，图标在这里配） */
const TAB_ICONS: Record<CosmeticTabId, React.ReactNode> = {
  color: <Palette size={16} />,
  pattern: <Sparkles size={16} />,
  face: <Smile size={16} />,
  body: <Fish size={16} />,
  accessory: <Crown size={16} />,
  eyes: <EyeIcon size={16} />,
  boost: <Zap size={16} />,
  'ai-presets': <Sparkles size={16} />,
};

/** 选项按钮：上面一张「穿着它的鱼」，下面标签，选中打勾 */
const OptionButton: React.FC<{
  selected: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  testKey: string;
  testValue: string;
}> = ({ selected, onClick, label, children, testKey, testValue }) => (
  <button
    onClick={onClick}
    aria-pressed={selected}
    data-cosmetic-key={testKey}
    data-cosmetic-value={testValue}
    className={`wardrobe-option relative rounded-xl border-2 p-1.5 transition-all flex flex-col items-center gap-0.5 ${
      selected
        ? 'border-cyan-400 bg-cyan-900/50 ring-2 ring-cyan-400/40'
        : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'
    }`}
  >
    {children}
    <span className="text-[11px] leading-tight text-white">{label}</span>
    {selected && (
      <span className="absolute -top-1.5 -right-1.5 bg-cyan-500 text-slate-900 rounded-full p-0.5">
        <Check size={12} strokeWidth={4} />
      </span>
    )}
  </button>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h3 className="text-sm font-bold text-cyan-400 mb-2 flex items-center gap-2">
    {icon} {children}
  </h3>
);

const CosmeticsPanel: React.FC<CosmeticsPanelProps> = ({
  cosmetics,
  onChange,
  onClose,
  fishType = 'CLOWN_FISH' as CreatureType,
  fish,
  renderer = 'canvas',
  mode = 'player',
  onModeChange,
}) => {
  const [activeTab, setActiveTab] = useState<CosmeticTabId>('color');
  const previewContext = useMemo(() => ({ fish, renderer }), [fish, renderer]);
  const [previewBoosting, setPreviewBoosting] = useState(true);
  const boostEffect = getBoostEffect(cosmetics);
  const updateBoost = (changes: Partial<BoostEffect>) => {
    onChange({ ...cosmetics, boostEffect: { ...boostEffect, ...changes } });
  };

  const updateCosmetics = <K extends keyof Cosmetics>(key: K, value: Cosmetics[K]) => {
    onChange(withOption(cosmetics, key, value));
  };

  /** 缩略图：把「这一项换成这个值」之后的鱼画出来。其余项保持玩家当前选择 */
  const thumb = <K extends keyof Cosmetics>(key: K, value: Cosmetics[K], size = 52) => (
    <FishPreview type={fishType} cosmetics={withOption(cosmetics, key, value)} size={size} />
  );

  const fishName = CREATURES[fishType]?.name ?? '你的鱼';

  // 摘要要带类别前缀，否则一排「无 无 无」根本看不出哪个是花纹、哪个是配饰
  const label = (list: readonly { value: string; label: string }[], v: string): string =>
    list.find((o) => o.value === v)?.label ?? v;

  const summary: string[] = [
    `色·${label(SKIN_COLOR_OPTIONS, cosmetics.skinColor)}`,
    `牙·${label(TEETH_OPTIONS, cosmetics.teeth)}`,
    `纹·${label(PATTERN_OPTIONS, cosmetics.pattern)}`,
    `鳞·${label(SCALE_OPTIONS, cosmetics.scaleType)}`,
    `嘴·${label(MOUTH_OPTIONS, cosmetics.mouthType)}`,
    `眉·${label(EYEBROW_OPTIONS, cosmetics.eyebrowType)}`,
    `眼·${label(EYE_OPTIONS, cosmetics.eyeType)}`,
    `形·${label(BODY_OPTIONS, cosmetics.bodyType)}`,
    `尾·${label(TAIL_OPTIONS, cosmetics.tailType)}`,
    `迹·${label(TRAIL_OPTIONS, cosmetics.trailType)}`,
    `饰·${label(ACCESSORY_OPTIONS, cosmetics.accessory)}`,
    `加速·${label(BOOST_STYLE_OPTIONS, boostEffect.style)}`,
  ];

  return (
    <FishPreviewContext.Provider value={previewContext}>
    <div className="cute-wardrobe fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="wardrobe-panel bg-slate-900 rounded-3xl border-2 border-cyan-500 shadow-2xl w-[960px] max-w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="wardrobe-header bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="text-white" size={22} />
            <h2 className="text-xl font-black text-white">装扮定制</h2>
            <span className="hidden sm:inline text-xs text-white/90">今天也要萌萌哒</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold leading-none">
            ×
          </button>
        </div>

        {/* 模式切换 */}
        {onModeChange && (
          <div className="px-4 pt-3 flex gap-2 shrink-0">
            <button
              onClick={() => onModeChange('player')}
              className={`flex-1 py-1.5 px-4 rounded-xl font-bold text-sm transition-all ${
                mode === 'player' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              🐟 玩家装扮
            </button>
            <button
              onClick={() => onModeChange('ai-fish')}
              className={`flex-1 py-1.5 px-4 rounded-xl font-bold text-sm transition-all ${
                mode === 'ai-fish' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              🤖 AI鱼装扮
            </button>
          </div>
        )}

        {/* 主体：左试衣镜 + 右货架 */}
        <div className="flex flex-1 min-h-0">
          <aside className="wardrobe-mirror w-[320px] shrink-0 border-r border-slate-700 bg-slate-950/50 p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="wardrobe-tank relative rounded-2xl border border-cyan-500/40 overflow-hidden">
              {/* 水里的气泡点缀，让预览看着像鱼缸而不是空白方块 */}
              <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute left-6 bottom-0 w-2 h-2 rounded-full bg-cyan-200/40" />
                <div className="absolute left-24 bottom-0 w-1.5 h-1.5 rounded-full bg-cyan-200/30" />
                <div className="absolute left-44 bottom-0 w-2.5 h-1.5 rounded-full bg-cyan-200/25" />
              </div>
              <span className="absolute left-3 top-2 text-[11px] font-black text-cyan-300/80 tracking-wide">
                🫧 小可爱的试衣镜
              </span>
              <div data-testid="cosmetics-preview" className="pt-6 pb-2">
                <FishPreview
                  type={fishType}
                  cosmetics={cosmetics}
                  width={288}
                  height={200}
                  animate
                  boosting={activeTab === 'boost' && previewBoosting}
                  title={`${fishName} 的当前装扮预览`}
                  className="mx-auto"
                />
              </div>
              {activeTab === 'boost' && (
                <div className="flex justify-center gap-2 pb-3">
                  {[{ value: true, label: '加速预览' }, { value: false, label: '常速预览' }].map(opt => (
                    <button key={opt.label} onClick={() => setPreviewBoosting(opt.value)} aria-pressed={previewBoosting === opt.value}
                      className={`text-xs px-3 py-1.5 rounded-lg ${previewBoosting === opt.value ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-center">
              <div className="text-white font-black">{fishName}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">换个选项，上面立刻变</div>
            </div>

            <div className="flex flex-wrap gap-1 justify-center">
              {summary.map((s, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {s}
                </span>
              ))}
            </div>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col">
            {/* 标签页 */}
            <div className="flex flex-wrap border-b border-slate-700 shrink-0">
              {COSMETIC_TABS.map((tab) => (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 whitespace-nowrap px-2 py-2.5 flex items-center justify-center gap-1.5 font-bold text-sm transition-all ${
                    activeTab === tab.id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {TAB_ICONS[tab.id]}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 选项区 */}
            <div className="p-4 overflow-y-auto max-h-[62vh]">
              {activeTab === 'boost' && (
                <div className="space-y-5">
                  <p className="text-xs text-slate-400">给小鱼选一条甜甜的加速尾迹，游快一点时就会亮起来。</p>
                  <div>
                    <SectionTitle icon={<Zap size={16} />}>推进样式</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BOOST_STYLE_OPTIONS.map(opt => (
                        <OptionButton key={opt.value} selected={boostEffect.style === opt.value}
                          onClick={() => updateBoost({ style: opt.value })} label={opt.label} testKey="boostStyle" testValue={opt.value}>
                          <FishPreview type={fishType} cosmetics={{ ...cosmetics, boostEffect: { ...boostEffect, style: opt.value } }}
                            width={116} height={64} boosting title={opt.label} />
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                  <div>
                    <SectionTitle icon={<Palette size={16} />}>效果颜色</SectionTitle>
                    <div className="grid grid-cols-6 gap-2">
                      {BOOST_COLOR_OPTIONS.map(opt => (
                        <OptionButton key={opt.value} selected={boostEffect.color === opt.value}
                          onClick={() => updateBoost({ color: opt.value })} label={opt.label} testKey="boostColor" testValue={opt.value}>
                          <span className="w-7 h-7 m-1 rounded-full border border-white/30" style={{ backgroundColor: opt.value }} />
                        </OptionButton>
                      ))}
                    </div>
                    <label className="mt-3 flex items-center gap-3 text-sm text-slate-300">
                      自选颜色
                      <input type="color" aria-label="加速效果自选颜色" value={boostEffect.color}
                        onChange={e => updateBoost({ color: e.target.value })} className="w-10 h-8 rounded cursor-pointer bg-transparent" />
                      <span className="font-mono text-xs text-slate-400">{boostEffect.color}</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {([{ key: 'length', label: '拖尾长度' }, { key: 'width', label: '效果粗细' }] as const).map(opt => (
                      <label key={opt.key} className="text-sm text-slate-300">
                        <span className="flex justify-between mb-2">{opt.label}<span>{Math.round(boostEffect[opt.key] * 100)}%</span></span>
                        <input type="range" aria-label={opt.label} min="0.6" max="1.6" step="0.1"
                          value={boostEffect[opt.key]} onChange={e => updateBoost({ [opt.key]: Number(e.target.value) })}
                          className="w-full accent-cyan-400" />
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={boostEffect.style === 'BUBBLES' || boostEffect.bubbles} aria-label="附加气泡" disabled={boostEffect.style === 'BUBBLES' || boostEffect.style === 'NONE'}
                      onChange={e => updateBoost({ bubbles: e.target.checked })} className="accent-cyan-400" />
                    附加气泡
                    {boostEffect.style === 'BUBBLES' && <span className="text-xs text-slate-500">啵啵模式自带小气泡</span>}
                  </label>
                  <button onClick={() => updateCosmetics('boostEffect', { ...DEFAULT_BOOST_EFFECT })}
                    className="text-xs text-cyan-300 hover:text-white flex items-center gap-1.5"><RotateCcw size={13} />恢复默认加速效果</button>
                </div>
              )}
              {activeTab === 'color' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle icon={<Palette size={16} />}>皮肤颜色</SectionTitle>
                    <div className="grid grid-cols-6 gap-2">
                      {SKIN_COLOR_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.skinColor === opt.value}
                          onClick={() => updateCosmetics('skinColor', opt.value)}
                          label={opt.label}
                          testKey="skinColor"
                          testValue={opt.value}
                        >
                          {thumb('skinColor', opt.value)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={<Sparkles size={16} />}>牙齿类型</SectionTitle>
                    <div className="grid grid-cols-4 gap-2">
                      {TEETH_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.teeth === opt.value}
                          onClick={() => updateCosmetics('teeth', opt.value)}
                          label={opt.label}
                          testKey="teeth"
                          testValue={opt.value}
                        >
                          {thumb('teeth', opt.value)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'pattern' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle icon={<Sparkles size={16} />}>花纹图案</SectionTitle>
                    <div className="grid grid-cols-5 gap-2">
                      {PATTERN_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.pattern === opt.value}
                          onClick={() => updateCosmetics('pattern', opt.value)}
                          label={opt.label}
                          testKey="pattern"
                          testValue={opt.value}
                        >
                          {thumb('pattern', opt.value)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={<Sparkles size={16} />}>鳞片效果</SectionTitle>
                    <div className="grid grid-cols-4 gap-2">
                      {SCALE_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.scaleType === opt.value}
                          onClick={() => updateCosmetics('scaleType', opt.value)}
                          label={opt.label}
                          testKey="scaleType"
                          testValue={opt.value}
                        >
                          {thumb('scaleType', opt.value)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'face' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle icon={<Smile size={16} />}>嘴型</SectionTitle>
                    <div className="grid grid-cols-3 gap-2">
                      {MOUTH_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.mouthType === opt.value}
                          onClick={() => updateCosmetics('mouthType', opt.value)}
                          label={opt.label}
                          testKey="mouthType"
                          testValue={opt.value}
                        >
                          {thumb('mouthType', opt.value, 58)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={<Sparkles size={16} />}>眉毛</SectionTitle>
                    <div className="grid grid-cols-4 gap-2">
                      {EYEBROW_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.eyebrowType === opt.value}
                          onClick={() => updateCosmetics('eyebrowType', opt.value)}
                          label={opt.label}
                          testKey="eyebrowType"
                          testValue={opt.value}
                        >
                          {thumb('eyebrowType', opt.value, 58)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'body' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle icon={<Fish size={16} />}>体型</SectionTitle>
                    <div className="grid grid-cols-4 gap-2">
                      {BODY_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.bodyType === opt.value}
                          onClick={() => updateCosmetics('bodyType', opt.value)}
                          label={opt.label}
                          testKey="bodyType"
                          testValue={opt.value}
                        >
                          {thumb('bodyType', opt.value, 58)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={<Fish size={16} />}>尾巴</SectionTitle>
                    <div className="grid grid-cols-5 gap-2">
                      {TAIL_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.tailType === opt.value}
                          onClick={() => updateCosmetics('tailType', opt.value)}
                          label={opt.label}
                          testKey="tailType"
                          testValue={opt.value}
                        >
                          {thumb('tailType', opt.value, 58)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={<Sparkles size={16} />}>拖尾特效</SectionTitle>
                    <div className="grid grid-cols-4 gap-2">
                      {TRAIL_OPTIONS.map((opt) => (
                        <OptionButton
                          key={opt.value}
                          selected={cosmetics.trailType === opt.value}
                          onClick={() => updateCosmetics('trailType', opt.value)}
                          label={opt.label}
                          testKey="trailType"
                          testValue={opt.value}
                        >
                          {thumb('trailType', opt.value, 58)}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'accessory' && (
                <div>
                  <SectionTitle icon={<Crown size={16} />}>配饰选择</SectionTitle>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCESSORY_OPTIONS.map((opt) => (
                      <OptionButton
                        key={opt.value}
                        selected={cosmetics.accessory === opt.value}
                        onClick={() => updateCosmetics('accessory', opt.value)}
                        label={`${opt.icon ?? ''} ${opt.label}`.trim()}
                        testKey="accessory"
                        testValue={opt.value}
                      >
                        {thumb('accessory', opt.value, 58)}
                      </OptionButton>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'eyes' && (
                <div>
                  <SectionTitle icon={<EyeIcon size={16} />}>眼睛类型</SectionTitle>
                  <div className="grid grid-cols-4 gap-2">
                    {EYE_OPTIONS.map((opt) => (
                      <OptionButton
                        key={opt.value}
                        selected={cosmetics.eyeType === opt.value}
                        onClick={() => updateCosmetics('eyeType', opt.value)}
                        label={opt.label}
                        testKey="eyeType"
                        testValue={opt.value}
                      >
                        {thumb('eyeType', opt.value, 58)}
                      </OptionButton>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'ai-presets' && (
                <div className="space-y-3">
                  <SectionTitle icon={<Sparkles size={16} />}>萌萌套装 · 一键穿上</SectionTitle>
                  <div className="grid grid-cols-2 gap-3">
                    {AI_COSMETICS_PRESETS.map((preset) => {
                      const applied = (Object.keys(preset.cosmetics) as (keyof Cosmetics)[])
                        .every(key => key === 'boostEffect' || cosmetics[key] === preset.cosmetics[key]);
                      return (
                        <button
                          key={preset.name}
                          data-cosmetic-key="preset"
                          data-cosmetic-value={preset.name}
                          aria-pressed={applied}
                          onClick={() => onChange({ ...preset.cosmetics, boostEffect: cosmetics.boostEffect })}
                          className={`flex items-center gap-3 p-2 rounded-xl border-2 text-left transition-all ${
                            applied
                              ? 'border-cyan-400 bg-cyan-900/40'
                              : 'border-slate-700 bg-slate-800 hover:border-cyan-400/60 hover:bg-cyan-900/20'
                          }`}
                        >
                          <FishPreview type={fishType} cosmetics={preset.cosmetics} size={64} />
                          <div className="min-w-0">
                            <div className="text-white font-bold text-sm truncate">{preset.name}</div>
                            <div className="text-slate-400 text-[11px] leading-relaxed">
                              {preset.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* 底部操作栏 */}
        <div className="bg-slate-800 px-6 py-3 flex justify-between items-center border-t border-slate-700 shrink-0">
          <button
            onClick={() => onChange({ ...DEFAULT_COSMETICS })}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all flex items-center gap-2"
          >
            <RotateCcw size={16} /> 重置
          </button>
          <button
            onClick={onClose}
            className="wardrobe-done px-8 py-2 text-white rounded-xl font-bold transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
    </FishPreviewContext.Provider>
  );
};

export default CosmeticsPanel;
