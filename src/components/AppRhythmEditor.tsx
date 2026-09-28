import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeftRight, Bookmark, BookmarkPlus, Check, Copy, Hand, Layers, Piano, RotateCcw, Shuffle, ChevronDown, ChevronLeft, ChevronRight, Link2, ListMusic, MoreHorizontal, Play, Repeat, Square, Trash2, Unlink, VolumeX, X, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type AppStyle, appStepsPerBar } from '@/lib/appStyles';
import {
  GROOVE_TRACKS, cloneDense, differs, effectiveVariation, baseVariation, partView, resizeLane, sectionGrooveOf,
  type DenseVariation, type GrooveTrack,
} from '@/lib/groove';
import { SECTION_PART_LABEL, foldSectionSounds, sectionPartOf, type Section, type SectionPartKey, type TrackId } from '@/lib/sections';
import { NOTE_LENGTH_CHOICES, VOICING_SPAN, type NoteLengths, type Voicings } from '@/lib/noteLengths';
import {
  fitToBars, forgetPattern, loadFigures, previewOf, savePattern, savedPatterns, spells, type SavedPattern, type StripPattern,
} from '@/lib/patternStrip';
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
  CHORD_INTERVALS, DEG, GM_PERC_NAMES, PERC_CHOICES, STRENGTHS, TONE_LETTER, TONE_NAME, accent, hitTone, notesOf, notesOnRow, packHit,
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
  /** Its own intro and ending (section.part), spelled out like A and B. */
  intro: DenseVariation | null;
  ending: DenseVariation | null;
  silenced: Partial<Record<TrackId, boolean>>;
  /** Which part of the rhythm the section plays in the song, when changed here. */
  plays?: SectionPartKey;
  /** The sounds this section plays instead of the song's (section.sounds): under every part's own. */
  sounds: Partial<Record<TrackId, string>>;
  /** Each part's own sounds (section.partSounds): the chorus on B can bring in the strings. */
  partSounds: PartSounds;
}
type PartSounds = Partial<Record<SectionPartKey, Partial<Record<TrackId, string>>>>;
const PARTS: SectionPartKey[] = ['intro', 'a', 'b', 'ending'];
const clonePartSounds = (p: PartSounds | undefined): PartSounds =>
  Object.fromEntries(Object.entries(p ?? {}).map(([k, v]) => [k, { ...v }]));
/** A part's sounds with the empty ones taken out: what two sections compare, and what is kept. */
const ownSounds = (p: Partial<Record<TrackId, string>> | undefined) =>
  Object.fromEntries(Object.entries(p ?? {}).filter(([, id]) => id).sort(([a], [b]) => a.localeCompare(b)));

/**
 * What the song sounds with, as the editor can change it for the whole song: each track's
 * sound (the kit for the drums) and each hand-percussion row's (the song's app.drumSounds).
 */
export interface SongSounds {
  instruments: InstrumentState[];
  drumSounds: Record<string, number>;
  /** How long each melodic track's notes ring (app.noteLengths): ⋯ › Notes. */
  noteLengths: NoteLengths;
  /** Where each melodic track's register starts (app.voicings): Keyboard and range. */
  voicings: Voicings;
}

/** A row of the grid: a kit row, the whole chord, or a degree 1-8 with its alteration. */
interface Lane { key: string; row: string; color: string; chord?: boolean; k?: number; a?: number }
/** What a section opens on: the part it plays; an intro or ending the rhythm added is edited as its one variation. */
const startKey = (s: Section | undefined): SectionPartKey => (!s || s.stylePart ? 'a' : sectionPartOf(s));
/** A section made to play [k]: its intro or ending, or its groove on A or B. */
function withPart(out: Section, k: SectionPartKey) {
  if (k === 'intro' || k === 'ending') { out.part = k; return; }
  delete out.part;
  out.variation = k === 'b' ? 1 : 0;
}
const isPartKey = (k: SectionPartKey): k is 'intro' | 'ending' => k === 'intro' || k === 'ending';
const cloneDraft = (d: Draft): Draft => ({
  a: d.a && cloneDense(d.a), b: d.b && cloneDense(d.b), intro: d.intro && cloneDense(d.intro), ending: d.ending && cloneDense(d.ending),
  silenced: { ...d.silenced }, plays: d.plays, sounds: { ...d.sounds }, partSounds: clonePartSounds(d.partSounds),
});

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
  /** How long each melodic track's notes ring, for the song. */
  noteLengths: NoteLengths;
  /** Where each melodic track's register starts, for the song. */
  voicings: Voicings;
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
  /**
   * The rhythm section [i] is edited on, when it is not [style] itself: one of the web's own,
   * read back per section (webSectionAppStyle), since a web section can pick its own parts.
   */
  styleOf?: (section: number) => AppStyle;
  /** The rhythm's own variations of a track (a web rhythm's Var 1… All together), for the strip. */
  variationsOf?: (section: number, track: GrooveTrack) => StripPattern[];
}

