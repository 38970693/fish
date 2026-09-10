/**
 * 装扮定制面板组件
 * 允许玩家自定义自己鱼的外观
 */

import React, { useState } from 'react';
import { Cosmetics, TeethType, PatternType, ScaleType, AccessoryType, TailType, BodyType, MouthType, EyeType, EyebrowType, TrailType } from '../types';
import { Sparkles, Palette, Crown, Eye as EyeIcon, Heart, Zap } from 'lucide-react';

interface CosmeticsPanelProps {
  cosmetics: Cosmetics;
  onChange: (cosmetics: Cosmetics) => void;
  onClose: () => void;
  mode?: 'player' | 'ai-fish';
  onModeChange?: (mode: 'player' | 'ai-fish') => void;
}

// 默认装扮配置
const DEFAULT_COSMETICS: Cosmetics = {
  teeth: 'NORMAL', skinColor: '#3b82f6', pattern: 'NONE', scaleType: 'NONE', accessory: 'NONE',
  tailType: 'DEFAULT', bodyType: 'DEFAULT', mouthType: 'TRIANGLE', eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE'
};

// AI鱼专属装扮 - 酷炫预设
const AI_COSMETICS_PRESETS: { name: string; cosmetics: Cosmetics }[] = [
  { name: '🦈 鲨鱼', cosmetics: { teeth: 'SHARP', skinColor: '#64748b', pattern: 'NONE', scaleType: 'SHINY', accessory: 'NONE', tailType: 'FORKED', bodyType: 'SLENDER', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'ANGRY', trailType: 'BUBBLES' }},
  { name: '👑 国王', cosmetics: { teeth: 'GOLD', skinColor: '#fbbf24', pattern: 'NONE', scaleType: 'SHINY', accessory: 'CROWN', tailType: 'FORKED', bodyType: 'CHUNKY', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'THICK', trailType: 'RAINBOW' }},
  { name: '🤖 机械', cosmetics: { teeth: 'DIAMOND', skinColor: '#374151', pattern: 'CIRCUIT', scaleType: 'MECHANICAL', accessory: 'SUNGLASSES', tailType: 'MECHANICAL', bodyType: 'BOX', mouthType: 'SQUARE', eyeType: 'CYBORG', eyebrowType: 'NONE', trailType: 'ELECTRIC' }},
  { name: '🐉 神龙', cosmetics: { teeth: 'SABER', skinColor: '#dc2626', pattern: 'LAVA', scaleType: 'DRAGON', accessory: 'NONE', tailType: 'TRIDENT', bodyType: 'SLENDER', mouthType: 'CURVE', eyeType: 'FIRE', eyebrowType: 'UNI', trailType: 'FIRE' }},
  { name: '🧜 美人鱼', cosmetics: { teeth: 'NORMAL', skinColor: '#06b6d4', pattern: 'SPOTS', scaleType: 'GLOW', accessory: 'FLOWER', tailType: 'RIBBON', bodyType: 'MERMAID', mouthType: 'CIRCLE', eyeType: 'LOVE', eyebrowType: 'NONE', trailType: 'BUBBLES' }},
  { name: '🌀 星空', cosmetics: { teeth: 'DIAMOND', skinColor: '#4c1d95', pattern: 'GALAXY', scaleType: 'CRYSTAL', accessory: 'HALO', tailType: 'RIBBON', bodyType: 'SLENDER', mouthType: 'CIRCLE', eyeType: 'ANIME', eyebrowType: 'NONE', trailType: 'GLITTER' }},
  { name: '🌸 樱花', cosmetics: { teeth: 'NORMAL', skinColor: '#f472b6', pattern: 'HEART', scaleType: 'GLOW', accessory: 'FLOWER', tailType: 'FAN', bodyType: 'ROUND', mouthType: 'CIRCLE', eyeType: 'LOVE', eyebrowType: 'NONE', trailType: 'HEARTS' }},
  { name: '⚡ 电光', cosmetics: { teeth: 'SHARP', skinColor: '#facc15', pattern: 'STRIPES', scaleType: 'GLOW', accessory: 'SUNGLASSES', tailType: 'FORKED', bodyType: 'SLENDER', mouthType: 'SQUARE', eyeType: 'MAD', eyebrowType: 'ANGRY', trailType: 'ELECTRIC' }},
];

