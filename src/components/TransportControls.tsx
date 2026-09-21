import { memo } from 'react';
import { Play, Square, Download, Loader2, ChevronDown, Save } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KeyControl } from './KeyControl';

import { type DetectedKey, type KeyMode } from '@/lib/keyDetect';

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
  bpm: number;
  metronomeEnabled: boolean;
  transposition: number;
  /** Key reading in force (user pick, else detected), before transposition. */
  keyBase: DetectedKey | null;
  onKeyModeChange: (mode: KeyMode) => void;
  onKeyPick: (semitones: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onExport: () => void;
  onExportMidi: () => void;
  onBpmChange: (bpm: number) => void;
  onMetronomeToggle: (enabled: boolean) => void;
  onTranspositionChange: (semitones: number) => void;
  hasChords: boolean;
  showSaveCta?: boolean;
  onSaveCtaClick?: () => void;
  /** Section and chord under the playhead — the header's "Now" readout. */
  nowSectionName?: string | null;
  nowChordName?: string | null;
  /** Rendered beside "Now": the 1..4 beat counter, its own subscriber. */
  beatSlot?: React.ReactNode;
}

/**
 * The transport band of the player header: play, tempo, key, metronome, and — on the
 * right — what is sounding right now plus the save/export actions.
 *
 * Below `lg` the same controls wrap into the stacked mobile arrangement; Save and WAV
 * move out of here into the fixed bottom bar (rendered by Index), which is why they are
 * `hidden lg:flex` rather than absent.
 */
export const TransportControls = memo(function TransportControls({
  isPlaying,
  isExporting,
  bpm,
  metronomeEnabled,
  transposition,
  keyBase,
  onKeyModeChange,
  onKeyPick,
  onPlay,
  onStop,
  onExport,
  onExportMidi,
  onBpmChange,
  onMetronomeToggle,
  onTranspositionChange,
  hasChords,
  showSaveCta = false,
  onSaveCtaClick,
  nowSectionName,
  nowChordName,
  beatSlot,
}: TransportControlsProps) {
  const bpmPercent = `${((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100}%`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 lg:px-8 py-3 lg:h-[84px] lg:flex-nowrap lg:gap-7 lg:py-0">
      {/* Play / Stop — the one hero control */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        disabled={!hasChords || isExporting}
        data-tour="play-button"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-0 text-white disabled:cursor-not-allowed disabled:opacity-40 lg:h-14 lg:w-14"
        style={{
          background: 'var(--cp-ac)',
          boxShadow: isPlaying
            ? '0 0 0 6px color-mix(in srgb, var(--cp-ac) 20%, transparent), 0 8px 24px color-mix(in srgb, var(--cp-ac) 35%, transparent)'
            : '0 8px 24px color-mix(in srgb, var(--cp-ac) 32%, transparent)',
        }}
        aria-label={isPlaying ? 'Stop' : 'Play'}
      >
        {isPlaying
          ? <Square size={20} fill="currentColor" strokeWidth={0} />
          : <Play size={24} fill="currentColor" strokeWidth={0} className="ml-[3px]" />}
      </button>

      {/* Tempo */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-none">
        <div className="flex items-baseline justify-between gap-2 lg:justify-start">
          <span className="cp-lbl">Tempo</span>
          <span className="flex items-baseline gap-1 lg:hidden">
            <span className="cp-mono text-xl font-bold leading-none">{bpm}</span>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cp-mu)' }}>BPM</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden w-[66px] items-baseline gap-1 lg:flex">
            <span className="cp-mono text-2xl font-bold leading-none">{bpm}</span>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cp-mu)' }}>BPM</span>
          </span>
          <input
            className="cp-rg w-full lg:w-44"
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
      </div>

      <div className="cp-dv hidden lg:block" />

      {/* Key + Metronome share a row of their own on mobile */}
      <div className="flex w-full items-center gap-3 lg:contents">
        <div className="flex flex-col gap-1.5">
          <span className="cp-lbl hidden lg:block">Key</span>
          <KeyControl
            base={keyBase}
            onModeChange={onKeyModeChange}
            transposition={transposition}
            onTranspositionChange={onTranspositionChange}
            onKeyPick={onKeyPick}
            variant="pill"
          />
        </div>

        <div className="cp-dv hidden lg:block" />

        <div className="flex flex-grow flex-col gap-1.5 lg:flex-grow-0">
          <span className="cp-lbl hidden lg:block">Metronome</span>
          <label className="cp-metro">
            <span
              className="flex items-center gap-2"
              style={{ color: metronomeEnabled ? 'var(--cp-act)' : 'var(--cp-mu)' }}
            >
              <MetronomeIcon size={18} className="shrink-0" />
              <span className="lg:hidden" style={{ color: 'var(--cp-tx)' }}>Metronome</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={metronomeEnabled}
              aria-label="Metronome"
              disabled={isExporting}
              onClick={() => onMetronomeToggle(!metronomeEnabled)}
              className={`cp-sw ${metronomeEnabled ? 'cp-on' : ''}`}
            />
          </label>
        </div>
      </div>

      <div className="hidden flex-grow lg:block" />

      {/* What is sounding — replaced by the keyboard hint when stopped */}
      {isPlaying ? (
        <div className="hidden items-center gap-3 pr-2 lg:flex">
          <div className="flex flex-col items-end gap-1">
            <span className="cp-lbl">Now</span>
            <span className="text-sm font-semibold">
              {nowSectionName}
              {nowChordName && (
                <>
                  <span style={{ color: 'var(--cp-mu)', fontWeight: 500 }}> · </span>
                  <span className="cp-mono font-bold">{nowChordName}</span>
                </>
              )}
            </span>
          </div>
          {beatSlot}
        </div>
      ) : (
        <div
          className="hidden items-center gap-2 text-xs font-medium lg:flex"
          style={{ color: 'var(--cp-mu)' }}
        >
          <span className="cp-kbd">Space</span>
          <span>play / stop</span>
        </div>
      )}

      {/* Save + export. On mobile these live in the fixed bottom bar instead. */}
      <div className="hidden items-center gap-2.5 lg:flex">
        {showSaveCta && (
          <button className="cp-btn cp-acc" onClick={onSaveCtaClick}>
            <Save size={18} />
            Save
          </button>
        )}
        <div className="flex">
          <button
            className="cp-btn cp-pri"
            style={{ borderRadius: '10px 0 0 10px' }}
            onClick={onExport}
            disabled={!hasChords || isPlaying || isExporting}
            data-tour="export-button"
          >
            {isExporting
              ? <><Loader2 size={18} className="animate-spin" />Exporting…</>
              : <><Download size={18} />WAV</>}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="cp-btn cp-pri cp-ib"
                style={{ width: 36, borderRadius: '0 10px 10px 0', borderLeft: '1px solid rgba(255,255,255,.28)' }}
                disabled={!hasChords || isPlaying || isExporting}
                aria-label="More export options"
              >
                <ChevronDown size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExport} disabled={isExporting}>
                <Download size={14} className="mr-2" />Export WAV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportMidi}>
                <Download size={14} className="mr-2" />Export MIDI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});
