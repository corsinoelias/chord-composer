import { isNumeric, setChordDisplay, useChordDisplay, type Accidentals, type ChordNotation } from '@/lib/chordDisplay';

/**
 * How chords are written — the app's Ajustes › Cifrado: four tiles, each showing what it
 * does with its own sign, and sharps or flats under them. No words of explanation; the
 * song behind the menu changes as soon as one is picked.
 */
export function ChordSymbolsPicker() {
  const display = useChordDisplay();
  const numeric = isNumeric(display);

  const tile = (notation: ChordNotation, sign: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`cp-nt ${display.notation === notation ? 'cp-on' : ''}`}
      aria-pressed={display.notation === notation}
      onClick={() => setChordDisplay({ ...display, notation })}
    >
      <span className="cp-nt-sign">{sign}</span>
      <span>{label}</span>
    </button>
  );

  const accidental = (value: Accidentals, label: string) => (
    <button
      type="button"
      className={`cp-seg-b ${display.accidentals === value && !numeric ? 'cp-on' : ''} ${value === 'auto' ? '' : 'cp-sign'}`}
      aria-pressed={display.accidentals === value}
      disabled={numeric}
      onClick={() => setChordDisplay({ ...display, accidentals: value })}
    >
      {label}
    </button>
  );

  return (
    // Clicks here change the choice, not close the menu.
    <div className="px-2 pb-2 pt-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="cp-lbl mb-1.5 text-[11px]" style={{ color: 'var(--cp-fa)' }}>Chord symbols</div>
      <div className="grid grid-cols-2 gap-1.5">
        {tile('chord', <>F<sup>♯</sup>m</>, 'Chords')}
        {tile('number', <>3<span className="cp-nt-stack"><span>7</span><span>5</span></span></>, 'Numbers')}
        {tile('roman', 'VII', 'Degrees')}
        {tile('solfege', <span className="cp-nt-stack cp-nt-sol"><span>mi</span><span>do sol</span></span>, 'Do Re Mi')}
      </div>
      <div className={`mt-2 flex items-center justify-between gap-2 ${numeric ? 'opacity-40' : ''}`}>
        <span className="text-[13px]">Accidentals</span>
        <div className="cp-seg cp-seg-sm" role="group" aria-label="Accidentals">
          {accidental('auto', 'Auto')}
          {accidental('sharp', '♯')}
          {accidental('flat', '♭')}
        </div>
      </div>
    </div>
  );
}