// 预定义选项
const TEETH_OPTIONS: { value: TeethType; label: string; color: string }[] = [
  { value: 'NORMAL', label: '普通', color: '#ffffff' },
  { value: 'SHARP', label: '锐齿', color: '#ef4444' },
  { value: 'VAMPIRE', label: '吸血鬼', color: '#7f1d1d' },
  { value: 'GOLD', label: '金牙', color: '#fbbf24' },
  { value: 'SABER', label: '军刀', color: '#94a3b8' },
  { value: 'DOUBLE_ROW', label: '双排', color: '#fde047' },
  { value: 'DIAMOND', label: '钻石', color: '#e0f2fe' },
  { value: 'RAINBOW', label: '彩虹', color: '#f472b6' },
];

const SKIN_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#a855f7', '#f43f5e',
  '#14b8a6', '#84cc16', '#fb923c', '#f472b6', '#c084fc'
];

const PATTERN_OPTIONS: { value: PatternType; label: string }[] = [
  { value: 'NONE', label: '无' },
  { value: 'STRIPES', label: '条纹' },
  { value: 'SPOTS', label: '斑点' },
  { value: 'TIGER', label: '虎纹' },
  { value: 'ZEBRA', label: '斑马纹' },
  { value: 'STAR', label: '星星' },
  { value: 'GALAXY', label: '星系' },
  { value: 'LAVA', label: '熔岩' },
  { value: 'HEART', label: '爱心' },
  { value: 'CLOUD', label: '云朵' },
];

const ACCESSORY_OPTIONS: { value: AccessoryType; label: string; icon: string }[] = [
  { value: 'NONE', label: '无', icon: '❌' },
  { value: 'CROWN', label: '皇冠', icon: '👑' },
  { value: 'SUNGLASSES', label: '墨镜', icon: '🕶️' },
  { value: 'FLOWER', label: '花朵', icon: '🌸' },
  { value: 'HALO', label: '光环', icon: '👼' },
  { value: 'EYEPATCH', label: '眼罩', icon: '🏴‍☠️' },
  { value: 'BOW_TIE', label: '领结', icon: '🎀' },
  { value: 'GOLD_CHAIN', label: '金链', icon: '📿' },
];

const EYE_OPTIONS: { value: EyeType; label: string }[] = [
  { value: 'NORMAL', label: '普通' },
  { value: 'ANIME', label: '动漫' },
  { value: 'MAD', label: '愤怒' },
  { value: 'CAT', label: '猫眼' },
  { value: 'FIRE', label: '火焰' },
  { value: 'CYBORG', label: '机械' },
  { value: 'LOVE', label: '爱心' },
  { value: 'DEAD', label: '死亡' },
];

const SCALE_OPTIONS: { value: ScaleType; label: string }[] = [
  { value: 'NONE', label: '无' },
  { value: 'SHINY', label: '闪亮' },
  { value: 'GLOW', label: '发光' },
  { value: 'CRYSTAL', label: '水晶' },
  { value: 'DRAGON', label: '龙鳞' },
  { value: 'ARMOR', label: '盔甲' },
  { value: 'MECHANICAL', label: '机械' },
];

