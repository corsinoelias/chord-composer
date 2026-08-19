import { Square } from 'lucide-react';
import { usePlaybackPosition } from '@/contexts/PlaybackContext';

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Isolated so only this text re-renders at animation-frame rate (usePlaybackPosition updates
// ~60x/sec) — same isolation pattern as ProgressFill in SongPlayerBar.tsx. Converts the
// existing chord-COUNT position (baseChordOffset + playbackPosition) into real seconds via a
// beat-weighted cumulative array, interpolating between the two chords position sits between.
function SongPillTime({
  baseChordOffset,
  cumulativeBeats,
  totalBeats,
  bpm,
}: {
  baseChordOffset: number;
  cumulativeBeats: number[];
  totalBeats: number;
  bpm: number;
}) {
  const playbackPosition = usePlaybackPosition();
  const position = baseChordOffset + Math.max(0, playbackPosition);
  const idx = Math.floor(position);
  const frac = position - idx;
  const b0 = cumulativeBeats[idx] ?? totalBeats;
  const b1 = cumulativeBeats[idx + 1] ?? b0;
  const elapsedBeats = b0 + (b1 - b0) * frac;
  const secondsPerBeat = bpm > 0 ? 60 / bpm : 0;
  return (
    <span className="font-mono text-[11px] text-muted-foreground tabular-nums" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
      {fmtTime(elapsedBeats * secondsPerBeat)} / {fmtTime(totalBeats * secondsPerBeat)}
    </span>
  );
}

interface SongPlayingPillProps {
  sectionName: string | null;
  onStop: () => void;
  baseChordOffset: number;
  cumulativeBeats: number[];
  totalBeats: number;
  bpm: number;
}

// The one floating element on the whole page, and only while audio is actually running —
// appears on Play, vanishes on Stop. Full-width near the bottom edge on a phone, a small
// anchored pill bottom-right on desktop.
export function SongPlayingPill({ sectionName, onStop, baseChordOffset, cumulativeBeats, totalBeats, bpm }: SongPlayingPillProps) {
  return (
    <div
      className="fixed z-40 inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-auto
        flex items-center gap-2.5 pl-3.5 pr-2 py-2 rounded-full bg-card border border-border shadow-lg"
    >
      <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
        <span className="w-0.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
        <span className="w-0.5 h-3 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '200ms' }} />
        <span className="w-0.5 h-2 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '400ms' }} />
      </span>
      <div className="min-w-0 flex-1 sm:flex-initial flex items-baseline gap-2">
        {sectionName && (
          <span className="text-xs font-semibold text-primary truncate">{sectionName}</span>
        )}
        <SongPillTime baseChordOffset={baseChordOffset} cumulativeBeats={cumulativeBeats} totalBeats={totalBeats} bpm={bpm} />
      </div>
      <button
        onClick={onStop}
        title="Stop"
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors"
      >
        <Square className="w-3 h-3 fill-current" />
      </button>
    </div>
  );
}
