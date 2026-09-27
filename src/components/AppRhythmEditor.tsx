import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, Copy, ListMusic, Play, Square, Trash2, VolumeX, X, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type AppStyle, appStepsPerBar } from '@/lib/appStyles';
import {
  GROOVE_TRACKS, cloneDense, differs, effectiveVariation, baseVariation, resizeLane, sectionGrooveOf,
  type DenseVariation, type GrooveTrack, type VariationKey,
} from '@/lib/groove';
import { type Section, type TrackId } from '@/lib/sections';
import { type Chord } from '@/lib/musicTheory';
import {
  RHYTHM_KIT, getInstrumentConfig, getSoundType, gmProgramOf, soundIdForProgram, soundTimbre, type InstrumentState,
} from '@/lib/instruments';
import { AllSoundsDialog } from './AllSoundsDialog';
import { drumSoundOf as kitSoundOf } from '@/lib/appEngine/fromAppStyle';
import { fillNow, subscribeEngineState } from '@/lib/appEngine/player';
import { previewAppCell } from '@/lib/appEngine/preview';
import { loadKits, type DrumKit } from '@/lib/appEngine/host';
import { engineChord } from '@/lib/appEngine/fromSong';
import { DRUM_ROWS, GM_PERC_FIRST } from '@/lib/appEngine/commands';
import {
  CHORD_INTERVALS, DEG, GM_PERC_NAMES, PERC_CHOICES, ROW_TONE, STRENGTHS, TONE_LETTER, TONE_NAME, accent, hitTone, notesOf, notesOnRow, packHit,
  packNotes, percFamily, percTones, pitchName, rowOf, rowText, scaleOf, semitoneOf, strengthOf, toggleAccent, toneMark,
  vel, withVelocity, type StepNote,
} from '@/lib/appEngine/steps';
import { useIsMobile } from '@/hooks/use-mobile';
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
  /** Which variation the section plays in the song, when changed here. */
  plays?: 0 | 1;
  /** The sounds this section plays instead of the song's (section.sounds). */
  sounds: Partial<Record<TrackId, string>>;
}

/**
 * What the song sounds with, as the editor can change it for the whole song: each track's
 * sound (the kit for the drums) and each hand-percussion row's (the song's app.drumSounds).
 */
export interface SongSounds {
  instruments: InstrumentState[];
  drumSounds: Record<string, number>;
}

/** A row of the grid: a kit row, the whole chord, or a degree 1-8 with its alteration. */
interface Lane { key: string; row: string; color: string; chord?: boolean; k?: number; a?: number }
const laneId = (l: Pick<Lane, 'key' | 'chord' | 'k' | 'a'>) => `${l.key}|${l.chord ? 'c' : ''}|${l.k ?? ''}|${l.a ?? ''}`;

export interface AppRhythmEditorProps {
  open: boolean;
  onClose: () => void;
  style: AppStyle;
  sections: Section[];
  /** Which sections play this rhythm, and so can be edited here. */
  editable: number[];
  initialSection: number;
  transposition: number;
  instruments: InstrumentState[];
  /** The sound the song gives each hand-percussion row (app.drumSounds). */
  drumSounds: Record<string, number>;
  /** Save: the song's sections with the edited ones given their groove (silences and sounds), and the song's sounds. */
  onSave: (sections: Section[], sounds: SongSounds) => void;
  /** Whether the song is playing: the editor plays through the song's own player. */
  playing: boolean;
  /** The section the song loops on, if any. */
  loopingIndex: number | null;
  /** Loops the song on a section (null: the whole song again); [start] plays it if it is stopped. */
  onLoop: (index: number | null, start?: boolean) => void;
  onStop: () => void;
  /**
   * While the editor is open, the song plays these sections and sounds instead of its own:
   * what is being edited. Null gives it back.
   */
  onDraft: (sections: Section[] | null, sounds: SongSounds | null) => void;
}

