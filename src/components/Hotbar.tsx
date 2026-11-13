import { BLOCK_DEFS, BlockType } from '../engine/blocks';

interface HotbarProps {
  slots: BlockType[];
  activeIndex: number;
  blockIcons: Map<BlockType, string>;
  onSelectSlot: (idx: number) => void;
}

export function Hotbar({ slots, activeIndex, blockIcons, onSelectSlot }: HotbarProps) {
  const activeBlock = slots[activeIndex];
  const activeName = BLOCK_DEFS[activeBlock]?.name ?? '';

  return (
    <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
      <div className="text-xs font-medium tracking-wide text-slate-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {activeName}
      </div>
      <div className="flex items-center gap-1 p-1 bg-[#0b101b]/92 border border-white/15 rounded-md shadow-xl">
        {slots.map((blockType, idx) => {
          const isActive = idx === activeIndex;
          const icon = blockIcons.get(blockType);
          const def = BLOCK_DEFS[blockType];
          return (
            <button
              key={`${idx}-${blockType}`}
              type="button"
              onClick={() => onSelectSlot(idx)}
              title={`${idx + 1}. ${def?.name ?? 'Block'}`}
              className={`relative w-11 h-11 flex items-center justify-center rounded transition-transform duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                isActive
                  ? 'bg-amber-400/20 border-2 border-amber-400 -translate-y-0.5'
                  : 'bg-slate-900/80 border border-white/10 hover:bg-slate-800/90'
              }`}
            >
              <span className="absolute top-0.5 left-1 text-[10px] leading-none font-mono-tabular text-slate-400">
                {idx + 1}
              </span>
              {icon ? (
                <img
                  src={icon}
                  alt={def?.name ?? 'Block'}
                  className="w-8 h-8 object-contain pointer-events-none"
                  draggable={false}
                />
              ) : (
                <span
                  className="w-6 h-6 rounded-sm"
                  style={{ backgroundColor: def?.particleColor ?? '#64748b' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
