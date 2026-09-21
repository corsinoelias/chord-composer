import { useMemo, type ReactNode } from 'react';
import { type Accidental, type ChordQuality, type RootNote } from '@/lib/musicTheory';
import { qualityClass } from '@/lib/chordColors';
import { type DetectedKey } from '@/lib/keyDetect';
import {
  chordsInKey,
  chordsOutsideKey,
  keyName,
  pitchClassOf,
  type PaletteChord,
  type PaletteMode,
  type PaletteTab,
} from '@/lib/keyPalette';

interface ChordPaletteProps {
  /** The sounding key; without one there is nothing to offer but the manual picker. */
  songKey: DetectedKey | null;
  tab: PaletteTab;
  onTabChange: (tab: PaletteTab) => void;
  mode: PaletteMode;
  onModeChange: (mode: PaletteMode) => void;
  /** The chord being edited, in sounding pitch. */
  root: RootNote;
  accidental: Accidental;
  quality: ChordQuality;
  onPick: (root: RootNote, accidental: Accidental, quality: ChordQuality) => void;
  /** Root, accidental and quality pickers — the "Manual" tab. */
  manual: ReactNode;
}

const MODES: { id: PaletteMode; label: string }[] = [
  { id: 'triads', label: 'Triads' },
  { id: 'sevenths', label: '7th' },
  { id: 'ninths', label: '9th' },
];

/**
 * How a chord is chosen in the Android app: first by what sounds right in the song's key,
 * then by what adds colour from outside it, and only then letter by letter. Each chord
 * carries its numeral (or what the borrowing is called), so the grid teaches while it picks.
 */
export function ChordPalette({
  songKey,
  tab,
  onTabChange,
  mode,
  onModeChange,
  root,
  accidental,
  quality,
  onPick,
  manual,
}: ChordPaletteProps) {
  const inKey = useMemo(() => (songKey ? chordsInKey(songKey, mode) : []), [songKey, mode]);
  const outside = useMemo(() => (songKey ? chordsOutsideKey(songKey, mode) : []), [songKey, mode]);

  if (!songKey) return <>{manual}</>;

  const name = keyName(songKey);
  const scale = songKey.mode === 'minor' ? 'minor' : 'major';
  const tonic = songKey.mode === 'minor' ? name.slice(0, -1) : name;
  const current = pitchClassOf(root, accidental);

  const chip = (c: PaletteChord) => {
    const on = pitchClassOf(c.root, c.accidental) === current && c.quality === quality;
    return (
      <button
        key={`${c.root}${c.accidental}${c.quality}`}
        type="button"
        className={`cp-pk ${qualityClass(c.quality)} ${on ? 'cp-on' : ''}`}
        aria-pressed={on}
        onClick={() => onPick(c.root, c.accidental, c.quality)}
      >
        {c.name}
        <small>{c.caption}</small>
        {c.gloss && <small>{c.gloss}</small>}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="cp-tabs" role="tablist" aria-label="How to choose the chord">
        {([
          ['key', `In ${tonic} ${scale}`, null],
          ['outside', 'Outside the key', 'Outside'],
          ['manual', 'Manual', null],
        ] as [PaletteTab, string, string | null][]).map(([id, label, short]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'cp-on' : ''}
            onClick={() => onTabChange(id)}
          >
            {short ? (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            ) : (
              label
            )}
          </button>
        ))}
      </div>

      {tab === 'manual' ? (
        manual
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs" style={{ color: 'var(--cp-mu)' }}>
              {tab === 'key'
                ? `These sound good together in ${tonic} ${scale}`
                : `Outside ${tonic} ${scale}, but they add colour`}
            </span>
            <div className="cp-seg cp-seg-sm">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={mode === m.id ? 'cp-on' : ''}
                  aria-pressed={mode === m.id}
                  onClick={() => onModeChange(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className={`grid gap-1.5 ${tab === 'key' ? 'grid-cols-4' : 'grid-cols-3 [&>button]:min-h-[56px]'}`}>
            {(tab === 'key' ? inKey : outside).map(chip)}
          </div>
        </>
      )}
    </div>
  );
}
