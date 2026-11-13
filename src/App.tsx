import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockPaletteModal } from './components/BlockPaletteModal';
import { Hotbar } from './components/Hotbar';
import { ShaderDock } from './components/ShaderDock';
import { voxelAudio } from './engine/audio';
import { BlockType, DEFAULT_HOTBAR } from './engine/blocks';
import { SHADER_PRESETS, ShaderPresetId, ShaderSettings } from './engine/shaders';
import { EngineSnapshot, VoxelEngine } from './engine/VoxelEngine';

const INITIAL_SHADER_SETTINGS: ShaderSettings = {
  preset: 'complementary',
  timeOfDay: SHADER_PRESETS.complementary.defaultTime,
  autoTimeCycle: false,
  godRays: SHADER_PRESETS.complementary.godRays,
  bloomStrength: SHADER_PRESETS.complementary.bloomStrength,
  waterQuality: 1.1,
  weather: 'clear',
  fogDensity: 0.0075,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  const [hotbarSlots, setHotbarSlots] = useState<BlockType[]>(DEFAULT_HOTBAR);
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [blockIcons, setBlockIcons] = useState<Map<BlockType, string>>(() => new Map());
  const [shaderSettings, setShaderSettings] = useState<ShaderSettings>(INITIAL_SHADER_SETTINGS);
  const [dockOpen, setDockOpen] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  const [snapshot, setSnapshot] = useState<EngineSnapshot>({
    x: 64,
    y: 25,
    z: 67,
    flyMode: false,
    isLocked: false,
    targetBlockName: null,
    underwater: false,
    timeLabel: 'Daylight',
  });

  // Mount Three.js VoxelEngine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new VoxelEngine(
      mount,
      INITIAL_SHADER_SETTINGS,
      (snap) => setSnapshot(snap),
      () => setContextLost(true)
    );
    engineRef.current = engine;
    setBlockIcons(new Map(engine.blockIcons));
    engine.setSelectedBlock(DEFAULT_HOTBAR[0]);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync active block with engine
  useEffect(() => {
    const block = hotbarSlots[activeSlot];
    if (block !== undefined) {
      engineRef.current?.setSelectedBlock(block);
    }
  }, [hotbarSlots, activeSlot]);

  // Sync shader settings with engine
  const handleChangeSettings = useCallback((next: ShaderSettings) => {
    setShaderSettings(next);
    engineRef.current?.applySettings(next);
  }, []);

  // Keyboard shortcuts for hotbar (1-9), Shader Studio (H), Inventory (B), Preset Cycle (V)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code.startsWith('Digit')) {
        const digit = Number(e.code.replace('Digit', ''));
        if (digit >= 1 && digit <= 9) {
          setActiveSlot(digit - 1);
        }
      } else if (e.code === 'KeyH' && !e.repeat) {
        setDockOpen((prev) => !prev);
      } else if (e.code === 'KeyB' && !e.repeat) {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        setPaletteOpen((prev) => !prev);
      } else if (e.code === 'KeyV' && !e.repeat) {
        const order: ShaderPresetId[] = ['complementary', 'seus', 'arcane', 'vanillaplus'];
        setShaderSettings((prev) => {
          const nextId = order[(order.indexOf(prev.preset) + 1) % order.length];
          const p = SHADER_PRESETS[nextId];
          const next: ShaderSettings = {
            ...prev,
            preset: nextId,
            timeOfDay: p.defaultTime,
            bloomStrength: p.bloomStrength,
            godRays: p.godRays,
          };
          engineRef.current?.applySettings(next);
          return next;
        });
      } else if (e.code === 'Escape') {
        setPaletteOpen(false);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (paletteOpen) return;
      if (Math.abs(e.deltaY) < 4) return;
      setActiveSlot((prev) => (e.deltaY > 0 ? (prev + 1) % 9 : (prev + 8) % 9));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [paletteOpen]);

  const handlePickBlock = (bt: BlockType) => {
    const existingIdx = hotbarSlots.indexOf(bt);
    if (existingIdx !== -1) {
      setActiveSlot(existingIdx);
      return;
    }
    setHotbarSlots((prev) => {
      const copy = [...prev];
      copy[activeSlot] = bt;
      return copy;
    });
  };

  const handleToggleMute = () => {
    voxelAudio.muted = !voxelAudio.muted;
    setMuted(voxelAudio.muted);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/95 text-center p-6">
          <h1 className="text-xl font-semibold text-white">Graphics Context Interrupted</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-md">
            Your browser temporarily reset the WebGL context. Reload the page to restore the 3D voxel shader world.
          </p>
        </div>
      )}

      {/* Semantic HUD Overlay (Zero backdrop-blur, zero pills, zero viewport occlusion) */}
      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4">
        {/* Top Row: Minimal Unboxed Brand + Live Spatial Readout */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-0.5 px-3 py-2 bg-[#0b101b]/78 border border-white/10 rounded-md">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
              <span>PrismCraft</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-xs font-normal text-amber-300">
                {SHADER_PRESETS[shaderSettings.preset].label}
              </span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-xs font-normal text-slate-300">{snapshot.timeLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-slate-300">
              <span>X {snapshot.x}</span>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span>Y {snapshot.y}</span>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span>Z {snapshot.z}</span>
              {snapshot.flyMode && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-amber-300">Flying</span>
                </>
              )}
              {snapshot.targetBlockName && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-cyan-300">{snapshot.targetBlockName}</span>
                </>
              )}
            </div>
          </div>

          {/* Discreet Control Legend (Top-Right) */}
          <div className="hidden sm:flex flex-col items-end gap-1 px-3 py-2 bg-[#0b101b]/75 border border-white/10 rounded-md text-[11px] text-slate-300">
            <div className="flex items-center gap-2">
              <span>{snapshot.isLocked ? 'ESC Unlock Cursor' : 'Click View to Lock Look'}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>WASD Move</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>Space Jump / 2x Fly</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span>LMB / Q Mine</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>RMB / E Place</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>V Next Shader</span>
            </div>
          </div>
        </div>

        {/* Center Pixel Crosshair */}
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-5 h-5 flex items-center justify-center">
            <div
              className={`absolute w-4 h-0.5 transition-colors ${
                snapshot.targetBlockName ? 'bg-amber-300' : 'bg-white/85'
              }`}
            />
            <div
              className={`absolute w-0.5 h-4 transition-colors ${
                snapshot.targetBlockName ? 'bg-amber-300' : 'bg-white/85'
              }`}
            />
          </div>
        </div>

        {/* Bottom Dock: Hotbar + Collapsible Shader Studio */}
        <div className="flex flex-col items-center gap-2.5 pb-1">
          <Hotbar
            slots={hotbarSlots}
            activeIndex={activeSlot}
            blockIcons={blockIcons}
            onSelectSlot={setActiveSlot}
          />
          <ShaderDock
            open={dockOpen}
            onToggleOpen={() => setDockOpen((prev) => !prev)}
            settings={shaderSettings}
            onChangeSettings={handleChangeSettings}
            flyMode={snapshot.flyMode}
            onToggleFly={() => engineRef.current?.toggleFlyMode()}
            muted={muted}
            onToggleMute={handleToggleMute}
            onOpenPalette={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              setPaletteOpen(true);
            }}
            onRespawn={() => engineRef.current?.resetToSpawn()}
            onNewWorld={() => engineRef.current?.regenerateWorld()}
          />
        </div>
      </div>

      {/* Creative Block Inventory Modal */}
      <BlockPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        blockIcons={blockIcons}
        activeBlock={hotbarSlots[activeSlot]}
        onPickBlock={handlePickBlock}
      />
    </div>
  );
}
