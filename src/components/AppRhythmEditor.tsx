import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, Copy, Play, Square, Trash2, VolumeX, X, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type AppStyle, appStepsPerBar } from '@/lib/appStyles';
import {
  GROOVE_TRACKS, cloneDense, differs, effectiveVariation, baseVariation, resizeLane, sectionGrooveOf,
  type DenseVariation, type GrooveTrack, type VariationKey,
} from '@/lib/groove';
import { type Section, type TrackId } from '@/lib/sections';
import { type Chord } from '@/lib/musicTheory';
import { type StylePattern } from '@/lib/styles';
import { type StyleLookup } from '@/lib/sectionPlayback';
import { getSoundType, soundTimbre, type InstrumentState } from '@/lib/instruments';
import { AppPlayback, fillNow, subscribeEngineState, type AppSong } from '@/lib/appEngine/player';
import { previewAppCell } from '@/lib/appEngine/preview';
import { loadKits, type DrumKit } from '@/lib/appEngine/host';
import { engineChord } from '@/lib/appEngine/fromSong';
import { DRUM_ROWS, GM_PERC_FIRST } from '@/lib/appEngine/commands';
import {
  CHORD_INTERVALS, DEG, GM_PERC_NAMES, ROW_TONE, STRENGTHS, TONE_LETTER, TONE_NAME, accent, hitTone, notesOf, notesOnRow, packHit,
  packNotes, percFamily, percTones, pitchName, rowOf, rowText, scaleOf, semitoneOf, strengthOf, toggleAccent, toneMark,
  vel, withVelocity, type StepNote,
} from '@/lib/appEngine/steps';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePlayback } from '@/contexts/PlaybackContext';
import { toast } from 'sonner';
import '@/styles/chord-player.css';

/**
 * The rhythm editor for a rhythm of the app's (the library's, or the app's own styles): the
 * web's counterpart of the app's rhythm editor (rhythm_editor.dart, step_grid.dart), designed
 * in docs and the prototype of 2026-09-27.
 *
 * It edits one section at a time, and the section keeps a copy of only what was edited
 * (section.groove, groove.ts): variations A and B, each track's pattern and bar count, the
 * fill carril a carril. The engine plays the edit while the editor is open; Save keeps it in
 * the song, Cancel leaves the song as it was.
 */

const TRACK_TABS: { id: GrooveTrack; name: string; color: string }[] = [
  { id: 'drums', name: 'Drums', color: '#FF3849' },
  { id: 'piano', name: 'Piano', color: '#E8B93E' },
  { id: 'guitar', name: 'Guitar', color: '#34C3B0' },
  { id: 'bass', name: 'Bass', color: '#8C7AE6' },
  { id: 'synth', name: 'Synth', color: '#DD3C71' },
];
const trackColor = (t: GrooveTrack) => TRACK_TABS.find((x) => x.id === t)!.color;
const trackName = (t: GrooveTrack) => TRACK_TABS.find((x) => x.id === t)!.name;
const isTrackKey = (k: string): k is GrooveTrack => (GROOVE_TRACKS as readonly string[]).includes(k);
const KIT_ORDER = ['kick', 'snare', 'rim', 'clap', 'hihat', 'hihatOpen', 'hihatFoot', 'tom1', 'tom2', 'floorTom', 'ride', 'crash'];
const PERC_ROWS = DRUM_ROWS.filter((r) => r.startsWith('perc'));
const CORE = ['kick', 'snare', 'hihat'];
const ROW_NAMES: Record<string, string> = {
  kick: 'Kick', snare: 'Snare', rim: 'Rim', clap: 'Clap', hihat: 'Hi-hat', hihatOpen: 'Open hat', hihatFoot: 'Hat pedal',
  tom1: 'Tom 1', tom2: 'Tom 2', floorTom: 'Floor tom', ride: 'Ride', crash: 'Crash',
};
const rowColor = (r: string) => (r === 'kick' ? '#FF3849' : r === 'snare' ? '#F5A524'
  : ['rim', 'tom1', 'tom2', 'floorTom'].includes(r) ? '#E8C547' : r.startsWith('perc') ? '#DE5AA0' : '#4CC3DC');

/** What one section is being edited into: both variations spelled out, and which tracks it silences. */
interface Draft {
  a: DenseVariation | null;
  b: DenseVariation | null;
  silenced: Partial<Record<TrackId, boolean>>;
}

/** A row of the grid: a kit row, the whole chord, or a degree 1-8 with its alteration. */
interface Lane { key: string; row: string; color: string; chord?: boolean; k?: number; a?: number }
const laneId = (l: Pick<Lane, 'key' | 'chord' | 'k' | 'a'>) => `${l.key}|${l.chord ? 'c' : ''}|${l.k ?? ''}|${l.a ?? ''}`;

export interface AppRhythmEditorProps {
  open: boolean;
  onClose: () => void;
  style: AppStyle;
  /** The song's own rhythm, resolved — what the loop is built with. */
  songStyle: StylePattern;
  lookup: StyleLookup;
  sections: Section[];
  /** Which sections play this rhythm, and so can be edited here. */
  editable: number[];
  initialSection: number;
  bpm: number;
  transposition: number;
  instruments: InstrumentState[];
  swing?: number;
  /** Save: the song's sections with the edited ones given their groove (and silences). */
  onSave: (sections: Section[]) => void;
}

