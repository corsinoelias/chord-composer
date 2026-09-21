import { memo } from 'react';
import { LayoutGrid, Plus, SlidersHorizontal } from 'lucide-react';
import { StyleSelector } from './StyleSelector';
import { type StylePattern } from '@/lib/styles';

interface SoundCardProps {
  selectedStyleId: string;
  customStyles: StylePattern[];
  onStyleChange: (styleId: string) => void;
  onOpenInstruments: () => void;
  onOpenRhythmEditor: () => void;
  onCreateNewRhythm?: () => void;
  /** How many sections play something other than the song's rhythm. */
  sectionsWithOwnRhythm: number;
  /** Clears every section's own rhythm so the whole song plays the one above. */
  onApplyToAll: () => void;
  className?: string;
  /** Off where the style capsule already sits in the header, as in the Android app. */
  showStyleSelector?: boolean;
}

/**
 * The lower card of the right rail: which rhythm the song plays, who plays it, and the
 * way in to editing it. On mobile the same three actions sit in the header instead.
 */
export const SoundCard = memo(function SoundCard({
  selectedStyleId,
  customStyles,
  onStyleChange,
  onOpenInstruments,
  onOpenRhythmEditor,
  onCreateNewRhythm,
  sectionsWithOwnRhythm,
  onApplyToAll,
  className = '',
  showStyleSelector = true,
}: SoundCardProps) {
  const tile = 'cp-btn flex-col justify-center gap-2 text-xs';
  const tileStyle = {
    height: 76,
    borderColor: 'var(--cp-ln)',
    background: 'var(--cp-s2)',
  } as const;

  return (
    <section
      className={`cp-card flex flex-col gap-3.5 px-4 pb-4 pt-4 lg:px-[18px] lg:pb-[18px] ${className}`}
      aria-label="Sound"
    >
      <span className="cp-lbl">Sound</span>

      {showStyleSelector && (
      <div data-tour="style-selector">
        <StyleSelector
          selectedStyleId={selectedStyleId}
          onStyleChange={onStyleChange}
          customStyles={customStyles}
          onCreateNew={onCreateNewRhythm}
          variant="card"
        />
      </div>
      )}

      {/* Only appears once a section actually diverges — otherwise there is nothing to
          apply and the row would just be noise. */}
      {sectionsWithOwnRhythm > 0 && (
        <div className="-mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--cp-mu)' }}>
          <i
            className="mx-0.5 shrink-0"
            style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--cp-ac)', transform: 'rotate(45deg)' }}
            aria-hidden="true"
          />
          <span className="flex-grow">
            {sectionsWithOwnRhythm} section{sectionsWithOwnRhythm === 1 ? '' : 's'} {sectionsWithOwnRhythm === 1 ? 'has' : 'have'} their own rhythm
          </span>
          <button
            className="cp-btn cp-gh"
            style={{ height: 28, padding: '0 8px', fontSize: 12, color: 'var(--cp-act)' }}
            onClick={onApplyToAll}
          >
            Apply to all
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button className={tile} style={tileStyle} onClick={onOpenInstruments}>
          <SlidersHorizontal size={18} style={{ color: 'var(--cp-act)' }} />
          Instruments
        </button>
        <button className={tile} style={tileStyle} onClick={onOpenRhythmEditor}>
          <LayoutGrid size={18} style={{ color: 'var(--cp-act)' }} />
          Edit Rhythm
        </button>
        {onCreateNewRhythm && (
          <button className={tile} style={tileStyle} onClick={onCreateNewRhythm}>
            <Plus size={18} style={{ color: 'var(--cp-act)' }} />
            New
          </button>
        )}
      </div>
    </section>
  );
});
