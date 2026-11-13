import { X } from 'lucide-react';
import { BLOCK_DEFS, BlockType, PLACEABLE_BLOCKS } from '../engine/blocks';

interface BlockPaletteModalProps {
  open: boolean;
  onClose: () => void;
  blockIcons: Map<BlockType, string>;
  activeBlock: BlockType;
  onPickBlock: (block: BlockType) => void;
}

export function BlockPaletteModal({
  open,
  onClose,
  blockIcons,
  activeBlock,
  onPickBlock,
}: BlockPaletteModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 p-5 bg-[#0b101b] border border-white/15 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Creative Block Inventory</h2>
            <p className="text-xs text-slate-400">
              Select a block to equip it into your active hotbar slot
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10 cursor-pointer"
            aria-label="Close inventory"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5 pt-4">
          {PLACEABLE_BLOCKS.map((bt) => {
            const def = BLOCK_DEFS[bt];
            const icon = blockIcons.get(bt);
            const selected = bt === activeBlock;
            return (
              <button
                key={bt}
                type="button"
                onClick={() => {
                  onPickBlock(bt);
                  onClose();
                }}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded border text-center transition-colors cursor-pointer ${
                  selected
                    ? 'bg-amber-400/15 border-amber-400 text-amber-200'
                    : 'bg-slate-900/80 border-white/10 text-slate-200 hover:bg-slate-800 hover:border-white/25'
                }`}
              >
                {icon && (
                  <img
                    src={icon}
                    alt={def.name}
                    className="w-10 h-10 object-contain pointer-events-none"
                    draggable={false}
                  />
                )}
                <span className="text-[11px] font-medium leading-tight truncate w-full">
                  {def.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