export function AppRhythmEditor(props: AppRhythmEditorProps) {
  const { open, onClose, style: rhythm, styleOf, variationsOf, sections, editable, initialSection, transposition, instruments, drumSounds, noteLengths, voicings, onSave, playing, loopingIndex, onLoop, onStop, onDraft } = props;
  const spb = appStepsPerBar(rhythm);
  const stepsPerBeat = Math.max(1, Math.round(16 / rhythm.meter.unit));
  const isMobile = useIsMobile();
  // A page is the whole bar where it fits; on a phone, half of it (two beats in four), as the
  // app splits it — shown one at a time, never stacked, so the grid does not grow tall.
  const per = isMobile ? Math.max(stepsPerBeat, Math.ceil(spb / 2 / stepsPerBeat) * stepsPerBeat) : spb;
  const chunks = Math.ceil(spb / per);

  const [sec, setSec] = useState(initialSection);
  /** The rhythm section [i] is edited on; [style], the one on screen. */
  const styleAt = useCallback((i: number): AppStyle => styleOf?.(i) ?? rhythm, [styleOf, rhythm]);
  const style = styleAt(sec);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  /** The part being edited: the groove's A or B, or the section's intro or ending. */
  const [v, setV] = useState<SectionPartKey>('a');
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
  /** Leaving with changes: the question of what to do with them is on screen. */
  const [leaving, setLeaving] = useState(false);
  /** The pattern strip: the app's figures for the track on screen, and yours (patternStrip.ts). */
  const [figures, setFigures] = useState<StripPattern[]>([]);
  const [mine, setMine] = useState<SavedPattern[]>(() => savedPatterns());
  /** Naming what is on the track to keep it, or forgetting one of yours. */
  const [ask, setAsk] = useState<{ kind: 'save'; name: string } | { kind: 'forget'; id: string; name: string } | null>(null);
  useEffect(() => {
    let live = true;
    loadFigures(tab, spb).then((list) => { if (live) setFigures(list); }).catch(() => { if (live) setFigures([]); });
    return () => { live = false; };
  }, [tab, spb]);
  /** The song's sounds as they are being tried: kept on Save, dropped on Cancel. */
  const [songSounds, setSongSounds] = useState<SongSounds>({ instruments, drumSounds, noteLengths, voicings });
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
    setV(startKey(sections[initialSection]));
    setMode('groove'); setTab('drums'); setPage(0); setAdded(new Set()); setFocus(null); setPop(null); setMenu(null);
    setLeaving(false); setShare(true);
    setSongSounds({ instruments, drumSounds, noteLengths, voicings }); setPanel(null); setSoundMenu(null);
    undo.current = []; redo.current = [];
    // The section loops while it is open, as the app's editor does: what you edit is what
    // keeps sounding, and nothing stops for it. Closing gives the loop back (giveBack).
    if (loopingIndex !== initialSection) { onLoop(initialSection); loopedByEditor.current = true; }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadKits().then(setKits).catch(() => {}); }, []);
  /** A panel over the editor: the kit to play by hand, or the keyboard with every track's range. */
  const [panel, setPanel] = useState<'kit' | 'keys' | 'more' | null>(null);
  /** The instrument the big keyboard shows: its notes, in its window. */
  const [keyTrack, setKeyTrack] = useState<KeyTrack>('piano');
  const openKeys = () => { if (tab !== 'drums') setKeyTrack(tab as KeyTrack); setPanel('keys'); };

  const section = sections[sec];
  /** A section as the editor reads it: its own sounds already on its parts (foldSectionSounds). */
  const folded = useMemo(() => sections.map((s) => (s ? foldSectionSounds(s) : s)), [sections]);
  const draftOf = useCallback((i: number, from: Record<number, Draft> = drafts): Draft => from[i] ?? {
    a: effectiveVariation(styleAt(i), sections[i], 'a'),
    b: effectiveVariation(styleAt(i), sections[i], 'b'),
    intro: sections[i]?.stylePart ? null : effectiveVariation(styleAt(i), partView(styleAt(i), sections[i] ?? {}, 'intro'), 'a'),
    ending: sections[i]?.stylePart ? null : effectiveVariation(styleAt(i), partView(styleAt(i), sections[i] ?? {}, 'ending'), 'a'),
    silenced: { ...(sections[i]?.silenced ?? {}) },
    sounds: { ...(folded[i]?.sounds ?? {}) },
    partSounds: clonePartSounds(folded[i]?.partSounds),
  }, [drafts, sections, folded, styleAt]);
  const draft = draftOf(sec);
  const isPart = !!section?.stylePart;
  const variation = (draft[v] ?? draft.a)!;
  const base = useMemo(() => (isPartKey(v)
    ? baseVariation(style, partView(style, {}, v), 'a')!
    : baseVariation(style, section ?? {}, v) ?? baseVariation(style, section ?? {}, 'a')!), [style, section, v]);
  /** No fill here: an intro or an ending, the section's own or one the rhythm added. */
  const noFill = isPart || isPartKey(v);
  const soundsChanged = songSounds.instruments !== instruments || songSounds.drumSounds !== drumSounds || songSounds.noteLengths !== noteLengths || songSounds.voicings !== voicings;
  const dirty = Object.keys(drafts).length > 0 || soundsChanged;

  /** Every edit goes through here: undoable, and on the section on screen. */
  const change = useCallback((fn: (d: Draft) => void) => {
    setDrafts((prev) => {
      undo.current.push(JSON.stringify(prev));
      if (undo.current.length > 100) undo.current.shift();
      redo.current = [];
      const d = draftOf(sec, prev);
      const next = cloneDraft(d);
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
      const groove = sectionGrooveOf(styleAt(i), sct, { a: d.a, b: d.b, intro: d.intro, ending: d.ending });
      const off = Object.fromEntries(Object.entries(d.silenced).filter(([, on]) => on));
      if (Object.keys(off).length) out.silenced = off; else delete out.silenced;
      if (groove) out.groove = groove; else delete out.groove;
      const own = Object.fromEntries(Object.entries(d.sounds).filter(([, id]) => id));
      if (Object.keys(own).length) out.sounds = own; else delete out.sounds;
      const parts = Object.fromEntries(Object.entries(d.partSounds).map(([k, p]) => [k, ownSounds(p)]).filter(([, p]) => Object.keys(p).length));
      if (Object.keys(parts).length) out.partSounds = parts; else delete out.partSounds;
    }
    if (d?.plays !== undefined) withPart(out, d.plays);
    // Heard while it is edited: the part on screen.
    if (audition && i === sec && !sct.stylePart) withPart(out, v === 'b' && !(d?.b ?? true) ? 'a' : v);
    return out;
  }), [sections, styleAt, sec, v]);
  useEffect(() => { if (open) onDraft(merged(drafts, true), songSounds); }, [open, drafts, merged, songSounds]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The notes each melodic track holds, while the song plays: the keys light with them. */
  const sounding = useSounding(open && playing);
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
    setV(startKey(target));
    if (target?.stylePart || (target && isPartKey(startKey(target)))) setMode('groove');
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
  /** What the part plays under its own sound: the section's, else the song's. */
  const underSoundOf = (track: TrackId) => draft.sounds[track] || songSoundOf(track);
  const partSoundOf = (track: TrackId) => draft.partSounds[v]?.[track];
  const soundIdOf = (track: TrackId) => partSoundOf(track) || underSoundOf(track);
  const kitId = soundIdOf('drums');
  const kitChoice = { rows: kits[getSoundType('drums', kitId)?.kit ?? 2]?.rows, own: kitId === RHYTHM_KIT, song: songSounds.drumSounds };
  const drumSoundOf = (row: string): number | undefined => kitSoundOf(style, kitChoice, row);
  /** Where [t]'s register starts: the song's own, else the rhythm's, else the app's default. */
  const lowOf = (t: KeyTrack) => songSounds.voicings[t] ?? style.voicings[t] ?? DEFAULT_LOW[t];
  const setLow = (t: KeyTrack, low: number) => setSongSounds((s) => ({ ...s, voicings: { ...s.voicings, [t]: low } }));
  /** The keys sounding, in the colour of the track that holds each; [only] a track's own. */
  const litKeys = (only?: KeyTrack) => {
    const lit = new Map<number, string>();
    KEY_TRACKS.forEach((t, i) => { if (!only || t === only) for (const m of sounding[i] ?? []) if (!lit.has(m) || t === only) lit.set(m, trackColor(t)); });
    return lit;
  };
  /** The sound the rhythm itself gives [track], when it names one from the SoundFont. */
  const rhythmSoundOf = (track: TrackId): string | undefined => {
    if (track === 'drums') return undefined;
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
  /**
   * [id] on [track], for the part on screen: each part of the rhythm has its own sound, as the
   * app keeps it. Saving gives it to the sections that share the part, as it does the pattern.
   */
  const pickSound = (track: TrackId, id: string) => {
    change((d) => {
      const p = { ...(d.partSounds[v] ?? {}) };
      if (id === (d.sounds[track] || songSoundOf(track))) delete p[track]; else p[track] = id;
      d.partSounds[v] = p;
    });
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
    // Writing holds the page on the bar you are working on; the pill brings the music back.
    if (playing) setFollow(false);
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
      let list = offRow(notesOf(p), lane.k!, lane.a!);
      if (!here.length) {
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
    if (isPartKey(v)) return;
    const other = v === 'a' ? 'b' : 'a';
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
  /**
   * A pattern from the strip on the track, heard at once in the loop: over every bar the track
   * has, repeated — a longer one gives it the bars it needs (fitToBars).
   */
  const applyPattern = (p: StripPattern) => {
    change((d) => {
      const x = V(d);
      const fitted = fitToBars(p, x.bars[tab], spb);
      x.rows[tab] = fitted.rows;
      x.bars[tab] = fitted.bars;
    });
    setMode('groove'); setPage(0); setFocus(null);
  };
  /** Cells at random, on the chord's own notes: the app's scramble, held on Random. */
  const scramble = () => change((d) => {
    const x = V(d);
    const n = x.bars[tab] * spb;
    const hit = () => Math.random() < 0.3;
    if (tab === 'drums') {
      const rows = Object.keys(x.rows.drums).filter((r) => x.rows.drums[r]?.some(Boolean));
      for (const r of rows.length ? rows : CORE) x.rows.drums[r] = Array.from({ length: n }, () => (hit() ? packHit(90 + Math.floor(Math.random() * 165)) : 0));
    } else {
      const tones = [DEG.chord, DEG.root, DEG.third, DEG.fifth, DEG.octave];
      x.rows[tab] = { lane: Array.from({ length: n }, () => (hit() ? packNotes(120 + Math.floor(Math.random() * 120), [{ d: tones[Math.floor(Math.random() * tones.length)], o: 0, a: 0 }]) : 0)) };
    }
  });
  /** A real groove, one of the figures, never the one already there: the app's Random. */
  const randomPattern = () => {
    const x = V(draft);
    const pool = figures.filter((p) => !spells(x.rows[tab], x.bars[tab], p, spb));
    if (!pool.length) { scramble(); return; }
    applyPattern(pool[Math.floor(Math.random() * pool.length)]);
  };
  /** The instrument keeps its groove through the fill: none of its lanes in it (the app's No fill). */
  const noFillHere = () => {
    change((d) => { const x = V(d); for (const k of Object.keys(x.fill.lanes)) if (tab === 'drums' ? !isTrackKey(k) : k === tab) delete x.fill.lanes[k]; });
    toast(`${trackName(tab)} keeps its groove through the fill`);
  };
  const silenced = !!draft.silenced[tab];
  const edited = mode === 'fill' ? differs(variation, base, 'fill') : differs(variation, base, tab);

  // ── Sharing: sections that play the same part edit it together, as the app does ──
  /** A section's [k] as it was when the editor opened, pattern and sound: what sharing compares. Null: it has none. */
  const origPart = useCallback((i: number, k: SectionPartKey): string | null => {
    const s = sections[i];
    if (!s || s.stylePart) return null;
    const g = isPartKey(k) ? effectiveVariation(styleAt(i), partView(styleAt(i), s, k), 'a') : effectiveVariation(styleAt(i), s, k);
    return g ? JSON.stringify([g, ownSounds(folded[i]?.partSounds?.[k])]) : null;
  }, [sections, folded, styleAt]);
  /** The sections that play the part on screen as this one does, this one first. */
  const sharers = useMemo(() => {
    const mine = origPart(sec, v);
    if (mine === null) return [sec];
    return [sec, ...editable.filter((i) => i !== sec && origPart(i, v) === mine)];
  }, [origPart, editable, sec, v]);
  /** Whether Save gives what was edited to every section that shares the part, or keeps it here. */
  const [share, setShare] = useState(true);
  /** [ds] with each edited part given to the sections that shared it when the editor opened. */
  const withSharing = (ds: Record<number, Draft>): Record<number, Draft> => {
    if (!share) return ds;
    const out = { ...ds };
    for (const [key, d] of Object.entries(ds)) {
      const i = Number(key);
      for (const k of PARTS) {
        const was = origPart(i, k);
        if (was === null || !d[k] || JSON.stringify([d[k], ownSounds(d.partSounds[k])]) === was) continue;
        for (const j of editable) {
          if (j === i || origPart(j, k) !== was) continue;
          const copy = cloneDraft(out[j] ?? draftOf(j, {}));
          copy[k] = cloneDense(d[k]!);
          copy.partSounds[k] = { ...(d.partSounds[k] ?? {}) };
          out[j] = copy;
        }
      }
    }
    return out;
  };

  // ── Save, and leaving ──
  const save = () => {
    onSave(merged(withSharing(drafts), false), songSounds);
    onClose();
  };
  /** Back: with changes, it asks what to do with them. */
  const cancel = () => {
    if (dirty && !leaving) { setLeaving(true); return; }
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
    return engine.bar % bars === shownBar ? engine.step : -1;
  })();
  /** The fill is sounding over the bar the groove shows: what it rewrites there is not what is heard. */
  const fillOver = mode === 'groove' && !noFill && !!engine?.fillBar && playhead >= 0;
  /** Where the music is, as a page — for the pill that brings the grid back to it. */
  const playingPage = !engine || engine.fillBar ? pageNow
    : mode === 'fill' ? pageNow : (engine.bar % bars) * chunks + Math.min(chunks - 1, Math.floor(engine.step / per));
  const away = playing && playingSection >= 0 && (!here || playingPage !== pageNow);
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

  const plays = draft.plays ?? startKey(section);
  /** The ⋯ sheet: what the track on screen can do beyond its cells, as the app's (below). */
  const openMore = () => setPanel('more');
  /** Name what the track plays, to find it in the strip in every song. */
  const askSave = () => {
    const n = mine.filter((p) => p.tab === tab).length + 1;
    setAsk({ kind: 'save', name: tab === 'drums' ? `My groove ${n}` : `My backing ${n}` });
  };
  const keepPattern = (name: string) => {
    const x = V(draft);
    savePattern({ name, tab, spb, bars: x.bars[tab], rows: JSON.parse(JSON.stringify(x.rows[tab])) });
    setMine(savedPatterns());
    setAsk(null);
    toast(`“${name}” is in your patterns`);
  };
  /** Where an edit goes: every section that shares the part, or this one only. */
  const openShare = (x: number, y: number) => setMenu({
    x, y,
    items: [
      { head: `${SECTION_PART_LABEL[v]} is the same in ${sharers.length} sections` },
      { label: `${share ? '✓ ' : ''}Edit it in all ${sharers.length}`, run: () => setShare(true) },
      { label: `${share ? '' : '✓ '}Only in ${section.name}`, run: () => setShare(false) },
    ],
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent
        className="cp flex h-[94vh] max-h-[980px] w-[calc(100vw-16px)] max-w-[1180px] flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden"
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
        data-editor-root=""
        onEscapeKeyDown={(e) => {
          if (pop || menu || soundMenu || leaving || ask || panel) { e.preventDefault(); setPop(null); setMenu(null); setSoundMenu(null); setLeaving(false); setAsk(null); setPanel(null); }
        }}
        // Closed by Back, Save or Esc only: a tap beside it — or one that lands as a menu
        // closes and "All sounds…" opens, as a phone delivers it — must not throw the edits away.
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header: back, where you are, ⋯ and Save */}
        <div className="flex items-center gap-1.5 border-b px-2 py-2 sm:px-3" style={{ borderColor: 'var(--cp-ln)' }}>
          <button type="button" className="cp-icb" onClick={cancel} aria-label="Back" title="Back"><ChevronLeft size={22} /></button>
          <div className="flex min-w-0 flex-1 flex-col">
            {editable.length > 1 ? (
              <select
                className="w-fit max-w-full truncate rounded-md border-0 bg-transparent p-0 pr-1 text-base font-bold"
                style={{ color: 'var(--cp-tx)' }}
                value={sec}
                onChange={(e) => { setFollow(false); goToSection(Number(e.target.value)); }}
                aria-label="Section"
              >
                {editable.map((i) => <option key={i} value={i} style={{ background: 'var(--cp-s1)' }}>{sections[i].name}{drafts[i] ? ' •' : ''}</option>)}
              </select>
            ) : <span className="truncate text-base font-bold">{section.name}</span>}
            <DialogTitle className="m-0 truncate text-xs font-semibold" style={{ color: 'var(--cp-mu)' }}>{style.name}</DialogTitle>
            <DialogDescription className="sr-only">The rhythm of {section.name}, part by part and track by track</DialogDescription>
          </div>
          <button type="button" className="cp-icb" aria-label="More" title="More" aria-haspopup="menu"
            onClick={openMore}><MoreHorizontal size={20} /></button>
          <button type="button" className="cp-btn" style={{ background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }} onClick={save}><Check size={15} />Save</button>
        </div>

        {/* The part, and the sections that share it */}
        <div className="flex items-center gap-2 px-3 pt-3 sm:px-4">
          {isPart ? (
            <span className="flex-1 text-sm font-bold">{section.stylePart!.kind === 'intro' ? 'Intro' : 'Ending'}</span>
          ) : (
            <div className="grid flex-1 grid-cols-4 overflow-hidden rounded-[11px] border" role="group" aria-label="Part of the rhythm" style={{ borderColor: 'var(--cp-ln)' }}>
              {PARTS.map((k) => {
                const lacking = (k === 'intro' && !style.intro?.length) || (k === 'ending' && !style.ending?.length);
                return (
                  <button key={k} type="button" aria-pressed={v === k}
                    onClick={() => {
                      // No B yet: made from A, as the app makes it the first time it is asked for.
                      if (k === 'b' && !hasB) {
                        change((d) => { d.b = d.a && cloneDense(d.a); });
                        toast('B made from A');
                      }
                      if (lacking && v !== k) toast(`This rhythm has no ${k}: it starts as A`);
                      if (isPartKey(k)) setMode('groove');
                      setV(k); setPage(0);
                    }}
                    className="relative h-9 border-0 px-2 text-[13px] font-extrabold"
                    style={v === k ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'transparent', color: 'var(--cp-mu)' }}
                    title={k === 'b' && !hasB ? 'Make a B from A' : plays === k ? `${SECTION_PART_LABEL[k]} · what ${section.name} plays` : SECTION_PART_LABEL[k]}>
                    {SECTION_PART_LABEL[k]}
                    {/* What the section plays in the song. */}
                    {plays === k && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: v === k ? '#fff' : 'var(--cp-act)' }} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
          {sharers.length > 1 && (
            <button type="button" aria-haspopup="menu"
              aria-label={share ? `Edits reach all ${sharers.length} sections that play this part` : `Edits stay in ${section.name}`}
              title={share ? `Edited in the ${sharers.length} sections that play it` : `Edited in ${section.name} only`}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openShare(r.right - 230, r.bottom); }}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13px] font-bold"
              style={{
                fontFamily: 'var(--cp-mono, monospace)',
                ...(share ? { background: 'var(--cp-acs)', borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : { background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }),
              }}>
              {share ? <Link2 size={15} /> : <Unlink size={15} />}×{share ? sharers.length : 1}
            </button>
          )}
        </div>

        {/* The tracks */}
        <div className="flex gap-1.5 px-3 pt-2.5 sm:px-4" role="tablist" aria-label="Track">
          {TRACK_TABS.map((t) => {
            const own = differs(variation, base, t.id) || !!partSoundOf(t.id);
            const inFill = t.id === 'drums' ? fillKeys.some((k) => !isTrackKey(k)) : fillKeys.includes(t.id);
            const on = tab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} aria-label={t.name} title={t.name}
                onClick={() => { setTab(t.id); setPage(0); setFocus(null); }}
                className="relative flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border text-[13px] font-semibold"
                style={on ? { background: `color-mix(in srgb, ${t.color} 14%, var(--cp-s1))`, borderColor: t.color, color: 'var(--cp-tx)' } : { background: 'transparent', borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }}>
                <InstrumentIcon track={t.id} color={on ? t.color : 'currentColor'} />
                <span className="hidden truncate md:inline">{t.name}</span>
                {own && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cp-act)' }} aria-hidden="true" />}
                {inFill && !noFill && <Zap size={10} className="absolute bottom-1 right-1" style={{ color: '#E8940F' }} aria-hidden="true" />}
                {draft.silenced[t.id] && <VolumeX size={11} className="absolute left-1.5 top-1.5" aria-label="Silenced here" />}
              </button>
            );
          })}
        </div>

        {/* Its sound, and its pages: the bars, and the fill */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 sm:px-4">
          <button type="button" aria-label={`${trackName(tab)} sound`} aria-haspopup="menu"
            title={partSoundOf(tab) ? `${SECTION_PART_LABEL[v]}’s own sound` : 'The song’s sound'}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSoundMenu({ x: r.left, y: r.bottom, above: r.top }); }}
            className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold"
            style={{ background: 'var(--cp-s2)', borderColor: partSoundOf(tab) ? 'var(--cp-ac)' : 'var(--cp-ln)', color: 'var(--cp-tx)' }}>
            <span className="min-w-0 truncate">{soundIdOf(tab) === RHYTHM_KIT ? 'Drums' : getSoundType(tab, soundIdOf(tab))?.name ?? 'Sound'}</span>
            <span className="flex-1" />
            <ChevronDown size={15} className="shrink-0" style={{ color: 'var(--cp-mu)' }} />
          </button>
          {Array.from({ length: bars }, (_, b) => {
            const on = mode === 'groove' && shownBar === b;
            const sounding = here && !!engine && !engine.fillBar && engine.bar % bars === b && !on;
            return (
              <button key={b} type="button" aria-pressed={on} aria-label={`Bar ${b + 1}`} title={`Bar ${b + 1}`}
                onClick={() => { setMode('groove'); setFollow(false); setFocus(null); setPage(b * chunks); }}
                className="relative h-9 w-9 shrink-0 rounded-[10px] border-0 text-[13px] font-bold"
                style={{ fontFamily: 'var(--cp-mono, monospace)', ...(on ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)' } : { background: 'var(--cp-s2)', color: 'var(--cp-tx2)' }) }}>
                {b + 1}
                {sounding && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: 'var(--cp-act)' }} aria-hidden="true" />}
              </button>
            );
          })}
          {!noFill && (
            <button type="button" aria-pressed={mode === 'fill'} title="The fill: the last bar, its own way"
              onClick={() => { setMode('fill'); setFocus(null); setPage(0); }}
              className="relative flex h-9 shrink-0 items-center gap-1 rounded-[10px] border-0 px-2.5 text-[13px] font-bold"
              style={mode === 'fill' ? { background: '#E8940F', color: '#fff' } : { background: 'color-mix(in srgb, #E8940F 14%, transparent)', color: '#E8940F' }}>
              <Zap size={14} />Fill
              {engine?.fillBar && mode !== 'fill' && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: '#E8940F' }} aria-label="The fill is playing" />}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2.5 sm:px-4">
          {/* The grid left the music — another page, another section, a cell written while it
              plays: the way back, as a map's button that recentres on where you are. */}
          {away && (editable.includes(playingSection) ? (
            <button type="button" className="mb-2 flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold"
              style={{ borderColor: 'var(--cp-ac)', background: 'var(--cp-acs)', color: 'var(--cp-act)' }}
              onClick={() => { setFollow(true); if (playingSection !== sec) goToSection(playingSection); else setPage(playingPage); }}>
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: 'var(--cp-act)' }} />
              {sections[playingSection]?.name} · bar {(engine?.bar ?? 0) + 1} · <b>Follow</b>
            </button>
          ) : (
            <div className="mb-2 text-xs" style={{ color: 'var(--cp-mu)' }}>Playing <b style={{ color: 'var(--cp-tx)' }}>{sections[playingSection]?.name}</b>, on another rhythm</div>
          ))}
          {[shownChunk].map((c) => (
            <div key={c} className="grid gap-1.5">
              <div className="grid items-center" style={{ gridTemplateColumns: cols, columnGap: gap }}>
                {/* On a phone a page is half a bar: its other half, from here. */}
                {chunks > 1 ? (
                  <span className="flex items-center gap-0.5">
                    <button type="button" className="cp-icb" style={{ width: 24, height: 22 }} disabled={shownChunk === 0}
                      onClick={() => { setFollow(false); setPage(pageNow - 1); }} aria-label="First half"><ChevronLeft size={15} /></button>
                    <button type="button" className="cp-icb" style={{ width: 24, height: 22 }} disabled={shownChunk >= chunks - 1}
                      onClick={() => { setFollow(false); setPage(pageNow + 1); }} aria-label="Second half"><ChevronRight size={15} /></button>
                  </span>
                ) : <span />}
                {Array.from({ length: Math.min(per, spb - c * per) }, (_, i) => {
                  const s = c * per + i;
                  const onBeat = s % stepsPerBeat === 0;
                  if (mode === 'fill') {
                    return (
                      <button key={s} type="button" onClick={() => change((d) => { V(d).fill.from = s; })} title="The fill starts here"
                        className="h-[22px] rounded-md border-0 p-0 text-[10.5px]"
                        style={{ fontFamily: 'var(--cp-mono, monospace)', background: s === from ? '#E8940F' : 'transparent', color: s === from ? '#fff' : onBeat ? 'var(--cp-tx)' : 'var(--cp-fa)', opacity: s < from ? 0.4 : 1, fontWeight: onBeat || s === from ? 700 : 400 }}>
                        {s + 1}
                      </button>
                    );
                  }
                  return <span key={s} className="text-center text-[10.5px]" style={{ fontFamily: 'var(--cp-mono, monospace)', color: onBeat ? 'var(--cp-tx)' : 'var(--cp-fa)', fontWeight: onBeat ? 700 : 400 }}>{onBeat ? s / stepsPerBeat + 1 : '·'}</span>;
                })}
              </div>
              {lanes.map((lane, li) => {
                const writes = mode === 'fill' && fillWrites(lane.key);
                // In the fill, what it does not rewrite keeps its groove: shown dim, as the app does.
                const dim = (mode === 'fill' && !writes) || !!c;
                const slim = tab !== 'drums' && !lane.chord && !!lane.a;
                let tag: JSX.Element;
                if (tab === 'drums') {
                  const lab = rowLabel(lane.row);
                  tag = (
                    <button type="button" className="flex h-full min-h-[28px] sm:min-h-[34px] flex-col justify-center rounded-[9px] border bg-transparent px-2 text-left text-[11.5px] font-bold leading-tight"
                      style={{ borderColor: lane.color, background: `color-mix(in srgb, ${lane.color} 12%, transparent)`, color: 'var(--cp-tx)', opacity: dim ? 0.45 : 1 }}
                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }} title={`${lab.name} · options`}>
                      <span className="truncate">{lab.name}</span>
                      {lab.sub && <small className="truncate text-[9.5px] font-semibold" style={{ color: 'var(--cp-mu)' }}>{lab.sub}</small>}
                    </button>
                  );
                } else if (lane.chord) {
                  tag = (
                    <button type="button" className="flex h-full min-h-[28px] sm:min-h-[34px] items-center gap-1.5 rounded-[9px] border bg-transparent px-2 text-left"
                      style={{ borderColor: lane.color, color: 'var(--cp-tx)', opacity: dim ? 0.45 : 1 }}
                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }} title="The whole chord">
                      <b className="text-[13px]">●</b><small className="text-[9.5px] font-semibold" style={{ color: 'var(--cp-mu)' }}>{chordLabel}</small>
                    </button>
                  );
                } else {
                  const semi = scaleOf(ref.quality)[lane.k! - 1] + lane.a!;
                  const iv = CHORD_OF(ref.quality);
                  const tone = iv.includes(((semi % 12) + 12) % 12);
                  tag = (
                    <button type="button" className={`flex items-center gap-1.5 rounded-[9px] border bg-transparent text-left ${slim ? 'h-[18px] px-1.5' : 'h-full min-h-[28px] sm:min-h-[34px] px-2'}`}
                      // A note of the chord on screen shows in its number's colour, not as a filled block: while
                      // the grid follows the music the chord changes every bar, and whole labels
                      // switching colour at each one read as the grid flickering.
                      style={{ borderColor: lane.a ? 'var(--cp-ln)' : lane.color, background: 'transparent', color: 'var(--cp-tx)', opacity: dim ? 0.45 : 1 }}
                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openLaneMenu(lane, r.left, r.bottom); }}
                      title={`Degree ${rowText(lane.k!, lane.a!)} of the ${chordLabel} scale${tone ? ' · a note of the chord' : ''}`}>
                      <b className={slim ? 'text-[11px]' : 'min-w-[20px] text-[13px]'} style={{ color: tone ? `color-mix(in srgb, ${lane.color} 70%, var(--cp-tx))` : 'var(--cp-tx)', transition: 'color 250ms ease' }}>{rowText(lane.k!, lane.a!)}</b>
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
                      const under = fillOver && fillWrites(lane.key) && s >= from;
                      const faded = mode === 'fill' ? (s < from || !writes) : under;
                      const ph = under ? -1 : playhead;
                      const alpha = [0.5, 0.7, 0.86, 1][on ? strengthOf(p) : 0];
                      const focused = focus?.li === li && focus?.s === s;
                      const cellStyle: CSSProperties = {
                        background: on ? `color-mix(in srgb, ${lane.color} ${Math.round(alpha * 100)}%, var(--cp-s2))` : 'var(--cp-s2)',
                        opacity: faded && ph !== s ? 0.32 : 1,
                        boxShadow: ph === s ? 'inset 0 0 0 2px var(--cp-tx)' : focused ? 'inset 0 0 0 2px var(--cp-ac)' : ring && on ? 'inset 0 0 0 2px #0B0D12' : undefined,
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
          {tab === 'drums' && (
            <button type="button" className="mt-2.5 h-8 rounded-[9px] border border-dashed bg-transparent px-2.5 text-xs font-semibold"
              style={{ borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx2)' }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openPieceMenu(r.left, r.bottom); }}>+ Add piece</button>
          )}
        </div>

        {/* The instrument's keys, thin: what sounds lights up, and the bar under them is its
            range — dragged, it moves where the instrument plays. A tap opens them large. */}
        {tab !== 'drums' && (
          <div className="px-3 pt-1.5 sm:px-4">
            <button type="button" aria-label="Keyboard and range" onClick={openKeys} className="block w-full border-0 bg-transparent p-0">
              <Keys lit={litKeys(tab as KeyTrack)} height={isMobile ? 34 : 40} range={[lowOf(tab as KeyTrack), lowOf(tab as KeyTrack) + VOICING_SPAN - 1]} />
            </button>
            <RangeBar className="mt-1" low={lowOf(tab as KeyTrack)} color={trackColor(tab)} label={trackName(tab)} height={9} onChange={(low) => setLow(tab as KeyTrack, low)} />
          </div>
        )}

        {/* Patterns: yours, the rhythm's own, the figures. Tried by ear, a tap each, while the
            grid shows what changed — the app's strip, always on screen for that reason. */}
        {(() => {
          const x = variation;
          const rhythmChips: StripPattern[] = isPart || isPartKey(v)
            ? [{ id: 'rhythm-part', name: isPart ? (section.stylePart!.kind === 'intro' ? 'Intro' : 'Ending') : SECTION_PART_LABEL[v], rows: base.rows[tab], bars: base.bars[tab] }]
            : (['a', 'b'] as const).flatMap((k) => {
              const b = baseVariation(style, section, k);
              return b ? [{ id: `rhythm-${k}`, name: k.toUpperCase(), rows: b.rows[tab], bars: b.bars[tab] }] : [];
            }).concat(variationsOf?.(sec, tab) ?? []);
          const yours = mine.filter((p) => p.tab === tab && p.spb === spb);
          const groups = [
            { label: 'Yours', list: yours as StripPattern[], mine: true },
            { label: style.name, list: rhythmChips, mine: false },
            { label: 'Figures', list: figures, mine: false },
          ].filter((g) => g.list.length);
          const chosen = [...yours, ...rhythmChips, ...figures].find((p) => spells(x.rows[tab], x.bars[tab], p, spb));
          const worthSaving = !chosen && Object.values(x.rows[tab] ?? {}).some((l) => l.some(Boolean));
          return (
            <div className="flex items-center gap-1.5 overflow-x-auto border-t px-3 py-2 sm:px-4" style={{ borderColor: 'var(--cp-ln)' }} role="group" aria-label="Patterns">
              {groups.map((g) => [
                <span key={`h-${g.label}`} className="shrink-0 pl-1 text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--cp-mu)' }}>{g.label}</span>,
                ...g.list.map((p) => (
                  <PatternChip key={p.id} name={p.name} preview={previewOf(p.rows)} color={trackColor(tab)} mine={g.mine} on={chosen === p}
                    onPick={() => applyPattern(p)}
                    onForget={g.mine ? () => setAsk({ kind: 'forget', id: p.id, name: p.name }) : undefined} />
                )),
              ])}
              {worthSaving && (
                <button type="button" onClick={askSave} className="flex h-[42px] shrink-0 items-center gap-1 rounded-xl border border-dashed bg-transparent px-3 text-[11px] font-extrabold"
                  style={{ borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' }} title="Save this pattern with a name">
                  <BookmarkPlus size={14} />Save
                </button>
              )}
            </div>
          );
        })()}

        {/* The loop: the fill thrown in, play, and round and round */}
        <div className="flex items-center justify-center gap-8 border-t px-4 py-2.5" style={{ borderColor: 'var(--cp-ln)' }}>
          <button type="button" className="cp-icb" disabled={noFill} aria-label="Fill now" title="The fill, on the next bar"
            onClick={() => (playing ? fillNow() : toast('Play the loop to throw the fill in'))}
            style={{ width: 46, height: 46, borderRadius: 23, ...(engine?.fillByHand === 2 ? { background: '#E8940F', color: '#fff' } : { color: '#E8940F', background: engine?.fillByHand === 1 ? 'color-mix(in srgb, #E8940F 18%, transparent)' : 'transparent' }) }}>
            <Zap size={20} />
          </button>
          <button type="button" className={`cp-play${playing ? ' cp-on' : ''}`} onClick={playOrStop} aria-label={playing ? 'Stop' : 'Play'} title={playing ? 'Stop the song' : 'Play this section'}>
            {playing ? <Square size={20} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button type="button" className="cp-icb" aria-pressed={loopHere} onClick={toggleLoop} aria-label="Loop this section" title="Round and round on this section"
            style={{ width: 46, height: 46, borderRadius: 23, ...(loopHere ? { background: 'var(--cp-acs)', color: 'var(--cp-act)' } : {}) }}>
            <Repeat size={20} />
          </button>
        </div>

        {ask && (
          <div className="absolute inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
            {ask.kind === 'save' ? (
              <form role="dialog" aria-label={tab === 'drums' ? 'Save the groove' : 'Save the backing'} className="grid w-full max-w-[340px] gap-3 rounded-2xl border p-4 shadow-xl"
                style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)' }}
                onSubmit={(e) => { e.preventDefault(); const name = ask.name.trim(); if (name) keepPattern(name); }}>
                <b className="text-base">{tab === 'drums' ? 'Save the groove' : 'Save the backing'}</b>
                <label className="grid gap-1.5 text-xs font-semibold" style={{ color: 'var(--cp-mu)' }}>Name
                  <input autoFocus value={ask.name} onChange={(e) => setAsk({ kind: 'save', name: e.target.value })} onFocus={(e) => e.currentTarget.select()}
                    className="h-11 rounded-[10px] border px-3 text-[15px]" style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }} />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" className="cp-btn" onClick={() => setAsk(null)}>Cancel</button>
                  <button type="submit" className="cp-btn" style={{ background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }}>Save</button>
                </div>
              </form>
            ) : (
              <div role="alertdialog" aria-label={`Forget “${ask.name}”?`} className="grid w-full max-w-[340px] gap-3 rounded-2xl border p-4 shadow-xl"
                style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)' }}>
                <b className="text-base">Forget “{ask.name}”?</b>
                <p className="m-0 text-sm" style={{ color: 'var(--cp-mu)' }}>It leaves the list, in this and every other song. Anything already playing it stays as it is.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="cp-btn" onClick={() => setAsk(null)}>Cancel</button>
                  <button type="button" className="cp-btn" style={{ color: 'var(--cp-dg)' }}
                    onClick={() => { forgetPattern(ask.id); setMine(savedPatterns()); setAsk(null); }}>Forget</button>
                </div>
              </div>
            )}
          </div>
        )}

        {panel === 'keys' && (
          <Panel title="Keyboard and range" onClose={() => setPanel(null)}>
            <Keys lit={litKeys(keyTrack)} height={isMobile ? 72 : 96} range={[lowOf(keyTrack), lowOf(keyTrack) + VOICING_SPAN - 1]} />
            {KEY_TRACKS.map((t) => (
              <div key={t} className="grid gap-1" style={{ opacity: t === keyTrack ? 1 : 0.55 }}>
                <button type="button" aria-pressed={t === keyTrack} onClick={() => setKeyTrack(t)}
                  className="flex items-baseline gap-2 border-0 bg-transparent p-0 text-left text-[12.5px]"
                  style={{ fontWeight: t === keyTrack ? 800 : 600, color: t === keyTrack ? trackColor(t) : 'var(--cp-tx2)' }}>
                  {trackName(t)}<span className="font-semibold" style={{ color: 'var(--cp-mu)', fontFamily: 'var(--cp-mono, monospace)' }}>{noteLabel(lowOf(t))}–{noteLabel(lowOf(t) + VOICING_SPAN - 1)}</span>
                </button>
                <RangeBar low={lowOf(t)} color={trackColor(t)} label={trackName(t)} height={22}
                  onChange={(low) => { setKeyTrack(t); setLow(t, low); }} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs" style={{ color: 'var(--cp-mu)' }}>Drag a bar to move where the instrument plays.</span>
              {Object.keys(songSounds.voicings).length > 0 && (
                <button type="button" className="cp-btn" onClick={() => setSongSounds((s) => ({ ...s, voicings: {} }))}>Where the rhythm puts them</button>
              )}
            </div>
          </Panel>
        )}
        {panel === 'more' && (() => {
          const close = () => setPanel(null);
          const then = (run: () => void) => () => { close(); run(); };
          const hasCells = Object.values(variation.rows[tab] ?? {}).some((l) => l.some(Boolean));
          const inFill = fillKeys.some((k) => (tab === 'drums' ? !isTrackKey(k) : k === tab));
          return (
            <Panel title={mode === 'fill' ? `${trackName(tab)} · fill` : trackName(tab)} onClose={close} narrow>
              {mode === 'groove' && (
                <div className="flex min-h-[44px] items-center gap-3 px-1">
                  <span className="flex-1 text-[15px] font-semibold">Bars</span>
                  <div className="flex overflow-hidden rounded-[10px] border" role="group" aria-label="Bars" style={{ borderColor: 'var(--cp-ln)' }}>
                    {([1, 2, 4] as const).map((n) => (
                      <button key={n} type="button" aria-pressed={bars === n} onClick={() => setBars(n)}
                        className="h-9 w-11 border-0 text-[13px] font-bold"
                        style={{ fontFamily: 'var(--cp-mono, monospace)', ...(bars === n ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)' } : { background: 'transparent', color: 'var(--cp-tx2)' }) }}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
              {tab !== 'drums' && (
                <label className="flex min-h-[44px] items-center gap-3 px-1">
                  <span className="flex-1 text-[15px] font-semibold">Notes</span>
                  <select className="h-9 rounded-full border px-3 text-[13px] font-semibold"
                    style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
                    value={String(songSounds.noteLengths[tab as KeyTrack] ?? '')}
                    onChange={(e) => {
                      const steps = e.target.value === '' ? undefined : Number(e.target.value);
                      setSongSounds((s) => {
                        const next = { ...s.noteLengths };
                        if (steps === undefined) delete next[tab as KeyTrack]; else next[tab as KeyTrack] = steps;
                        return { ...s, noteLengths: next };
                      });
                    }}>
                    {NOTE_LENGTH_CHOICES.map((o) => <option key={o.label} value={o.steps === undefined ? '' : String(o.steps)} title={o.title}>{o.label}</option>)}
                  </select>
                </label>
              )}
              <button type="button" role="switch" aria-checked={silenced} onClick={() => change((d) => { d.silenced[tab] = !d.silenced[tab]; })}
                className="flex min-h-[44px] items-center gap-3 border-0 bg-transparent px-1 text-left">
                <span className="flex-1 text-[15px] font-semibold" style={{ color: 'var(--cp-tx)' }}>Mute</span>
                <span className={`cp-sw ${silenced ? 'cp-on' : ''}`} aria-hidden="true" />
              </button>
              <div role="separator" className="h-px" style={{ background: 'var(--cp-ln)' }} />
              <div className="grid">
                {tab === 'drums'
                  ? <SheetItem icon={<Hand size={19} />} label="Play the pieces" onClick={() => setPanel('kit')} />
                  : <SheetItem icon={<Piano size={19} />} label="Keyboard and range" onClick={openKeys} />}
                {hasCells && <SheetItem icon={<BookmarkPlus size={19} />} label="Save as a pattern" onClick={then(askSave)} />}
                {mode === 'groove' && <SheetItem icon={<Shuffle size={19} />} label="Random" title="Hold: cells at random" onClick={then(randomPattern)} onHold={then(scramble)} />}
                {edited && <SheetItem icon={<RotateCcw size={19} />} label="Same as the rest" onClick={then(backToRhythm)} />}
                {mode === 'groove'
                  ? <SheetItem icon={<Trash2 size={19} />} label="Clear" danger onClick={then(clearTrack)} />
                  : inFill && <SheetItem icon={<Layers size={19} />} label="No fill" title="This instrument keeps its groove through the fill" onClick={then(noFillHere)} />}
              </div>
              {((!isPart && hasB && !isPartKey(v)) || (!isPart && plays !== v)) && (
                <>
                  <div role="separator" className="h-px" style={{ background: 'var(--cp-ln)' }} />
                  <div className="grid">
                    {!isPart && hasB && !isPartKey(v) && <SheetItem icon={<Copy size={19} />} label={`Copy from ${v === 'a' ? 'B' : 'A'}`} onClick={then(copyOther)} />}
                    {!isPart && plays !== v && <SheetItem icon={<ArrowLeftRight size={19} />} label={`Play ${SECTION_PART_LABEL[v]} in ${section.name}`} onClick={then(() => change((d) => { d.plays = v; }))} />}
                  </div>
                </>
              )}
            </Panel>
          );
        })()}
        {panel === 'kit' && (
          <Panel title="Play the pieces" onClose={() => setPanel(null)}>
            <Kit playing={playing} drumSoundOf={drumSoundOf}
              pads={[...new Set([...(variation.rows.drums.clap?.some(Boolean) ? ['clap'] : []), ...PERC_ROWS.filter((r) => variation.rows.drums[r]?.some(Boolean) || variation.fill.lanes[r]?.some(Boolean))])]
                .map((r) => ({ row: r, name: r === 'clap' ? 'Clap' : rowLabel(r).name }))} />
          </Panel>
        )}

        {/* Back with changes */}
        {leaving && (
          <div className="absolute inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
            <div role="alertdialog" aria-label="Save the changes?" className="grid w-full max-w-[320px] gap-2 rounded-2xl border p-4 shadow-xl"
              style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)' }}>
              <b className="mb-1 text-base">Save the changes?</b>
              <button type="button" className="cp-btn justify-center" style={{ background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }}
                onClick={() => { setLeaving(false); save(); }}>Save</button>
              <button type="button" className="cp-btn justify-center" onClick={() => setLeaving(false)}>Keep editing</button>
              <button type="button" className="cp-btn justify-center" style={{ color: 'var(--cp-dg)' }} onClick={() => { setLeaving(false); onClose(); }}>Discard</button>
            </div>
          </div>
        )}

        {popLane && pop && (
          <CellPopover
            lane={popLane} s={pop.s} x={pop.x} y={pop.y} p={valueAt(popLane, pop.s)} tab={tab}
            title={tab === 'drums' ? rowLabel(popLane.row).name : popLane.chord ? `Whole chord (${chordLabel})` : `Degree ${rowText(popLane.k!, popLane.a!)}`}
            drumSound={tab === 'drums' ? drumSoundOf(popLane.row) : undefined}
            chord={(() => {
              const c = chordAtStep((mode === 'fill' ? sectionBars - 1 : shownBar) * spb + pop.s);
              return c ? { name: chordName(c), ...engineChord(c, transposition) } : undefined;
            })()}
            onWrite={(fn, moveTo) => {
              write(popLane, pop.s, fn);
              // Another note, or its ♭ ♯, is another row: the window follows it there.
              if (moveTo) setPop({ ...pop, id: laneId({ key: popLane.key, ...moveTo }) });
            }}
            onClose={() => setPop(null)}
          />
        )}
        {menu && <Menu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
        {soundMenu && (
          <SoundMenu key={tab} track={tab} x={soundMenu.x} y={soundMenu.y} above={soundMenu.above} onClose={() => setSoundMenu(null)}
            underSound={underSoundOf(tab)} partSound={partSoundOf(tab)} partName={SECTION_PART_LABEL[v]}
            rhythmSound={rhythmSoundOf(tab)}
            onPick={(id) => pickSound(tab, id)}
            onAllSounds={() => { setSoundMenu(null); setAllSounds(true); }} />
        )}
        {tab !== 'drums' && (
          <AllSoundsDialog open={allSounds} onOpenChange={setAllSounds} track={tab} trackName={trackName(tab)}
            currentSoundId={soundIdOf(tab)}
            onPick={(program) => pickSound(tab, soundIdForProgram(tab, program))} />
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
type MenuItem = { head: string } | { label: string; run: () => void; hold?: () => void; danger?: boolean; title?: string };

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
 * A track's sound in the part on screen: each part of the rhythm has its own, and Save gives
 * it to the sections that share the part. The list's sounds, the rhythm's own first, and every
 * sound of the SoundFont behind "All sounds…". The kit's list, for the drums.
 */
function SoundMenu({ track, x, y, above, onClose, underSound, partSound, partName, rhythmSound, onPick, onAllSounds }: {
  track: TrackId; x: number; y: number; above: number; onClose: () => void;
  /** What the part plays without a sound of its own: the section's, else the song's. */
  underSound: string; partSound?: string; partName: string; rhythmSound?: string;
  onPick: (id: string) => void;
  onAllSounds: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const config = getInstrumentConfig(track);
  const current = partSound || underSound;
  // The rhythm's own sound first, then one picked from "All sounds…", then the list.
  const ids = [...new Set([
    ...(rhythmSound ? [rhythmSound] : []),
    ...(gmProgramOf(current) !== null ? [current] : []),
    ...(config?.soundTypes.map((s) => s.id) ?? []),
  ])].filter((id) => id !== RHYTHM_KIT);
  const place = usePlaced(ref, x, y, above);
  return (
    <div ref={ref} role="menu" aria-label={`${config?.name ?? track} sound`} className="fixed z-[60] flex w-[260px] max-w-[calc(100vw-16px)] flex-col rounded-xl border p-1.5 shadow-xl"
      style={{ ...place, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', maxHeight: 'min(430px, calc(100dvh - 16px))' }}>
      <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--cp-mu)' }}>{partName}</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ids.map((id) => {
          const on = id === current;
          return (
            <button key={id} type="button" role="menuitemradio" aria-checked={on}
              className="flex w-full items-center gap-2 rounded-lg border-0 px-2.5 py-2 text-left text-[13px] hover:bg-[var(--cp-s2)]"
              style={{ background: on ? 'var(--cp-acs)' : 'transparent', color: 'var(--cp-tx)' }}
              onClick={() => { onPick(id); onClose(); }}>
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
        ? it.head
          ? <div key={i} className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--cp-mu)' }}>{it.head}</div>
          : <div key={i} role="separator" className="mx-2 my-1 h-px" style={{ background: 'var(--cp-ln)' }} />
        : <MenuButton key={i} item={it} onClose={onClose} />))}
    </div>
  );
}

type KeyTrack = 'piano' | 'guitar' | 'bass' | 'synth';
const KEY_TRACKS: KeyTrack[] = ['piano', 'guitar', 'bass', 'synth'];
/** Where each track's register starts when neither the song nor its rhythm says: the app's defaults. */
const DEFAULT_LOW: Record<KeyTrack, number> = { piano: 60, guitar: 55, bass: 40, synth: 60 };
/** The keyboard drawn: E1 to C7, room for the bass's lowest and the synth's highest. */
const KEY_LO = 28;
const KEY_HI = 96;
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const WHITES = Array.from({ length: KEY_HI - KEY_LO + 1 }, (_, i) => KEY_LO + i).filter((m) => !isBlack(m));
const BLACKS = Array.from({ length: KEY_HI - KEY_LO + 1 }, (_, i) => KEY_LO + i).filter(isBlack);
/** Where key [m] sits across the keyboard, 0–1. */
function keyBox(m: number) {
  const w = 1 / WHITES.length;
  const i = WHITES.filter((x) => x < m).length;
  return isBlack(m) ? { left: (i - 0.3) * w, width: 0.6 * w } : { left: i * w, width: w };
}
const noteLabel = (m: number) => `${pitchName(m)}${Math.floor(m / 12) - 1}`;
const clampLow = (n: number) => Math.max(KEY_LO, Math.min(KEY_HI - VOICING_SPAN + 1, n));

/** The notes each melodic track holds, from the engine, while [on]. */
function useSounding(on: boolean): number[][] {
  const [notes, setNotes] = useState<number[][]>([[], [], [], []]);
  useEffect(() => {
    if (!on) { setNotes([[], [], [], []]); return; }
    return subscribeEngineState((st) => setNotes((prev) => (JSON.stringify(prev) === JSON.stringify(st.sounding) ? prev : st.sounding.map((a) => [...a]))));
  }, [on]);
  return notes;
}

/**
 * A keyboard: the keys [lit] in their track's colour. With a [range], the track's two octaves
 * stay bright and the keys outside them fade, so the bar under it and the keys read as one
 * window; a note that sounds outside it — a ninth above the chord, an octave leap written in
 * a step, which the engine leaves where they fall — is lit striped, there but out of place.
 */
function Keys({ lit, height, range }: { lit: Map<number, string>; height: number; range?: [number, number] }) {
  const inside = (m: number) => !range || (m >= range[0] && m <= range[1]);
  const paint = (m: number, base: string, faded: string) => {
    const color = lit.get(m);
    if (!color) return inside(m) ? base : faded;
    return inside(m) ? color : `repeating-linear-gradient(135deg, ${color} 0 3px, ${faded} 3px 6px)`;
  };
  return (
    <span className="relative block overflow-hidden rounded-md border" style={{ height, borderColor: 'var(--cp-ln2)', background: '#FFFFFF' }} aria-hidden="true">
      {WHITES.map((m) => { const b = keyBox(m); return <span key={m} className="absolute bottom-0 top-0 border-r" style={{ left: `${b.left * 100}%`, width: `${b.width * 100}%`, borderColor: '#D5D8E0', background: paint(m, '#FFFFFF', '#E3E5EA') }} />; })}
      {BLACKS.map((m) => { const b = keyBox(m); return <span key={m} className="absolute top-0" style={{ left: `${b.left * 100}%`, width: `${b.width * 100}%`, height: '62%', borderRadius: '0 0 2px 2px', background: paint(m, '#23262E', '#8A8E99') }} />; })}
    </span>
  );
}

/**
 * One track's range under the keys: two octaves from where it starts, dragged along them (the
 * app's _RangeBar). The drag is added up from where it began, so small moves are not lost to
 * rounding, and kept when let go; the arrow keys move it a semitone, with Shift an octave.
 */
function RangeBar({ low, color, label, height, onChange, className = '' }: {
  low: number; color: string; label: string; height: number; onChange: (low: number) => void; className?: string;
}) {
  const drag = useRef<{ x0: number; low0: number; w: number } | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const shown = moving ?? low;
  const a = keyBox(clampLow(shown));
  const b = keyBox(Math.min(KEY_HI, clampLow(shown) + VOICING_SPAN - 1));
  return (
    <div className={`relative rounded-full ${className}`} style={{ height, background: 'var(--cp-s2)' }}>
      <button type="button" aria-label={`${label} range, ${noteLabel(shown)} to ${noteLabel(shown + VOICING_SPAN - 1)}`}
        className="absolute bottom-0 top-0 rounded-full border-0 p-0"
        style={{ left: `${a.left * 100}%`, width: `${(b.left + b.width - a.left) * 100}%`, background: color, cursor: moving === null ? 'grab' : 'grabbing', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x0: e.clientX, low0: low, w: e.currentTarget.parentElement!.getBoundingClientRect().width };
          setMoving(low);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const next = clampLow(d.low0 + Math.round(((e.clientX - d.x0) / d.w) * (KEY_HI - KEY_LO + 1)));
          // Each semitone it crosses goes out at once, as the app's bar does: the keys and
          // the sound follow the drag, not only the release.
          if (next !== moving) { setMoving(next); onChange(next); }
        }}
        onPointerUp={() => { drag.current = null; setMoving(null); }}
        onPointerCancel={() => { drag.current = null; setMoving(null); }}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          if (!step) return;
          e.preventDefault();
          onChange(clampLow(low + step * (e.shiftKey ? 12 : 1)));
        }} />
    </div>
  );
}

/** A panel over the editor, closed by its ✕, Esc or a tap beside it. */
function Panel({ title, onClose, children, narrow = false }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="absolute inset-0 z-[65] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: 'rgba(0,0,0,.4)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className={`grid max-h-[92%] w-full ${narrow ? 'max-w-[380px] gap-1.5' : 'max-w-[720px] gap-3'} overflow-y-auto rounded-t-2xl border p-4 shadow-xl sm:rounded-2xl`}
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)' }}>
        <div className="flex items-center gap-2">
          <b className="flex-1 text-base">{title}</b>
          <button type="button" className="cp-icb" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The kit seen from the stool (the app's DrumKitPanel): each piece lights as the engine strikes
 * it, and a tap sounds it — near the edge, what a drummer plays there: the snare's rim, the
 * open hat. Under it, the hand percussion the rhythm plays.
 */
const PIECES: { row: string; edge?: string; name: string; x: number; y: number; w: number; h: number; cymbal?: boolean; round?: boolean }[] = [
  { row: 'crash', name: 'Crash', x: 12, y: 8, w: 76, h: 76, cymbal: true, round: true },
  { row: 'hihat', edge: 'hihatOpen', name: 'Hi-hat', x: 20, y: 96, w: 64, h: 64, cymbal: true, round: true },
  { row: 'tom1', name: 'Tom 1', x: 112, y: 14, w: 58, h: 58, round: true },
  { row: 'tom2', name: 'Tom 2', x: 180, y: 14, w: 58, h: 58, round: true },
  { row: 'snare', edge: 'rim', name: 'Snare', x: 98, y: 92, w: 68, h: 68, round: true },
  { row: 'kick', name: 'Kick', x: 176, y: 110, w: 92, h: 44 },
  { row: 'floorTom', name: 'Floor tom', x: 280, y: 94, w: 70, h: 70, round: true },
  { row: 'ride', name: 'Ride', x: 262, y: 4, w: 84, h: 84, cymbal: true, round: true },
  { row: 'hihatFoot', name: 'Pedal', x: 30, y: 166, w: 44, h: 12 },
];
function Kit({ playing, drumSoundOf, pads }: { playing: boolean; drumSoundOf: (row: string) => number | undefined; pads: { row: string; name: string }[] }) {
  const [lit, setLit] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!playing) return;
    return subscribeEngineState((st) => {
      if (!st.drumStruck) return;
      const now = performance.now();
      setLit((prev) => {
        const next = { ...prev };
        DRUM_ROWS.forEach((row, i) => { if (st.drumStruck & (1 << i)) next[row] = now; });
        return next;
      });
    });
  }, [playing]);
  // Lit for a moment, then out.
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 90); return () => window.clearInterval(t); }, []);
  const on = (row?: string) => !!row && performance.now() - (lit[row] ?? -1e9) < 180;
  const strike = (row: string) => {
    setLit((prev) => ({ ...prev, [row]: performance.now() }));
    previewAppCell({ track: 'drums', row, packed: packHit(205), drumSound: drumSoundOf(row) });
  };
  return (
    <div className="grid gap-3">
      <div className="relative mx-auto w-full max-w-[380px]" style={{ aspectRatio: '360 / 184' }}>
        {PIECES.map((p) => {
          const hit = on(p.row) || on(p.edge);
          return (
            <button key={p.row} type="button" aria-label={p.name}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
                const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
                strike(p.edge && Math.hypot(dx, dy) > 0.72 ? p.edge : p.row);
              }}
              className="absolute grid place-items-center border-2 p-0 text-[10.5px] font-extrabold transition-colors"
              style={{
                left: `${(p.x / 360) * 100}%`, top: `${(p.y / 184) * 100}%`, width: `${(p.w / 360) * 100}%`, height: `${(p.h / 184) * 100}%`,
                borderRadius: p.round ? '50%' : 12,
                borderColor: hit ? '#E8283A' : 'var(--cp-ln2)',
                background: hit ? 'color-mix(in srgb, #E8283A 22%, var(--cp-s1))' : p.cymbal ? 'color-mix(in srgb, #E8B93E 18%, var(--cp-s1))' : 'var(--cp-s2)',
                color: 'var(--cp-tx2)',
              }}>{p.name}</button>
          );
        })}
      </div>
      {pads.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, pads.length)}, minmax(0, 1fr))` }}>
          {pads.map((p) => (
            <button key={p.row} type="button" onPointerDown={() => strike(p.row)}
              className="h-12 rounded-xl border-2 text-xs font-extrabold transition-colors"
              style={{ borderColor: on(p.row) ? '#DE5AA0' : 'var(--cp-ln2)', background: on(p.row) ? 'color-mix(in srgb, #DE5AA0 22%, var(--cp-s1))' : 'var(--cp-s2)', color: 'var(--cp-tx2)' }}>{p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A line of an options sheet: an icon and what it does; one with [onHold] does that on a long press (or a right click). */
function SheetItem({ icon, label, onClick, onHold, danger = false, title }: {
  icon: React.ReactNode; label: string; onClick: () => void; onHold?: () => void; danger?: boolean; title?: string;
}) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); };
  return (
    <button type="button" title={title}
      className="flex min-h-[46px] items-center gap-3.5 rounded-lg border-0 bg-transparent px-1.5 text-left text-[15px] font-semibold hover:bg-[var(--cp-s2)]"
      style={{ color: danger ? 'var(--cp-dg)' : 'var(--cp-tx)' }}
      onPointerDown={onHold ? () => { held.current = false; timer.current = window.setTimeout(() => { held.current = true; onHold(); }, 480); } : undefined}
      onPointerUp={stop} onPointerLeave={stop}
      onContextMenu={onHold ? (e) => { e.preventDefault(); stop(); onHold(); } : undefined}
      onClick={() => { if (held.current) { held.current = false; return; } onClick(); }}>
      <span className="grid w-6 place-items-center" style={{ color: danger ? 'var(--cp-dg)' : 'var(--cp-mu)' }}>{icon}</span>{label}
    </button>
  );
}

/** A menu item: a tap runs it; one with a hold does that on a long press (or a right click). */
function MenuButton({ item, onClose }: { item: Extract<MenuItem, { label: string }>; onClose: () => void }) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); };
  const hold = () => { held.current = true; onClose(); item.hold!(); };
  return (
    <button role="menuitem" type="button" title={item.title} className="rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] hover:bg-[var(--cp-s2)]"
      style={{ color: item.danger ? 'var(--cp-dg)' : 'var(--cp-tx)' }}
      onPointerDown={item.hold ? () => { held.current = false; timer.current = window.setTimeout(hold, 480); } : undefined}
      onPointerUp={stop} onPointerLeave={stop}
      onContextMenu={item.hold ? (e) => { e.preventDefault(); stop(); hold(); } : undefined}
      onClick={() => { if (held.current) { held.current = false; return; } onClose(); item.run(); }}>{item.label}</button>
  );
}

/** A pattern in the strip: its name over a thumbnail of its first bar. One of yours is forgotten by a long press. */
function PatternChip({ name, preview, color, mine, on, onPick, onForget }: {
  name: string; preview: boolean[]; color: string; mine: boolean; on: boolean; onPick: () => void; onForget?: () => void;
}) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); };
  return (
    <button type="button" aria-pressed={on} title={onForget ? `${name} · hold to forget` : name}
      className="flex h-[42px] shrink-0 flex-col items-start justify-center gap-1 rounded-xl border px-2.5"
      style={on ? { background: 'var(--cp-acs)', borderColor: 'var(--cp-ac)', borderWidth: 1.5, color: 'var(--cp-act)' } : { background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
      onPointerDown={onForget ? () => { held.current = false; timer.current = window.setTimeout(() => { held.current = true; onForget(); }, 480); } : undefined}
      onPointerUp={stop} onPointerLeave={stop}
      onContextMenu={onForget ? (e) => { e.preventDefault(); stop(); onForget(); } : undefined}
      onClick={() => { if (held.current) { held.current = false; return; } onPick(); }}>
      <span className="flex items-center gap-1 whitespace-nowrap text-xs" style={{ fontWeight: on ? 800 : 700 }}>
        {mine && <Bookmark size={10} style={{ color: 'var(--cp-mu)' }} fill="currentColor" />}{name}
      </span>
      <span className="flex h-[6px] w-[58px] gap-px" aria-hidden="true">
        {preview.map((p, i) => <span key={i} className="flex-1 rounded-[1px]" style={{ background: p ? color : 'var(--cp-ln)' }} />)}
      </span>
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

/** [notes] without the one on degree row [k] with [a]: the other note a step can hold. */
const offRow = (notes: StepNote[], k: number, a: number) =>
  notes.filter((n) => { const r = rowOf(n); return n.d !== DEG.chord && !(r && r.k === k && r.a === a); });

/** How the keypad names a key: the whole chord, a chord tone, or a degree of the scale. */
const keyLabel = (d: number) => (d === DEG.chord ? '●' : d >= DEG.scale1 ? `${d - DEG.scale1 + 1}` : TONE_LETTER[d]);
const keyName = (d: number) => (d === DEG.chord ? 'The whole chord' : d >= DEG.scale1 ? `Degree ${d - DEG.scale1 + 1}` : `The ${TONE_NAME[d]}`);

/**
 * The window of a cell. A drum hit: its strength, accent and, for hand percussion, its tone.
 * A note: one keypad picks it — the numbers follow the chord (● R 3 5 7 9 8) or the scale
 * (● 1–8), one switch says which — with its ♭ ♯ and octave, its strength and accent; the
 * title is the note it makes over the chord it sits on. As the app's (step_grid.dart).
 */
function CellPopover({ lane, s, x, y, p, tab, title, drumSound, chord, onWrite, onClose }: {
  lane: Lane; s: number; x: number; y: number; p: number; tab: GrooveTrack; title: string; drumSound?: number;
  chord?: { name: string; root: number; quality: string };
  onWrite: (fn: (p: number) => number, moveTo?: { chord?: boolean; k?: number; a?: number }) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-cell]')) onClose(); };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [onClose]);
  const isDrums = tab === 'drums';
  /** The note this cell plays: the whole chord on the chord row, else the one on its degree row. */
  const note: StepNote | undefined = isDrums ? undefined
    : lane.chord ? notesOf(p).find((n) => n.d === DEG.chord) : notesOnRow(p, lane.k!, lane.a!)[0];
  const [scale, setScale] = useState(note ? note.d >= DEG.scale1 : !lane.chord);
  const [alt, setAlt] = useState(note ? note.a : lane.a ?? 0);
  const level = p ? strengthOf(p) : -1;
  const others = (q: number) => (lane.chord ? [] : offRow(notesOf(q), lane.k!, lane.a!));
  /** The step with this cell's note as [n], the other note it holds kept. */
  const put = (n: StepNote) => {
    onWrite((q) => {
      if (n.d === DEG.chord) return packNotes(q ? vel(q) : 205, [n], q ? accent(q) : 0);
      return packNotes(q ? vel(q) : 205, [...others(q).slice(0, 1), n], q ? accent(q) : 0);
    }, n.d === DEG.chord ? { chord: true } : { ...rowOf(n)! });
  };
  const pick = (d: number) => put(d === DEG.chord ? { d, a: 0, o: 0 } : { d, a: alt, o: note && note.d !== DEG.chord ? note.o : 0 });
  const accidental = (value: number) => {
    const a = alt === value ? 0 : value;
    setAlt(a);
    if (note && note.d !== DEG.chord) put({ ...note, a });
  };
  const octave = (value: number) => { if (note && note.d !== DEG.chord) put({ ...note, o: note.o === value ? 0 : value }); };
  const clear = () => {
    onWrite((q) => {
      if (isDrums || lane.chord) return 0;
      const rest = others(q);
      return rest.length ? packNotes(vel(q), rest, accent(q)) : 0;
    });
    onClose();
  };
  const chip = (pressed: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={pressed} onClick={onClick}
      className="rounded-[9px] border px-2.5 py-1 text-xs font-semibold"
      style={pressed ? { background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' } : { background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}>
      {label}
    </button>
  );
  const square = (pressed: boolean, label: string, aria: string, onClick: () => void, disabled = false) => (
    <button type="button" aria-pressed={pressed} aria-label={aria} title={aria} onClick={onClick} disabled={disabled}
      className="h-10 min-w-[44px] rounded-[10px] border-0 px-2 text-[16px] disabled:opacity-40"
      style={pressed ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'var(--cp-s2)', color: 'var(--cp-tx)' }}>
      {label}
    </button>
  );
  const own = drumSound !== undefined ? drumSound - GM_PERC_FIRST : 0;
  const tones = isDrums && lane.row.startsWith('perc') && own > 0 ? percTones(own) : [];
  const keys: number[] = scale
    ? [DEG.chord, ...Array.from({ length: 8 }, (_, i) => DEG.scale1 + i)]
    : [DEG.chord, DEG.root, DEG.third, DEG.fifth, DEG.seventh, DEG.ninth, DEG.octave];
  const noteName = note && chord
    ? note.d === DEG.chord ? chord.name : pitchName(chord.root + (semitoneOf(note, chord.quality) ?? 0))
    : undefined;
  const place = usePlaced(ref, x, y);
  return (
    <div ref={ref} role="dialog" aria-label={`${title}, step ${s + 1}`} className="fixed z-[60] grid w-[312px] max-w-[calc(100vw-16px)] gap-3 rounded-2xl border p-3 shadow-xl"
      style={{ ...place, background: 'var(--cp-s1)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)', maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' }}>
      <div className="flex items-center gap-2">
        {isDrums ? <b className="min-w-0 flex-1 truncate text-[14px]">{title}</b> : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <b className="text-[22px] leading-none">{noteName ?? '—'}</b>
            {chord && <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: 'var(--cp-s2)', color: 'var(--cp-tx2)' }}>{chord.name}</span>}
          </span>
        )}
        {!isDrums && (
          <div className="flex overflow-hidden rounded-[9px] border" role="group" aria-label="What the numbers follow" style={{ borderColor: 'var(--cp-ln)' }}>
            {([false, true] as const).map((sc) => (
              <button key={String(sc)} type="button" aria-pressed={scale === sc} onClick={() => setScale(sc)}
                className="h-7 border-0 px-2.5 text-xs font-bold"
                style={scale === sc ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)' } : { background: 'transparent', color: 'var(--cp-mu)' }}>
                {sc ? 'Scale' : 'Chord'}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="cp-icb" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      {!isDrums && (
        <>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
            {keys.map((d) => {
              const a = d === DEG.chord ? 0 : alt;
              const on = !!note && note.d === d && (d === DEG.chord || note.a === a);
              const sign = d === DEG.chord ? '' : a < 0 ? '♭' : a > 0 ? '♯' : '';
              return (
                <button key={d} type="button" aria-pressed={on} aria-label={`${sign === '♭' ? 'flat ' : sign === '♯' ? 'sharp ' : ''}${keyName(d)}`}
                  onClick={() => pick(d)}
                  className="h-12 min-w-0 rounded-[11px] border-0 p-0 text-[15px] font-bold"
                  style={{ fontFamily: 'var(--cp-mono, monospace)', ...(on ? { background: 'var(--cp-ac)', color: '#fff' } : { background: 'var(--cp-s2)', color: 'var(--cp-tx)' }) }}>
                  {sign}{keyLabel(d)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            {square(alt < 0, '♭', 'Flat', () => accidental(-1))}
            {square(alt > 0, '♯', 'Sharp', () => accidental(1))}
            <span className="w-1.5" />
            {square(!!note && note.o < 0, '−8', 'An octave down', () => octave(-1), !note || note.d === DEG.chord)}
            {square(!!note && note.o > 0, '+8', 'An octave up', () => octave(1), !note || note.d === DEG.chord)}
            <span className="flex-1" />
            {note && (
              <button type="button" onClick={clear} aria-label="Remove the note" title="Remove the note"
                className="grid h-10 w-11 place-items-center rounded-[10px] border-0"
                style={{ background: 'color-mix(in srgb, var(--cp-dg) 14%, transparent)', color: 'var(--cp-dg)' }}><Trash2 size={17} /></button>
            )}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {STRENGTHS.map((st, i) => chip(level === i, st.name, () => onWrite((q) => {
          if (isDrums) return q ? withVelocity(q, st.v) : packHit(st.v);
          if (lane.chord) return packNotes(st.v, [{ d: DEG.chord, o: 0, a: 0 }], q ? accent(q) : 0);
          const mine = note ?? { d: 7 + lane.k!, a: lane.a!, o: 0 };
          return packNotes(st.v, [...others(q).slice(0, 1), mine], q ? accent(q) : 0);
        })))}
        {chip(!!(p && accent(p)), 'Accent', () => onWrite((q) => (q ? toggleAccent(q)
          : isDrums ? packHit(255, 0, 1) : packNotes(255, [lane.chord ? { d: DEG.chord, o: 0, a: 0 } : { d: 7 + lane.k!, a: lane.a!, o: 0 }], 1))))}
        {isDrums && p > 0 && (
          <button type="button" onClick={clear} aria-label="Remove the hit" title="Remove the hit"
            className="ml-auto grid h-8 w-9 place-items-center rounded-[9px] border-0"
            style={{ background: 'color-mix(in srgb, var(--cp-dg) 14%, transparent)', color: 'var(--cp-dg)' }}><Trash2 size={15} /></button>
        )}
      </div>
      {tones.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tones.map((t) => chip(!!p && (hitTone(p) || own) === t, GM_PERC_NAMES[t] ?? `${t}`, () => onWrite((q) => packHit(q ? vel(q) : 205, t === own ? 0 : t, q ? accent(q) : 0))))}
        </div>
      )}
    </div>
  );
}

/** Each track by what it is played on: a kit, keys, a guitar, a bass, a synth's wave. */
function InstrumentIcon({ track, color }: { track: GrooveTrack; color: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (track) {
    case 'drums':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="10" rx="8" ry="3" />
          <path d="M4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          <path d="M9 3.5 12 8M17 3 13.5 8" />
        </svg>
      );
    case 'piano':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 12v7M12 12v7M16 12v7" />
          <path d="M6.5 5v7h3V5M14.5 5v7h3V5" fill={color} />
        </svg>
      );
    case 'guitar':
      return (
        <svg {...common}>
          <path d="M13.5 10.5 20 4" />
          <path d="m18.5 2.5 3 3" />
          <path d="M11.8 8.6c-1.4-.9-3.3-.7-4.5.5-.9.9-1 2-1.7 2.6-.8.6-2.2.5-3 1.6-1.2 1.6-.6 4.4 1.3 6.2 1.9 1.9 4.6 2.5 6.2 1.3 1.1-.8 1-2.2 1.6-3 .6-.7 1.7-.8 2.6-1.7 1.2-1.2 1.4-3.1.5-4.5" />
          <circle cx="9" cy="15" r="1.4" fill={color} />
        </svg>
      );
    case 'bass':
      return (
        <svg {...common}>
          <path d="M12.5 11.5 21 3" />
          <path d="M10.4 10.2c-1.5-.5-3-.1-3.9.8-.7.7-.7 1.6-1.4 2.2-.8.6-2 .7-2.6 1.6-1 1.4-.4 3.7 1.3 5.3 1.6 1.7 3.9 2.3 5.3 1.3.9-.6 1-1.8 1.6-2.6.6-.7 1.5-.7 2.2-1.4.9-.9 1.3-2.4.8-3.9" />
          <path d="M6.5 16.5l1 1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M6 13c1.2-4 2.4-4 3.6 0s2.4 4 3.6 0 2.4-4 3.6 0" />
        </svg>
      );
  }
}
