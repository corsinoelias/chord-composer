import { useEffect, useMemo, useRef, useState } from 'react';
import { getGuitarVoicing, type GuitarVoicing } from '@/data/guitarChords';
import type { Accidental, Chord, ChordQuality, RootNote } from '@/lib/musicTheory';
import { chordLabel, chordNoteNames, makeChord, resample, SILENT_VOICING } from '@/lib/guitarStrum/strumTheory';
import { computeFretboardGeometry } from '@/lib/guitarStrum/fretboardGeometry';
import {
  baseLibrary, defaultArpPattern, defaultPatternId, defaultPatternName, defaultStrumPattern,
  loadCustomPatterns, resamplePatternData, saveCustomPatterns,
} from '@/lib/guitarStrum/strumPatterns';
import type { ArpPatternData, GridSize, PatternEntry, SchedEvent, StrumMode, StrumPatternData } from '@/lib/guitarStrum/types';
import {
  closeAudioContext, currentAudioTime, fadeOutSequencer, getAudioContext, hasAudioContext,
  primeSequencer, scheduleArpStep, scheduleClick, schedulePluck, scheduleStrum,
  setSustain as setEngineSustain,
} from '@/lib/guitarStrum/strumAudio';
import { StrumTransport } from './StrumTransport';
import { StrumFretboard } from './StrumFretboard';
import { StrumPatternGrid } from './StrumPatternGrid';
import { ChordProgressionBar } from './ChordProgressionBar';
import { PatternLibraryPopover } from './PatternLibraryPopover';

const INITIAL_CHORDS: Chord[] = [
  makeChord('D', '', 'maj'),
  makeChord('B', '', 'min'),
  makeChord('G', '', 'maj'),
  makeChord('D', '', 'sus4'),
  makeChord('A', '', 'maj'),
];

const STRUM_HINT_SEEN_KEY = 'cs_guitar_strum_hint_seen_v1';

type PopoverKind = 'chord' | 'pattern' | null;
interface VibrationState { amp: number; t0: number; freq: number }

interface LiveRefs {
  currentVoicing: GuitarVoicing;
  popoverOpen: boolean;
  togglePlay: () => void;
  manualStrum: (direction: 'down' | 'up') => void;
  pluck: (stringIndex: number) => void;
}