export function AppRhythmEditor(props: AppRhythmEditorProps) {
  const { open, onClose, style, songStyle, lookup, sections, editable, initialSection, bpm, transposition, instruments, swing, onSave } = props;
  const spb = appStepsPerBar(style);
  const stepsPerBeat = Math.max(1, Math.round(16 / style.meter.unit));
  const isMobile = useIsMobile();
  // A page is the whole bar where it fits; on a phone, half of it (two beats in four), as the
  // app splits it — shown one at a time, never stacked, so the grid does not grow tall.
  const per = isMobile ? Math.max(stepsPerBeat, Math.ceil(spb / 2 / stepsPerBeat) * stepsPerBeat) : spb;
  const chunks = Math.ceil(spb / per);
  const { state: mainPlayback, stop: stopMain } = usePlayback();

  const [sec, setSec] = useState(initialSection);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [v, setV] = useState<VariationKey>('a');
  const [mode, setMode] = useState<'groove' | 'fill'>('groove');
  const [tab, setTab] = useState<GrooveTrack>('drums');
  /** The page on screen: a bar of the pattern, or half of one on a phone. */
  const [page, setPage] = useState(0);
  /** While the loop plays the page follows the bar that sounds, as the app's grid does; paging by hand stops it. */
  const [follow, setFollow] = useState(true);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ li: number; s: number } | null>(null);
  /** The open cell window, by row (not position: an accidental moves a note to a row that did not exist). */
  const [pop, setPop] = useState<{ id: string; s: number; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [kits, setKits] = useState<DrumKit[]>([]);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);

  // Each opening starts from the song as it is.
  useEffect(() => {
    if (!open) return;
    setSec(initialSection);
    setDrafts({});
    setV(sections[initialSection]?.variation === 1 ? 'b' : 'a');
    setMode('groove'); setTab('drums'); setPage(0); setAdded(new Set()); setFocus(null); setPop(null); setMenu(null);
    setConfirmDiscard(false);
    undo.current = []; redo.current = [];
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadKits().then(setKits).catch(() => {}); }, []);

  const section = sections[sec];
  const draftOf = useCallback((i: number, from: Record<number, Draft> = drafts): Draft => from[i] ?? {
    a: effectiveVariation(style, sections[i], 'a'),
    b: effectiveVariation(style, sections[i], 'b'),
    silenced: { ...(sections[i]?.silenced ?? {}) },
  }, [drafts, sections, style]);
  const draft = draftOf(sec);
  const isPart = !!section?.stylePart;
  const variation = (draft[v] ?? draft.a)!;
  const base = useMemo(() => baseVariation(style, section ?? {}, v) ?? baseVariation(style, section ?? {}, 'a')!, [style, section, v]);
  const dirty = Object.keys(drafts).length > 0;

  /** Every edit goes through here: undoable, and on the section on screen. */
  const change = useCallback((fn: (d: Draft) => void) => {
    setDrafts((prev) => {
      undo.current.push(JSON.stringify(prev));
      if (undo.current.length > 100) undo.current.shift();
      redo.current = [];
      const d = draftOf(sec, prev);
      const next: Draft = { a: d.a && cloneDense(d.a), b: d.b && cloneDense(d.b), silenced: { ...d.silenced } };
      fn(next);
      return { ...prev, [sec]: next };
    });
  }, [draftOf, sec]);
  const V = (d: Draft) => (d[v] ?? d.a)!;

  // ── The section's chords, step by step: what a pattern plays over, and names its rows with ──
  const chordSteps = useMemo(() => {
    const out: { chord: Chord; from: number; to: number }[] = [];
    let at = 0;
    for (const chord of section?.chords ?? []) {
      const n = Math.max(1, Math.round(chord.duration * 4));
      out.push({ chord, from: at, to: at + n });
      at += n;
    }
    return { list: out, total: at };
  }, [section]);
  const sectionBars = Math.max(1, Math.ceil(chordSteps.total / spb));
  const chordAtStep = useCallback((abs: number): Chord | undefined => {
    if (!chordSteps.list.length) return undefined;
    const at = ((abs % chordSteps.total) + chordSteps.total) % chordSteps.total;
    return chordSteps.list.find((c) => at >= c.from && at < c.to)?.chord ?? chordSteps.list[0].chord;
  }, [chordSteps]);
  /** The bar of the section the bar on screen is first heard in: the fill is always the last one. */
  const shownSectionBar = mode === 'fill' ? sectionBars - 1 : Math.floor(page / chunks);
  const refChord = chordAtStep(shownSectionBar * spb);
  const ref = refChord ? engineChord(refChord, transposition) : { root: 0, quality: 'maj', bass: -1 };
  const chordLabel = refChord ? chordName(refChord) : '';

  // ── The loop: this section on its own, held open, playing what is being edited ──
  const playbackRef = useRef<AppPlayback | null>(null);
  const [playing, setPlaying] = useState(false);
  const [engine, setEngine] = useState<{ step: number; bar: number; fillBar: boolean; fillByHand: number } | null>(null);
  const loopInput = useCallback((drafts: Record<number, Draft>): AppSong => {
    const d = draftOf(sec, drafts);
    const s = section;
    const groove = sectionGrooveOf(style, s, { a: d.a, b: d.b });
    return {
      song: {
        sections: [{ ...s, repeatCount: 1, groove, silenced: d.silenced, variation: v === 'b' && d.b ? 1 : 0 }],
        bpm, transposition, instrumentSettings: instruments, swing, holdOpen: true,
      },
      style: songStyle,
      lookup,
    };
  }, [draftOf, sec, section, style, v, bpm, transposition, instruments, swing, songStyle, lookup]);
  useEffect(() => { if (playing) void playbackRef.current?.update(loopInput(drafts)); }, [drafts, v, playing, loopInput]);
  useEffect(() => {
    if (!playing) { setEngine(null); return; }
    return subscribeEngineState((st) => setEngine((prev) => (prev && prev.step === st.step && prev.bar === st.bar && prev.fillBar === st.fillBar && prev.fillByHand === st.fillByHand
      ? prev : { step: st.step, bar: st.bar, fillBar: st.fillBar, fillByHand: st.fillByHand })));
  }, [playing]);
  const stopLoop = useCallback(() => { playbackRef.current?.stop(); playbackRef.current = null; setPlaying(false); }, []);
  const startLoop = useCallback(async () => {
    // One thing plays at a time: the song behind the editor stops for the loop.
    if (mainPlayback.isPlaying) stopMain();
    stopLoop();
    const pb = new AppPlayback();
    playbackRef.current = pb;
    setPlaying(true);
    setFollow(true);
    try { await pb.play(loopInput(drafts)); } catch { setPlaying(false); toast.error('Could not start the sound'); }
  }, [stopLoop, loopInput, drafts, mainPlayback.isPlaying, stopMain]);
  useEffect(() => { if (!open) stopLoop(); }, [open, stopLoop]);
  useEffect(() => () => { playbackRef.current?.stop(); }, []);
  // Another section: the loop follows it.
  useEffect(() => { if (playing) void startLoop(); }, [sec]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reading the grid ──
  const fillWrites = (key: string) => Object.prototype.hasOwnProperty.call(variation.fill.lanes, key);
  const lanes: Lane[] = useMemo(() => {
    if (tab !== 'drums') {
      const alt = new Set<string>();
      for (const l of [variation.rows[tab]?.lane, variation.fill.lanes[tab]]) {
        for (const p of l ?? []) for (const n of notesOf(p)) { const r = rowOf(n); if (r && r.a) alt.add(`${r.k}:${r.a}`); }
      }
      const out: Lane[] = [{ key: tab, row: 'lane', chord: true, color: trackColor(tab) }];
      for (let k = 1; k <= 8; k++) {
        if (alt.has(`${k}:-1`)) out.push({ key: tab, row: 'lane', k, a: -1, color: trackColor(tab) });
        out.push({ key: tab, row: 'lane', k, a: 0, color: trackColor(tab) });
        if (alt.has(`${k}:1`)) out.push({ key: tab, row: 'lane', k, a: 1, color: trackColor(tab) });
      }
      return out;
    }
    const rows = variation.rows.drums ?? {};
    const plays = (r: string) => rows[r]?.some(Boolean) || (mode === 'fill' && !!variation.fill.lanes[r]);
    return [...KIT_ORDER, ...PERC_ROWS].filter((r) => CORE.includes(r) || plays(r) || added.has(r))
      .map((r) => ({ key: r, row: r, color: rowColor(r) }));
  }, [tab, variation, mode, added]);
  const bars = variation.bars[tab];
  const pageCount = mode === 'fill' ? chunks : bars * chunks;
  const pageNow = Math.min(page, pageCount - 1);
  const shownBar = mode === 'fill' ? 0 : Math.floor(pageNow / chunks);
  const shownChunk = pageNow % chunks;
  const valueAt = (lane: Lane, s: number): number => {
    if (mode === 'fill' && fillWrites(lane.key)) return variation.fill.lanes[lane.key][s] ?? 0;
    const b = mode === 'fill' ? bars - 1 : shownBar;
    const l = tab === 'drums' ? variation.rows.drums[lane.row] : variation.rows[tab]?.lane;
    return l?.[b * spb + s] ?? 0;
  };
  const drumSoundOf = (row: string): number | undefined => {
    if (style.drumSounds[row] !== undefined) return style.drumSounds[row];
    const kitIndex = getSoundType('drums', instruments.find((i) => i.id === 'drums')?.soundTypeId ?? 'acoustic')?.kit ?? 2;
    return kits[kitIndex]?.rows[row];
  };
  const rowLabel = (row: string): { name: string; sub: string } => {
    if (!row.startsWith('perc')) return { name: ROW_NAMES[row] ?? row, sub: '' };
    const note = (drumSoundOf(row) ?? GM_PERC_FIRST) - GM_PERC_FIRST;
    const lanesHere = [variation.rows.drums[row], variation.fill.lanes[row]].filter(Boolean) as number[][];
    const toned = lanesHere.some((l) => l.some((p) => p && hitTone(p)));
    const fam = percFamily(note);
    return { name: toned && fam ? fam : GM_PERC_NAMES[note] ?? `Perc ${note}`, sub: row.replace('perc', 'Perc ') };
  };
  const keyName = (key: string) => (isTrackKey(key) ? trackName(key) : rowLabel(key).name);

  // ── Writing ──
  /** The lane an edit at step [s] writes into: the fill (a copy of the groove's last bar on a first touch) or the pattern bar on screen. */
  const laneFor = (d: Draft, lane: Lane): { arr: number[]; i: (s: number) => number } => {
    const x = V(d);
    if (mode === 'fill') {
      if (!Object.prototype.hasOwnProperty.call(x.fill.lanes, lane.key)) {
        const b = x.bars[tab];
        const src = tab === 'drums' ? x.rows.drums[lane.row] : x.rows[tab]?.lane;
        x.fill.lanes[lane.key] = src ? src.slice((b - 1) * spb, b * spb) : new Array(spb).fill(0);
      }
      return { arr: x.fill.lanes[lane.key], i: (s) => s };
    }
    if (tab === 'drums') {
      x.rows.drums[lane.row] ??= new Array(x.bars.drums * spb).fill(0);
      return { arr: x.rows.drums[lane.row], i: (s) => shownBar * spb + s };
    }
    x.rows[tab].lane ??= new Array(x.bars[tab] * spb).fill(0);
    return { arr: x.rows[tab].lane, i: (s) => shownBar * spb + s };
  };
  const audition = (lane: Lane, p: number, s: number) => {
    if (!p || playing) return;
    if (tab === 'drums') { previewAppCell({ track: 'drums', row: lane.row, packed: p, drumSound: drumSoundOf(lane.row) }); return; }
    const inst = instruments.find((i) => i.id === tab);
    const sound = getSoundType(tab, inst?.soundTypeId ?? '');
    const chord = chordAtStep((mode === 'fill' ? sectionBars - 1 : shownBar) * spb + s);
    previewAppCell({ track: tab, row: 'lane', packed: p, chord, transposition, timbre: soundTimbre(sound), program: sound?.program, low: style.voicings[tab] });
  };
  /** Writes one cell from what it shows now, and plays what was written. */
  const write = (lane: Lane, s: number, fn: (p: number) => number) => {
    const next = fn(valueAt(lane, s));
    if (mode === 'fill' && !fillWrites(lane.key)) toast(`${keyName(lane.key)} now plays its own fill: its groove bar was copied in`);
    change((d) => {
      const { arr, i } = laneFor(d, lane);
      arr[i(s)] = next;
    });
    audition(lane, next, s);
  };
  const toggle = (li: number, s: number) => {
    const lane = lanes[li];
    setFocus({ li, s });
    if (tab === 'drums') { write(lane, s, (p) => (p ? 0 : packHit(205))); return; }
    if (lane.chord) { write(lane, s, (p) => (p && notesOf(p)[0]?.d === DEG.chord ? 0 : packNotes(p ? vel(p) : 205, [{ d: DEG.chord, o: 0, a: 0 }], p ? accent(p) : 0))); return; }
    write(lane, s, (p) => {
      const here = notesOnRow(p, lane.k!, lane.a!);
      let list = notesOf(p).filter((n) => n.d !== DEG.chord);
      if (here.length) list = list.filter((n) => !here.includes(n));
      else {
        if (list.length >= 2) { list = [list[0]]; toast('Two notes per step at most: the second one was replaced'); }
        list.push({ d: 7 + lane.k!, a: lane.a!, o: 0 });
      }
      return packNotes(p ? vel(p) : 205, list, p ? accent(p) : 0);
    });
  };

  // ── Undo, and the keyboard ──
  const doUndo = useCallback(() => {
    const last = undo.current.pop();
    if (last === undefined) return;
    setDrafts((prev) => { redo.current.push(JSON.stringify(prev)); return JSON.parse(last); });
  }, []);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (next === undefined) return;
    setDrafts((prev) => { undo.current.push(JSON.stringify(prev)); return JSON.parse(next); });
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, doUndo, doRedo]);
  const cellKey = (e: ReactKeyboardEvent, li: number, s: number) => {
    const move = ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as Record<string, number[]>)[e.key];
    if (move) {
      e.preventDefault();
      const next = { li: Math.max(0, Math.min(lanes.length - 1, li + move[0])), s: Math.max(0, Math.min(spb - 1, s + move[1])) };
      setFocus(next);
      requestAnimationFrame(() => (document.querySelector(`[data-cell="${next.li}-${next.s}"]`) as HTMLElement | null)?.focus());
    } else if ((e.key === ' ' || e.key === 'Enter') && !e.shiftKey) { e.preventDefault(); toggle(li, s); }
    else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const r = (e.target as HTMLElement).getBoundingClientRect();
      setPop({ id: laneId(lanes[li]), s, x: r.left, y: r.bottom });
    }
  };

  // ── Track actions ──
  const setBars = (n: 1 | 2 | 4) => change((d) => {
    const x = V(d);
    const from = x.bars[tab];
    for (const r of Object.keys(x.rows[tab])) x.rows[tab][r] = resizeLane(x.rows[tab][r], from, n, spb);
    x.bars[tab] = n;
  });
  const clearTrack = () => change((d) => {
    const x = V(d);
    if (mode === 'fill') {
      for (const k of Object.keys(x.fill.lanes)) if (tab === 'drums' ? !isTrackKey(k) : k === tab) x.fill.lanes[k] = new Array(spb).fill(0);
    } else for (const r of Object.keys(x.rows[tab])) x.rows[tab][r] = x.rows[tab][r].map(() => 0);
  });
  const copyOther = () => {
    const other: VariationKey = v === 'a' ? 'b' : 'a';
    change((d) => {
      const src = d[other];
      const dst = d[v];
      if (!src || !dst) return;
      dst.rows[tab] = JSON.parse(JSON.stringify(src.rows[tab]));
      dst.bars[tab] = src.bars[tab];
    });
    toast(`${trackName(tab)} copied from ${other.toUpperCase()}`);
  };
  const backToRhythm = () => change((d) => {
    const x = V(d);
    const b = cloneDense(base);
    if (mode === 'fill') x.fill = b.fill;
    else { x.rows[tab] = b.rows[tab]; x.bars[tab] = b.bars[tab]; }
  });
  /** This track as edited here, on every other section that plays this rhythm. */
  const applyToAll = () => {
    const mine = V(draft);
    setDrafts((prev) => {
      undo.current.push(JSON.stringify(prev));
      const next = { ...prev };
      for (const i of editable) {
        if (i === sec || sections[i].stylePart) continue;
        const d = draftOf(i, prev);
        const x = d[v];
        if (!x) continue;
        const copy: Draft = { a: d.a && cloneDense(d.a), b: d.b && cloneDense(d.b), silenced: { ...d.silenced } };
        copy[v]!.rows[tab] = JSON.parse(JSON.stringify(mine.rows[tab]));
        copy[v]!.bars[tab] = mine.bars[tab];
        next[i] = copy;
      }
      return next;
    });
    toast(`${trackName(tab)} of ${v.toUpperCase()} now plays like this in every section with this rhythm`);
  };
  const silenced = !!draft.silenced[tab];
  const edited = mode === 'fill' ? differs(variation, base, 'fill') : differs(variation, base, tab);

  // ── Save and cancel ──
  const save = () => {
    const next = sections.map((s, i) => {
      const d = drafts[i];
      if (!d) return s;
      const groove = sectionGrooveOf(style, s, { a: d.a, b: d.b });
      const out: Section = { ...s, silenced: Object.fromEntries(Object.entries(d.silenced).filter(([, on]) => on)) };
      if (!Object.keys(out.silenced!).length) delete out.silenced;
      if (groove) out.groove = groove; else delete out.groove;
      return out;
    });
    onSave(next);
    stopLoop();
    onClose();
  };
  const cancel = () => {
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return; }
    stopLoop();
    onClose();
  };

  // ── Menus ──
  const openLaneMenu = (lane: Lane, x: number, y: number) => {
    const items: MenuItem[] = [{ head: keyName(lane.key) }];
    if (mode === 'fill' && fillWrites(lane.key)) {
      items.push({ label: 'Keep groove here (out of the fill)', run: () => change((d) => { delete V(d).fill.lanes[lane.key]; }) });
    } else if (mode === 'fill') {
      items.push({ label: 'Play its own fill', run: () => change((d) => { laneFor(d, lane); }) });
    }
    items.push({ label: mode === 'fill' ? 'Clear its fill' : tab === 'drums' ? 'Clear row' : 'Clear track', run: () => change((d) => {
      const x = V(d);
      if (mode === 'fill' && x.fill.lanes[lane.key]) x.fill.lanes[lane.key] = new Array(spb).fill(0);
      else if (tab === 'drums' && x.rows.drums[lane.row]) x.rows.drums[lane.row] = x.rows.drums[lane.row].map(() => 0);
      else if (tab !== 'drums') x.rows[tab].lane = x.rows[tab].lane.map(() => 0);
    }) });
    if (tab === 'drums' && !CORE.includes(lane.row)) {
      items.push({ label: 'Remove from the groove', run: () => {
        change((d) => { delete V(d).rows.drums[lane.row]; delete V(d).fill.lanes[lane.row]; });
        setAdded((a) => { const n = new Set(a); n.delete(lane.row); return n; });
      } });
    }
    setMenu({ items, x, y });
  };
  const openPieceMenu = (x: number, y: number) => {
    const shown = new Set(lanes.map((l) => l.row));
    const kit = KIT_ORDER.filter((r) => !shown.has(r));
    const perc = PERC_ROWS.filter((r) => !shown.has(r));
    setMenu({
      x, y,
      items: [
        { head: 'Kit' }, ...kit.map((r) => ({ label: ROW_NAMES[r], run: () => setAdded((a) => new Set(a).add(r)) })),
        ...(perc.length ? [{ head: 'Hand percussion' } as MenuItem] : []),
        ...perc.map((r) => ({ label: `${rowLabel(r).name} (${r.replace('perc', 'Perc ')})`, run: () => setAdded((a) => new Set(a).add(r)) })),
      ],
    });
  };

  // ── Where the music is ──
  const playhead = (() => {
    if (!playing || !engine) return -1;
    if (mode === 'fill') return engine.fillBar ? engine.step : -1;
    if (engine.fillBar) return -1;
    return engine.bar % bars === shownBar ? engine.step : -1;
  })();
  // Following: the page moves to where the music is, bar and half bar, groove or fill.
  useEffect(() => {
    if (!playing || !follow || !engine) return;
    const chunk = Math.min(chunks - 1, Math.floor(engine.step / per));
    let target: number;
    if (mode === 'fill') {
      if (!engine.fillBar) return;
      target = chunk;
    } else {
      if (engine.fillBar) return;
      target = (engine.bar % bars) * chunks + chunk;
    }
    if (target !== pageNow) setPage(target);
  }, [engine, playing, follow, mode, bars, chunks, per, pageNow]);

  if (!section) return null;
  const popLane = pop ? lanes.find((l) => laneId(l) === pop.id) : undefined;

  // ── Layout ──
  const labelW = isMobile ? (tab === 'drums' ? 70 : 50) : (tab === 'drums' ? 108 : 72);
  const gap = isMobile ? 3 : 5;
  const cols = `${labelW}px repeat(${per}, minmax(0, 1fr))`;
  const from = variation.fill.from;
  const fillKeys = Object.keys(variation.fill.lanes);
  const hasB = !!draft.b;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent
        className="cp flex h-[94vh] max-h-[980px] w-[calc(100vw-16px)] max-w-[1180px] flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden"
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
        onEscapeKeyDown={(e) => { if (pop || menu) { e.preventDefault(); setPop(null); setMenu(null); } }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--cp-ln)' }}>
          <div className="flex min-w-0 flex-col">
            <span className="cp-lbl">Edit rhythm · {style.id.startsWith('lib-') ? 'rhythm library' : 'app style'}</span>
            <DialogTitle className="m-0 truncate text-base font-bold">{style.name}</DialogTitle>
            <DialogDescription className="m-0 text-xs" style={{ color: edited ? 'var(--cp-act)' : 'var(--cp-mu)' }}>
              {edited
                ? <>{mode === 'fill' ? 'The fill' : trackName(tab)}: own version in this section · <button className="border-0 bg-transparent p-0 font-bold underline" style={{ color: 'var(--cp-act)' }} onClick={backToRhythm}>Back to rhythm</button></>
                : `${mode === 'fill' ? 'The fill' : trackName(tab)}: plays the rhythm as written`}
            </DialogDescription>
          </div>
          {editable.length > 1 && (
            <select
              className="h-9 rounded-full border px-3 text-sm font-semibold"
              style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
              value={sec}
              onChange={(e) => { setSec(Number(e.target.value)); setPage(0); setFocus(null); const s = sections[Number(e.target.value)]; setV(s?.variation === 1 && !s.stylePart ? 'b' : 'a'); if (s?.stylePart) setMode('groove'); }}
              aria-label="Section"
            >
              {editable.map((i) => <option key={i} value={i}>{sections[i].name}{drafts[i] ? ' •' : ''}</option>)}
            </select>
          )}
          <div className="flex-1" />
          {!isPart && (
            <button type="button" className="cp-btn" onClick={() => (playing ? fillNow() : toast('Start the loop to throw the fill in'))}
              title="The section plays its fill on the next bar"
              style={engine?.fillByHand === 2 ? { background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' } : engine?.fillByHand === 1 ? { borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : undefined}>
              <Zap size={15} />{isMobile ? 'Fill' : 'Fill now'}
            </button>
          )}
          <button type="button" className="cp-btn" onClick={() => (playing ? stopLoop() : void startLoop())}>
            {playing ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{playing ? 'Stop' : isMobile ? 'Loop' : 'Loop section'}
          </button>
          <button type="button" className="cp-btn" onClick={cancel}>Cancel</button>
          <button type="button" className="cp-btn" style={{ background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }} onClick={save}>Save</button>
        </div>
        {confirmDiscard && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" style={{ background: 'var(--cp-acs)' }}>
            <span className="flex-1">Discard what you changed? The song stays as it was.</span>
            <button type="button" className="cp-btn" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
            <button type="button" className="cp-btn" style={{ color: 'var(--cp-dg)' }} onClick={() => { setConfirmDiscard(false); stopLoop(); onClose(); }}>Discard</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b px-3" role="tablist" style={{ borderColor: 'var(--cp-ln)' }}>
          {TRACK_TABS.map((t) => {
            const own = differs(variation, base, t.id);
            const inFill = t.id === 'drums' ? fillKeys.some((k) => !isTrackKey(k)) : fillKeys.includes(t.id);
            const on = tab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on}
                onClick={() => { setTab(t.id); setPage(0); setFocus(null); }}
                className="flex items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 pb-2.5 pt-3 text-sm font-semibold"
                style={{ color: on ? 'var(--cp-tx)' : 'var(--cp-mu)', borderBottom: `2px solid ${on ? 'var(--cp-ac)' : 'transparent'}` }}>
                <span className="h-2 w-2 rounded" style={{ background: t.color }} />{t.name}
                {own && <span className="rounded-full px-1.5 text-[9.5px] font-extrabold" style={{ background: 'var(--cp-acs)', color: 'var(--cp-act)' }}>OWN</span>}
                {inFill && !isPart && <Zap size={11} style={{ color: '#E8940F' }} aria-label="The fill plays this track" />}
                {draft.silenced[t.id] && <VolumeX size={12} aria-label="Silenced here" />}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
            {!isPart && (
              <div className="flex overflow-hidden rounded-[11px] border" role="group" aria-label="Variation" style={{ borderColor: 'var(--cp-ln)' }}>
                {(['a', 'b'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={v === k} disabled={k === 'b' && !hasB}
                    onClick={() => { setV(k); setPage(0); if (playing) toast(`Switching to ${k.toUpperCase()} through the fill, on the next bar`); }}
                    className="h-[34px] min-w-[38px] border-0 px-3 text-[13px] font-extrabold disabled:opacity-40"
                    style={v === k ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'transparent', color: 'var(--cp-mu)' }}
                    title={k === 'b' && !hasB ? 'This rhythm has no variation B' : `Variation ${k.toUpperCase()}`}>{k.toUpperCase()}</button>
                ))}
              </div>
            )}
            {!isPart && (
              <div className="flex overflow-hidden rounded-[11px] border" role="group" aria-label="Groove or fill" style={{ borderColor: 'var(--cp-ln)' }}>
                {(['groove', 'fill'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setFocus(null); }}
                    className="flex h-[34px] items-center gap-1.5 border-0 px-3 text-[13px] font-bold"
                    style={mode === m ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)' } : { background: 'transparent', color: 'var(--cp-mu)' }}>
                    {m === 'groove' ? 'Groove' : 'Fill'}
                    {m === 'fill' && engine?.fillBar && <span className="h-[7px] w-[7px] rounded-full" style={{ background: '#E8940F' }} aria-label="The fill is playing" />}
                  </button>
                ))}
              </div>
            )}
            <span className="text-xs" style={{ color: 'var(--cp-mu)' }}>
              {isPart ? `${section.stylePart!.kind === 'intro' ? 'Intro' : 'Ending'} part: one variation, no fill`
                : engine?.fillBar ? 'The fill is playing'
                  : mode === 'fill' ? 'The last bar of the section, and every 8 bars'
                    : `Variation ${v.toUpperCase()}`}
            </span>
            <div className="flex-1" />
            <span className="cp-cap h-[34px] rounded-full px-3 text-[12.5px]" title="Change it in Instruments" style={{ background: 'var(--cp-s2)' }}>
              {getSoundType(tab, instruments.find((i) => i.id === tab)?.soundTypeId ?? '')?.name ?? 'Sound'}
            </span>
            {mode === 'groove' && (
              <select className="h-[34px] rounded-full border px-3 text-[12.5px] font-semibold" aria-label="Bars"
                style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
                value={bars} onChange={(e) => setBars(Number(e.target.value) as 1 | 2 | 4)}>
                <option value={1}>1 bar</option><option value={2}>2 bars</option><option value={4}>4 bars</option>
              </select>
            )}
            <ToolButton pressed={silenced} onClick={() => change((d) => { d.silenced[tab] = !d.silenced[tab]; })} title="Keep the pattern, play nothing here"><VolumeX size={15} />Silence</ToolButton>
            <ToolButton onClick={clearTrack} title="Empty this track (Ctrl Z brings it back)"><Trash2 size={15} />Clear</ToolButton>
            {!isPart && hasB && <ToolButton onClick={copyOther} title="Copy this track from the other variation"><Copy size={15} />Copy from {v === 'a' ? 'B' : 'A'}</ToolButton>}
            {!isPart && editable.length > 1 && mode === 'groove' && <ToolButton onClick={applyToAll} title="Every section with this rhythm plays this track like this">Apply to every section</ToolButton>}
          </div>

          {/* The fill map */}
          {mode === 'fill' && (
            <div className="mx-4 mb-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2" style={{ borderColor: 'var(--cp-ln2)' }}>
              <span className="cp-lbl mr-1">Fill {v.toUpperCase()} rewrites</span>
              {fillKeys.length ? fillKeys.map((k) => (
                <button key={k} type="button" className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  style={{ borderColor: 'var(--cp-ln)', background: 'var(--cp-s1)', color: 'var(--cp-tx)' }}
                  onClick={() => { setTab(isTrackKey(k) ? k : 'drums'); setFocus(null); }}>
                  <i className="inline-block h-2 w-2 rounded-sm" style={{ background: isTrackKey(k) ? trackColor(k) : rowColor(k) }} />{keyName(k)}
                </button>
              )) : <span className="text-xs" style={{ color: 'var(--cp-mu)' }}>nothing yet: tap a cell to start the fill</span>}
              <span className="ml-auto text-xs" style={{ color: 'var(--cp-mu)' }}>From step {from + 1} · everything else keeps its groove</span>
            </div>
          )}

          {/* The grid */}
          <div className="px-4 pb-4">
            <div className="rounded-2xl border px-3 pb-3" style={{ borderColor: 'var(--cp-ln)' }}>
              {/* Where you are, and the other pages: at the top, and held there while the grid scrolls. */}
              <div className="sticky top-0 z-[5] -mx-3 mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-2xl border-b px-3 py-2"
                style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)' }}>
                <span className="text-[13px] font-bold">
                  {mode === 'fill' ? `Fill · from step ${from + 1}` : `Bar ${shownBar + 1} of ${bars}`}
                  {chunks > 1 && <span className="font-semibold" style={{ color: 'var(--cp-mu)' }}> · beats {Math.floor((shownChunk * per) / stepsPerBeat) + 1}–{Math.min(spb, (shownChunk + 1) * per) / stepsPerBeat}</span>}
                </span>
                {tab !== 'drums' && <span className="text-xs" style={{ color: 'var(--cp-mu)' }}>names over <b style={{ color: 'var(--cp-tx)' }}>{chordLabel}</b> (bar {shownSectionBar + 1})</span>}
                <span className="flex-1" />
                {playing && (
                  <button type="button" aria-pressed={follow} onClick={() => setFollow((on) => !on)}
                    title="The grid moves to the bar that is playing"
                    className="h-[30px] rounded-full border px-2.5 text-xs font-semibold"
                    style={follow ? { background: 'var(--cp-acs)', borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : { background: 'transparent', borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }}>
                    {follow ? '● Following' : 'Follow'}
                  </button>
                )}
                {pageCount > 1 && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--cp-tx2)' }}>
                    <button type="button" className="cp-icb" style={{ width: 30, height: 30 }} disabled={pageNow === 0} onClick={() => { setFollow(false); setPage(pageNow - 1); }} aria-label={chunks > 1 ? 'Previous page' : 'Previous bar'}>‹</button>
                    {pageNow + 1}/{pageCount}
                    <button type="button" className="cp-icb" style={{ width: 30, height: 30 }} disabled={pageNow >= pageCount - 1} onClick={() => { setFollow(false); setPage(pageNow + 1); }} aria-label={chunks > 1 ? 'Next page' : 'Next bar'}>›</button>
                  </span>
                )}
              </div>
              {[shownChunk].map((c) => (
                <div key={c} className="grid gap-1.5">
                  <div className="grid items-center" style={{ gridTemplateColumns: cols, columnGap: gap }}>
                    <span />
                    {Array.from({ length: Math.min(per, spb - c * per) }, (_, i) => {
                      const s = c * per + i;
                      const onBeat = s % stepsPerBeat === 0;
                      if (mode === 'fill') {
                        return (
                          <button key={s} type="button" onClick={() => change((d) => { V(d).fill.from = s; })} title="The fill starts here"
                            className="h-[22px] rounded-md border-0 p-0 text-[10.5px]"
                            style={{ fontFamily: 'var(--cp-mono, monospace)', background: s === from ? 'var(--cp-ac)' : 'transparent', color: s === from ? '#fff' : onBeat ? 'var(--cp-tx)' : 'var(--cp-fa)', opacity: s < from ? 0.4 : 1, fontWeight: onBeat || s === from ? 700 : 400 }}>
                            {s + 1}
                          </button>
                        );
                      }
                      return <span key={s} className="text-center text-[10.5px]" style={{ fontFamily: 'var(--cp-mono, monospace)', color: onBeat ? 'var(--cp-tx)' : 'var(--cp-fa)', fontWeight: onBeat ? 700 : 400 }}>{onBeat ? s / stepsPerBeat + 1 : '·'}</span>;
                    })}
                  </div>
                  {lanes.map((lane, li) => {
                    const writes = mode === 'fill' && fillWrites(lane.key);
                    const slim = tab !== 'drums' && !lane.chord && !!lane.a;
                    let tag: JSX.Element;
                    if (tab === 'drums') {
                      const lab = rowLabel(lane.row);
                      tag = (
                        <button type="button" className="flex h-full min-h-[28px] sm:min-h-[34px] flex-col justify-center rounded-[9px] border bg-transparent px-2 text-left text-[11.5px] font-bold leading-tight"
                          style={{ borderColor: lane.color, background: `color-mix(in srgb, ${lane.color} 12%, transparent)`, color: 'var(--cp-tx)', opacity: c ? 0.55 : 1 }}
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }} title={`${lab.name} · options`}>
                          <span className="truncate">{lab.name}</span>
                          {mode === 'fill'
                            ? <span className="text-[9px] font-extrabold uppercase" style={{ color: writes ? '#E8940F' : 'var(--cp-mu)' }}>{writes ? 'Fill' : 'Groove'}</span>
                            : lab.sub && <small className="truncate text-[9.5px] font-semibold" style={{ color: 'var(--cp-mu)' }}>{lab.sub}</small>}
                        </button>
                      );
                    } else if (lane.chord) {
                      tag = (
                        <button type="button" className="flex h-full min-h-[28px] sm:min-h-[34px] items-center gap-1.5 rounded-[9px] border bg-transparent px-2 text-left"
                          style={{ borderColor: lane.color, color: 'var(--cp-tx)', opacity: c ? 0.55 : 1 }}
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }} title="The whole chord">
                          <b className="text-[13px]">●</b><small className="text-[9.5px] font-semibold" style={{ color: 'var(--cp-mu)' }}>{chordLabel}</small>
                          {mode === 'fill' && <span className="text-[9px] font-extrabold uppercase" style={{ color: writes ? '#E8940F' : 'var(--cp-mu)' }}>{writes ? 'Fill' : 'Groove'}</span>}
                        </button>
                      );
                    } else {
                      const semi = scaleOf(ref.quality)[lane.k! - 1] + lane.a!;
                      const iv = CHORD_OF(ref.quality);
                      const tone = iv.includes(((semi % 12) + 12) % 12);
                      tag = (
                        <button type="button" className={`flex items-center gap-1.5 rounded-[9px] border bg-transparent text-left ${slim ? 'h-[18px] px-1.5' : 'h-full min-h-[28px] sm:min-h-[34px] px-2'}`}
                          style={{ borderColor: lane.a ? 'var(--cp-ln)' : lane.color, background: tone ? `color-mix(in srgb, ${lane.color} 24%, transparent)` : 'transparent', color: 'var(--cp-tx)', opacity: c ? 0.55 : 1 }}
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }}
                          title={`Degree ${rowText(lane.k!, lane.a!)} of the ${chordLabel} scale${tone ? ' · a note of the chord' : ''}`}>
                          <b className={slim ? 'text-[11px]' : 'min-w-[20px] text-[13px]'}>{rowText(lane.k!, lane.a!)}</b>
                          <small className={slim ? 'text-[9px]' : 'text-[9.5px] font-semibold'} style={{ color: 'var(--cp-mu)' }}>{pitchName(ref.root + semi)}</small>
                        </button>
                      );
                    }
                    return (
                      <div key={`${lane.key}-${lane.k ?? ''}-${lane.a ?? ''}-${lane.chord ? 'c' : ''}`} className="grid items-center" style={{ gridTemplateColumns: cols, columnGap: gap, marginBottom: lane.chord ? 6 : 0 }}>
                        {tag}
                        {Array.from({ length: Math.min(per, spb - c * per) }, (_, i) => {
                          const s = c * per + i;
                          const p = valueAt(lane, s);
                          let on = false; let mark = ''; let ring = false; let octMark = '';
                          if (tab === 'drums') { on = p > 0; if (on) mark = toneMark(hitTone(p)); }
                          else if (lane.chord) on = p > 0 && notesOf(p)[0]?.d === DEG.chord;
                          else {
                            const here = notesOnRow(p, lane.k!, lane.a!);
                            on = here.length > 0;
                            const ct = here.find((n) => n.d < DEG.scale1);
                            if (ct) { mark = TONE_LETTER[ct.d]; ring = true; }
                            const o = here.find((n) => n.o);
                            if (o) octMark = o.o > 0 ? `+${o.o}` : `${o.o}`;
                          }
                          const faded = mode === 'fill' && (s < from || !writes);
                          const alpha = [0.5, 0.7, 0.86, 1][on ? strengthOf(p) : 0];
                          const focused = focus?.li === li && focus?.s === s;
                          const cellStyle: CSSProperties = {
                            background: on ? `color-mix(in srgb, ${lane.color} ${Math.round(alpha * 100)}%, var(--cp-s2))` : 'var(--cp-s2)',
                            opacity: faded && playhead !== s ? 0.32 : 1,
                            boxShadow: playhead === s ? 'inset 0 0 0 2px var(--cp-tx)' : focused ? 'inset 0 0 0 2px var(--cp-ac)' : ring && on ? 'inset 0 0 0 2px #0B0D12' : undefined,
                            height: slim ? 18 : isMobile ? 28 : 36,
                            borderRadius: slim ? 5 : 8,
                          };
                          return (
                            <Cell key={s} data={`${li}-${s}`} style={cellStyle} tabIndex={focused || (!focus && li === 0 && s === 0) ? 0 : -1}
                              label={`${tab === 'drums' ? rowLabel(lane.row).name : lane.chord ? 'Whole chord' : `Degree ${rowText(lane.k!, lane.a!)}`}, step ${s + 1}${on ? ', on' : ''}`}
                              onTap={() => toggle(li, s)}
                              onHold={(x, y) => setPop({ id: laneId(lane), s, x, y })}
                              onKey={(e) => cellKey(e, li, s)}>
                              {mark && <span className="text-[12px] font-extrabold" style={{ color: '#0B0D12' }}>{mark}</span>}
                              {on && accent(p) ? <span className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full" style={{ background: '#0B0D12' }} /> : null}
                              {octMark && <span className="absolute bottom-0 right-1 text-[9px] font-bold" style={{ fontFamily: 'var(--cp-mono, monospace)', color: '#0B0D12' }}>{octMark}</span>}
                            </Cell>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                {tab === 'drums' && (
                  <button type="button" className="h-8 rounded-[9px] border border-dashed bg-transparent px-2.5 text-xs font-semibold"
                    style={{ borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx2)' }}
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openPieceMenu(r.left, r.bottom); }}>+ Add piece</button>
                )}
                <span className="min-w-[180px] flex-1 text-xs" style={{ color: 'var(--cp-mu)' }}>
                  {mode === 'fill' ? 'Tap a step number to move where the fill starts. The first tap on a Groove lane copies its last bar into the fill.'
                    : tab === 'drums' ? 'Tap to add or remove a hit · hold or right-click for strength and tone'
                      : 'Tap a degree to add that note (two per step) · hold or right-click for ♭ ♯, octave, chord tone and strength'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11.5px] sm:flex" style={{ borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }}>
          {tab === 'drums'
            ? <><span><b>H</b> open · high</span><span><b>M</b> muted</span><span><b>L</b> low</span><span>● accent</span><span>shade = strength</span></>
            : <><span><b>tinted row</b> a note of the chord</span><span><b>slim row</b> altered degree</span><span><b>R 3 5 7 9 8</b> in a cell: follows the chord</span><span><b>+1</b> octave up</span></>}
          <span className="flex-1" />
          <span>Ctrl Z undoes · Esc closes a menu</span>
        </div>

        {popLane && pop && (
          <CellPopover
            lane={popLane} s={pop.s} x={pop.x} y={pop.y} p={valueAt(popLane, pop.s)} tab={tab}
            title={tab === 'drums' ? rowLabel(popLane.row).name : popLane.chord ? `Whole chord (${chordLabel})` : `Degree ${rowText(popLane.k!, popLane.a!)}`}
            drumSound={tab === 'drums' ? drumSoundOf(popLane.row) : undefined}
            chords={chordsOfSection(section.chords, transposition)}
            onWrite={(fn, moveTo) => {
              write(popLane, pop.s, fn);
              // An accidental moves the note to another row: the window follows it there.
              if (moveTo) setPop({ ...pop, id: laneId({ ...popLane, a: moveTo.a }) });
            }}
            onClose={() => setPop(null)}
          />
        )}
        {menu && <Menu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      </DialogContent>
    </Dialog>
  );
}

// ── Pieces ──

const CHORD_OF = (quality: string) => CHORD_INTERVALS[quality] ?? CHORD_INTERVALS.maj;

function chordName(c: Chord): string {
  const q: Record<string, string> = { maj: '', min: 'm', '7': '7', maj7: 'maj7', min7: 'm7', dim: 'dim', aug: 'aug', sus4: 'sus4', sus2: 'sus2' };
  return `${c.root}${c.accidental === '#' ? '♯' : c.accidental === 'b' ? '♭' : ''}${q[c.quality] ?? c.quality}`;
}
function chordsOfSection(chords: Chord[], transposition: number) {
  const seen = new Set<string>();
  const out: { name: string; root: number; quality: string }[] = [];
  for (const c of chords) {
    const e = engineChord(c, transposition);
    const name = chordName(c);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, root: e.root, quality: e.quality });
  }
  return out.slice(0, 6);
}

type MenuItem = { head: string } | { label: string; run: () => void };

function Menu({ items, x, y, onClose }: { items: MenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [onClose]);
  const left = Math.min(window.innerWidth - 230, Math.max(12, x));
  const top = Math.min(window.innerHeight - 40 - items.length * 34, y + 6);
  return (
    <div ref={ref} role="menu" className="fixed z-[60] grid min-w-[210px] rounded-xl border p-1.5 shadow-xl"
      style={{ left, top, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', maxHeight: '60vh', overflowY: 'auto' }}>
      {items.map((it, i) => ('head' in it
        ? <div key={i} className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--cp-mu)' }}>{it.head}</div>
        : <button key={i} role="menuitem" type="button" className="rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] hover:bg-[var(--cp-s2)]"
            style={{ color: 'var(--cp-tx)' }} onClick={() => { onClose(); it.run(); }}>{it.label}</button>))}
    </div>
  );
}

function ToolButton({ children, onClick, title, pressed }: { children: React.ReactNode; onClick: () => void; title: string; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={pressed}
      className="flex h-[34px] items-center gap-1.5 rounded-[10px] border px-2.5 text-[12.5px] font-semibold"
      style={pressed ? { background: 'var(--cp-acs)', borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : { background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx2)' }}>
      {children}
    </button>
  );
}

/** A cell: tap writes it, holding (or a right click) opens its window. */
function Cell({ children, style, label, onTap, onHold, onKey, tabIndex, data }: {
  children?: React.ReactNode; style: CSSProperties; label: string; onTap: () => void; onHold: (x: number, y: number) => void;
  onKey: (e: ReactKeyboardEvent) => void; tabIndex: number; data: string;
}) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const open = (el: HTMLElement) => { const r = el.getBoundingClientRect(); onHold(r.left, r.bottom); };
  return (
    <button type="button" data-cell={data} aria-label={label} tabIndex={tabIndex}
      className="relative grid min-w-0 place-items-center border-0 p-0 transition-transform active:scale-95"
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        held.current = false;
        const el = e.currentTarget;
        timer.current = window.setTimeout(() => { held.current = true; open(el); }, 420);
      }}
      onPointerUp={() => { if (timer.current) window.clearTimeout(timer.current); }}
      onPointerLeave={() => { if (timer.current) window.clearTimeout(timer.current); }}
      onClick={(e) => { if (held.current) { e.preventDefault(); held.current = false; return; } onTap(); }}
      onContextMenu={(e) => { e.preventDefault(); open(e.currentTarget); }}
      onKeyDown={onKey}>
      {children}
    </button>
  );
}

/** The window of a cell: strength, accent, a percussion hit's tone, a note's accidental, octave and what it follows. */
function CellPopover({ lane, s, x, y, p, tab, title, drumSound, chords, onWrite, onClose }: {
  lane: Lane; s: number; x: number; y: number; p: number; tab: GrooveTrack; title: string; drumSound?: number;
  chords: { name: string; root: number; quality: string }[];
  onWrite: (fn: (p: number) => number, moveTo?: { a: number }) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-cell]')) onClose(); };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [onClose]);
  const isDrums = tab === 'drums';
  const melodic = !isDrums && !lane.chord;
  const note = melodic ? notesOnRow(p, lane.k!, lane.a!)[0] : undefined;
  const level = p ? strengthOf(p) : -1;
  /** The step's notes with this row's note changed by [fn], put in first when it is not there yet. */
  const changeNote = (q: number, fn: (n: StepNote) => StepNote): StepNote[] => {
    let list = notesOf(q).filter((n) => n.d !== DEG.chord);
    if (!notesOnRow(q, lane.k!, lane.a!).length) {
      if (list.length >= 2) list = [list[0]];
      list.push({ d: 7 + lane.k!, a: lane.a!, o: 0 });
      return list.map((n, i) => (i === list.length - 1 ? fn(n) : n));
    }
    const here = notesOnRow(q, lane.k!, lane.a!)[0];
    return list.map((n) => (n.d === here.d && n.a === here.a && n.o === here.o ? fn(n) : n));
  };
  const chip = (pressed: boolean, label: string, onClick: () => void, danger = false) => (
    <button key={label} type="button" aria-pressed={pressed} onClick={onClick}
      className="rounded-[9px] border px-2.5 py-1 text-xs font-semibold"
      style={pressed ? { background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' } : { background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: danger ? 'var(--cp-dg)' : 'var(--cp-tx)' }}>
      {label}
    </button>
  );
  const own = drumSound !== undefined ? drumSound - GM_PERC_FIRST : 0;
  const tones = isDrums && lane.row.startsWith('perc') && own > 0 ? percTones(own) : [];
  const left = Math.min(window.innerWidth - 296, Math.max(12, x));
  const top = Math.min(window.innerHeight - 380, y + 8);
  return (
    <div ref={ref} role="dialog" aria-label={`${title}, step ${s + 1}`} className="fixed z-[60] grid w-[284px] gap-2.5 rounded-2xl border p-3 shadow-xl"
      style={{ left, top, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}>
      <div className="flex items-center gap-2"><b className="flex-1 text-[13px]">{title} · step {s + 1}</b>
        <button type="button" className="cp-icb" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close"><X size={15} /></button></div>
      {note && (
        <p className="m-0 text-xs" style={{ color: 'var(--cp-mu)' }}>
          {note.d < DEG.scale1 ? `Follows the chord: its ${TONE_NAME[note.d]}.` : `Follows the scale: degree ${rowText(lane.k!, lane.a!)}.`}
          <br />Over {chords.map((c) => `${c.name} ${pitchName(c.root + (semitoneOf(note, c.quality) ?? 0))}`).join(' · ')}
        </p>
      )}
      <div>
        <div className="cp-lbl mb-1.5">Strength</div>
        <div className="flex flex-wrap gap-1.5">
          {STRENGTHS.map((st, i) => chip(level === i, st.name, () => onWrite((q) => {
            if (isDrums) return q ? withVelocity(q, st.v) : packHit(st.v);
            if (lane.chord) return packNotes(st.v, [{ d: DEG.chord, o: 0, a: 0 }], q ? accent(q) : 0);
            return packNotes(st.v, changeNote(q, (n) => n), q ? accent(q) : 0);
          })))}
          {chip(!!(p && accent(p)), 'Accent', () => onWrite((q) => (q ? toggleAccent(q)
            : isDrums ? packHit(255, 0, 1) : packNotes(255, lane.chord ? [{ d: DEG.chord, o: 0, a: 0 }] : changeNote(0, (n) => n), 1))))}
        </div>
      </div>
      {tones.length > 1 && (
        <div>
          <div className="cp-lbl mb-1.5">Hit</div>
          <div className="flex flex-wrap gap-1.5">
            {tones.map((t) => chip(!!p && (hitTone(p) || own) === t, GM_PERC_NAMES[t] ?? `${t}`, () => onWrite((q) => packHit(q ? vel(q) : 205, t === own ? 0 : t, q ? accent(q) : 0))))}
          </div>
        </div>
      )}
      {melodic && (
        <>
          <div>
            <div className="cp-lbl mb-1.5">Accidental</div>
            <div className="flex flex-wrap gap-1.5">
              {([[-1, '♭ flat'], [0, '♮ natural'], [1, '♯ sharp']] as const).map(([a, l]) => chip((note ? note.a : lane.a) === a, l, () => {
                onWrite((q) => packNotes(q ? vel(q) : 205, changeNote(q, (n) => ({ ...n, a })), q ? accent(q) : 0), { a });
              }))}
            </div>
          </div>
          <div>
            <div className="cp-lbl mb-1.5">Octave</div>
            <div className="flex flex-wrap gap-1.5">
              {[-1, 0, 1].map((o) => chip((note?.o ?? 0) === o, o > 0 ? '+1' : o < 0 ? '−1' : '0', () => onWrite((q) => packNotes(q ? vel(q) : 205, changeNote(q, (n) => ({ ...n, o })), q ? accent(q) : 0))))}
            </div>
          </div>
          {ROW_TONE[lane.k!] && (
            <div>
              <div className="cp-lbl mb-1.5">Follows</div>
              <div className="flex flex-wrap gap-1.5">
                {chip(!note || note.d >= DEG.scale1, `The scale (${rowText(lane.k!, note ? note.a : lane.a!)})`, () => onWrite((q) => packNotes(q ? vel(q) : 205, changeNote(q, (n) => ({ d: 7 + lane.k!, a: n.a, o: n.o })), q ? accent(q) : 0)))}
                {chip(!!note && note.d < DEG.scale1, `The chord (${TONE_LETTER[ROW_TONE[lane.k!]]})`, () => onWrite((q) => packNotes(q ? vel(q) : 205, changeNote(q, (n) => ({ d: ROW_TONE[lane.k!], a: n.a, o: n.o })), q ? accent(q) : 0)))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        {chip(false, 'Clear', () => { onWrite((q) => {
          if (isDrums || lane.chord) return 0;
          const here = notesOnRow(q, lane.k!, lane.a!);
          const rest = notesOf(q).filter((n) => n.d !== DEG.chord && !here.includes(n));
          return rest.length ? packNotes(vel(q), rest, accent(q)) : 0;
        }); onClose(); }, true)}
        {chip(false, 'Done', onClose)}
        <span className="ml-auto self-center" aria-hidden="true"><Check size={14} style={{ color: 'var(--cp-fa)' }} /></span>
      </div>
    </div>
  );
}
