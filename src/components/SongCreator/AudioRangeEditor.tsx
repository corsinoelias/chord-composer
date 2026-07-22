import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Scissors, ZoomIn, ZoomOut, Square } from 'lucide-react';
import type { AudioRange } from './types';

interface OtherRange {
  label: string;
  range: AudioRange;
}

interface AudioRangeEditorProps {
  audioUrl: string;
  range?: AudioRange;
  onRangeChange: (range: AudioRange | undefined) => void;
  // Other sections' ranges on the same shared file, shown as reference bands so the
  // user can see how this section's clip relates to the rest of the song.
  otherRanges?: OtherRange[];
  // What to call the current target in the empty-state CTA ("esta sección" vs "toda la canción").
  targetLabel?: string;
  // Real synced playback (chords + vocal reference together, via the audio engine) —
  // separate from the raw scrub-preview below, which stays isolated for precise trimming.
  isChordsPreviewPlaying: boolean;
  onToggleChordsPreview: () => void;
  chordsPreviewLabel: string;
}

const MIN_CLIP_SEC = 0.15;
// High enough resolution that zooming in still reveals real waveform detail instead of
// just stretching blurry bars — cheap to compute (one Float32Array pass at decode time).
const WAVEFORM_BUCKETS = 1500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

function formatPrecise(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function parsePrecise(text: string): number | null {
  const m = text.trim().match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type DragTarget = 'start' | 'end' | null;

export default function AudioRangeEditor({
  audioUrl, range, onRangeChange, otherRanges = [], targetLabel = 'esta sección',
  isChordsPreviewPlaying, onToggleChordsPreview, chordsPreviewLabel,
}: AudioRangeEditorProps) {
  const audioElRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // A callback ref (not useRef) so drawing re-runs the instant the canvas actually
  // mounts — it only enters the DOM once a range exists ("Agregar recorte" clicked),
  // which can happen well after decoding already finished and set `peaks`.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>();
  const [zoom, setZoom] = useState(1);

  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [dragging, setDragging] = useState<DragTarget>(null);

  const [startText, setStartText] = useState(() => formatPrecise(range?.startSec ?? 0));
  const [endText, setEndText] = useState(() => formatPrecise(range?.endSec ?? 0));

  useEffect(() => {
    setStartText(formatPrecise(range?.startSec ?? 0));
    setEndText(formatPrecise(range?.endSec ?? 0));
  }, [range]);

  // Decode once for the waveform (amplitude peaks) and an authoritative duration —
  // separate from the <audio> element, which only handles preview playback.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setDecodeFailed(false);
    setZoom(1);
    (async () => {
      try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const res = await fetch(audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        ctx.close().catch(() => {});
        if (cancelled) return;
        setDuration(buffer.duration);
        const channel = buffer.getChannelData(0);
        const bucketSize = Math.max(1, Math.floor(channel.length / WAVEFORM_BUCKETS));
        const result = new Float32Array(WAVEFORM_BUCKETS);
        for (let i = 0; i < WAVEFORM_BUCKETS; i++) {
          const start = i * bucketSize;
          const end = Math.min(start + bucketSize, channel.length);
          let max = 0;
          for (let j = start; j < end; j++) {
            const v = Math.abs(channel[j]);
            if (v > max) max = v;
          }
          result[i] = max;
        }
        setPeaks(result);
      } catch {
        if (!cancelled) setDecodeFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Draw the waveform — resolves the app's --primary token to an actual color so the
  // canvas matches the rest of the UI instead of hardcoding a hex value. Redraws on
  // both `peaks` changing AND the canvas (re)mounting, plus any resize — covers the
  // dialog's open animation (canvas measuring at width 0 mid-transition) and decoding
  // finishing before the canvas ever entered the DOM (no range set yet).
  useEffect(() => {
    if (!canvasEl) return;

    const draw = () => {
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = rect.width * dpr;
      canvasEl.height = rect.height * dpr;
      const ctx2d = canvasEl.getContext('2d');
      if (!ctx2d) return;
      ctx2d.scale(dpr, dpr);
      ctx2d.clearRect(0, 0, rect.width, rect.height);

      const color = getComputedStyle(canvasEl).color;
      ctx2d.fillStyle = color;
      const midY = rect.height / 2;

      const data = peaks ?? new Float32Array(WAVEFORM_BUCKETS).fill(0.08); // flat placeholder while loading/on failure
      const barGap = 1;
      const barWidth = rect.width / data.length;
      for (let i = 0; i < data.length; i++) {
        const h = Math.max(1, data[i] * rect.height);
        ctx2d.fillRect(i * barWidth, midY - h / 2, Math.max(1, barWidth - barGap), h);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvasEl);
    return () => observer.disconnect();
  }, [peaks, canvasEl]);

  const pct = useCallback((sec: number) => duration > 0 ? Math.min(100, Math.max(0, (sec / duration) * 100)) : 0, [duration]);

  const commitRange = useCallback((startSec: number, endSec: number) => {
    // The chords-preview schedules the vocal clip's start/stop once, at the moment it's
    // triggered — it doesn't re-read range changes live, so let it keep playing here
    // would silently go stale (sound like it's still using the old boundaries). Stop it
    // instead of misleading the user into thinking a live edit is already reflected.
    if (isChordsPreviewPlaying) onToggleChordsPreview();
    const s = Math.max(0, Math.min(startSec, endSec - MIN_CLIP_SEC));
    const e = Math.min(duration || endSec, Math.max(endSec, s + MIN_CLIP_SEC));
    onRangeChange({ startSec: s, endSec: e });
  }, [duration, onRangeChange, isChordsPreviewPlaying, onToggleChordsPreview]);

  // ── Dragging the start/end handles ──────────────────────────────────────────
  useEffect(() => {
    if (!dragging || !range) return;
    const onMove = (e: PointerEvent) => {
      const track = trackRef.current;
      if (!track || duration === 0) return;
      const rect = track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
      if (dragging === 'start') commitRange(Math.min(t, range.endSec - MIN_CLIP_SEC), range.endSec);
      else commitRange(range.startSec, Math.max(t, range.startSec + MIN_CLIP_SEC));
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, range, duration, commitRange]);

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (!range) return;
    if (which === 'start') commitRange(range.startSec + delta, range.endSec);
    else commitRange(range.startSec, range.endSec + delta);
  };

  const handleKeyDown = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(which, e.shiftKey ? -1 : -0.05); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(which, e.shiftKey ? 1 : 0.05); }
  };

  // ── Preview playback — plays exactly [start, end], playhead tracked via rAF for a
  // smooth sweep across the waveform rather than the ~4Hz native `timeupdate` event ──
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const el = audioElRef.current;
      if (el) {
        setPlayhead(el.currentTime);
        if (range && el.currentTime >= range.endSec) { el.pause(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, range]);

  // Keep the playhead in view while zoomed in and playing — otherwise it scrubs off the
  // visible (scrolled) portion of the waveform within a couple seconds at high zoom.
  useEffect(() => {
    if (!isPlaying) return;
    const container = scrollRef.current;
    const track = trackRef.current;
    if (!container || !track || duration === 0) return;
    const trackWidth = track.getBoundingClientRect().width;
    const playheadX = (playhead / duration) * trackWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (playheadX < viewLeft || playheadX > viewRight) {
      container.scrollLeft = Math.max(0, playheadX - container.clientWidth / 2);
    }
  }, [playhead, isPlaying, duration]);

  const togglePreview = () => {
    const el = audioElRef.current;
    if (!el || !range) return;
    if (isPlaying) { el.pause(); return; }
    // Resume from wherever the user last clicked inside the selection (via seekTo)
    // instead of always jumping back to the start — only reset to the start if the
    // current position has drifted outside the selection (first play, or it already
    // ran to the end last time).
    if (el.currentTime < range.startSec || el.currentTime >= range.endSec) {
      el.currentTime = range.startSec;
    }
    setPlayhead(el.currentTime);
    el.play();
  };

  // Spacebar toggles the scrub preview — the trim tool's primary audition control.
  // Skipped while typing in the mm:ss fields, or while some OTHER focused control
  // (a button, a drag handle) would already act on its own native Space activation —
  // otherwise pressing Space on e.g. the zoom button would both zoom AND toggle preview.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || target.getAttribute('role') === 'slider') return;
      e.preventDefault();
      togglePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Click anywhere on the selected span (not on a handle) to audition that exact point.
  const seekTo = (e: React.MouseEvent) => {
    if (!range || dragging) return;
    const track = trackRef.current;
    const el = audioElRef.current;
    if (!track || !el || duration === 0) return;
    const rect = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
    const clamped = Math.min(range.endSec, Math.max(range.startSec, t));
    el.currentTime = clamped;
    setPlayhead(clamped);
  };

  const addClip = () => {
    if (duration === 0) return;
    onRangeChange({ startSec: 0, endSec: duration });
  };

  return (
    <div className="space-y-3">
      <audio ref={audioElRef} src={audioUrl} preload="metadata" className="hidden" />

      {!range ? (
        <button
          onClick={addClip}
          disabled={duration === 0}
          className="w-full flex items-center justify-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-dashed border-primary/30 rounded-lg py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Scissors className="w-3.5 h-3.5" />
          {duration === 0 ? 'Cargando audio…' : `Agregar recorte para ${targetLabel}`}
        </button>
      ) : (
        <>
          {/* Big live time readout — what second of the song is sounding right now, for
              whoever's editing to use as a reference point while previewing/scrubbing */}
          <div className="flex items-baseline justify-center gap-2 py-1">
            <span className={`text-3xl font-mono font-bold tabular-nums transition-colors ${isPlaying ? 'text-primary' : 'text-foreground'}`}>
              {formatPrecise(playhead)}
            </span>
            <span className="text-sm font-mono text-muted-foreground">/ {formatPrecise(duration)}</span>
          </div>

          {/* Zoom controls — the waveform gets cramped/imprecise to drag at full-song
              width, especially for a short section inside a long recording */}
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))}
              disabled={zoom <= MIN_ZOOM}
              title="Alejar"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground w-7 text-center tabular-nums">{zoom}×</span>
            <button
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))}
              disabled={zoom >= MAX_ZOOM}
              title="Acercar"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reference bands for other sections' clips on the same file — scrolls in
              lockstep with the waveform below since it lives inside the same wide track */}
          <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-background">
            <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
              {otherRanges.length > 0 && (
                <div className="relative h-4 mx-2 mt-1.5 text-[10px] text-muted-foreground">
                  {otherRanges.map((o, i) => (
                    <div
                      key={i}
                      title={`${o.label}: ${formatPrecise(o.range.startSec)} – ${formatPrecise(o.range.endSec)}`}
                      className="absolute top-0 h-full rounded bg-muted-foreground/15 border border-muted-foreground/20 flex items-center px-1 overflow-hidden whitespace-nowrap"
                      style={{ left: `${pct(o.range.startSec)}%`, width: `${Math.max(1, pct(o.range.endSec) - pct(o.range.startSec))}%` }}
                    >
                      {o.label}
                    </div>
                  ))}
                </div>
              )}

              {/* Waveform + range selection */}
              <div
                ref={trackRef}
                onClick={seekTo}
                className="relative h-40 cursor-pointer select-none"
              >
                <canvas ref={setCanvasEl} className="absolute inset-0 w-full h-full text-primary/40" />

                {/* Dim the parts outside the selection */}
                <div className="absolute inset-y-0 left-0 bg-background/70" style={{ width: `${pct(range.startSec)}%` }} />
                <div className="absolute inset-y-0 right-0 bg-background/70" style={{ width: `${100 - pct(range.endSec)}%` }} />

                {/* Selected span highlight */}
                <div
                  className="absolute inset-y-0 bg-primary/10 border-y-2 border-primary/50"
                  style={{ left: `${pct(range.startSec)}%`, width: `${pct(range.endSec) - pct(range.startSec)}%` }}
                />

                {/* Playhead */}
                {(isPlaying || playhead > 0) && (
                  <div
                    className="absolute inset-y-0 w-px bg-foreground pointer-events-none"
                    style={{ left: `${pct(playhead)}%` }}
                  />
                )}

                {/* Start handle */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Inicio del recorte"
                  aria-valuemin={0}
                  aria-valuemax={range.endSec}
                  aria-valuenow={range.startSec}
                  onPointerDown={e => { e.stopPropagation(); setDragging('start'); }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={handleKeyDown('start')}
                  className="absolute inset-y-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center focus:outline-none group"
                  style={{ left: `${pct(range.startSec)}%` }}
                >
                  <div className="w-1 h-full rounded-full bg-primary group-focus:ring-2 group-focus:ring-primary/50 shadow-sm" />
                </div>

                {/* End handle */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Fin del recorte"
                  aria-valuemin={range.startSec}
                  aria-valuemax={duration}
                  aria-valuenow={range.endSec}
                  onPointerDown={e => { e.stopPropagation(); setDragging('end'); }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={handleKeyDown('end')}
                  className="absolute inset-y-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center focus:outline-none group"
                  style={{ left: `${pct(range.endSec)}%` }}
                >
                  <div className="w-1 h-full rounded-full bg-primary group-focus:ring-2 group-focus:ring-primary/50 shadow-sm" />
                </div>
              </div>
            </div>
          </div>

          {decodeFailed && (
            <p className="text-[11px] text-muted-foreground italic">
              No se pudo dibujar la onda de este archivo, pero el recorte funciona igual.
            </p>
          )}

          {/* Precise numeric readouts + preview */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Inicio (mm:ss)</label>
              <input
                value={startText}
                onChange={e => setStartText(e.target.value)}
                onBlur={() => { const s = parsePrecise(startText); if (s != null) commitRange(s, range.endSec); }}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <button
              onClick={togglePreview}
              title={isPlaying ? 'Pausar' : 'Probar recorte'}
              className="mt-4 shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <div className="flex-1">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Fin (mm:ss)</label>
              <input
                value={endText}
                onChange={e => setEndText(e.target.value)}
                onBlur={() => { const eVal = parsePrecise(endText); if (eVal != null) commitRange(range.startSec, eVal); }}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Duración del recorte: <span className="font-mono">{formatPrecise(range.endSec - range.startSec)}</span>
            </p>
            <button
              onClick={() => onRangeChange(undefined)}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Quitar recorte
            </button>
          </div>

          {/* Real synced playback — chords + vocal reference together, exactly like it'll
              sound for real, via the same engine the section Play buttons use. Separate
              from "Probar recorte" above, which only scrubs the isolated vocal clip. */}
          <button
            onClick={onToggleChordsPreview}
            className={`w-full flex items-center justify-center gap-1.5 text-xs rounded-lg py-2 font-medium border transition-colors
              ${isChordsPreviewPlaying
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'}`}
          >
            {isChordsPreviewPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isChordsPreviewPlaying ? 'Detener' : chordsPreviewLabel}
          </button>
        </>
      )}
    </div>
  );
}