export function GuitarStrummingPlayer() {
  const [bpm, setBpm] = useState(96);
  const [steps, setSteps] = useState<GridSize>(8);
  const [mode, setMode] = useState<StrumMode>('strum');
  const [playing, setPlaying] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [countBeat, setCountBeat] = useState('');
  const [chords, setChords] = useState<Chord[]>(INITIAL_CHORDS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeChordIndex, setActiveChordIndex] = useState(-1);
  const [activeStep, setActiveStep] = useState(-1);
  const [strumPattern, setStrumPattern] = useState<StrumPatternData>(() => defaultStrumPattern(8));
  const [arpPattern, setArpPattern] = useState<ArpPatternData>(() => defaultArpPattern(8));
  const [library, setLibrary] = useState<PatternEntry[]>(() => baseLibrary().concat(loadCustomPatterns()));
  const [currentIds, setCurrentIds] = useState<{ strum: string | null; arp: string | null }>({
    strum: defaultPatternId('strum', 8), arp: defaultPatternId('arp', 8),
  });
  const [patternNames, setPatternNames] = useState<{ strum: string; arp: string }>({
    strum: defaultPatternName('strum', 8), arp: defaultPatternName('arp', 8),
  });
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState<{ strum: boolean; arp: boolean }>({ strum: false, arp: false });
  const [popover, setPopover] = useState<PopoverKind>(null);
  const [sustain, setSustainState] = useState(1.3);
  const [fretboardSize, setFretboardSize] = useState({ w: 0, h: 0 });
  // Starts false so SSR and the pre-hydration client render agree (no hydration
  // mismatch); the effect below flips it on right after mount for a first-time visitor.
  const [showStrumHint, setShowStrumHint] = useState(false);

  const fbRef = useRef<HTMLDivElement>(null);
  const stringRefs = useRef<(SVGPathElement | null)[]>([null, null, null, null, null, null]);
  const geoRef = useRef({ ys: [0, 1, 2, 3, 4, 5].map(i => 30 + i * 48), x0: 47, x1: 1000, gap: 48, height: 300 });
  const vibRef = useRef<VibrationState[]>([0, 1, 2, 3, 4, 5].map(() => ({ amp: 0, t0: -9, freq: 15 })));
  const visQueueRef = useRef<SchedEvent[]>([]);
  const posRef = useRef(0);
  const nextTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const activeStepRef = useRef(-1);
  const activeChordRef = useRef(-1);
  const countBeatRef = useRef('');

  // Mirrors PlaybackContext's optionsRef pattern (see CLAUDE.md): the tick() scheduler
  // below reads live values through this ref so BPM/pattern/chord/assignment edits apply
  // on the next grid step without needing to restart playback.
  const stateRef = useRef({ bpm, steps, mode, chords, strumPattern, arpPattern, assignments, library });
  useEffect(() => {
    stateRef.current = { bpm, steps, mode, chords, strumPattern, arpPattern, assignments, library };
  }, [bpm, steps, mode, chords, strumPattern, arpPattern, assignments, library]);

  const selectedChord: Chord = chords[selectedIndex] ?? chords[0];
  const currentChord: Chord = playing && activeChordIndex >= 0 ? (chords[activeChordIndex] ?? selectedChord) : selectedChord;
  const currentVoicing = useMemo(() => getGuitarVoicing(currentChord) ?? SILENT_VOICING, [currentChord]);
  const geometry = useMemo(
    () => computeFretboardGeometry(currentVoicing, fretboardSize.w, fretboardSize.h),
    [currentVoicing, fretboardSize],
  );

  useEffect(() => {
    geoRef.current = { ys: geometry.ys, x0: geometry.x0, x1: geometry.x1, gap: geometry.gap, height: geometry.height };
  }, [geometry]);

  function pushVisual(event: { time: number; strings: number[]; spread: number; amp: number } | null) {
    if (event) visQueueRef.current.push({ kind: 'strum', ...event });
  }

  function dismissStrumHint() {
    setShowStrumHint(false);
    try { window.localStorage.setItem(STRUM_HINT_SEEN_KEY, 'true'); } catch { /* storage unavailable */ }
  }

  function manualStrum(direction: 'down' | 'up') {
    dismissStrumHint();
    const audioCtx = getAudioContext();
    pushVisual(scheduleStrum(currentVoicing, direction, audioCtx.currentTime + 0.01, false, false));
  }

  function pluck(stringIndex: number) {
    dismissStrumHint();
    pushVisual(schedulePluck(currentVoicing, stringIndex));
  }

  function tick() {
    const audioCtx = getAudioContext();
    const horizon = audioCtx.currentTime + 0.22;
    const s = stateRef.current;
    const stepDuration = ((60 / s.bpm) * 4) / s.steps;
    while (nextTimeRef.current < horizon) {
      const globalIndex = posRef.current;
      const stepIndex = globalIndex % s.steps;
      const chordCount = Math.max(1, s.chords.length);
      const chordIndex = Math.floor(globalIndex / s.steps) % chordCount;
      const chord = s.chords[chordIndex];
      if (chord) {
        const assignedId = s.assignments[chordIndex];
        const assignedEntry = assignedId ? s.library.find(p => p.id === assignedId) : undefined;
        const activeMode: StrumMode = assignedEntry ? assignedEntry.mode : s.mode;
        const data = assignedEntry
          ? resamplePatternData(activeMode, assignedEntry.data, s.steps)
          : activeMode === 'strum' ? s.strumPattern : s.arpPattern;
        const voicing = getGuitarVoicing(chord) ?? SILENT_VOICING;
        if (activeMode === 'strum') {
          const value = (data as StrumPatternData)[stepIndex] ?? 0;
          if (value) pushVisual(scheduleStrum(voicing, value === 2 ? 'up' : 'down', nextTimeRef.current, true, value === 3));
        } else {
          const rows = data as ArpPatternData;
          const activeStrings: number[] = [];
          for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
            if (rows[stringIdx]?.[stepIndex] && voicing.frets[stringIdx] >= 0) activeStrings.push(stringIdx);
          }
          if (activeStrings.length) pushVisual(scheduleArpStep(voicing, activeStrings, nextTimeRef.current));
        }
      }
      visQueueRef.current.push({ kind: 'grid', time: nextTimeRef.current, step: stepIndex, chordIndex });
      nextTimeRef.current += stepDuration;
      posRef.current += 1;
    }
  }

  function play() {
    const audioCtx = getAudioContext();
    primeSequencer(audioCtx.currentTime);
    posRef.current = 0;
    let start = audioCtx.currentTime + 0.12;
    if (countIn) {
      const beatDuration = 60 / bpm;
      for (let i = 0; i < 4; i++) {
        scheduleClick(start + i * beatDuration, i === 0);
        visQueueRef.current.push({ kind: 'count', time: start + i * beatDuration, label: String(i + 1) });
      }
      start += 4 * beatDuration;
      visQueueRef.current.push({ kind: 'count', time: start, label: '' });
    }
    nextTimeRef.current = start;
    setPlaying(true);
    timerRef.current = window.setInterval(tick, 25);
    tick();
  }

  function stop() {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    fadeOutSequencer(getAudioContext().currentTime);
    visQueueRef.current = [];
    setPlaying(false);
    setActiveStep(-1);
    setActiveChordIndex(-1);
    setCountBeat('');
    activeStepRef.current = -1;
    activeChordRef.current = -1;
    countBeatRef.current = '';
  }

  function togglePlay() {
    if (timerRef.current === null) play(); else stop();
  }

  const liveRef = useRef<LiveRefs>({
    currentVoicing, popoverOpen: false, togglePlay, manualStrum, pluck,
  });
  liveRef.current = { currentVoicing, popoverOpen: popover !== null, togglePlay, manualStrum, pluck };

  // RAF loop: drains the visual event queue against audio-clock time (vibration cues,
  // active-step highlight, count-in text), then imperatively redraws the 6 vibrating
  // string paths — kept off React state for smooth motion, same approach the original
  // design prototype used. Everything it reads is a ref, so it's set up once on mount.
  useEffect(() => {
    let rafId: number;
    const frame = () => {
      if (hasAudioContext()) {
        const now = currentAudioTime();
        let stepEvent: Extract<SchedEvent, { kind: 'grid' }> | null = null;
        while (visQueueRef.current.length && visQueueRef.current[0].time <= now + 0.01) {
          const event = visQueueRef.current.shift()!;
          if (event.kind === 'strum') {
            event.strings.forEach((stringIdx, k) => {
              vibRef.current[stringIdx] = { amp: event.amp, t0: now + k * event.spread, freq: 13 + stringIdx * 2.2 };
            });
          } else if (event.kind === 'grid') {
            stepEvent = event;
          } else if (event.kind === 'count' && event.label !== countBeatRef.current) {
            countBeatRef.current = event.label;
            setCountBeat(event.label);
          }
        }
        if (stepEvent && (stepEvent.step !== activeStepRef.current || stepEvent.chordIndex !== activeChordRef.current)) {
          activeStepRef.current = stepEvent.step;
          activeChordRef.current = stepEvent.chordIndex;
          setActiveStep(stepEvent.step);
          setActiveChordIndex(stepEvent.chordIndex);
        }
      }

      const t = performance.now() / 1000;
      const geo = geoRef.current;
      const length = geo.x1 - geo.x0;
      const seg = Math.max(24, length / 24);
      for (let i = 0; i < 6; i++) {
        const el = stringRefs.current[i];
        if (!el) continue;
        const v = vibRef.current[i];
        const age = hasAudioContext() ? currentAudioTime() - v.t0 : 99;
        const amp = age < 0 ? 0 : v.amp * Math.exp(-age * 2.6) * (geo.gap / 44);
        const y = geo.ys[i];
        if (amp < 0.35) {
          el.setAttribute('d', `M${geo.x0} ${y} L${geo.x1} ${y}`);
          el.setAttribute('stroke', 'hsl(220 12% 72%)');
        } else {
          const phase = t * v.freq * 6.283;
          const sway = Math.sin(phase);
          let d = `M${geo.x0} ${y}`;
          for (let x = geo.x0 + seg; x < geo.x1; x += seg) {
            const env = Math.sin((Math.PI * (x - geo.x0)) / length);
            d += ` L${x.toFixed(1)} ${(y + amp * env * sway).toFixed(2)}`;
          }
          d += ` L${geo.x1} ${y}`;
          el.setAttribute('d', d);
          el.setAttribute('stroke', 'hsl(262 83% 74%)');
        }
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STRUM_HINT_SEEN_KEY) !== 'true') setShowStrumHint(true);
    } catch {
      setShowStrumHint(true); // storage unavailable (private mode) — show it once per page load instead
    }
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const el = fbRef.current;
      const w = el ? Math.round(el.clientWidth) : 0;
      const h = el ? Math.round(el.clientHeight) : 0;
      setFretboardSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    let observer: ResizeObserver | null = null;
    if (window.ResizeObserver && fbRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(fbRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.key === 'Escape' && liveRef.current.popoverOpen) { setPopover(null); return; }
      if (e.code === 'Space') { e.preventDefault(); liveRef.current.togglePlay(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); liveRef.current.manualStrum('down'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); liveRef.current.manualStrum('up'); }
      else if (/^[1-6]$/.test(e.key)) { liveRef.current.pluck(6 - parseInt(e.key, 10)); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      closeAudioContext();
    };
  }, []);

  // ── grid editing ──────────────────────────────────────────────────────────
  function setGrid(n: GridSize) {
    if (steps === n) return;
    setSteps(n);
    setStrumPattern(resample(strumPattern, n, 0));
    setArpPattern(arpPattern.map(row => resample(row, n, false)));
  }
  function cycleStep(i: number) {
    const next = strumPattern.slice();
    next[i] = (((next[i] ?? 0) + 1) % 4) as StrumPatternData[number];
    setStrumPattern(next);
    setDirty({ ...dirty, strum: true });
  }
  function toggleArpCell(stringIndex: number, step: number) {
    setArpPattern(arpPattern.map((row, i) => (i === stringIndex ? row.map((v, s) => (s === step ? !v : v)) : row)));
    setDirty({ ...dirty, arp: true });
  }

  // ── pattern library ───────────────────────────────────────────────────────
  function currentData(): StrumPatternData | ArpPatternData {
    return mode === 'strum' ? strumPattern.slice() : arpPattern.map(row => row.slice());
  }
  function loadPattern(entry: PatternEntry) {
    setMode(entry.mode);
    setCurrentIds({ ...currentIds, [entry.mode]: entry.id });
    setPatternNames({ ...patternNames, [entry.mode]: entry.name });
    setDirty({ ...dirty, [entry.mode]: false });
    if (entry.mode === 'strum') setStrumPattern(resample(entry.data as StrumPatternData, steps, 0));
    else setArpPattern((entry.data as ArpPatternData).map(row => resample(row, steps, false)));
    setPopover(null);
  }
  function savePattern() {
    const name = (patternNames[mode] || '').trim() || `My pattern ${library.filter(p => p.custom).length + 1}`;
    const existing = library.find(p => p.id === currentIds[mode] && p.mode === mode);
    let nextLibrary: PatternEntry[];
    let nextId: string;
    if (existing && existing.custom) {
      nextLibrary = library.map(p => (p.id === existing.id ? { ...p, name, steps, data: currentData() } : p));
      nextId = existing.id;
    } else {
      const entry: PatternEntry = { id: `c-${Date.now()}`, name, mode, steps, data: currentData(), custom: true };
      nextLibrary = library.concat([entry]);
      nextId = entry.id;
    }
    setLibrary(nextLibrary);
    saveCustomPatterns(nextLibrary);
    setCurrentIds({ ...currentIds, [mode]: nextId });
    setPatternNames({ ...patternNames, [mode]: name });
    setDirty({ ...dirty, [mode]: false });
    setPopover(null);
  }
  function deletePattern(id: string) {
    const nextLibrary = library.filter(p => p.id !== id);
    setLibrary(nextLibrary);
    saveCustomPatterns(nextLibrary);
    const nextAssignments: Record<number, string> = {};
    Object.entries(assignments).forEach(([k, v]) => { if (v !== id) nextAssignments[Number(k)] = v; });
    setAssignments(nextAssignments);
    setCurrentIds({
      strum: currentIds.strum === id ? null : currentIds.strum,
      arp: currentIds.arp === id ? null : currentIds.arp,
    });
  }
  function newPattern() {
    setCurrentIds({ ...currentIds, [mode]: null });
    setPatternNames({ ...patternNames, [mode]: '' });
    setDirty({ ...dirty, [mode]: false });
    if (mode === 'strum') setStrumPattern(new Array(steps).fill(0) as StrumPatternData);
    else setArpPattern([0, 1, 2, 3, 4, 5].map(() => new Array(steps).fill(false)));
    setPopover(null);
  }
  function clearPattern() {
    if (mode === 'strum') { setStrumPattern(new Array(steps).fill(0) as StrumPatternData); setDirty({ ...dirty, strum: true }); }
    else { setArpPattern([0, 1, 2, 3, 4, 5].map(() => new Array(steps).fill(false))); setDirty({ ...dirty, arp: true }); }
  }

  // ── chord progression editing ─────────────────────────────────────────────
  function addChord() {
    const next = chords.concat([makeChord(selectedChord.root, selectedChord.accidental, selectedChord.quality)]);
    setChords(next);
    setSelectedIndex(next.length - 1);
  }
  function duplicateChord() {
    const next = chords.slice();
    next.splice(selectedIndex + 1, 0, makeChord(selectedChord.root, selectedChord.accidental, selectedChord.quality));
    setChords(next);
    setSelectedIndex(selectedIndex + 1);
  }
  function deleteChord() {
    const i = selectedIndex;
    const filtered = chords.filter((_, k) => k !== i);
    const next = filtered.length ? filtered : [makeChord('C', '', 'maj')];
    const nextAssignments: Record<number, string> = {};
    chords.forEach((_, k) => {
      if (k === i || !assignments[k]) return;
      nextAssignments[k < i ? k : k - 1] = assignments[k];
    });
    setChords(next);
    setAssignments(nextAssignments);
    setSelectedIndex(Math.max(0, i - 1));
    if (next.length <= 1) setPopover(null);
  }
  function setChordRoot(root: RootNote, accidental: Accidental) {
    setChords(chords.map((c, i) => (i === selectedIndex ? { ...c, root, accidental } : c)));
  }
  function setChordQuality(quality: ChordQuality) {
    setChords(chords.map((c, i) => (i === selectedIndex ? { ...c, quality } : c)));
  }
  function assignToChord() {
    const id = currentIds[mode];
    if (!id) return;
    const next = { ...assignments };
    if (next[selectedIndex] === id) delete next[selectedIndex];
    else next[selectedIndex] = id;
    setAssignments(next);
  }

  // ── derived display values ────────────────────────────────────────────────
  const currentId = currentIds[mode];
  const currentEntry = library.find(p => p.id === currentId && p.mode === mode) ?? null;
  const isDirty = dirty[mode];
  const patternLabel = (currentEntry ? currentEntry.name : patternNames[mode] || 'Unsaved') + (isDirty ? ' •' : '');
  const assignedIdOfSelected = assignments[selectedIndex];
  const assigned = !!(assignedIdOfSelected && currentId && assignedIdOfSelected === currentId);
  const mutedStrings = [0, 1, 2, 3, 4, 5].map(i => currentVoicing.frets[i] < 0);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'hsl(220 20% 97%)' }}>
      <StrumTransport
        playing={playing}
        onTogglePlay={togglePlay}
        bpm={bpm}
        onBpmChange={setBpm}
        countIn={countIn}
        onToggleCountIn={() => setCountIn(!countIn)}
        sustain={sustain}
        onSustainChange={v => { setSustainState(v); setEngineSustain(v); }}
        mode={mode}
        onModeChange={setMode}
        steps={steps}
        onStepsChange={setGrid}
      />

      <StrumFretboard
        geometry={geometry}
        fbRef={fbRef}
        stringRefs={stringRefs}
        showDiagram
        chordName={chordLabel(currentChord)}
        chordNotes={chordNoteNames(currentChord)}
        countBeat={countBeat}
        onPluck={pluck}
        onStrumDown={() => manualStrum('down')}
        onStrumUp={() => manualStrum('up')}
        showHint={showStrumHint}
        onDismissHint={dismissStrumHint}
      />

      <section style={{
        flex: '0 1 auto', minHeight: 0, maxHeight: '58%', position: 'relative', background: '#fff',
        borderTop: '1px solid hsl(220 13% 87%)', padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <ChordProgressionBar
          chords={chords}
          selectedIndex={selectedIndex}
          activeChordIndex={activeChordIndex}
          playing={playing}
          assignments={assignments}
          library={library}
          onSelectChip={i => { setSelectedIndex(i); setPopover('chord'); }}
          onAddChord={addChord}
          popoverOpen={popover === 'chord'}
          onClosePopover={() => setPopover(null)}
          onDuplicate={duplicateChord}
          onDelete={deleteChord}
          onRootChange={setChordRoot}
          onQualityChange={setChordQuality}
        />

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StrumPatternGrid
            mode={mode}
            steps={steps}
            strumPattern={strumPattern}
            arpPattern={arpPattern}
            activeStep={activeStep}
            mutedStrings={mutedStrings}
            onCycleStep={cycleStep}
            onToggleArpCell={toggleArpCell}
            patternLabel={patternLabel}
            patternPopoverOpen={popover === 'pattern'}
            onTogglePatternPopover={() => setPopover(popover === 'pattern' ? null : 'pattern')}
            assigned={assigned}
            assignDisabled={!currentId}
            assignLabel={assigned ? `✓ ${chordLabel(selectedChord)}` : `Assign to ${chordLabel(selectedChord)}`}
            onAssignToggle={assignToChord}
            dirty={isDirty}
            onSavePattern={savePattern}
            onClearPattern={clearPattern}
          />

          {popover === 'pattern' && (
            <PatternLibraryPopover
              mode={mode}
              steps={steps}
              library={library}
              currentId={currentId}
              patternName={patternNames[mode]}
              onNameChange={name => setPatternNames({ ...patternNames, [mode]: name })}
              onSelect={loadPattern}
              onDelete={deletePattern}
              onNew={newPattern}
              onSave={savePattern}
              saveLabel={currentEntry && currentEntry.custom ? 'Save' : 'Create'}
            />
          )}
        </div>
      </section>

      {popover && <div onClick={() => setPopover(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}
    </div>
  );
}
