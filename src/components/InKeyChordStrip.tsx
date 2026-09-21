import { useMemo } from 'react';
import { getDiatonicChords } from '@/lib/musicKeys';
import { type RootNote, type Accidental, type ChordQuality } from '@/lib/musicTheory';

// Parse simple diatonic chord strings ("Am", "Bdim", "F#") into component parts
function parseDiatonic(str: string): { root: RootNote; acc: Accidental; qual: ChordQuality } | null {
  const m = str.match(/^([A-G])([#b]?)(m|dim)?$/);
  if (!m) return null;
  const qual: ChordQuality = m[3] === 'dim' ? 'dim' : m[3] === 'm' ? 'min' : 'maj';
  return { root: m[1] as RootNote, acc: (m[2] ?? '') as Accidental, qual };
}

interface InKeyChordStripProps {
  /** Key name as spelled in ALL_KEYS ("C", "Bb", "F#m"). Nothing renders without one. */
  songKey?: string;
  root: RootNote;
  accidental: Accidental;
  quality: ChordQuality;
  onPick: (root: RootNote, accidental: Accidental, quality: ChordQuality) => void;
  /** `player` is the chord player's edit dialog: pill chips on an accent-tinted panel. */
  variant?: 'default' | 'player';
}

/**
 * The seven chords of the key, as a one-tap row — the same quick-pick the song builder
 * puts next to its lyrics, shared so the two chord modals cannot drift apart.
 *
 * The chords are named in sounding pitch, so callers that edit in "display space" (a
 * transposed song) can pass their state straight through.
 */
export function InKeyChordStrip({ songKey, root, accidental, quality, onPick, variant = 'default' }: InKeyChordStripProps) {
  const diatonicChords = useMemo(() => (songKey ? getDiatonicChords(songKey) : []), [songKey]);

  if (diatonicChords.length === 0) return null;

  if (variant === 'player') {
    return (
      <div
        className="flex flex-col gap-2.5 rounded-[14px] px-4 py-3.5"
        style={{
          background: 'color-mix(in srgb, var(--cp-ac) 9%, var(--cp-s1))',
          border: '1px solid color-mix(in srgb, var(--cp-ac) 25%, transparent)',
        }}
      >
        <span className="cp-lbl" style={{ color: 'var(--cp-act)' }}>In key of {songKey}</span>
        <div className="flex flex-wrap gap-1.5">
          {diatonicChords.map((c) => {
            const parsed = parseDiatonic(c);
            if (!parsed) return null;
            const isActive = root === parsed.root && accidental === parsed.acc && quality === parsed.qual;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onPick(parsed.root, parsed.acc, parsed.qual)}
                className={`cp-ik ${isActive ? 'cp-on' : ''}`}
                aria-pressed={isActive}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
      <label className="block text-[11px] font-semibold text-primary/70 uppercase tracking-widest mb-2">
        In key of {songKey}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {diatonicChords.map((c) => {
          const parsed = parseDiatonic(c);
          if (!parsed) return null;
          const isActive = root === parsed.root && accidental === parsed.acc && quality === parsed.qual;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onPick(parsed.root, parsed.acc, parsed.qual)}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all
                ${isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary'
                }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}