export function AppRhythmEditor(props: AppRhythmEditorProps) {
  const { open, onClose, style, sections, editable, initialSection, transposition, instruments, drumSounds, onSave, playing, loopingIndex, onLoop, onStop, onDraft } = props;
  const spb = appStepsPerBar(style);
  const stepsPerBeat = Math.max(1, Math.round(16 / style.meter.unit));
  const isMobile = useIsMobile();
  // A page is the whole bar where it fits; on a phone, half of it (two beats in four), as the
  // app splits it — shown one at a time, never stacked, so the grid does not grow tall.
  const per = isMobile ? Math.max(stepsPerBeat, Math.ceil(spb / 2 / stepsPerBeat) * stepsPerBeat) : spb;
  const chunks = Math.ceil(spb / per);

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
  /** The song's sounds as they are being tried: kept on Save, dropped on Cancel. */
  const [songSounds, setSongSounds] = useState<SongSounds>({ instruments, drumSounds });
  const [soundMenu, setSoundMenu] = useState<{ x: number; y: number; above: number } | null>(null);
  const [allSounds, setAllSounds] = useState(false);
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
    setSongSounds({ instruments, drumSounds }); setSoundMenu(null);
    undo.current = []; redo.current = [];
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadKits().then(setKits).catch(() => {}); }, []);

  const section = sections[sec];
  const draftOf = useCallback((i: number, from: Record<number, Draft> = drafts): Draft => from[i] ?? {
    a: effectiveVariation(style, sections[i], 'a'),
    b: effectiveVariation(style, sections[i], 'b'),
    silenced: { ...(sections[i]?.silenced ?? {}) },
    sounds: { ...(sections[i]?.sounds ?? {}) },
  }, [drafts, sections, style]);
  const draft = draftOf(sec);
  const isPart = !!section?.stylePart;
  const variation = (draft[v] ?? draft.a)!;
  const base = useMemo(() => baseVariation(style, section ?? {}, v) ?? baseVariation(style, section ?? {}, 'a')!, [style, section, v]);
  const soundsChanged = songSounds.instruments !== instruments || songSounds.drumSounds !== drumSounds;
  const dirty = Object.keys(drafts).length > 0 || soundsChanged;

  /** Every edit goes through here: undoable, and on the section on screen. */
  const change = useCallback((fn: (d: Draft) => void) => {
    setDrafts((prev) => {
      undo.current.push(JSON.stringify(prev));
      if (undo.current.length > 100) undo.current.shift();
      redo.current = [];
      const d = draftOf(sec, prev);
      const next: Draft = { a: d.a && cloneDense(d.a), b: d.b && cloneDense(d.b), silenced: { ...d.silenced }, plays: d.plays, sounds: { ...d.sounds } };
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

  // ── Sound: the song's own player, playing what is being edited ──
  /**
   * The song's sections with every edit so far: what Save keeps, and — with [audition] — what
   * plays while the editor is open, where the section on screen plays the variation being edited.
   */
  const merged = useCallback((ds: Record<number, Draft>, audition: boolean): Section[] => sections.map((sct, i) => {
    const d = ds[i];
    const out: Section = { ...sct };
    if (d) {
      const groove = sectionGrooveOf(style, sct, { a: d.a, b: d.b });
      const off = Object.fromEntries(Object.entries(d.silenced).filter(([, on]) => on));
      if (Object.keys(off).length) out.silenced = off; else delete out.silenced;
      if (groove) out.groove = groove; else delete out.groove;
      const own = Object.fromEntries(Object.entries(d.sounds).filter(([, id]) => id));
      if (Object.keys(own).length) out.sounds = own; else delete out.sounds;
    }
    if (d?.plays !== undefined) out.variation = d.plays;
    if (audition && i === sec && !sct.stylePart) out.variation = v === 'b' && (d?.b ?? true) ? 1 : 0;
    return out;
  }), [sections, style, sec, v]);
  useEffect(() => { if (open) onDraft(merged(drafts, true), songSounds); }, [open, drafts, merged, songSounds]); // eslint-disable-line react-hooks/exhaustive-deps
  const [engine, setEngine] = useState<{ section: number; step: number; bar: number; fillBar: boolean; fillByHand: number } | null>(null);
  useEffect(() => {
    if (!open || !playing) { setEngine(null); return; }
    return subscribeEngineState((st) => setEngine((prev) => (prev && prev.section === st.section && prev.step === st.step && prev.bar === st.bar && prev.fillBar === st.fillBar && prev.fillByHand === st.fillByHand
      ? prev : { section: st.section, step: st.step, bar: st.bar, fillBar: st.fillBar, fillByHand: st.fillByHand })));
  }, [open, playing]);
  /** The engine numbers only the sections with chords (fromSong.ts); this is the way back to the song's. */
  const engineSections = useMemo(() => sections.slice(0, 30).map((x, i) => (x.chords.length ? i : -1)).filter((i) => i >= 0), [sections]);
  const playingSection = engine ? engineSections[engine.section] ?? -1 : -1;
  const here = playing && playingSection === sec;
  /** The loop this editor set, so closing it gives the song back as it was. */
  const loopedByEditor = useRef(false);
  const loopHere = loopingIndex === sec;
  const toggleLoop = () => {
    if (loopHere) { onLoop(null); loopedByEditor.current = false; return; }
    onLoop(sec, !playing);
    loopedByEditor.current = true;
    setFollow(true);
  };
  const playOrStop = () => {
    if (playing) { onStop(); return; }
    onLoop(sec, true);
    loopedByEditor.current = true;
    setFollow(true);
  };
  // Another section on screen: a loop the editor set moves with it.
  useEffect(() => { if (loopedByEditor.current && loopingIndex !== null && loopingIndex !== sec) onLoop(sec); }, [sec]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing gives the song back: its own sections, and no loop it did not have. Closed or
  // taken off the page (Index unmounts it), whichever comes first; the latest callbacks, by ref.
  const giveBack = useRef(() => {});
  giveBack.current = () => {
    onDraft(null, null);
    if (loopedByEditor.current) { onLoop(null); loopedByEditor.current = false; }
  };
  useEffect(() => { if (!open) giveBack.current(); }, [open]);
  useEffect(() => () => giveBack.current(), []);
  /** Goes to a section: its own variation, its own page. */
  const goToSection = (i: number) => {
    const target = sections[i];
    setSec(i); setPage(0); setFocus(null); setPop(null);
    setV(target?.variation === 1 && !target.stylePart ? 'b' : 'a');
    if (target?.stylePart) setMode('groove');
  };
  // Following goes from section to section too, as the app's grid does.
  useEffect(() => {
    if (!follow || !playing || playingSection < 0 || playingSection === sec || !editable.includes(playingSection)) return;
    goToSection(playingSection);
  }, [playingSection, follow, playing]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // ── Sounds: the section's own, else the song's (as being tried here) ──
  const songSoundOf = (track: TrackId) => songSounds.instruments.find((i) => i.id === track)?.soundTypeId ?? '';
  const soundIdOf = (track: TrackId) => draft.sounds[track] || songSoundOf(track);
  const kitId = soundIdOf('drums');
  const kitChoice = { rows: kits[getSoundType('drums', kitId)?.kit ?? 2]?.rows, own: kitId === RHYTHM_KIT, song: songSounds.drumSounds };
  const drumSoundOf = (row: string): number | undefined => kitSoundOf(style, kitChoice, row);
  /** The sound the rhythm itself gives [track], when it names one from the SoundFont. */
  const rhythmSoundOf = (track: TrackId): string | undefined => {
    if (track === 'drums') return RHYTHM_KIT;
    const program = style.programs[track as keyof typeof style.programs];
    return program === undefined || (style.timbres?.[track as keyof typeof style.programs] ?? 13) !== 13 ? undefined : soundIdForProgram(track, program);
  };
  /** Plays a hit or a chord on the sound just picked, when the song is not already playing it. */
  const tryOut = (track: TrackId, id: string) => {
    if (playing) return;
    if (track === 'drums') {
      const rows = kits[getSoundType('drums', id)?.kit ?? 2]?.rows;
      const choice = { rows, own: id === RHYTHM_KIT, song: songSounds.drumSounds };
      previewAppCell({ track: 'drums', row: 'snare', packed: packHit(205), drumSound: kitSoundOf(style, choice, 'snare') });
      return;
    }
    const sound = getSoundType(track, id);
    previewAppCell({
      track, row: 'lane', packed: packNotes(205, [{ d: DEG.chord, o: 0, a: 0 }]), chord: chordAtStep(shownBar * spb),
      transposition, timbre: soundTimbre(sound), program: sound?.program, low: style.voicings[track as keyof typeof style.voicings],
    });
  };
  /** [id] on [track]: for the whole song (the section's own taken off, so it is heard), or for this section only. */
  const pickSound = (track: TrackId, id: string, scope: 'song' | 'section') => {
    if (scope === 'section') {
      change((d) => { if (id === songSoundOf(track)) delete d.sounds[track]; else d.sounds[track] = id; });
    } else {
      setSongSounds((s) => ({ ...s, instruments: s.instruments.map((i) => (i.id === track ? { ...i, soundTypeId: id } : i)) }));
      if (draft.sounds[track]) change((d) => { delete d.sounds[track]; });
    }
    tryOut(track, id);
  };
  /** A hand-percussion row's sound, for the whole song as the app keeps it; the rhythm's own takes the song's off. */
  const pickRowSound = (row: string, sound: number) => {
    setSongSounds((s) => {
      const next = { ...s.drumSounds };
      if (sound === style.drumSounds[row]) delete next[row]; else next[row] = sound;
      return { ...s, drumSounds: next };
    });
    if (!playing) previewAppCell({ track: 'drums', row, packed: packHit(205), drumSound: sound });
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
    const sound = getSoundType(tab, soundIdOf(tab));
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
        const copy: Draft = { a: d.a && cloneDense(d.a), b: d.b && cloneDense(d.b), silenced: { ...d.silenced }, plays: d.plays, sounds: { ...d.sounds } };
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
    onSave(merged(drafts, false), songSounds);
    onClose();
  };
  const cancel = () => {
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return; }
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
    if (tab === 'drums' && lane.row.startsWith('perc')) {
      items.push({ label: 'Change sound…', run: () => openRowSoundMenu(lane.row, x, y) });
    }
    if (tab === 'drums' && !CORE.includes(lane.row)) {
      items.push({ label: 'Remove from the groove', run: () => {
        change((d) => { delete V(d).rows.drums[lane.row]; delete V(d).fill.lanes[lane.row]; });
        setAdded((a) => { const n = new Set(a); n.delete(lane.row); return n; });
      } });
    }
    setMenu({ items, x, y });
  };
  /** A percussion row's sound, as the app's "Change sound": for the whole song. */
  const openRowSoundMenu = (row: string, x: number, y: number) => {
    const now = drumSoundOf(row);
    const own = style.drumSounds[row];
    const mark = (sound: number) => (sound === now ? '✓ ' : '');
    const items: MenuItem[] = [{ head: `${rowLabel(row).sub} · whole song` }];
    if (own !== undefined) items.push({ label: `${mark(own)}The rhythm’s: ${GM_PERC_NAMES[own - GM_PERC_FIRST] ?? 'its own'}`, run: () => pickRowSound(row, own) });
    for (const note of PERC_CHOICES) {
      const sound = GM_PERC_FIRST + note;
      if (sound === own) continue;
      items.push({ label: `${mark(sound)}${GM_PERC_NAMES[note] ?? `Perc ${note}`}`, run: () => pickRowSound(row, sound) });
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
    if (!here || !engine) return -1;
    if (mode === 'fill') return engine.fillBar ? engine.step : -1;
    if (engine.fillBar) return -1;
    return engine.bar % bars === shownBar ? engine.step : -1;
  })();
  // Following: the page moves to where the music is, bar and half bar, groove or fill.
  useEffect(() => {
    if (!here || !follow || !engine) return;
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
  }, [engine, here, follow, mode, bars, chunks, per, pageNow]);

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
        data-editor-root=""
        onEscapeKeyDown={(e) => { if (pop || menu || soundMenu) { e.preventDefault(); setPop(null); setMenu(null); setSoundMenu(null); } }}
        // Closed by Cancel, Save or Esc only: a tap beside it — or one that lands as a menu
        // closes and "All sounds…" opens, as a phone delivers it — must not throw the edits away.
        onInteractOutside={(e) => e.preventDefault()}
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
              onChange={(e) => { setFollow(false); goToSection(Number(e.target.value)); }}
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
          <button type="button" className="cp-btn" onClick={playOrStop} title={playing ? 'Stop the song' : 'Play this section round and round'}>
            {playing ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{playing ? 'Stop' : isMobile ? 'Loop' : 'Loop section'}
          </button>
          <button type="button" className="cp-btn" onClick={cancel}>Cancel</button>
          <button type="button" className="cp-btn" style={{ background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }} onClick={save}>Save</button>
        </div>
        {confirmDiscard && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" style={{ background: 'var(--cp-acs)' }}>
            <span className="flex-1">Discard what you changed? The song stays as it was.</span>
            <button type="button" className="cp-btn" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
            <button type="button" className="cp-btn" style={{ color: 'var(--cp-dg)' }} onClick={() => { setConfirmDiscard(false); onClose(); }}>Discard</button>
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
                  <button key={k} type="button" aria-pressed={v === k}
                    onClick={() => {
                      // No B yet: made from A, as the app makes it the first time it is asked for.
                      if (k === 'b' && !hasB) {
                        change((d) => { d.b = d.a && cloneDense(d.a); });
                        toast('B created from A: change what you want in it');
                      }
                      setV(k); setPage(0);
                      if (playing && here) toast(`Switching to ${k.toUpperCase()} through the fill, on the next bar`);
                    }}
                    className="h-[34px] min-w-[38px] border-0 px-3 text-[13px] font-extrabold disabled:opacity-40"
                    style={v === k ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'transparent', color: 'var(--cp-mu)' }}
                    title={k === 'b' && !hasB ? 'Make a variation B from A' : `Edit variation ${k.toUpperCase()}`}>{k.toUpperCase()}</button>
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
                    : `Editing variation ${v.toUpperCase()}`}
            </span>
            {!isPart && hasB && (() => {
              // What the section plays in the song is the section card's choice; said here, with a
              // way to make it the one being edited.
              const plays = draft.plays ?? (section.variation === 1 ? 1 : 0);
              const wanted = v === 'b' ? 1 : 0;
              return (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cp-mu)' }}>
                  · this section plays {plays ? 'B' : 'A'}
                  {plays !== wanted && (
                    <button type="button" className="h-[26px] rounded-full border px-2 text-xs font-semibold"
                      style={{ borderColor: 'var(--cp-ln)', background: 'transparent', color: 'var(--cp-act)' }}
                      onClick={() => change((d) => { d.plays = wanted; })}>Play {v.toUpperCase()} here</button>
                  )}
                </span>
              );
            })()}
            <div className="flex-1" />
            <button type="button" aria-label={`${trackName(tab)} sound`} aria-haspopup="menu"
              title={draft.sounds[tab] ? 'This section’s own sound' : 'The song’s sound'}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSoundMenu({ x: r.left, y: r.bottom, above: r.top }); }}
              className="flex h-[34px] max-w-[240px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold"
              style={{ background: 'var(--cp-s2)', borderColor: draft.sounds[tab] ? 'var(--cp-ac)' : 'var(--cp-ln)', color: 'var(--cp-tx)' }}>
              <span className="truncate">{getSoundType(tab, soundIdOf(tab))?.name ?? 'Sound'}</span>
              {draft.sounds[tab] && <span className="shrink-0 text-[10.5px] font-bold" style={{ color: 'var(--cp-act)' }}>this section</span>}
              <ChevronDown size={14} className="shrink-0" />
            </button>
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
                {playing && !here && playingSection >= 0 && (
                  <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--cp-mu)' }}>
                    Playing: <b style={{ color: 'var(--cp-tx)' }}>{sections[playingSection]?.name}</b> · bar {(engine?.bar ?? 0) + 1}
                    {editable.includes(playingSection) && (
                      <button type="button" className="h-[26px] rounded-full border px-2 text-xs font-semibold" style={{ borderColor: 'var(--cp-ln)', background: 'transparent', color: 'var(--cp-act)' }}
                        onClick={() => { setFollow(true); goToSection(playingSection); }}>Go there</button>
                    )}
                  </span>
                )}
                <button type="button" aria-pressed={loopHere} onClick={toggleLoop} title="The song plays this section round and round"
                  className="h-[30px] rounded-full border px-2.5 text-xs font-semibold"
                  style={loopHere ? { background: 'var(--cp-acs)', borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : { background: 'transparent', borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }}>
                  {loopHere ? '⟲ Looping here' : 'Loop here'}
                </button>
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
        {soundMenu && (
          <SoundMenu key={tab} track={tab} x={soundMenu.x} y={soundMenu.y} above={soundMenu.above} onClose={() => setSoundMenu(null)}
            songSound={songSoundOf(tab)} sectionSound={draft.sounds[tab]} sectionName={section?.name ?? ''}
            rhythmSound={rhythmSoundOf(tab)}
            onPick={(id, scope) => pickSound(tab, id, scope)}
            onAllSounds={() => { setSoundMenu(null); setAllSounds(true); }} />
        )}
        {tab !== 'drums' && (
          <AllSoundsDialog open={allSounds} onOpenChange={setAllSounds} track={tab} trackName={trackName(tab)}
            currentSoundId={soundIdOf(tab)}
            onPick={(program) => pickSound(tab, soundIdForProgram(tab, program), draft.sounds[tab] ? 'section' : 'song')} />
        )}
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

/**
 * Where a pop-up opened at the screen point ([x], [y]) goes, whole on screen: under the point,
 * or over [above] (the top of what opened it) when there is no room below. The editor is
 * centred with a transform, which makes it the box a fixed pop-up inside it is placed in, so
 * the screen point is taken to the editor's own. Hidden until it has been measured.
 */
function usePlaced(ref: React.RefObject<HTMLElement>, x: number, y: number, above?: number, size?: number): CSSProperties {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.parentElement?.closest('[data-editor-root]')?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = Math.max(m, Math.min(vw - w - m, x));
    let sy = y + 6;
    if (sy + h > vh - m && above !== undefined && above - h - 6 >= m) sy = above - h - 6;
    sy = Math.max(m, Math.min(vh - h - m, sy));
    setAt({ left: sx - box.left, top: sy - box.top });
  }, [ref, x, y, above, size]);
  return at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: 'hidden' };
}