const CosmeticsPanel: React.FC<CosmeticsPanelProps> = ({ cosmetics, onChange, onClose, mode = 'player', onModeChange }) => {
  const [activeTab, setActiveTab] = useState<'color' | 'pattern' | 'accessory' | 'eyes' | 'ai-presets'>('color');

  const updateCosmetics = (key: keyof Cosmetics, value: any) => {
    onChange({ ...cosmetics, [key]: value });
  };

  const applyAIPresets = (preset: Cosmetics) => {
    onChange(preset);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center">
      <div className="bg-slate-900 rounded-3xl border-2 border-cyan-500 shadow-2xl w-[600px] max-h-[80vh] overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Sparkles className="text-white" size={24} />
            <h2 className="text-2xl font-black text-white">装扮定制</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* 模式切换 */}
        <div className="px-4 pt-3 flex gap-2">
          <button
            onClick={() => onModeChange?.('player')}
            className={`flex-1 py-2 px-4 rounded-xl font-bold transition-all ${
              mode === 'player' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🐟 玩家装扮
          </button>
          <button
            onClick={() => onModeChange?.('ai-fish')}
            className={`flex-1 py-2 px-4 rounded-xl font-bold transition-all ${
              mode === 'ai-fish' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🤖 AI鱼装扮
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-slate-700">
          {[
            { key: 'color' as const, label: '颜色', icon: <Palette size={16} /> },
            { key: 'pattern' as const, label: '花纹', icon: <Sparkles size={16} /> },
            { key: 'accessory' as const, label: '配饰', icon: <Crown size={16} /> },
            { key: 'eyes' as const, label: '眼睛', icon: <EyeIcon size={16} /> },
            { key: 'ai-presets' as const, label: 'AI预设', icon: <Sparkles size={16} /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* AI预设标签页 */}
          {activeTab === 'ai-presets' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                <Sparkles size={20} /> AI鱼酷炫预设 - 选择一个应用
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {AI_COSMETICS_PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => applyAIPresets(preset.cosmetics)}
                    className="p-4 rounded-xl border-2 border-slate-700 bg-slate-800 hover:border-cyan-400 hover:bg-cyan-900/30 transition-all text-left"
                  >
                    <div className="text-white font-bold text-lg">{preset.name}</div>
                    <div className="text-slate-400 text-xs mt-1">
                      牙齿:{preset.cosmetics.teeth} | 眼睛:{preset.cosmetics.eyeType}
                    </div>
                    <div className="text-slate-500 text-xs">
                      花纹:{preset.cosmetics.pattern} | 鳞片:{preset.cosmetics.scaleType}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 颜色标签页 */}
          {activeTab === 'color' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                  <Palette size={20} /> 皮肤颜色
                </h3>
                <div className="grid grid-cols-5 gap-3">
                  {SKIN_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => updateCosmetics('skinColor', color)}
                      className={`w-14 h-14 rounded-xl transition-all ${
                        cosmetics.skinColor === color
                          ? 'ring-4 ring-white scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                  <Sparkles size={20} /> 牙齿类型
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {TEETH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateCosmetics('teeth', opt.value)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        cosmetics.teeth === opt.value
                          ? 'border-cyan-400 bg-cyan-900/50'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div
                        className="w-6 h-6 rounded mx-auto mb-1"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="text-xs text-white">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 花纹标签页 */}
          {activeTab === 'pattern' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                  <Sparkles size={20} /> 花纹图案
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {PATTERN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateCosmetics('pattern', opt.value)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        cosmetics.pattern === opt.value
                          ? 'border-cyan-400 bg-cyan-900/50'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-white font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                  <Sparkles size={20} /> 鳞片效果
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {SCALE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateCosmetics('scaleType', opt.value)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        cosmetics.scaleType === opt.value
                          ? 'border-cyan-400 bg-cyan-900/50'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-xs text-white">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 配饰标签页 */}
          {activeTab === 'accessory' && (
            <div>
              <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <Crown size={20} /> 配饰选择
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {ACCESSORY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateCosmetics('accessory', opt.value)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      cosmetics.accessory === opt.value
                        ? 'border-cyan-400 bg-cyan-900/50'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <span className="block text-xs text-white mt-1">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 眼睛标签页 */}
          {activeTab === 'eyes' && (
            <div>
              <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <EyeIcon size={20} /> 眼睛类型
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {EYE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateCosmetics('eyeType', opt.value)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      cosmetics.eyeType === opt.value
                        ? 'border-cyan-400 bg-cyan-900/50'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-white font-bold text-sm">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center border-t border-slate-700">
          <button
            onClick={() => {
              // 重置为默认装扮
              onChange(DEFAULT_COSMETICS);
            }}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
          >
            重置
          </button>
          <button
            onClick={onClose}
            className="px-8 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default CosmeticsPanel;
