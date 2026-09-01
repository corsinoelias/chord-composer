import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Pause, Minus, Plus, Maximize, Type } from 'lucide-react';
import { transposeKey, type ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { PRESETS, type StyleLayout } from '@/lib/chordSheet/presets';
import { SheetPaper } from './SheetPaper';

// Full-screen performance view of a chord sheet — launched from the editor (previews the
// working draft) and the public `/chord-sheet-maker/[slug]` page (perform a shared chart).
// Read-only: it renders the same SheetPaper as everywhere else, just bigger, single-column,
// auto-scrolling, with a screen wake lock so the device doesn't sleep mid-song. The chart
// keeps its own preset (colours/fonts) — only width, column count and global scale change.

const SPEED_KEY = 'csm-stage-speed';
const FONT_KEY = 'csm-stage-font';
const MIN_FONT = 1;
const MAX_FONT = 3;
const FONT_STEP = 0.15;
const MIN_SPEED = 8;   // px/sec
const MAX_SPEED = 90;
const SPEED_STEP = 6;

function readNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch { return fallback; }
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinel = s;
      } catch { /* denied / not focused — nothing we can do */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}

interface Props {
  text: string;
  title: string;
  artist: string;
  baseKey: string;
  capo: number;
  instrument: DiagramInstrument | 'piano';
  chartType: ChartNotation;
  layout: StyleLayout;
  /** Starting transposition in semitones. */
  semi: number;
  /** When given (the editor), transposing in Stage writes back to the doc. */
  onSemiChange?: (semi: number) => void;
  onExit: () => void;
}

