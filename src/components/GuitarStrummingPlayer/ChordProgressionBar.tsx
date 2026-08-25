import type { Accidental, Chord, ChordQuality, RootNote } from '@/lib/musicTheory';
import { CHROMATIC_ROOTS, STRUM_CHORD_TYPES, chordLabel } from '@/lib/guitarStrum/strumTheory';
import type { PatternEntry } from '@/lib/guitarStrum/types';

interface Props {
  chords: Chord[];
  selectedIndex: number;
  activeChordIndex: number;
  playing: boolean;
  assignments: Record<number, string>;
  library: PatternEntry[];
  onSelectChip: (index: number) => void;
  onAddChord: () => void;

  popoverOpen: boolean;
  onClosePopover: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRootChange: (root: RootNote, accidental: Accidental) => void;
  onQualityChange: (quality: ChordQuality) => void;
}

const PRIMARY = 'hsl(262 83% 52%)';
const BORDER = 'hsl(220 13% 87%)';

export function ChordProgressionBar({
  chords, selectedIndex, activeChordIndex, playing, assignments, library, onSelectChip, onAddChord,
  popoverOpen, onClosePopover, onDuplicate, onDelete, onRootChange, onQualityChange,
}: Props) {
  const selectedChord = chords[selectedIndex];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(220 10% 42%)' }}>
          Progression
        </span>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'stretch', gap: 7, overflowX: 'auto', padding: '2px 0' }}>
          {chords.map((chord, i) => {
            const assignedId = assignments[i];
            const assignedEntry = assignedId ? library.find(p => p.id === assignedId) : undefined;
            const on = playing && activeChordIndex === i;
            const sel = selectedIndex === i;
            return (
              <button
                key={chord.id} type="button" onClick={() => onSelectChip(i)}
                style={{
                  flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                  padding: '7px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', transition: 'border-color 90ms',
                  border: `1px solid ${on ? PRIMARY : sel ? 'hsl(262 70% 74%)' : BORDER}`,
                  background: on ? PRIMARY : sel ? 'hsl(262 83% 97%)' : '#fff',
                  color: on ? '#fff' : 'hsl(220 20% 10%)',
                  boxShadow: sel && !on ? '0 0 0 3px hsl(262 83% 52% / 0.1)' : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>{chordLabel(chord)}</span>
                  <span style={{ fontSize: 12, lineHeight: 1, opacity: 0.5 }}>▾</span>
                </span>
                <span style={{
                  maxWidth: 104, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: on ? 'hsl(262 70% 94%)' : assignedEntry ? PRIMARY : 'hsl(220 13% 68%)',
                }}>{assignedEntry ? assignedEntry.name : 'active pattern'}</span>
              </button>
            );
          })}
          <button
            type="button" onClick={onAddChord} title="Add chord"
            style={{ flex: '0 0 auto', width: 42, borderRadius: 11, border: '1px dashed hsl(220 13% 78%)', background: 'transparent', color: 'hsl(220 10% 45%)', fontSize: 17, cursor: 'pointer' }}
          >+</button>
        </div>
      </div>

      {popoverOpen && selectedChord && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 30, maxWidth: 470,
          background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: '0 18px 50px hsl(224 30% 12% / 0.22)',
          padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'cs-rise 140ms ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 22, fontWeight: 700 }}>{chordLabel(selectedChord)}</span>
            <span style={{ fontSize: 11, color: 'hsl(220 10% 42%)' }}>Bar {selectedIndex + 1} of {chords.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" onClick={onDuplicate} style={{ border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>Duplicate</button>
              <button type="button" onClick={onDelete} style={{ border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>Remove</button>
              <button type="button" onClick={onClosePopover} title="Close" style={{ width: 30, border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>×</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {CHROMATIC_ROOTS.map(({ root, accidental }, i) => {
              const on = selectedChord.root === root && selectedChord.accidental === accidental;
              return (
                <button
                  key={i} type="button" onClick={() => onRootChange(root, accidental)}
                  style={{
                    borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Space Mono', ui-monospace, monospace",
                    border: `1px solid ${on ? PRIMARY : BORDER}`,
                    background: on ? PRIMARY : '#fff', color: on ? '#fff' : 'hsl(220 20% 20%)',
                  }}
                >{root}{accidental === '#' ? '#' : ''}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {STRUM_CHORD_TYPES.map(t => {
              const on = selectedChord.quality === t.quality;
              return (
                <button
                  key={t.quality} type="button" onClick={() => onQualityChange(t.quality)}
                  style={{
                    borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${on ? PRIMARY : BORDER}`,
                    background: on ? 'hsl(262 83% 97%)' : '#fff', color: on ? PRIMARY : 'hsl(220 20% 20%)',
                  }}
                >{t.label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
