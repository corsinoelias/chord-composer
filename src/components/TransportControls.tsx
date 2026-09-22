import { memo, useMemo, useRef } from 'react';
import {
  Download,
  FileMusic,
  FolderOpen,
  LayoutGrid,
  MoreVertical,
  Play,
  Plus,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KeyControl } from './KeyControl';
import { StyleSelector } from './StyleSelector';
import { type DetectedKey, type KeyMode } from '@/lib/keyDetect';
import { type Section } from '@/lib/sections';
import { type StylePattern } from '@/lib/styles';
import { chordPosition, useGlide } from '@/lib/playbackPosition';
import { SWING_OPTIONS, swingOption } from '@/lib/swing';

/** Metronome glyph — lucide has no metronome/pendulum icon, so this draws one:
 *  a trapezoidal body with a swung pendulum rod. Stroke style matches lucide
 *  (24 viewBox, currentColor, round caps) so it sits well beside the other icons. */
export function MetronomeIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 21 10 3h4l3 18z" />
      <path d="m12 16 5-7" />
    </svg>
  );
}

const BPM_MIN = 40;
const BPM_MAX = 200;

interface TransportControlsProps {
  isPlaying: boolean;
  isExporting: boolean;
  hasChords: boolean;
  onPlay: () => void;
  onStop: () => void;

  bpm: number;
  onBpmChange: (bpm: number) => void;
  /** The rhythm's time signature ("4/4", "6/8") and feel, shown beside the tempo. */
  meter: string;
  /** The swing in force (the song's, else its rhythm's), as the app's ratio: 1, 1.5 or 2. */
  swingRatio: number;
  onSwingChange: (ratio: number) => void;

  /** Key reading in force (user pick, else detected), before transposition. */
  keyBase: DetectedKey | null;
  transposition: number;
  onTranspositionChange: (semitones: number) => void;
  onKeyModeChange: (mode: KeyMode) => void;
  onKeyPick: (semitones: number) => void;

  metronomeEnabled: boolean;
  onMetronomeToggle: (enabled: boolean) => void;

  selectedStyleId: string;
  customStyles: StylePattern[];
  onStyleChange: (styleId: string) => void;

  onOpenMixer: () => void;
  onOpenLibrary: () => void;
  onOpenTemplates: () => void;
  onOpenInstruments: () => void;
  onOpenRhythmEditor: () => void;
  onNewRhythm: () => void;
  onExport: () => void;
  onExportMidi: () => void;

  /** For the song map along the bottom. */
  sections: Section[];
  sectionColors: Map<string, string>;
  currentChordIndex: number;
  loopingSectionIndex: number | null;
  onJumpToSection: (index: number) => void;
}

/**
 * The Android app's transport (lib/features/transport/transport_bar.dart): play, the tempo
 * with its meter and swing on the label line, the key, the click and the style as three
 * capsules, the mixer and a "more" menu — and underneath, the song as a strip of its
 * sections, filling as it plays.
 *
 * On a phone the three capsules take a row of their own; on a wide screen they sit in
 * the same row as play and tempo, as the app does on a tablet.
 */