export function StageMode({ text, title, artist, baseKey, capo, instrument, chartType, layout, semi: propSemi, onSemiChange, onExit }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Controlled by the parent when it can persist the change (the editor), local otherwise
  // (the read-only public view) — never both, so there's no sync effect to loop on.
  const [localSemi, setLocalSemi] = useState(propSemi);
  const semi = onSemiChange ? propSemi : localSemi;
  const changeSemi = useCallback((delta: number) => {
    if (onSemiChange) onSemiChange(propSemi + delta);
    else setLocalSemi((s) => s + delta);
  }, [onSemiChange, propSemi]);
  const [fontScale, setFontScale] = useState(() => readNum(FONT_KEY, 1.5));
  const [speed, setSpeed] = useState(() => readNum(SPEED_KEY, 28));
  const [scrolling, setScrolling] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [maxWidth, setMaxWidth] = useState(() => (typeof window === 'undefined' ? 900 : Math.min(1100, window.innerWidth - 48)));

  useWakeLock(true);

  useEffect(() => { try { localStorage.setItem(FONT_KEY, String(fontScale)); } catch { /* ignore */ } }, [fontScale]);
  useEffect(() => { try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* ignore */ } }, [speed]);

  useEffect(() => {
    const onResize = () => setMaxWidth(Math.min(1100, window.innerWidth - 48));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-scroll loop — px/sec, frame-rate independent, stops at the bottom. Keeps its own
  // sub-pixel accumulator because a per-frame delta below ~0.5px is lost to scrollTop's
  // rounding; re-syncs if the reader scrolls by hand.
  useEffect(() => {
    if (!scrolling) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let acc = el.scrollTop;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (Math.abs(acc - el.scrollTop) > 4) acc = el.scrollTop; // reader took over
      acc += (speed * dt) / 1000;
      el.scrollTop = acc;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setScrolling(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, speed]);

  // Auto-hide the control bar a few seconds after the last interaction (only while scrolling).
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const bumpControls = useCallback(() => {
    setControlsShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsShown(false), 3200);
  }, []);
  useEffect(() => {
    if (!scrolling) { clearTimeout(hideTimer.current); setControlsShown(true); return; }
    bumpControls();
    return () => clearTimeout(hideTimer.current);
  }, [scrolling, bumpControls]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onExit();
  }, [onExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': e.preventDefault(); exit(); break;
        case ' ': e.preventDefault(); setScrolling((s) => !s); break;
        case 'ArrowUp': e.preventDefault(); setSpeed((s) => Math.min(MAX_SPEED, s + SPEED_STEP)); break;
        case 'ArrowDown': e.preventDefault(); setSpeed((s) => Math.max(MIN_SPEED, s - SPEED_STEP)); break;
        case '+': case '=': e.preventDefault(); changeSemi(1); break;
        case '-': case '_': e.preventDefault(); changeSemi(-1); break;
        case ']': e.preventDefault(); setFontScale((f) => Math.min(MAX_FONT, +(f + FONT_STEP).toFixed(2))); break;
        case '[': e.preventDefault(); setFontScale((f) => Math.max(MIN_FONT, +(f - FONT_STEP).toFixed(2))); break;
        case 'f': case 'F': toggleFullscreen(); break;
        default: return;
      }
      bumpControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, toggleFullscreen, bumpControls, changeSemi]);

  const stageLayout: StyleLayout = useMemo(
    () => ({ ...layout, columns: 1, scale: layout.scale * fontScale }),
    [layout, fontScale],
  );

  const preset = PRESETS[layout.preset];
  const displayKey = transposeKey(baseKey, semi);

  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20 disabled:opacity-40';

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col"
      style={{ background: `color-mix(in srgb, ${preset.paper} 82%, #000)` }}
      onPointerMove={bumpControls}
      onTouchStart={bumpControls}
    >
      {/* Control bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3 transition-opacity duration-300 ${controlsShown ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 p-1.5 shadow-xl backdrop-blur">
          <button type="button" className={btn} onClick={exit} title="Exit (Esc)"><X className="h-4 w-4" /></button>
          <span className="mx-0.5 h-6 w-px bg-white/15" />

          <button
            type="button"
            className={`${btn} ${scrolling ? 'bg-primary/80 hover:bg-primary' : ''}`}
            onClick={() => setScrolling((s) => !s)}
            title="Auto-scroll (Space)"
          >
            {scrolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button type="button" className={btn} onClick={() => setSpeed((s) => Math.max(MIN_SPEED, s - SPEED_STEP))} title="Slower (↓)"><Minus className="h-4 w-4" /></button>
          <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-white/70">{Math.round(speed)}px/s</span>
          <button type="button" className={btn} onClick={() => setSpeed((s) => Math.min(MAX_SPEED, s + SPEED_STEP))} title="Faster (↑)"><Plus className="h-4 w-4" /></button>
          <span className="mx-0.5 h-6 w-px bg-white/15" />

          <button type="button" className={btn} onClick={() => changeSemi(-1)} title="Transpose down (−)"><span className="text-sm font-bold">♭</span></button>
          <span className="min-w-[2.5rem] text-center font-mono text-sm font-bold text-white">{displayKey}</span>
          <button type="button" className={btn} onClick={() => changeSemi(1)} title="Transpose up (+)"><span className="text-sm font-bold">♯</span></button>
          <span className="mx-0.5 h-6 w-px bg-white/15" />

          <button type="button" className={btn} onClick={() => setFontScale((f) => Math.max(MIN_FONT, +(f - FONT_STEP).toFixed(2)))} title="Smaller text ([)"><Type className="h-3 w-3" /></button>
          <button type="button" className={btn} onClick={() => setFontScale((f) => Math.min(MAX_FONT, +(f + FONT_STEP).toFixed(2)))} title="Bigger text (])"><Type className="h-5 w-5" /></button>
          <span className="mx-0.5 h-6 w-px bg-white/15" />

          <button type="button" className={btn} onClick={toggleFullscreen} title="Fullscreen (F)"><Maximize className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Scrolling chart */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 py-20 sm:py-24">
          <SheetPaper
            text={text}
            title={title}
            artist={artist}
            baseKey={baseKey}
            semi={semi}
            capo={capo}
            instrument={instrument}
            chartType={chartType}
            layout={stageLayout}
            maxWidthPx={maxWidth}
          />
          {/* tail space so the last line can scroll clear of the bottom edge */}
          <div className="h-[40vh]" />
        </div>
      </div>
    </div>
  );
}
