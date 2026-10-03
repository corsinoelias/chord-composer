import { useState } from 'react';
import { ChevronRight, Volume2 } from 'lucide-react';
import { isNumeric, setChordDisplay, useChordDisplay, type Accidentals, type ChordNotation } from '@/lib/chordDisplay';
import { CLICK_SOUNDS, clickSoundLabel, type ClickSettings } from '@/lib/clickSettings';
import { setCountIn, useCountIn } from '@/lib/countIn';
import { FADE_LENGTHS, setFadeLength, useFadeLength } from '@/lib/fadeLength';
import { FADE_IN_LENGTHS, setFadeInLength, useFadeInLength } from '@/lib/fadeInLength';
import { previewClick } from '@/lib/appEngine/preview';
import { Segments, SettingsGroup, SettingsHead, SettingsRow, SwitchControl } from './primitives';
import { SoundSheet } from './SoundSheet';

/**
 * The app's Ajustes, in its three groups: Chord symbols, Playback and Metronome. Every control
 * writes to the store it always wrote to (chordDisplay, countIn, fadeLength, fadeInLength,
 * clickSettings through [onClickChange]), so what is saved is exactly what was saved before.
 */
export function SettingsPanel({ click, onClickChange, metronomeEnabled }: {
  click: ClickSettings;
  onClickChange: (click: ClickSettings) => void;
  metronomeEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-7">
      <section>
        <SettingsHead>Chord symbols</SettingsHead>
        <ChordSymbolsGroup />
      </section>
      <section>
        <SettingsHead>Playback</SettingsHead>
        <PlaybackGroup />
      </section>
      <section>
        <SettingsHead>Metronome</SettingsHead>
        <MetronomeSettings click={click} onClickChange={onClickChange} metronomeEnabled={metronomeEnabled} />
      </section>
    </div>
  );
}

/** How chords are written: four tiles, each showing what it does with its own sign, and sharps or flats under them. */
function ChordSymbolsGroup() {
  const display = useChordDisplay();
  // Numbers and numerals take their accidentals from the key (♭VII, never ♯VI), so the choice
  // stays in view but has nothing to say for them.
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

  return (
    <SettingsGroup>
      <div className="cp-set-tiles">
        {tile('chord', <>F<sup>♯</sup>m</>, 'Chords')}
        {tile('number', <>3<span className="cp-nt-stack"><span>7</span><span>5</span></span></>, 'Numbers')}
        {tile('roman', 'VII', 'Degrees')}
        {tile('solfege', <span className="cp-nt-stack cp-nt-sol"><span>mi</span><span>do sol</span></span>, 'Do Re Mi')}
      </div>
      <SettingsRow title="Accidentals" dim={numeric}>
        <Segments<Accidentals>
          label="Accidentals"
          values={['auto', 'sharp', 'flat']}
          selected={display.accidentals}
          labelOf={(v) => (v === 'auto' ? 'Auto' : v === 'sharp' ? '♯' : '♭')}
          large={(v) => v !== 'auto'}
          disabled={numeric}
          onSelect={(accidentals) => setChordDisplay({ ...display, accidentals })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}

function PlaybackGroup() {
  const countIn = useCountIn();
  const fadeIn = useFadeInLength();
  const fadeOut = useFadeLength();
  return (
    <SettingsGroup>
      <SettingsRow title="Count-in">
        <SwitchControl label="Count-in" on={countIn} onChange={setCountIn} />
      </SettingsRow>
      <SettingsRow title="Fade-in">
        <Segments label="Fade-in length" values={FADE_IN_LENGTHS} selected={fadeIn} labelOf={(v) => `${v} s`} onSelect={setFadeInLength} />
      </SettingsRow>
      <SettingsRow title="Fade-out">
        <Segments label="Fade-out length" values={FADE_LENGTHS} selected={fadeOut} labelOf={(v) => `${v} s`} onSelect={setFadeLength} />
      </SettingsRow>
    </SettingsGroup>
  );
}

/**
 * Everything about the click. Shared by the settings page and the transport's sheet, so the two
 * can never offer different things.
 */
export function MetronomeSettings({ click, onClickChange, metronomeEnabled }: {
  click: ClickSettings;
  onClickChange: (click: ClickSettings) => void;
  metronomeEnabled: boolean;
}) {
  const [soundOpen, setSoundOpen] = useState(false);
  const percent = Math.round(click.volume * 100);
  const hear = (next: ClickSettings = click) => previewClick(next, metronomeEnabled);
  return (
    <>
      <SettingsGroup>
        <div className="cp-set-row" style={{ paddingRight: 4 }}>
          <label className="cp-set-title" htmlFor="click-volume" style={{ flex: '0 0 84px' }}>Volume</label>
          <input
            id="click-volume"
            className="cp-rg min-w-0 flex-1"
            type="range"
            min={0}
            max={100}
            value={percent}
            aria-valuetext={`${percent}%`}
            onChange={(e) => onClickChange({ ...click, volume: Number(e.target.value) / 100 })}
            // Heard once the finger lifts rather than on every move: a click per frame of a drag is a buzz, not a level.
            onPointerUp={() => hear()}
            onKeyUp={() => hear()}
            style={{ ['--cp-p' as string]: `${percent}%` }}
          />
          <button type="button" className="cp-set-icon-btn" aria-label="Try it" title="Try it" onClick={() => hear()}>
            <Volume2 size={20} />
          </button>
        </div>
        <SettingsRow title="Sound" onClick={() => setSoundOpen(true)}>
          <span className="cp-set-value">{clickSoundLabel(click.sound)}</span>
          <ChevronRight size={20} style={{ color: 'var(--cp-fa)' }} aria-hidden />
        </SettingsRow>
        <SettingsRow title="Accent the 1">
          <SwitchControl label="Accent the first beat" on={click.accent} onChange={(accent) => onClickChange({ ...click, accent })} />
        </SettingsRow>
        <SettingsRow title="Clicks per beat">
          <Segments<1 | 2>
            label="Clicks per beat"
            values={[1, 2]}
            selected={click.division}
            labelOf={String}
            onSelect={(division) => onClickChange({ ...click, division })}
          />
        </SettingsRow>
      </SettingsGroup>
      <SoundSheet
        open={soundOpen}
        onOpenChange={setSoundOpen}
        sounds={CLICK_SOUNDS}
        chosen={click.sound}
        // Four sounds, each heard as it is chosen; the sheet stays so they can be compared.
        onPick={(sound) => { const next = { ...click, sound }; onClickChange(next); hear(next); }}
      />
    </>
  );
}