export const TransportControls = memo(function TransportControls(props: TransportControlsProps) {
  const {
    isPlaying, isExporting, hasChords, onPlay, onStop,
    bpm, onBpmChange, meter, swingRatio, onSwingChange,
    keyBase, transposition, onTranspositionChange, onKeyModeChange, onKeyPick,
    metronomeEnabled, onMetronomeToggle,
    selectedStyleId, customStyles, onStyleChange,
    onOpenMixer, onOpenLibrary, onOpenTemplates, onOpenInstruments, onOpenRhythmEditor, onNewRhythm,
    onExport, onExportMidi,
  } = props;

  const bpmPercent = `${((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100}%`;

  const capsules = (
    <>
      <KeyControl
        base={keyBase}
        onModeChange={onKeyModeChange}
        transposition={transposition}
        onTranspositionChange={onTranspositionChange}
        onKeyPick={onKeyPick}
        variant="pill"
      />
      <button
        type="button"
        className={`cp-cap shrink-0 ${metronomeEnabled ? 'cp-on' : ''}`}
        onClick={() => onMetronomeToggle(!metronomeEnabled)}
        disabled={isExporting}
        aria-pressed={metronomeEnabled}
        aria-label="Metronome click"
        title="Metronome click"
      >
        <MetronomeIcon size={16} />
        <span className="text-xs">Click</span>
      </button>
      <div className="min-w-0 flex-1 lg:max-w-[300px]" data-tour="style-selector">
        <StyleSelector
          selectedStyleId={selectedStyleId}
          onStyleChange={onStyleChange}
          customStyles={customStyles}
          onCreateNew={onNewRhythm}
          variant="pill"
        />
      </div>
    </>
  );

  return (
    <div className="px-3 pt-1 lg:px-8 lg:pt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isPlaying ? onStop : onPlay}
          disabled={!hasChords || isExporting}
          data-tour="play-button"
          className={`cp-play ${isPlaying ? 'cp-on' : ''}`}
          aria-label={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying
            ? <Square size={20} fill="currentColor" strokeWidth={0} />
            : <Play size={24} fill="currentColor" strokeWidth={0} className="ml-[3px]" />}
        </button>

        {/* Tempo: meter and feel ride the label line so they cost no height. The meter belongs
            to the rhythm; the feel is the song's own pick, as the app's swing chip. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 lg:w-64 lg:flex-none">
          <div className="flex items-center gap-[5px]">
            <span className="cp-lbl" style={{ color: 'var(--cp-fa)' }}>Tempo</span>
            <span className="cp-mini" title="Time signature — set by the rhythm">{meter}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="cp-mini cp-mini-btn" title="Swing" aria-label={`Swing: ${swingOption(swingRatio).label}`}>
                  {swingOption(swingRatio).label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                {SWING_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.ratio} onClick={() => onSwingChange(o.ratio)}>
                    <span className="flex-1">{o.label}</span>
                    {swingOption(swingRatio).ratio === o.ratio && <span aria-hidden>✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-baseline gap-[5px]">
            <span className="cp-mono text-2xl font-bold leading-none tabular-nums">{bpm}</span>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cp-fa)' }}>BPM</span>
          </div>
          <input
            className="cp-rg w-full"
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            value={bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value, 10))}
            disabled={isExporting}
            aria-label={`Tempo, ${bpm} beats per minute`}
            style={{ ['--cp-p' as string]: bpmPercent }}
          />
        </div>

        {/* Wide screens: the capsules join this row */}
        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">{capsules}</div>

        <div className="flex items-center">
          <button type="button" className="cp-icb" onClick={onOpenMixer} aria-label="Mixer" title="Mixer">
            <SlidersHorizontal size={20} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="cp-icb" style={{ width: 32 }} aria-label="More">
                <MoreVertical size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onOpenLibrary}>
                <FolderOpen size={15} className="mr-2" />My songs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenTemplates}>
                <FileMusic size={15} className="mr-2" />Templates
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenInstruments}>
                <SlidersHorizontal size={15} className="mr-2" />Instruments
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenRhythmEditor}>
                <LayoutGrid size={15} className="mr-2" />Edit rhythm
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onNewRhythm}>
                <Plus size={15} className="mr-2" />New rhythm
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExport} disabled={!hasChords || isPlaying || isExporting}>
                <Download size={15} className="mr-2" />Export WAV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportMidi} disabled={!hasChords}>
                <Download size={15} className="mr-2" />Export MIDI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Phones: the capsules get a row of their own */}
      <div className="mt-2 flex items-center gap-2 lg:hidden">{capsules}</div>

      {/* Room above (from the tempo slider) and below (to the header's edge), so it reads as
          the song's own bar rather than as part of the tempo control. */}
      <div className="pb-3 pt-3 lg:pb-4 lg:pt-4">
        <SongMap
          sections={props.sections}
          colors={props.sectionColors}
          currentChordIndex={props.currentChordIndex}
          isPlaying={isPlaying}
          loopingSectionIndex={props.loopingSectionIndex}
          bpm={bpm}
          onJump={props.onJumpToSection}
        />
      </div>
    </div>
  );
});

interface SongMapProps {
  sections: Section[];
  colors: Map<string, string>;
  currentChordIndex: number;
  isPlaying: boolean;
  loopingSectionIndex: number | null;
  bpm: number;
  onJump: (index: number) => void;
}

/**
 * Where the song is: a segment per section, as long as it plays. Played at half strength,
 * still to come faint, and the one under way filling in its own colour as it goes —
 * gliding through each chord rather than stepping (see useGlide).
 */
const SongMap = memo(function SongMap({
  sections,
  colors,
  currentChordIndex,
  isPlaying,
  loopingSectionIndex,
  bpm,
  onJump,
}: SongMapProps) {
  const fills = useRef<(HTMLElement | null)[]>([]);

  const pos = useMemo(
    () => (isPlaying ? chordPosition(sections, currentChordIndex, loopingSectionIndex) : null),
    [sections, currentChordIndex, isPlaying, loopingSectionIndex],
  );
  const current = pos?.sectionIndex ?? -1;

  const tween = useMemo(() => {
    if (!pos || pos.sectionBeats <= 0) return null;
    return {
      key: currentChordIndex,
      from: pos.chordStartInSection / pos.sectionBeats,
      to: (pos.chordStartInSection + pos.chordBeats) / pos.sectionBeats,
      ms: (pos.chordBeats * 60000) / bpm,
    };
    // bpm is read when a chord starts; a tempo change mid-chord takes effect on the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, currentChordIndex]);

  useGlide(tween, (v) => {
    fills.current.forEach((el, i) => {
      if (el) el.style.width = i === current ? `${Math.min(100, v * 100)}%` : '0%';
    });
  });

  if (sections.length === 0) return <div className="cp-map" />;

  return (
    <div className="cp-map" role="group" aria-label="Song sections">
      {sections.map((section, i) => {
        const beats = section.chords.reduce((sum, c) => sum + (c.duration ?? 4), 0);
        const weight = Math.max(1, beats * section.repeatCount);
        return (
          <button
            key={section.id}
            type="button"
            className={isPlaying && i >= current ? 'cp-next' : ''}
            style={{ flexGrow: weight, flexBasis: 0, ['--cp-sc' as string]: colors.get(section.id) }}
            onClick={() => onJump(i)}
            aria-label={`Go to ${section.name}`}
            title={section.name}
          >
            <i ref={(el) => { fills.current[i] = el; }} />
          </button>
        );
      })}
    </div>
  );
});
