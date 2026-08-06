import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Scissors, ZoomIn, ZoomOut, Square, SkipBack, Rewind, FastForward, Repeat, Maximize2 } from 'lucide-react';
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
// Coarse repositioning that doesn't need mouse precision — the whole point is not
// having to aim at a waveform where one pixel can be half a second.
const SKIP_SEC = 5;
// Pressing play with the cursor parked this close to the end would play a blink and
// stop, which reads as broken; treat it as "finished" and start over instead.
const END_EPSILON = 0.25;
// Ruler tick intervals, in seconds — the smallest one whose labels still have room to
// breathe at the current zoom wins.
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIN_TICK_PX = 64;

function formatPrecise(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatClock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Screen readers turn "1:23.45" into "one twenty-three point four five". Slider values
// get spelled out instead.
function formatSpoken(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const seconds = `${s} ${s === 1 ? 'segundo' : 'segundos'}`;
  return m > 0 ? `${m} ${m === 1 ? 'minuto' : 'minutos'} ${seconds}` : seconds;
}

function parsePrecise(text: string): number | null {
  const m = text.trim().match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type DragTarget = 'start' | 'end' | 'playhead' | null;

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
  const [loop, setLoop] = useState(false);
  // A pointer gesture that actually moved is a drag, not a click — without this the
  // click that ends a drag would bubble to the track and seek to wherever it landed.
  const didDragRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Measured, not derived: the ruler needs real pixels to decide how far apart its
  // labels can sit without colliding.
  const [trackWidth, setTrackWidth] = useState(0);
  // Discrete, one-shot messages for screen readers. The big clock is deliberately left
  // out of this — announcing it would fire many times a second.
  const [announcement, setAnnouncement] = useState('');
  // Which edge a click landed past, so it can pulse instead of the click doing nothing.
  const [edgeFlash, setEdgeFlash] = useState<'start' | 'end' | null>(null);
  // Set when editing the range had to stop the synced chords+vocal playback, so the UI
  // can say why instead of the music just dying.
  const [previewInterrupted, setPreviewInterrupted] = useState(false);

  const announce = useCallback((message: string) => {
    // Re-announce even when the text repeats (pressing ⏮ twice should speak twice).
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

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

  // Whether a clip exists at all — used as an effect dependency instead of `range`
  // itself, which is a fresh object on every drag frame and would thrash the observers
  // and listeners keyed to it.
  const hasRange = !!range;

  // ── Time ruler ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setTrackWidth(track.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [hasRange]);

  const ticks = useMemo(() => {
    if (duration === 0 || trackWidth === 0) return [];
    const step = TICK_STEPS.find(s => (s / duration) * trackWidth >= MIN_TICK_PX);
    if (!step) return [];
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
  }, [duration, trackWidth]);

  // ── Zoom ────────────────────────────────────────────────────────────────────
  // The wide track is `zoom * 100%` of the scroll container, so its pixel width is
  // always clientWidth * zoom — that's what lets us convert between time and scroll
  // offset without measuring again.
  const scrollToTime = useCallback((sec: number, level: number, align: 'center' | 'left') => {
    const container = scrollRef.current;
    if (!container || duration === 0) return;
    const total = container.clientWidth * level;
    const x = (sec / duration) * total;
    container.scrollLeft = Math.max(0, align === 'center' ? x - container.clientWidth / 2 : x - 16);
  }, [duration]);

  // Zoom around whatever is in the middle of the view. Without this the waveform grows
  // from its left edge and whatever you were looking at slides off screen.
  const applyZoom = (next: number) => {
    const level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const container = scrollRef.current;
    if (!container || duration === 0) { setZoom(level); return; }
    const anchor = ((container.scrollLeft + container.clientWidth / 2) / (container.clientWidth * zoom)) * duration;
    setZoom(level);
    requestAnimationFrame(() => scrollToTime(anchor, level, 'center'));
  };

  const fitToSelection = () => {
    if (!range || duration === 0) return;
    const span = range.endSec - range.startSec;
    if (span <= 0) return;
    const level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(duration / span)));
    setZoom(level);
    requestAnimationFrame(() => scrollToTime(range.startSec, level, 'left'));
    announce(level >= MAX_ZOOM
      ? `Zoom al máximo de ${MAX_ZOOM} aumentos`
      : `Ajustado al recorte, ${level} aumentos`);
  };

  const commitRange = useCallback((startSec: number, endSec: number) => {
    // The chords-preview schedules the vocal clip's start/stop once, at the moment it's
    // triggered — it doesn't re-read range changes live, so letting it keep playing here
    // would silently go stale (sound like it's still using the old boundaries). Stop it
    // instead, and raise a flag so the UI can explain the silence and offer to restart.
    if (isChordsPreviewPlaying) {
      onToggleChordsPreview();
      setPreviewInterrupted(true);
    }
    const s = Math.max(0, Math.min(startSec, endSec - MIN_CLIP_SEC));
    const e = Math.min(duration || endSec, Math.max(endSec, s + MIN_CLIP_SEC));
    onRangeChange({ startSec: s, endSec: e });
  }, [duration, onRangeChange, isChordsPreviewPlaying, onToggleChordsPreview]);

  // Moves the play position without touching the clip boundaries. Everything that
  // repositions playback — transport buttons, keyboard, clicking, dragging the
  // playhead — funnels through here so they can't drift apart.
  // Returns where it actually landed, since callers need the clamped value to report it.
  const seekPlayhead = useCallback((sec: number) => {
    if (!range) return 0;
    const clamped = Math.min(range.endSec, Math.max(range.startSec, sec));
    const el = audioElRef.current;
    if (el) el.currentTime = clamped;
    setPlayhead(clamped);
    return clamped;
  }, [range]);

  // ── Dragging the start/end handles and the playhead ─────────────────────────
  useEffect(() => {
    if (!dragging || !range) return;
    const onMove = (e: PointerEvent) => {
      const track = trackRef.current;
      if (!track || duration === 0) return;
      didDragRef.current = true;
      const rect = track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
      if (dragging === 'playhead') seekPlayhead(t);
      else if (dragging === 'start') commitRange(Math.min(t, range.endSec - MIN_CLIP_SEC), range.endSec);
      else commitRange(range.startSec, Math.max(t, range.startSec + MIN_CLIP_SEC));
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, range, duration, commitRange, seekPlayhead]);

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (!range) return;
    if (which === 'start') commitRange(range.startSec + delta, range.endSec);
    else commitRange(range.startSec, range.endSec + delta);
  };

  // Full ARIA slider keyboard contract: arrows for fine steps, Page keys for coarse
  // ones, Home/End to jump to the bound the handle can reach.
  const handleKeyDown = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    if (!range) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => nudge(which, e.shiftKey ? -1 : -0.05),
      ArrowRight: () => nudge(which, e.shiftKey ? 1 : 0.05),
      PageDown: () => nudge(which, -1),
      PageUp: () => nudge(which, 1),
      Home: () => which === 'start'
        ? commitRange(0, range.endSec)
        : commitRange(range.startSec, range.startSec + MIN_CLIP_SEC),
      End: () => which === 'start'
        ? commitRange(range.endSec - MIN_CLIP_SEC, range.endSec)
        : commitRange(range.startSec, duration),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
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
        if (range && el.currentTime >= range.endSec) {
          // Looping is the normal way to work on a vocal reference: you listen to the
          // same phrase over and over while lining the chords up against it.
          if (loop) el.currentTime = range.startSec;
          else { el.pause(); return; }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, range, loop]);

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
    // Resume from wherever the user last left the playhead inside the selection instead
    // of always jumping back to the start — but reset if it sits outside the selection
    // (first play) or has effectively reached the end, where resuming would play a blink.
    if (el.currentTime < range.startSec || el.currentTime >= range.endSec - END_EPSILON) {
      el.currentTime = range.startSec;
    }
    setPlayhead(el.currentTime);
    el.play();
  };

  // ── Transport ───────────────────────────────────────────────────────────────
  const restart = () => {
    seekPlayhead(range?.startSec ?? 0);
    announce('Al inicio del recorte');
  };

  const skip = (delta: number) => {
    const landed = seekPlayhead((audioElRef.current?.currentTime ?? playhead) + delta);
    announce(formatSpoken(landed));
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    announce(next ? 'Bucle activado' : 'Bucle desactivado');
  };

  // Keyboard contract for the playhead. Space is handled here rather than by the global
  // listener below, which deliberately ignores anything with role="slider".
  const playheadKeyDown = (e: React.KeyboardEvent) => {
    if (!range) return;
    const keys: Record<string, () => void> = {
      Home: restart,
      End: () => seekPlayhead(range.endSec),
      ArrowLeft: () => skip(e.shiftKey ? -5 : -1),
      ArrowRight: () => skip(e.shiftKey ? 5 : 1),
      PageDown: () => skip(-SKIP_SEC),
      PageUp: () => skip(SKIP_SEC),
      ' ': togglePreview,
      l: toggleLoop,
      L: toggleLoop,
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  // Spacebar toggles the scrub preview — the trim tool's primary audition control.
  // Scoped to the dialog this editor lives in (falling back to the editor itself when
  // used outside one), so it can't hijack Space for the rest of the page. Skipped while
  // typing, and while any OTHER focused control would already act on its own native
  // Space activation — otherwise Space on the zoom button would zoom AND toggle preview.
  // Kept in a ref so the listener below can be registered once instead of being torn
  // down and rebuilt on every render.
  const togglePreviewRef = useRef(togglePreview);
  togglePreviewRef.current = togglePreview;

  useEffect(() => {
    if (!hasRange) return;
    const scope = containerRef.current?.closest('[role="dialog"]') ?? containerRef.current;
    if (!scope) return;

    const onKeyDown = (e: Event) => {
      const event = e as KeyboardEvent;
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, a[href], [contenteditable="true"], [role="slider"], [role="button"]')) return;
      event.preventDefault();
      togglePreviewRef.current();
    };

    scope.addEventListener('keydown', onKeyDown);
    return () => scope.removeEventListener('keydown', onKeyDown);
  }, [hasRange]);

  // Click anywhere on the selected span to audition that exact point. Clicks on the
  // handles bubble here too, so the pixels right at the clip's edges — exactly where you
  // aim when you want to hear it from the top — stay seekable instead of being swallowed
  // by a 24px drag target.
  const seekTo = (e: React.MouseEvent) => {
    if (!range) return;
    if (didDragRef.current) return;
    const track = trackRef.current;
    if (!track || duration === 0) return;
    const rect = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;

    // Outside the clip there is nothing to play, and silently snapping to the edge looks
    // like the app ignored the click. Pulse the edge that got in the way instead.
    if (t < range.startSec || t > range.endSec) {
      const edge = t < range.startSec ? 'start' : 'end';
      setEdgeFlash(edge);
      announce(`Fuera del recorte. Arrastrá el ${edge === 'start' ? 'inicio' : 'fin'} para incluir ese punto.`);
    }
    seekPlayhead(t);
  };

  useEffect(() => {
    if (!edgeFlash) return;
    const id = window.setTimeout(() => setEdgeFlash(null), 600);
    return () => window.clearTimeout(id);
  }, [edgeFlash]);

  const addClip = () => {
    if (duration === 0) return;
    onRangeChange({ startSec: 0, endSec: duration });
  };

  const transportBtn = 'w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div ref={containerRef} className="space-y-3">
      <audio ref={audioElRef} src={audioUrl} preload="metadata" className="hidden" />

      {/* One-shot announcements for screen readers — transport actions, zoom changes,
          clicks that landed outside the clip. */}
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

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
          <div className="flex items-baseline justify-center gap-2 py-1" aria-hidden="true">
            <span className={`text-3xl font-mono font-bold tabular-nums transition-colors ${isPlaying ? 'text-primary' : 'text-foreground'}`}>
              {formatPrecise(playhead)}
            </span>
            <span className="text-sm font-mono text-muted-foreground">/ {formatPrecise(duration)}</span>
          </div>

          {/* Zoom controls — the waveform gets cramped/imprecise to drag at full-song
              width, especially for a short section inside a long recording */}
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={fitToSelection}
              aria-label="Ajustar el zoom al recorte"
              title="Ajustar al recorte"
              className="flex items-center gap-1 h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Ajustar
            </button>
            <button
              onClick={() => applyZoom(zoom - 1)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Alejar la onda"
              title="Alejar"
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-muted-foreground w-8 text-center tabular-nums">{zoom}×</span>
            <button
              onClick={() => applyZoom(zoom + 1)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Acercar la onda"
              title="Acercar"
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reference bands for other sections' clips on the same file — scrolls in
              lockstep with the waveform below since it lives inside the same wide track */}
          <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-background">
            <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
              {otherRanges.length > 0 && (
                <div className="relative h-5 mx-2 mt-1.5 text-[11px] text-muted-foreground">
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

              {/* Time ruler — without it, finding 1:20 means playing until you get there.
                  Lives inside the same wide track as the waveform so it scrolls and zooms
                  in lockstep. */}
              <div className="relative h-5 select-none" aria-hidden="true">
                {ticks.map(t => (
                  <div key={t} className="absolute top-0 h-full flex items-start" style={{ left: `${pct(t)}%` }}>
                    <div className="w-px h-1.5 bg-border" />
                    <span className="ml-1 text-[11px] text-muted-foreground tabular-nums leading-none">{formatClock(t)}</span>
                  </div>
                ))}
              </div>

              {/* Waveform + range selection */}
              <div
                ref={trackRef}
                onPointerDown={() => { didDragRef.current = false; }}
                onClick={seekTo}
                className="relative h-40 cursor-pointer select-none"
              >
                <canvas
                  ref={setCanvasEl}
                  role="img"
                  aria-label={`Onda de audio de ${formatSpoken(duration)}`}
                  className="absolute inset-0 w-full h-full text-primary/40"
                />

                {/* Dim the parts outside the selection */}
                <div className="absolute inset-y-0 left-0 bg-background/70" style={{ width: `${pct(range.startSec)}%` }} />
                <div className="absolute inset-y-0 right-0 bg-background/70" style={{ width: `${100 - pct(range.endSec)}%` }} />

                {/* Selected span highlight */}
                <div
                  className="absolute inset-y-0 bg-primary/10 border-y-2 border-primary/50"
                  style={{ left: `${pct(range.startSec)}%`, width: `${pct(range.endSec) - pct(range.startSec)}%` }}
                />

                {/* Playhead — always rendered, including at position 0, so there is
                    something to see and to grab before anything has been played. The bar
                    ignores pointer events so the waveform under it stays clickable; only
                    the grip at the top is draggable, and it is the keyboard control for
                    playback position. */}
                <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${pct(playhead)}%` }}>
                  <div className="absolute inset-y-0 -ml-px w-0.5 bg-foreground" />
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Posición de reproducción"
                    aria-valuemin={range.startSec}
                    aria-valuemax={range.endSec}
                    aria-valuenow={playhead}
                    aria-valuetext={formatSpoken(playhead)}
                    onPointerDown={e => { e.stopPropagation(); didDragRef.current = false; setDragging('playhead'); }}
                    onKeyDown={playheadKeyDown}
                    className="pointer-events-auto absolute top-0 -ml-3 w-6 h-6 flex items-start justify-center cursor-ew-resize rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="w-3 h-2.5 rounded-b bg-foreground shadow-sm" />
                  </div>
                </div>

                {/* Start / end handles. The hit area is 24px wide (WCAG 2.2 target size)
                    while the drawn bar stays thin, and a click that never turned into a
                    drag falls through to the track's seek — otherwise the handle would
                    block the one spot you click to hear the clip from its start. */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Inicio del recorte"
                  aria-valuemin={0}
                  aria-valuemax={range.endSec}
                  aria-valuenow={range.startSec}
                  aria-valuetext={formatSpoken(range.startSec)}
                  onPointerDown={e => { e.stopPropagation(); didDragRef.current = false; setDragging('start'); }}
                  onKeyDown={handleKeyDown('start')}
                  className="absolute inset-y-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                  style={{ left: `${pct(range.startSec)}%` }}
                >
                  <div className={`h-full rounded-full bg-primary shadow-sm transition-all ${edgeFlash === 'start' ? 'w-2 ring-2 ring-primary/60' : 'w-1'}`} />
                </div>

                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Fin del recorte"
                  aria-valuemin={range.startSec}
                  aria-valuemax={duration}
                  aria-valuenow={range.endSec}
                  aria-valuetext={formatSpoken(range.endSec)}
                  onPointerDown={e => { e.stopPropagation(); didDragRef.current = false; setDragging('end'); }}
                  onKeyDown={handleKeyDown('end')}
                  className="absolute inset-y-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                  style={{ left: `${pct(range.endSec)}%` }}
                >
                  <div className={`h-full rounded-full bg-primary shadow-sm transition-all ${edgeFlash === 'end' ? 'w-2 ring-2 ring-primary/60' : 'w-1'}`} />
                </div>
              </div>
            </div>
          </div>

          {decodeFailed && (
            <p className="text-xs text-muted-foreground italic">
              No se pudo dibujar la onda de este archivo, pero el recorte funciona igual.
            </p>
          )}

          {/* Two players with different scopes live in this panel, and nothing used to say
              so. Labelling them is the difference between "why does one sound different"
              and knowing which one you're listening to. */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Solo voz <span className="font-normal normal-case tracking-normal">— para ajustar el recorte</span>
          </p>

          {/* Transport for the isolated vocal clip. Every button has a keyboard
              equivalent on the playhead grip: Home, ←/→, PageUp/PageDown, Space, L. */}
          <div className="flex items-center justify-center gap-1 rounded-full bg-muted/50 p-1">
            <button onClick={restart} aria-label="Volver al inicio del recorte" title="Volver al inicio (Inicio)" className={transportBtn}>
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => skip(-SKIP_SEC)} aria-label={`Retroceder ${SKIP_SEC} segundos`} title={`Retroceder ${SKIP_SEC}s`} className={transportBtn}>
              <Rewind className="w-4 h-4" />
            </button>

            <button
              onClick={togglePreview}
              aria-label={isPlaying ? 'Pausar la voz' : 'Reproducir solo la voz'}
              title={isPlaying ? 'Pausar (Espacio)' : 'Probar recorte (Espacio)'}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button onClick={() => skip(SKIP_SEC)} aria-label={`Adelantar ${SKIP_SEC} segundos`} title={`Adelantar ${SKIP_SEC}s`} className={transportBtn}>
              <FastForward className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLoop(v => !v)}
              aria-pressed={loop}
              aria-label="Repetir el recorte en bucle"
              title="Bucle (L)"
              className={loop
                ? 'w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : transportBtn}
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>

          {/* Precise numeric readouts */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Inicio (mm:ss)</label>
              <input
                value={startText}
                onChange={e => setStartText(e.target.value)}
                onBlur={() => { const s = parsePrecise(startText); if (s != null) commitRange(s, range.endSec); }}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Fin (mm:ss)</label>
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
            <p className="text-xs text-muted-foreground">
              Duración del recorte: <span className="font-mono">{formatPrecise(range.endSec - range.startSec)}</span>
            </p>
            <button
              onClick={() => onRangeChange(undefined)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Quitar recorte
            </button>
          </div>

          {/* Real synced playback — chords + vocal reference together, exactly like it'll
              sound for real, via the same engine the section Play buttons use. Separate
              from the transport above, which only scrubs the isolated vocal clip. */}
          <div className="pt-1 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pt-2">
              Voz + acordes <span className="font-normal normal-case tracking-normal">— cómo va a sonar de verdad</span>
            </p>

            {previewInterrupted && !isChordsPreviewPlaying && (
              <p className="text-xs text-muted-foreground">
                Se detuvo al cambiar el recorte: los acordes y la voz se agendan juntos al
                arrancar, así que hay que volver a lanzarlos para escuchar los límites nuevos.
              </p>
            )}

            <button
              onClick={() => { setPreviewInterrupted(false); onToggleChordsPreview(); }}
              className={`w-full flex items-center justify-center gap-1.5 text-xs rounded-lg py-2 font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${isChordsPreviewPlaying
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'}`}
            >
              {isChordsPreviewPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isChordsPreviewPlaying ? 'Detener' : previewInterrupted ? 'Volver a escuchar con los acordes' : chordsPreviewLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