/**
 * A track's sound, for the whole song (as the Instruments panel sets it) or for the section on
 * screen only (as the section card's sounds): the list's sounds, the rhythm's own first, and
 * every sound of the SoundFont behind "All sounds…". The kit's list, for the drums.
 */
function SoundMenu({ track, x, y, above, onClose, songSound, sectionSound, sectionName, rhythmSound, onPick, onAllSounds }: {
  track: TrackId; x: number; y: number; above: number; onClose: () => void;
  songSound: string; sectionSound?: string; sectionName: string; rhythmSound?: string;
  onPick: (id: string, scope: 'song' | 'section') => void;
  onAllSounds: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<'song' | 'section'>(sectionSound ? 'section' : 'song');
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const config = getInstrumentConfig(track);
  const current = scope === 'section' ? sectionSound || songSound : songSound;
  // The rhythm's own sound first, then one picked from "All sounds…", then the list.
  const ids = [...new Set([
    ...(rhythmSound ? [rhythmSound] : []),
    ...(gmProgramOf(current) !== null ? [current] : []),
    ...(config?.soundTypes.map((s) => s.id) ?? []),
  ])];
  const place = usePlaced(ref, x, y, above);
  return (
    <div ref={ref} role="menu" aria-label={`${config?.name ?? track} sound`} className="fixed z-[60] flex w-[260px] max-w-[calc(100vw-16px)] flex-col rounded-xl border p-1.5 shadow-xl"
      style={{ ...place, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', maxHeight: 'min(430px, calc(100dvh - 16px))' }}>
      <div className="flex overflow-hidden rounded-[10px] border m-1" role="group" aria-label="Where the sound goes" style={{ borderColor: 'var(--cp-ln)' }}>
        {(['song', 'section'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}
            className="h-[30px] flex-1 truncate border-0 px-2 text-xs font-bold"
            style={scope === k ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'transparent', color: 'var(--cp-mu)' }}>
            {k === 'song' ? 'Whole song' : `Only ${sectionName || 'this section'}`}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {scope === 'section' && sectionSound && (
          <button type="button" role="menuitem" className="w-full rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] hover:bg-[var(--cp-s2)]"
            style={{ color: 'var(--cp-act)' }} onClick={() => { onPick(songSound, 'section'); onClose(); }}>
            Same as the song ({getSoundType(track, songSound)?.name ?? songSound})
          </button>
        )}
        {ids.map((id) => {
          const on = id === current;
          return (
            <button key={id} type="button" role="menuitemradio" aria-checked={on}
              className="flex w-full items-center gap-2 rounded-lg border-0 px-2.5 py-2 text-left text-[13px] hover:bg-[var(--cp-s2)]"
              style={{ background: on ? 'var(--cp-acs)' : 'transparent', color: 'var(--cp-tx)' }}
              onClick={() => { onPick(id, scope); onClose(); }}>
              <span className="min-w-0 flex-1 truncate">{getSoundType(track, id)?.name ?? id}</span>
              {id === rhythmSound && <span className="shrink-0 text-[10.5px] font-bold" style={{ color: 'var(--cp-mu)' }}>{track === 'drums' ? '' : 'rhythm’s'}</span>}
              {on && <Check size={15} className="shrink-0" style={{ color: 'var(--cp-act)' }} />}
            </button>
          );
        })}
      </div>
      {track !== 'drums' && (
        <button type="button" className="mt-1 flex items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs font-semibold hover:bg-[var(--cp-s2)]"
          style={{ color: 'var(--cp-act)' }} onClick={onAllSounds}>
          <ListMusic size={14} />All sounds…
        </button>
      )}
    </div>
  );
}

function Menu({ items, x, y, onClose }: { items: MenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [onClose]);
  const place = usePlaced(ref, x, y, undefined, items.length);
  return (
    <div ref={ref} role="menu" className="fixed z-[60] grid min-w-[210px] max-w-[calc(100vw-16px)] rounded-xl border p-1.5 shadow-xl"
      style={{ ...place, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', maxHeight: 'min(60vh, calc(100dvh - 16px))', overflowY: 'auto' }}>
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
  const place = usePlaced(ref, x, y);
  return (
    <div ref={ref} role="dialog" aria-label={`${title}, step ${s + 1}`} className="fixed z-[60] grid w-[284px] max-w-[calc(100vw-16px)] gap-2.5 rounded-2xl border p-3 shadow-xl"
      style={{ ...place, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)', maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' }}>
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
