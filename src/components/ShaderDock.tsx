import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Grid,
  RefreshCw,
  Sun,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { SHADER_PRESETS, ShaderPresetId, ShaderSettings } from '../engine/shaders';

interface ShaderDockProps {
  open: boolean;
  onToggleOpen: () => void;
  settings: ShaderSettings;
  onChangeSettings: (next: ShaderSettings) => void;
  flyMode: boolean;
  onToggleFly: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onOpenPalette: () => void;
  onRespawn: () => void;
  onNewWorld: () => void;
}

const PRESET_ORDER: ShaderPresetId[] = ['complementary', 'seus', 'arcane', 'vanillaplus'];

export function ShaderDock({
  open,
  onToggleOpen,
  settings,
  onChangeSettings,
  flyMode,
  onToggleFly,
  muted,
  onToggleMute,
  onOpenPalette,
  onRespawn,
  onNewWorld,
}: ShaderDockProps) {
  const applyPreset = (id: ShaderPresetId) => {
    const p = SHADER_PRESETS[id];
    onChangeSettings({
      ...settings,
      preset: id,
      timeOfDay: p.defaultTime,
      bloomStrength: p.bloomStrength,
      godRays: p.godRays,
    });
  };

  return (
    <div className="flex flex-col items-center w-full max-w-[820px] pointer-events-auto">
      {/* Compact Action Strip + Collapse Toggle */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0b101b]/90 border border-white/12 rounded-t-md border-b-0">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span>Shader Studio (H)</span>
        </button>

        <span className="h-3.5 w-px bg-white/12" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-200 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          title="Open Block Inventory (B)"
        >
          <Grid className="w-3.5 h-3.5 text-slate-400" />
          <span>Blocks (B)</span>
        </button>

        <button
          type="button"
          onClick={onToggleFly}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs whitespace-nowrap shrink-0 rounded cursor-pointer ${
            flyMode ? 'bg-amber-400/20 text-amber-300' : 'text-slate-300 hover:text-white'
          }`}
          title="Toggle Fly Mode (F)"
        >
          <Wind className="w-3.5 h-3.5" />
          <span>{flyMode ? 'Fly: On (F)' : 'Fly (F)'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5 text-slate-400" /> : <Volume2 className="w-3.5 h-3.5 text-slate-300" />}
        </button>
      </div>

      {/* Expandable Shader Studio Drawer */}
      {open && (
        <div className="w-full px-4 py-3.5 bg-[#0b101b]/95 border border-white/15 rounded-lg shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
            {/* Shader Presets */}
            <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-md border border-white/10">
              {PRESET_ORDER.map((id) => {
                const p = SHADER_PRESETS[id];
                const active = settings.preset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Weather & World Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeSettings({
                    ...settings,
                    weather: settings.weather === 'clear' ? 'rain' : 'clear',
                  })
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.weather === 'rain'
                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                    : 'bg-slate-900/80 border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {settings.weather === 'rain' ? (
                  <CloudRain className="w-3.5 h-3.5 text-sky-300" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>{settings.weather === 'rain' ? 'Rain & Puddles' : 'Clear Sky'}</span>
              </button>

              <button
                type="button"
                onClick={onRespawn}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900/80 border border-white/10 rounded whitespace-nowrap shrink-0 cursor-pointer"
                title="Return to Shrine Overlook"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Spawn</span>
              </button>

              <button
                type="button"
                onClick={onNewWorld}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900/80 border border-white/10 rounded whitespace-nowrap shrink-0 cursor-pointer"
                title="Generate New Seed World"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>New Seed</span>
              </button>
            </div>
          </div>

          {/* Sliders Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3">
            {/* Time of Day */}
            <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Sun Elevation</span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeSettings({ ...settings, autoTimeCycle: !settings.autoTimeCycle })
                  }
                  className={`text-[11px] font-medium cursor-pointer ${
                    settings.autoTimeCycle ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {settings.autoTimeCycle ? 'Auto: On' : 'Manual'}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={settings.timeOfDay}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    autoTimeCycle: false,
                    timeOfDay: Number(e.target.value),
                  })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* Volumetric God Rays */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Sun Shafts</span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {Math.round(settings.godRays * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={settings.godRays}
                onChange={(e) =>
                  onChangeSettings({ ...settings, godRays: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* HDR Bloom */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">HDR Bloom</span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {Math.round(settings.bloomStrength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.05}
                value={settings.bloomStrength}
                onChange={(e) =>
                  onChangeSettings({ ...settings, bloomStrength: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* Water Caustics & Ripples */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Water Caustics</span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {Math.round(settings.waterQuality * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={settings.waterQuality}
                onChange={(e) =>
                  onChangeSettings({ ...settings, waterQuality: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* Atmospheric Fog */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Atmosphere Haze</span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {Math.round((settings.fogDensity / 0.022) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.002}
                max={0.022}
                step={0.001}
                value={settings.fogDensity}
                onChange={(e) =>
                  onChangeSettings({ ...settings, fogDensity: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
