import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  rectIntersection,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  type CollisionDetection,
  pointerWithin,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { type Chord, generateChordId, chordToMidiNotes } from '@/lib/musicTheory';
import { type Section, createSection, getSectionDisplayName } from '@/lib/sections';
import { detectKey, keyLabel, relativeTonic, type DetectedKey, type KeyMode } from '@/lib/keyDetect';
import { keyPrefersFlats } from '@/lib/musicKeys';
import { getDefaultInstrumentStates, type InstrumentState } from '@/lib/instruments';
import { getStyleByIdWithOverrides, resolveActiveStyle, MUSICAL_STYLES, type StylePattern } from '@/lib/styles';
import { getCustomStyles, getStyleOverride, saveStyleOverride, saveCustomStyle, isCustomStyle, initCustomStylesCache } from '@/lib/customStyles';
import { renderProgressionOffline, playChordPreview, areSamplesLoaded, preloadAudio } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { exportMidi } from '@/lib/midiExporter';
import { usePlayback, useCurrentStep } from '@/contexts/PlaybackContext';
import { useStyleInstruments, createInstrumentStatesFromStyle } from '@/hooks/useStyleInstruments';
import { type Song, createSong } from '@/lib/songs';
import { parseChordString } from '@/lib/chordParser';
import { decodeEditorSections, editorSectionsToSections } from '@/lib/editorLink';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getUkuleleVoicing } from '@/data/ukuleleChords';
import { getSongForViewer, setSongVisibility, saveSongWithSync } from '@/lib/songStorage';
import { saveForkDraft, loadForkDraft, clearForkDraft, shouldRestoreForkDraft } from '@/lib/forkDraft';
import { analytics } from '@/lib/analytics';
import { SectionCard } from '@/components/SectionCard';
import { TransportControls } from '@/components/TransportControls';
import { ChordEditModal } from '@/components/ChordEditModal';
import { AddChordModal } from '@/components/AddChordModal';
import { RhythmEditor } from '@/components/RhythmEditor';
import { CreateRhythmModal } from '@/components/CreateRhythmModal';
import { InstrumentsPanel } from '@/components/InstrumentsPanel';
import { ChordBlock } from '@/components/ChordBlock';
import { ProgressBar } from '@/components/ProgressBar';
import { GuidedTour } from '@/components/GuidedTour';
import { BeatIndicator } from '@/components/BeatIndicator';
import { CountdownOverlay } from '@/components/CountdownOverlay';
import { ProgressionTemplatesModal } from '@/components/ProgressionTemplatesModal';
import { ShortcutsHelp } from '@/components/ShortcutsHelp';
import { WaveformVisualizer } from '@/components/WaveformVisualizer';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { DurationDots } from '@/components/DurationDots';
import { InstrumentViewSelector } from '@/components/InstrumentViewSelector';
import type { ChordView } from '@/hooks/useSyncedChordView';
import { MixingConsole } from '@/components/MixingConsole';
import { AuthModal } from '@/components/AuthModal';
import { AccountPromptModal } from '@/components/AccountPromptModal';
import { AccountMenu, AccountAvatarButton } from '@/components/AccountMenu';
import { Button } from '@/components/ui/button';
import { Music2, Plus, ArrowLeft, Check, Loader2, FileMusic, Sliders, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useAccountState } from '@/hooks/useAccountState';

interface IndexProps {
  songId?: string;
}

// Export → save nudge. Aug 2026 this converted at 4.4% (91 shown, 4 clicked), and the
// mechanics were most of the reason: it fired in the same tick as the "exported
// successfully" toast, which itself stacked on the still-visible "Rendering audio…" one.
// Three toasts at once, two of them opening with the same word, arriving at the exact
// moment the browser pops its own download UI and the user's attention leaves the page.
// Now the export owns a single toast (one id, loading → success) and the nudge arrives
// alone, a beat later, once that has cleared. See showExportSaveNudge.
const EXPORT_NUDGE_SESSION_KEY = 'chord-player-export-nudge-count';
// Someone who exports twice in a session is showing more intent, not less, so the nudge
// gets a second chance — but never twice for the same export, and never a third time.
const EXPORT_NUDGE_MAX_PER_SESSION = 2;
const EXPORT_NUDGE_DELAY_MS = 1600;
// Shared by both export paths so the progress/success/error states replace each other in
// place instead of piling up.
const EXPORT_TOAST_ID = 'chord-player-export';

// The fields that constitute "the visitor changed this song", used to spot the first
// real edit on a copy opened from a share link. Instruments are deliberately left out:
// loading a song applies its style, and useStyleInstruments then rewrites instrument
// sounds and volumes by itself — that's the app talking, not the visitor, and counting
// it would fork the song before anyone touched anything.
const editorSignature = (s: {
  title: string;
  sections: Section[];
  bpm: number;
  styleId: string;
  transposition: number;
  metronomeEnabled: boolean;
}) => JSON.stringify([s.title, s.sections, s.bpm, s.styleId, s.transposition, s.metronomeEnabled]);

// Isolated subscriber to the 16th-note playhead: the only thing that re-renders on
// every step, keeping those ~6.7x/sec updates out of the big editor tree.
const PlayheadBeatIndicator = ({ isPlaying }: { isPlaying: boolean }) => {
  const currentStep = useCurrentStep();
  return <BeatIndicator currentStep={currentStep} isPlaying={isPlaying} />;
};

const Index = ({ songId }: IndexProps) => {
  const { showOnboarding, dismissOnboarding } = useFirstTimeUser();
  const { state: playbackState, play, warmup, stop: stopPlayback, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex } = playbackState;
  // `currentStep` is intentionally NOT read here — it changes ~6.7x/sec and reading it
  // at this top level would re-render the entire editor tree every 16th note (the cause
  // of the audio crackle). The beat playhead subscribes to it in isolation via
  // <PlayheadBeatIndicator> (see below), which uses useCurrentStep().

  // Song loading state
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [songCreatedAt, setSongCreatedAt] = useState<string | null>(null);
  const { isLoggedIn, displayName, refresh: refreshAuth } = useAccountState();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalEntryPoint, setAuthModalEntryPoint] = useState('save_cta');
  const [accountPromptOpen, setAccountPromptOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Signing in is a detour, not the goal: every entry point into the auth modal here is
  // really someone trying to keep their work. Without remembering that, the click that
  // opened the modal is swallowed and they have to press Save a second time.
  const pendingSaveRef = useRef(false);

  // Sharing state.
  // `sharedSong` is set when the loaded song belongs to SOMEONE ELSE. In that case the
  // song's id is deliberately kept out of `currentSongId` — autosave is gated on it, so
  // leaving it null is what guarantees a visitor's edits can never reach the owner's row.
  // The first real edit clears this and turns the session into the visitor's own copy.
  const [sharedSong, setSharedSong] = useState<{ id: string; title: string } | null>(null);
  const sharedBaselineRef = useRef<string | null>(null);
  // Id of the shared song the current work was forked from (null for organic sessions).
  const [forkedFromId, setForkedFromId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // A fork the visitor left behind by refreshing before saving. Read once per mount,
  // then fed into the state initializers below.
  const [restoredDraft] = useState(() => (shouldRestoreForkDraft() ? loadForkDraft() : null));

  // A shared-link visitor (?chords= or ?data=, see the sections initializer below) came
  // here to see a specific progression, not to be walked through a 4-step tour before
  // they can look at it — skip the guided tour for that first visit.
  const [hasDeepLinkedProgression] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('chords') || params.has('data');
  });

  // Default chords for new songs
  const defaultChords: Chord[] = [
    { id: generateChordId(), root: 'E', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'D', accidental: '', quality: 'maj', duration: 4 },
    { id: generateChordId(), root: 'B', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'C', accidental: '', quality: 'maj', duration: 4 },
  ];

  // Sections state — if opening from a song page (?data=...), restore the full
  // section/duration/repeat structure; if opening from a blog link (?chords=...),
  // fall back to a single flat section
  const [sections, setSections] = useState<Section[]>(() => {
    if (restoredDraft) return restoredDraft.sections;
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('data');
    if (dataParam) {
      const decoded = decodeEditorSections(dataParam);
      const fromData = decoded ? editorSectionsToSections(decoded) : [];
      if (fromData.length > 0) return fromData;
    }
    const chordsParam = params.get('chords');
    const fromUrl = chordsParam ? parseChordString(chordsParam) : [];
    return [{
      ...createSection('Section A'),
      chords: fromUrl.length > 0 ? fromUrl : defaultChords,
    }];
  });
  const [customStyles, setCustomStyles] = useState<StylePattern[]>(getCustomStyles());

  // Determine initial style — prefer ?style= URL param, then merengue (only for new songs)
  const getInitialStyleId = () => {
    if (restoredDraft) return restoredDraft.styleId;
    const styleParam = new URLSearchParams(window.location.search).get('style');
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    if (styleParam && allStyles.some(s => s.id === styleParam)) return styleParam;
    // When loading an existing song the real styleId arrives async from Supabase.
    // Use a neutral placeholder so the pre-load render doesn't apply the wrong style
    // overrides. For new songs (no id in path) default to reggaeton as before.
    const hasSongInUrl = window.location.pathname.includes('/chord-player/song_');
    if (hasSongInUrl) return 'rock_basic';
    return allStyles.find(s => s.id === 'reggaeton')?.id || 'rock_basic';
  };

  const [selectedStyleId, setSelectedStyleId] = useState(getInitialStyleId);
  const [bpm, setBpm] = useState(() => {
    if (restoredDraft) return restoredDraft.bpm;
    const bpmParam = new URLSearchParams(window.location.search).get('bpm');
    if (bpmParam) {
      const parsed = parseInt(bpmParam, 10);
      if (!isNaN(parsed) && parsed >= 40 && parsed <= 300) return parsed;
    }
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    const hasSongInUrl = window.location.pathname.includes('/chord-player/song_');
    // Must match getInitialStyleId above: it returns reggaeton for new songs, so deriving
    // the BPM from merengue (130) left a new visitor on reggaeton at 130 — outside its own
    // bpmRange of [85, 105]. The sitewide nav/footer CTA used to hide this by pinning
    // ?bpm=100; now that it links to the bare URL, the default has to stand on its own.
    const initialId = hasSongInUrl ? 'rock_basic' : (allStyles.find(s => s.id === 'reggaeton')?.id || 'rock_basic');
    return allStyles.find(s => s.id === initialId)?.bpm ?? 100;
  });
  const [instruments, setInstruments] = useState<InstrumentState[]>(
    () => restoredDraft?.instruments ?? getDefaultInstrumentStates(),
  );
  const [songTitle, setSongTitle] = useState(() => {
    if (restoredDraft) return restoredDraft.title;
    const titleParam = new URLSearchParams(window.location.search).get('title');
    if (titleParam) return titleParam;
    return 'My Song';
  });
  const [transposition, setTransposition] = useState(restoredDraft?.transposition ?? 0);
  // null = follow whatever detectKey() heard. Set the moment the user picks anything in
  // the key panel, and from then on their reading wins: detection runs on every edit, so
  // without this, adding one chord could re-read the song in another key and respell the
  // whole sheet under them. It is a way of reading the same chords, so it is not persisted.
  const [keyOverride, setKeyOverride] = useState<DetectedKey | null>(null);
  const [metronomeEnabled, setMetronomeEnabled] = useState(restoredDraft?.metronomeEnabled ?? true);
  const [loopingSectionIndex, setLoopingSectionIndex] = useState<number | null>(null);
  
  // Live edited style (for rhythm editor live mode)
  const [liveEditedStyle, setLiveEditedStyle] = useState<StylePattern | null>(null);
  
  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [previewChord, setPreviewChord] = useState<Chord | null>(null);
  const [editingChord, setEditingChord] = useState<{ sectionIndex: number; chordIndex: number; chord: Chord } | null>(null);
  const [addChordSection, setAddChordSection] = useState<{ index: number; name: string } | null>(null);
  const [instrumentsPanelOpen, setInstrumentsPanelOpen] = useState(false);
  const [rhythmEditorOpen, setRhythmEditorOpen] = useState(false);
  const [createRhythmModalOpen, setCreateRhythmModalOpen] = useState(false);
  const [editingNewStyle, setEditingNewStyle] = useState<StylePattern | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeChord, setActiveChord] = useState<{ chord: Chord; sectionIndex: number } | null>(null);
  const [selectedChordIds, setSelectedChordIds] = useState<Set<string>>(new Set());
  const [showCountdown, setShowCountdown] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [mixingConsoleOpen, setMixingConsoleOpen] = useState(false);
  const [animatingSections, setAnimatingSections] = useState<{ index: number; direction: 'up' | 'down' }[]>([]);
  // Refs for current values (used in callbacks)
  const sectionsRef = useRef<Section[]>(sections);
  const bpmRef = useRef(bpm);
  const metronomeRef = useRef(metronomeEnabled);
  const instrumentsRef = useRef<InstrumentState[]>(instruments);
  const transpositionRef = useRef(transposition);
  const styleRef = useRef(selectedStyleId);
  const loopingSectionRef = useRef<number | null>(null);
  const liveEditedStyleRef = useRef<StylePattern | null>(null);
  const customStylesRef = useRef<StylePattern[]>(customStyles);

  // Sync refs during render (not in useEffect) — eliminates 1-render lag
  sectionsRef.current = sections;
  bpmRef.current = bpm;
  metronomeRef.current = metronomeEnabled;
  instrumentsRef.current = instruments;
  styleRef.current = selectedStyleId;
  loopingSectionRef.current = loopingSectionIndex;
  transpositionRef.current = transposition;
  liveEditedStyleRef.current = liveEditedStyle;
  customStylesRef.current = customStyles;

  const currentStyle = useMemo(
    () => resolveActiveStyle(selectedStyleId, liveEditedStyle, customStyles, getStyleOverride),
    [selectedStyleId, customStyles, liveEditedStyle],
  );

  // Keep melodicRef in sync so startPlayback always gets the current melodic data
  const melodicRef = useRef(currentStyle.melodic);
  melodicRef.current = currentStyle.melodic;

  // The key the chords are written in, plus the key they actually sound in once
  // transposed — the transport labels itself with the second one, and both chord modals
  // use it to offer the seven chords of that key.
  const detectedKey = useMemo(() => detectKey(sections), [sections]);
  // The reading in force: the user's pick if they made one, otherwise what was heard.
  // Its pitchClass is the tonic of the chords as stored, before transposition.
  const keyBase = keyOverride ?? detectedKey;
  const soundingKey = keyBase ? keyLabel(keyBase.pitchClass + transposition, keyBase.mode) : undefined;

  const handleKeyModeChange = useCallback((mode: KeyMode) => {
    setKeyOverride((prev) => {
      const current = prev ?? detectKey(sectionsRef.current);
      if (!current) return prev;
      return { pitchClass: relativeTonic(current.pitchClass, current.mode, mode), mode };
    });
  }, []);

  // Choosing a tonic in the panel is a transposition, and it also pins the reading.
  const handleKeyPick = useCallback((semitones: number) => {
    setKeyOverride((prev) => prev ?? detectKey(sectionsRef.current));
    setTransposition(semitones);
    analytics.transposed(semitones);
  }, []);

  // Chord names follow the key's signature: in F the IV reads B♭, not A♯.
  const preferFlats = soundingKey ? keyPrefersFlats(soundingKey) : false;

  const bassReferenceChord = useMemo(() => {
    const allChords = sections.flatMap(s => s.chords);
    const idx = isPlaying && currentChordIndex >= 0 ? currentChordIndex : 0;
    const chord = allChords[idx] ?? allChords[0];
    if (!chord) return { rootMidi: 48, quality: 'maj' };
    return { rootMidi: (chordToMidiNotes(chord)[0] ?? 48) + transposition, quality: chord.quality };
  }, [sections, currentChordIndex, isPlaying, transposition]);

  // Sync instruments with current style when style changes
  useStyleInstruments({
    style: currentStyle,
    instruments,
    onInstrumentsChange: setInstruments,
    enabled: true,
  });

  // Sensors for section drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    const activeId = args.active.id as string;

    // For chords: prefer pointer-based detection so the user can drop into "empty space"
    // (e.g. after the last chord when the layout wraps).
    if (activeId.startsWith('chord-')) {
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) return pointerCollisions;
      return rectIntersection(args);
    }

    // For sections: keep classic sortable behavior.
    return closestCenter(args);
  }, []);

  // Single effect to keep all playback options in sync during playback
  useEffect(() => {
    if (!isPlaying) return;
    updatePlaybackOptions({
      bpm, styleId: selectedStyleId, customStyles, liveEditedStyle,
      melodic: currentStyle.melodic, instruments, transposition,
      metronome: metronomeEnabled, loopingSectionIndex,
      sections,
    });
  }, [
    isPlaying, bpm, selectedStyleId, customStyles, liveEditedStyle,
    currentStyle.melodic, instruments, transposition, metronomeEnabled,
    loopingSectionIndex, updatePlaybackOptions, sections,
  ]);

  // Load song from URL param
  useEffect(() => {
    if (songId && songId !== currentSongId) {
      console.log(`[SONG] Loading song: ${songId}`);
      getSongForViewer(songId).then(result => {
        if (result) {
          const { song, isOwner } = result;
          console.log(`[SONG] Song loaded — styleId: "${song.styleId}", bpm: ${song.bpm}, sections: ${song.sections.length}, owner: ${isOwner}`);
          song.sections.forEach((s, i) => {
            console.log(`[SONG]   section[${i}] "${s.name}" — bassVar: ${s.bassVariationId ?? 'none'}, pianoVar: ${s.pianoVariationId ?? 'none'}, guitarVar: ${s.guitarVariationId ?? 'none'}`);
          });
          setSections(song.sections.length > 0 ? song.sections : [{
            ...createSection('Section A'),
            chords: defaultChords
          }]);
          setBpm(song.bpm);
          setSelectedStyleId(song.styleId);
          setTransposition(song.transposition);
          // A different song gets its own key read from scratch.
          setKeyOverride(null);
          setMetronomeEnabled(song.metronomeEnabled);
          setSongTitle(song.title);
          if (song.instrumentSettings.length > 0) {
            setInstruments(song.instrumentSettings);
          }
          if (isOwner) {
            setCurrentSongId(song.id);
            setSongCreatedAt(song.createdAt);
            setLastSavedAt(new Date(song.updatedAt));
            setIsPublic(result.isPublic);
          } else {
            // Opened from a share link. Everything works — play, transpose, tweak the
            // mix — but the song stays the owner's until the visitor edits it, at which
            // point the effect below hands them their own copy. Leaving currentSongId
            // null is what keeps autosave from ever pointing at the owner's row.
            setSharedSong({ id: song.id, title: song.title });
            analytics.sharedSongOpened();
          }
          // Migrate legacy song.melodic → style (one-time, only if style has no melodic yet)
          if (song.melodic) {
            console.log(`[SONG] Migrating legacy song.melodic to style override for "${song.styleId}"`);
            const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
            const targetStyle = getStyleByIdWithOverrides(song.styleId, allStyles, getStyleOverride);
            if (targetStyle && !targetStyle.melodic) {
              const migrated = { ...targetStyle, melodic: song.melodic };
              if (isCustomStyle(song.styleId)) {
                saveCustomStyle(migrated);
              } else {
                saveStyleOverride(song.styleId, migrated);
              }
              setCustomStyles(getCustomStyles());
              window.dispatchEvent(new Event('customStylesChanged'));
            }
          }
        } else {
          console.warn(`[SONG] Song not found: ${songId}`);
          toast.error('Song not found');
          window.location.href = '/app/';
        }
      });
    }
  }, [songId]);

  // Auto-save with debounce — only runs once logged in AND a song has been explicitly saved
  useEffect(() => {
    if (!isLoggedIn || !currentSongId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounce save by 1.5 seconds, then await write before marking saved
    saveTimeoutRef.current = setTimeout(async () => {
      const song: Song = {
        id: currentSongId,
        title: songTitle,
        createdAt: songCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections,
        bpm,
        styleId: selectedStyleId,
        transposition,
        instrumentSettings: instruments,
        metronomeEnabled,
      };

      console.log(`[SONG] Auto-save firing — styleId: "${selectedStyleId}", bpm: ${bpm}`);
      sections.forEach((s, i) => {
        console.log(`[SONG]   section[${i}] "${s.name}" — bassVar: ${s.bassVariationId ?? 'none'}, pianoVar: ${s.pianoVariationId ?? 'none'}`);
      });

      await saveSongWithSync(song);
      console.log('[SONG] Auto-save complete');
      setLastSavedAt(new Date());
      setIsSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isLoggedIn, currentSongId, songTitle, sections, bpm, selectedStyleId, transposition, instruments, metronomeEnabled, songCreatedAt]);

  // Explicit save — turns the current in-progress work into a persisted song.
  // Never fires automatically: /chord-player/ stays a stable, stateless URL until the user asks to save.
  const handleSaveNewSong = useCallback(async () => {
    const newSong = createSong(songTitle);
    newSong.sections = sections;
    newSong.bpm = bpm;
    newSong.styleId = selectedStyleId;
    newSong.transposition = transposition;
    newSong.metronomeEnabled = metronomeEnabled;
    newSong.instrumentSettings = instruments;
    setIsSaving(true);
    await saveSongWithSync(newSong);
    setCurrentSongId(newSong.id);
    setSongCreatedAt(newSong.createdAt);
    setLastSavedAt(new Date());
    setIsSaving(false);
    window.history.pushState({}, '', `/chord-player/${newSong.id}`);
    // Saving from a shared song (without having edited it) is also a way to take a copy —
    // createSong minted a fresh id, so this row is the visitor's from the start.
    if (sharedSong) {
      setForkedFromId(sharedSong.id);
      setSharedSong(null);
      sharedBaselineRef.current = null;
    }
    setIsPublic(false);
  }, [songTitle, sections, bpm, selectedStyleId, transposition, metronomeEnabled, instruments, sharedSong]);

  // Share — flips the song's is_public flag and hands back the link. Opt-in and
  // reversible; a saved song stays private until this runs.
  const handleShare = useCallback(async () => {
    if (!currentSongId) return;
    const url = `${window.location.origin}/chord-player/${currentSongId}`;
    if (!isPublic) {
      setIsSharing(true);
      const ok = await setSongVisibility(currentSongId, true);
      setIsSharing(false);
      if (!ok) {
        toast.error('Could not create the share link', { description: 'Check your connection and try again.' });
        return;
      }
      setIsPublic(true);
      analytics.songShared();
    }
    const unshare = {
      label: 'Stop sharing',
      onClick: async () => {
        if (await setSongVisibility(currentSongId, false)) {
          setIsPublic(false);
          analytics.songUnshared();
          toast('Sharing turned off', { description: 'The link no longer opens this song.' });
        }
      },
    };
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied', {
        description: 'Anyone with the link can play it. Their edits become their own copy.',
        action: unshare,
      });
    } catch {
      // Clipboard blocked (no permission, or a non-secure origin) — show the link instead.
      toast('Your share link', { description: url, action: unshare });
    }
  }, [currentSongId, isPublic]);

  // Turn a shared song into the visitor's own copy on their first edit.
  //
  // Nothing is blocked up front: someone arriving from a share link gets the full
  // editor and can play, loop and export without being asked for anything. The moment
  // they change something, this quietly re-labels the session as theirs — the owner's
  // song is left exactly as it was, and the visitor now has something worth an account.
  useEffect(() => {
    if (!sharedSong) return;
    const signature = editorSignature({
      title: songTitle, sections, bpm, styleId: selectedStyleId, transposition, metronomeEnabled,
    });
    // First run after the song loads: record what "untouched" looks like. Captured from
    // live state rather than from the fetched song so any normalization the loader does
    // (empty song → one default section) can't read as an edit.
    if (sharedBaselineRef.current === null) {
      sharedBaselineRef.current = signature;
      return;
    }
    if (signature === sharedBaselineRef.current) return;

    setSharedSong(null);
    sharedBaselineRef.current = null;
    setForkedFromId(sharedSong.id);
    // Keep the visitor's own title if renaming it is what triggered the fork.
    setSongTitle(current => (current === sharedSong.title ? `Copy of ${current}` : current));
    // Drop the owner's id from the URL — the address bar should stop claiming this is
    // their song, and a refresh should not reload it over the visitor's work.
    window.history.replaceState({}, '', '/chord-player/');
    analytics.sharedSongForked();
    toast('This is now your own copy', {
      description: 'The original is untouched. Save it to keep your changes.',
      action: {
        label: 'Save',
        onClick: () => {
          if (isLoggedIn) {
            handleSaveNewSong();
          } else {
            pendingSaveRef.current = true;
            setAuthModalEntryPoint('shared_song_fork');
            setAccountPromptOpen(true);
          }
        },
      },
    });
  }, [sharedSong, songTitle, sections, bpm, selectedStyleId, transposition, metronomeEnabled, isLoggedIn, handleSaveNewSong]);

  // Keep an unsaved fork alive across a refresh — React state survives the signup modal
  // (AuthModal calls onSuccess rather than reloading) but not a reload. Once the copy
  // has a real id, the cloud is the source of truth and the draft is dropped.
  useEffect(() => {
    if (!forkedFromId) return;
    if (currentSongId) {
      clearForkDraft();
      return;
    }
    saveForkDraft({
      title: songTitle, sections, bpm, styleId: selectedStyleId,
      transposition, metronomeEnabled, instruments, forkedFromId,
    });
  }, [forkedFromId, currentSongId, songTitle, sections, bpm, selectedStyleId, transposition, metronomeEnabled, instruments]);

  // Tell the visitor where a restored draft came from, once, on mount.
  useEffect(() => {
    if (!restoredDraft) return;
    setForkedFromId(restoredDraft.forkedFromId);
    analytics.forkDraftRestored();
    toast('Restored your unsaved copy', {
      description: 'It only lives in this browser until you save it.',
    });
  }, [restoredDraft]);

  // Handle export from Songs page
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('export') === 'true' && currentSongId) {
      // Remove export param from URL
      window.history.replaceState({}, '', `/chord-player/${currentSongId}`);
      // Trigger export after a short delay to let everything load
      setTimeout(() => {
        handleExport();
      }, 500);
    }
  }, [currentSongId]);

  const handleBackToSongs = useCallback(() => {
    stopPlayback();
    window.location.href = '/app/';
  }, [stopPlayback]);


  // Load custom styles on mount
  useEffect(() => {
    console.log('[SONG] initCustomStylesCache starting…');
    initCustomStylesCache().then(({ customStyles: cs, styleOverrides }) => {
      console.log(`[SONG] initCustomStylesCache done — ${cs.length} custom styles, overrides: [${Object.keys(styleOverrides).join(', ')}]`);
      setCustomStyles(cs);
    });
  }, []);

  useEffect(() => {
    const handleCustomStylesChanged = () => {
      setCustomStyles(getCustomStyles());
    };
    window.addEventListener('customStylesChanged', handleCustomStylesChanged);
    return () => window.removeEventListener('customStylesChanged', handleCustomStylesChanged);
  }, []);

  const startPlayback = useCallback(async () => {
    const currentSections = sectionsRef.current;
    const loopIdx = loopingSectionRef.current;

    // Validate loopIdx is within bounds
    if (loopIdx !== null && (loopIdx < 0 || loopIdx >= currentSections.length)) {
      console.warn('Invalid looping section index:', loopIdx);
      return;
    }

    // Check if we actually have chords to play (respect loop selection)
    const hasChords = loopIdx !== null
      ? (currentSections[loopIdx]?.chords?.length ?? 0) > 0
      : currentSections.some(s => (s?.chords?.length ?? 0) > 0);

    if (!hasChords) return;

    // If samples not loaded, show loading toast and wait
    if (!areSamplesLoaded()) {
      toast.info('Loading audio samples...');
      try {
        await preloadAudio();
      } catch (err) {
        console.warn('Preload warning:', err);
      }
    }

    // IMPORTANT: always pass the full sections array; PlaybackContext will apply loopingSectionIndex.
    await play(currentSections, {
      bpm: bpmRef.current,
      metronome: metronomeRef.current,
      instruments: instrumentsRef.current,
      styleId: styleRef.current,
      transposition: transpositionRef.current,
      liveEditedStyle: liveEditedStyleRef.current,
      customStyles: customStylesRef.current,
      loopingSectionIndex: loopIdx,
      melodic: melodicRef.current,
    });
  }, [play]);

  const stopPlaybackCompletely = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);


  // Section handlers
  const handleAddSection = () => {
    const newSection = createSection(getSectionDisplayName(sections.length));
    setSections(prev => [...prev, newSection]);
    analytics.sectionAdded();
    // Sonner toasts are announced via aria-live — without this, adding a section is
    // silent for screen reader users (the new card appears above the button with no
    // notification, and focus never moves to it).
    toast.success(`${newSection.name} added`);
  };

  const handleDeleteSection = useCallback((index: number) => {
    if (sectionsRef.current.length === 1) {
      toast.error('Cannot delete the only section');
      return;
    }
    if (loopingSectionRef.current === index) {
      setLoopingSectionIndex(null);
    }
    setSections(prev => prev.filter((_, i) => i !== index));
    analytics.sectionDeleted();
  }, []);

  const handleDuplicateSection = useCallback((index: number) => {
    const section = sectionsRef.current[index];
    const newSection = {
      ...createSection(section.name + ' Copy'),
      chords: section.chords.map(c => ({ ...c, id: generateChordId() })),
      repeatCount: section.repeatCount
    };
    setSections(prev => [...prev.slice(0, index + 1), newSection, ...prev.slice(index + 1)]);
    analytics.sectionDuplicated();
  }, []);

  const handleSectionNameChange = useCallback((index: number, name: string) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  }, []);

  const handleToggleSectionLoop = useCallback((index: number) => {
    setLoopingSectionIndex(prev => {
      const next = prev === index ? null : index;
      loopingSectionRef.current = next;
      return next;
    });
  }, []);

  const handleRepeatChange = useCallback((sectionIndex: number, repeatCount: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIndex ? { ...s, repeatCount: Math.max(1, repeatCount) } : s));
  }, []);


  // Chord handlers
  const handleAddChord = (chord: Chord) => {
    if (addChordSection === null) return;
    setSections(prev => prev.map((s, i) => i === addChordSection.index ? { ...s, chords: [...s.chords, chord] } : s));
    toast.success(`Added ${chord.root}${chord.accidental}${chord.quality} to ${addChordSection.name}`);
    analytics.chordAdded();
  };

  const handleChordClick = useCallback((sectionIndex: number, chordIndex: number) => {
    const chord = sectionsRef.current[sectionIndex]?.chords[chordIndex];
    if (!chord) return;
    if (!isPlaying) {
      playChordPreview(chord);
    }
    setPreviewChord(chord);
    setEditingChord({ sectionIndex, chordIndex, chord });
  }, [isPlaying]);

  const handleChordPreview = useCallback((partialChord: Partial<Chord>) => {
    if (isPlaying) return;
    const chord: Chord = {
      id: 'preview',
      root: partialChord.root || 'C',
      accidental: partialChord.accidental || '',
      quality: partialChord.quality || 'maj',
      duration: partialChord.duration || 2,
      bassNote: partialChord.bassNote,
    };
    playChordPreview(chord);
  }, [isPlaying]);

  const handleChordSave = (updatedChord: Chord) => {
    if (!editingChord) return;
    setSections(prev => prev.map((s, i) => 
      i === editingChord.sectionIndex 
        ? { ...s, chords: s.chords.map((c, j) => j === editingChord.chordIndex ? updatedChord : c) }
        : s
    ));
    setEditingChord(null);
  };

  const handleChordDelete = useCallback((sectionIndex: number, chordIndex: number) => {
    const totalChords = sectionsRef.current.reduce((sum, s) => sum + s.chords.length, 0);
    if (totalChords <= 1) {
      toast.error('Cannot delete the last chord');
      return;
    }
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex ? { ...s, chords: s.chords.filter((_, j) => j !== chordIndex) } : s
    ));
    analytics.chordRemoved();
  }, []);

  const handleChordDuplicate = useCallback((sectionIndex: number, chordIndex: number) => {
    const chord = sectionsRef.current[sectionIndex]?.chords[chordIndex];
    if (!chord) return;
    const newChord = { ...chord, id: generateChordId() };
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex
        ? { ...s, chords: [...s.chords.slice(0, chordIndex + 1), newChord, ...s.chords.slice(chordIndex + 1)] }
        : s
    ));
    analytics.chordDuplicated();
  }, []);

  // ── Multi-select ────────────────────────────────────────────────────────────

  const handleChordSelect = useCallback((sectionIndex: number, chordIndex: number, ctrl: boolean) => {
    const chord = sectionsRef.current[sectionIndex]?.chords[chordIndex];
    if (!chord) return;
    const id = `chord-${sectionIndex}-${chord.id}`;
    setSelectedChordIds(prev => {
      const next = new Set(prev);
      if (ctrl) {
        // Ctrl: toggle this chord in the existing selection
        if (next.has(id)) next.delete(id); else next.add(id);
      } else {
        // No modifier but selection is active: select only this chord
        next.clear();
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedChordIds.size === 0) return;
    const totalChords = sectionsRef.current.reduce((s, sec) => s + sec.chords.length, 0);
    if (totalChords <= selectedChordIds.size) {
      toast.error('Cannot delete all chords');
      return;
    }
    setSections(prev => prev.map((s, si) => ({
      ...s,
      chords: s.chords.filter(c => !selectedChordIds.has(`chord-${si}-${c.id}`)),
    })));
    setSelectedChordIds(new Set());
    toast.success(`Deleted ${selectedChordIds.size} chord${selectedChordIds.size > 1 ? 's' : ''}`);
    analytics.chordRemoved();
  }, [selectedChordIds]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedChordIds.size === 0) return;
    setSections(prev => prev.map((s, si) => {
      const newChords: Chord[] = [];
      s.chords.forEach(c => {
        newChords.push(c);
        if (selectedChordIds.has(`chord-${si}-${c.id}`)) {
          newChords.push({ ...c, id: generateChordId() });
        }
      });
      return { ...s, chords: newChords };
    }));
    setSelectedChordIds(new Set());
    toast.success(`Duplicated ${selectedChordIds.size} chord${selectedChordIds.size > 1 ? 's' : ''}`);
    analytics.chordDuplicated();
  }, [selectedChordIds]);

  // Clear selection on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedChordIds(new Set());
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedChordIds.size > 0 && !editingChord && !addChordSection) {
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedChordIds, editingChord, addChordSection, handleDeleteSelected]);

  const handleChordReorder = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIndex) return s;
      const newChords = [...s.chords];
      const [removed] = newChords.splice(fromIndex, 1);
      newChords.splice(toIndex, 0, removed);
      return { ...s, chords: newChords };
    }));
    analytics.chordsReordered();
  };

  // Move chord between sections
  const handleChordMove = (fromSectionIndex: number, fromChordIndex: number, toSectionIndex: number, toChordIndex: number) => {
    setSections(prev => {
      const newSections = [...prev];
      const chord = { ...newSections[fromSectionIndex].chords[fromChordIndex] };
      
      // Remove from source section
      newSections[fromSectionIndex] = {
        ...newSections[fromSectionIndex],
        chords: newSections[fromSectionIndex].chords.filter((_, i) => i !== fromChordIndex)
      };
      
      // Add to target section
      const targetChords = [...newSections[toSectionIndex].chords];
      targetChords.splice(toChordIndex, 0, chord);
      newSections[toSectionIndex] = {
        ...newSections[toSectionIndex],
        chords: targetChords
      };

      return newSections;
    });
    analytics.chordsReordered();
  };

  // Unified drag handlers for sections and chords
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;
    
    // Check if it's a chord (format: chord-{sectionIndex}-{chordId})
    if (activeId.startsWith('chord-')) {
      const parts = activeId.split('-');
      const sectionIndex = parseInt(parts[1], 10);
      const chordId = parts.slice(2).join('-');
      const chord = sections[sectionIndex]?.chords.find(c => c.id === chordId);
      if (chord) {
        setActiveChord({ chord, sectionIndex });
      }
    } else {
      // It's a section drag
      setActiveDragId(activeId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveChord(null);
    setActiveDragId(null);
    
    if (!over) return;
    
    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Handle chord drag
    if (activeId.startsWith('chord-')) {
      const activeParts = activeId.split('-');
      const fromSectionIndex = parseInt(activeParts[1], 10);
      const activeChordId = activeParts.slice(2).join('-');
      
      // Find the chord index in source section
      const fromChordIndex = sections[fromSectionIndex].chords.findIndex(c => c.id === activeChordId);
      if (fromChordIndex === -1) return;
      
      if (overId.startsWith('chord-')) {
        // Dropping on another chord
        const overParts = overId.split('-');
        const toSectionIndex = parseInt(overParts[1], 10);
        const overChordId = overParts.slice(2).join('-');
        const toChordIndex = sections[toSectionIndex].chords.findIndex(c => c.id === overChordId);
        
        if (toChordIndex === -1) return;
        
        if (fromSectionIndex === toSectionIndex) {
          // Same section reorder
          if (fromChordIndex !== toChordIndex) {
            handleChordReorder(fromSectionIndex, fromChordIndex, toChordIndex);
          }
        } else {
          // Cross-section move
          handleChordMove(fromSectionIndex, fromChordIndex, toSectionIndex, toChordIndex);
        }
      } else if (overId.startsWith('section-drop-')) {
        // Dropping on a section container (works for empty space / end-of-line after wrapping)
        const toSectionIndex = parseInt(overId.replace('section-drop-', ''), 10);
        const toChordIndex = sections[toSectionIndex].chords.length;

        if (fromSectionIndex === toSectionIndex) {
          // Same section: move to end
          const lastIndex = toChordIndex - 1;
          if (lastIndex >= 0 && fromChordIndex !== lastIndex) {
            handleChordReorder(fromSectionIndex, fromChordIndex, lastIndex);
          }
        } else {
          // Cross-section: move to end
          handleChordMove(fromSectionIndex, fromChordIndex, toSectionIndex, toChordIndex);
        }
      }
      return;
    }
    
    // Section drag is no longer handled here (using buttons instead)
  };

  // Stop playback when all chords are removed; sections sync is handled by the consolidated effect above
  useEffect(() => {
    if (isPlaying && !sections.some(s => s.chords.length > 0)) {
      stopPlaybackCompletely();
    }
  }, [sections]);

  // Nudge anonymous users to save right after they export — the moment
  // they've clearly gotten value out of the progression, not a moment of
  // fear of loss. A toast, not a modal: doesn't interrupt them checking out
  // their export.
  const showExportSaveNudge = useCallback(() => {
    if (isLoggedIn) return;
    const shownSoFar = Number(sessionStorage.getItem(EXPORT_NUDGE_SESSION_KEY)) || 0;
    if (shownSoFar >= EXPORT_NUDGE_MAX_PER_SESSION) return;

    // Deliberately delayed: the download and its success toast get their moment first.
    // Counting and reporting happen inside the timeout so a nudge nobody stayed around
    // to see is neither counted against the session limit nor reported as shown.
    window.setTimeout(() => {
      sessionStorage.setItem(EXPORT_NUDGE_SESSION_KEY, String(shownSoFar + 1));
      analytics.exportNudgeShown();
      // Clear the export toast so the nudge is the only thing on screen rather than the
      // second of two saying much the same thing.
      toast.dismiss(EXPORT_TOAST_ID);
      toast('Save this progression to your account and pick it up on any device.', {
        duration: Infinity,
        closeButton: true,
        action: {
          // "Save it", not "Sign up". Signing up from here actually saves the song
          // (pendingSaveRef below), so this names the outcome instead of the chore.
          label: 'Save it',
          onClick: () => {
            analytics.exportNudgeClicked();
            // The nudge's whole pitch is "don't lose this" — signing up from it should
            // leave the song saved, not just leave them logged in.
            pendingSaveRef.current = true;
            setAuthModalEntryPoint('export_nudge');
            // Through the same two-step "why an account" prompt as every other entry
            // point (save CTA, shared-song fork). This one used to drop straight into
            // the raw auth form; it was the only one that skipped the explanation.
            setAccountPromptOpen(true);
          },
        },
      });
    }, EXPORT_NUDGE_DELAY_MS);
  }, [isLoggedIn]);

  const handleExport = useCallback(async () => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;

    setIsExporting(true);
    // One toast for the whole export, replaced in place. Previously 'Rendering audio...'
    // was its own toast on the default 4s timer, so a fast render left it on screen with
    // the success toast stacked on top of it.
    toast.loading('Rendering audio…', { id: EXPORT_TOAST_ID });

    try {
      const style = resolveActiveStyle(selectedStyleId, liveEditedStyle, customStyles, getStyleOverride);
      const audioBuffer = await renderProgressionOffline(sections, bpm, instruments, style, transposition);
      const filename = songTitle.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') || 'chord-progression';
      await encodeAndDownloadMp3(audioBuffer, `${filename}.wav`);
      // Short: it's confirming something the browser is already showing a download for,
      // and it has to be gone before the nudge arrives.
      toast.success('WAV exported', { id: EXPORT_TOAST_ID, duration: 2000 });
      analytics.exportWav();
      showExportSaveNudge();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.', { id: EXPORT_TOAST_ID, duration: 5000 });
    } finally {
      setIsExporting(false);
    }
  }, [sections, bpm, instruments, selectedStyleId, songTitle, transposition, liveEditedStyle, showExportSaveNudge]);

  const handleExportMidi = useCallback(() => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;
    try {
      const filename = songTitle.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') || 'chord-progression';
      exportMidi(sections, bpm, transposition, filename);
      toast.success('MIDI exported', { id: EXPORT_TOAST_ID, duration: 2000 });
      analytics.exportMidi();
      showExportSaveNudge();
    } catch (error) {
      console.error('MIDI export failed:', error);
      toast.error('MIDI export failed. Please try again.', { id: EXPORT_TOAST_ID, duration: 5000 });
    }
  }, [sections, bpm, transposition, songTitle, showExportSaveNudge]);

  const hasChords = sections.some(s => s.chords.length > 0);

  // Warn on tab close / navigation while there's real, unpersisted work —
  // logged-in users with a saved song are already covered by autosave.
  useUnsavedChangesGuard(hasChords && !(isLoggedIn && lastSavedAt));

  // Resolve which chord is currently highlighted during playback
  const currentPlayingChord = useMemo(() => {
    if (currentChordIndex < 0) return null;
    if (loopingSectionIndex !== null) {
      const sec = sections[loopingSectionIndex];
      if (!sec || sec.chords.length === 0) return null;
      // currentChordIndex is a global index; subtract this section's start offset
      let sectionOffset = 0;
      for (let i = 0; i < loopingSectionIndex; i++) {
        sectionOffset += sections[i].chords.length * sections[i].repeatCount;
      }
      const localIdx = (currentChordIndex - sectionOffset) % sec.chords.length;
      return sec.chords[Math.max(0, localIdx)];
    }
    let idx = currentChordIndex;
    for (const sec of sections) {
      const total = sec.chords.length * sec.repeatCount;
      if (idx < total) return sec.chords[idx % sec.chords.length];
      idx -= total;
    }
    return null;
  }, [currentChordIndex, sections, loopingSectionIndex]);

  // What to show in the visualization panel: playback chord when playing, last clicked or first chord otherwise
  const visualChord = useMemo(() => {
    if (isPlaying) return currentPlayingChord;
    if (previewChord) return previewChord;
    return sections[0]?.chords[0] ?? null;
  }, [isPlaying, currentPlayingChord, previewChord, sections]);

  // Chord visualizer's instrument view — piano by default here (unlike the song pages'
  // "Now playing", which defaults to guitar): this is the editor's own local toggle, not
  // synced with anything else, since no other component on this page shares the choice.
  const [visualizerView, setVisualizerView] = useState<ChordView>('piano');

  const activeNotes = useMemo(
    () => (visualChord ? getChordNotes(visualChord, transposition, preferFlats) : []),
    [visualChord, transposition, preferFlats],
  );

  const currentChordDisplayName = useMemo(
    () => (visualChord ? getTransposedChordName(visualChord, transposition, preferFlats) : ''),
    [visualChord, transposition, preferFlats],
  );

  const guitarVoicing = useMemo(
    () => (visualChord ? getGuitarVoicing(visualChord, transposition) : null),
    [visualChord, transposition],
  );

  const ukuleleVoicing = useMemo(
    () => (visualChord ? getUkuleleVoicing(visualChord, transposition) : null),
    [visualChord, transposition],
  );

  // Calculate global chord offset for each section (with repeats)
  const getGlobalOffset = (sectionIndex: number) => {
    let offset = 0;
    for (let i = 0; i < sectionIndex; i++) {
      offset += sections[i].chords.length * sections[i].repeatCount;
    }
    return offset;
  };

  const handleMoveSection = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= sectionsRef.current.length) return;
    setAnimatingSections([
      { index: fromIndex, direction },
      { index: toIndex, direction: direction === 'up' ? 'down' : 'up' }
    ]);
    setTimeout(() => setAnimatingSections([]), 350);
    setSections(prev => {
      const newSections = [...prev];
      const [removed] = newSections.splice(fromIndex, 1);
      newSections.splice(toIndex, 0, removed);
      return newSections;
    });
    setLoopingSectionIndex(prev => {
      if (prev === null) return prev;
      if (prev === fromIndex) return toIndex;
      if (fromIndex < prev && toIndex >= prev) return prev - 1;
      if (fromIndex > prev && toIndex <= prev) return prev + 1;
      return prev;
    });
    analytics.sectionMoved();
  }, []);

  const handleMoveSectionUp = useCallback((si: number) => handleMoveSection(si, 'up'), [handleMoveSection]);
  const handleMoveSectionDown = useCallback((si: number) => handleMoveSection(si, 'down'), [handleMoveSection]);

  const handleSectionAddChord = useCallback((sectionIndex: number) => {
    const section = sectionsRef.current[sectionIndex];
    if (section) setAddChordSection({ index: sectionIndex, name: section.name });
  }, []);

  const handleSetProgression = useCallback((sectionIndex: number, chords: Chord[]) => {
    setSections(prev => prev.map((s, i) => i === sectionIndex ? { ...s, chords } : s));
  }, []);

  const handleSectionVariationChange = useCallback((sectionIndex: number, instrument: 'bass' | 'piano' | 'guitar', variationId: string) => {
    setSections(prev => prev.map((s, i) => i !== sectionIndex ? s : {
      ...s,
      bassVariationId: instrument === 'bass' ? variationId : s.bassVariationId,
      pianoVariationId: instrument === 'piano' ? variationId : s.pianoVariationId,
      guitarVariationId: instrument === 'guitar' ? variationId : s.guitarVariationId,
    }));
    analytics.variationChanged(instrument);
  }, []);

  // Handler for loading a progression template
  const handleLoadTemplate = (chords: Chord[], templateName: string) => {
    setSections(prev => {
      const newSections = [...prev];
      if (newSections.length > 0) {
        newSections[0] = { ...newSections[0], chords };
      }
      return newSections;
    });
    analytics.templateUsed(templateName);
    toast.success('Progression template loaded!');
  };

  // Countdown playback - starts countdown then plays
  const handlePlayWithCountdown = useCallback(() => {
    if (!hasChords || isExporting) return;
    analytics.playProgression(selectedStyleId);
    // Warm up all the audio play() will await (samples, bass sample dir, guitar
    // soundfont) DURING the countdown, so it overlaps that ~1.2-2.4s window instead of
    // freezing after "1" like it used to. Fire-and-forget; play() still awaits as a
    // safety net if warmup hasn't finished. Uses the same refs startPlayback reads.
    warmup({
      bpm: bpmRef.current,
      metronome: metronomeRef.current,
      instruments: instrumentsRef.current,
      styleId: styleRef.current,
      transposition: transpositionRef.current,
      liveEditedStyle: liveEditedStyleRef.current,
      customStyles: customStylesRef.current,
      loopingSectionIndex: loopingSectionRef.current,
      melodic: melodicRef.current,
    }).catch(() => {});
    setShowCountdown(true);
  }, [hasChords, isExporting, selectedStyleId, warmup]);

  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false);
    startPlayback();
  }, [startPlayback]);

  const handleCountdownCancel = useCallback(() => {
    setShowCountdown(false);
  }, []);

  // Generate chord IDs for all sections (for DndContext)
  const allChordIds = sections.flatMap((section, sectionIndex) => 
    section.chords.map(c => `chord-${sectionIndex}-${c.id}`)
  );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    isPlaying,
    bpm,
    onPlay: hasChords ? handlePlayWithCountdown : () => {},
    onStop: stopPlaybackCompletely,
    onBpmChange: setBpm,
    onMetronomeToggle: () => setMetronomeEnabled(prev => {
      const next = !prev;
      analytics.metronomeToggled(next);
      return next;
    }),
    enabled: !showCountdown && !templatesModalOpen && !editingChord && !addChordSection,
  });

  // Update browser tab title dynamically once there's a real song — until then, keep the
  // SEO title Astro set server-side ("Chord Player — ..."), don't clobber it with
  // the auto-generated "My Song · <date>" draft name.
  useEffect(() => {
    if (!currentSongId && !songId) return;
    document.title = `${songTitle || 'New progression'} — Chord Player | Chord Sequence`;
  }, [songTitle, currentSongId, songId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Logo + breadcrumb + title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Logo — goes home */}
              <a href="/" className="shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors" aria-label="ChordSequence home">
                <Music2 className="w-4 h-4 text-primary-foreground" />
              </a>

              {/* Breadcrumb. Deliberately NOT an h1: this whole row is "hidden sm:flex", so on
                  mobile it never rendered and the page was left without a heading — bad for the
                  one page that has to rank for "chord player". The H1 now lives in the "About
                  the chord player" section of chord-player/index.astro, which sits outside
                  #editor-skeleton and so is present before and after hydration. Keep this a
                  span; promoting it back would give the page two competing h1s. */}
              <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                <a href="/app/" className="hover:text-foreground transition-colors shrink-0">My library</a>
                <span className="opacity-30 mx-0.5">/</span>
                <span className="text-foreground font-medium truncate max-w-[160px] md:max-w-xs m-0 inline text-xs">
                  {currentSongId || songId ? songTitle || 'New progression' : 'Chord Player'}
                </span>
              </div>

              {/* Opened from someone else's link — say so, so the first edit forking the
                  song into a copy reads as expected rather than as a glitch. */}
              {sharedSong && (
                <span className="hidden md:inline-flex items-center gap-1 shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  Shared song · editing makes your own copy
                </span>
              )}

              {/* Mobile: back button only */}
              <Button variant="ghost" size="icon" onClick={handleBackToSongs} className="sm:hidden shrink-0 h-8 w-8" aria-label="Back to library">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Right: Actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Waveform Visualizer - hidden on mobile */}
              {isPlaying && (
                <div className="h-6 w-16 hidden lg:block">
                  <WaveformVisualizer isPlaying={isPlaying} barCount={12} />
                </div>
              )}
              
              {/* Beat indicator - only on desktop. Wrapped in its own subscriber so the
                  ~6.7x/sec step updates re-render ONLY this indicator, not the editor. */}
              {isPlaying && (
                <div className="hidden md:block">
                  <PlayheadBeatIndicator isPlaying={isPlaying} />
                </div>
              )}
              
              {/* Share button — only for a saved song you own; there's no link to hand
                  out until the song has a row of its own. */}
              {currentSongId && isLoggedIn && (
                <Button
                  variant={isPublic ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="gap-1 h-8 px-2"
                  aria-label={isPublic ? 'Copy share link' : 'Share this song'}
                >
                  {isSharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline text-xs">{isPublic ? 'Shared' : 'Share'}</span>
                </Button>
              )}

              {/* Mixing Console button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMixingConsoleOpen(true)}
                className="gap-1 h-8 px-2"
                aria-label="Open mixing console"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Mix</span>
              </Button>
              
              {/* Templates button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTemplatesModalOpen(true)}
                className="gap-1 h-8 px-2"
                aria-label="Open progression templates"
              >
                <FileMusic className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Templates</span>
              </Button>
              
              {/* Shortcuts help - hidden on mobile */}
              <div className="hidden md:block">
                <ShortcutsHelp />
              </div>

              {/* Save status — purely informational now; the account menu below is
                  always visible once logged in, independent of save state. The
                  actual Save call-to-action lives next to Play in TransportControls. */}
              <div className="flex items-center gap-2">
                {isSaving ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </span>
                ) : lastSavedAt ? (
                  <span className="hidden xs:flex items-center gap-1 text-xs text-[hsl(var(--success))]">
                    <Check className="h-3 w-3" />
                    Saved
                  </span>
                ) : null}
                {isLoggedIn && (
                  <AccountMenu displayName={displayName} trigger={<AccountAvatarButton displayName={displayName} />} />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container max-w-6xl mx-auto px-2 sm:px-4 py-3 sm:py-6 space-y-3 sm:space-y-4">
        {/* Progress bar when playing */}
        <ProgressBar
          sections={sections}
          currentChordIndex={currentChordIndex}
          isPlaying={isPlaying}
          loopingSectionIndex={loopingSectionIndex}
        />

        <TransportControls
          isPlaying={isPlaying}
          isExporting={isExporting}
          bpm={bpm}
          metronomeEnabled={metronomeEnabled}
          selectedStyleId={selectedStyleId}
          songTitle={songTitle}
          transposition={transposition}
          keyBase={keyBase}
          onKeyModeChange={handleKeyModeChange}
          onKeyPick={handleKeyPick}
          customStyles={customStyles}
          onPlay={handlePlayWithCountdown}
          onStop={stopPlaybackCompletely}
          onReset={() => { stopPlaybackCompletely(); }}
          onExport={handleExport}
          onExportMidi={handleExportMidi}
          onBpmChange={(newBpm) => {
            setBpm(newBpm);
          }}
          onMetronomeToggle={(enabled) => {
            setMetronomeEnabled(enabled);
            analytics.metronomeToggled(enabled);
          }}
          onStyleChange={(id) => {
            setSelectedStyleId(id);
            setLiveEditedStyle(null);
            analytics.styleChanged(id);
          }}
          onSongTitleChange={setSongTitle}
          onTranspositionChange={(semitones: number) => {
            setTransposition(semitones);
            analytics.transposed(semitones);
          }}
          onOpenInstruments={() => setInstrumentsPanelOpen(true)}
          onOpenRhythmEditor={() => {
            const currentStyle = [...customStyles, ...MUSICAL_STYLES].find(s => s.id === selectedStyleId);
            if (currentStyle) {
              setLiveEditedStyle(null);
              setEditingNewStyle(null);
              setRhythmEditorOpen(true);
            }
          }}
          onCreateNewRhythm={() => setCreateRhythmModalOpen(true)}
          hasChords={hasChords}
          showSaveCta={hasChords && !(isLoggedIn && lastSavedAt)}
          onSaveCtaClick={() => {
            analytics.saveCtaClicked();
            if (isLoggedIn) {
              handleSaveNewSong();
            } else {
              pendingSaveRef.current = true;
              setAuthModalEntryPoint('save_cta');
              setAccountPromptOpen(true);
            }
          }}
        />

        {/* Chord visualizer — always visible when chords exist. Same card language as the
            song pages' "Now playing" (pulse dot + gradient header, primary accent while
            live) — was a plain centered label before, now reads as the same component
            family instead of a one-off. */}
        {hasChords && (
          <div
            className={`rounded-2xl border bg-card overflow-hidden transition-colors
              ${isPlaying ? 'border-primary/30 shadow-sm shadow-primary/10' : 'border-border'}
            `}
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPlaying ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`}
                aria-hidden="true"
              />
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isPlaying ? 'text-primary' : 'text-muted-foreground'}`}>
                {isPlaying ? 'Now playing' : 'Chord preview'}
              </p>
              {visualChord && (
                <span className="text-primary">
                  <DurationDots
                    duration={visualChord.duration ?? 4}
                    isActive={isPlaying}
                    bpm={bpm}
                    uid="editor-now-playing"
                    rawIndex={currentChordIndex}
                    size={7}
                  />
                </span>
              )}
              <InstrumentViewSelector value={visualizerView} onChange={setVisualizerView} className="ml-auto" />
            </div>
            <div className="flex items-center justify-center px-4 py-4">
              {visualizerView === 'piano' ? (
                <PianoKeyboard
                  activeNotes={activeNotes}
                  chordName={currentChordDisplayName}
                  className="w-full max-w-xs sm:max-w-sm"
                />
              ) : visualizerView === 'ukulele' ? (
                ukuleleVoicing ? (
                  <GuitarChordDiagram
                    voicing={ukuleleVoicing}
                    chordName={currentChordDisplayName}
                    className="w-28 sm:w-32 flex-shrink-0"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No ukulele voicing available</p>
                )
              ) : guitarVoicing ? (
                <GuitarChordDiagram
                  voicing={guitarVoicing}
                  chordName={currentChordDisplayName}
                  className="w-28 sm:w-32 flex-shrink-0"
                />
              ) : (
                <p className="text-xs text-muted-foreground py-2">No guitar voicing available</p>
              )}
            </div>
          </div>
        )}

        {/* Sections - DndContext only for chord drag & drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={allChordIds} strategy={rectSortingStrategy}>
            <div className="space-y-3" data-tour="chords-section">
              {sections.map((section, sectionIndex) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  transposition={transposition}
                  preferFlats={preferFlats}
                  currentChordIndex={currentChordIndex}
                  globalChordOffset={getGlobalOffset(sectionIndex)}
                  totalSections={sections.length}
                  isLooping={loopingSectionIndex === sectionIndex}
                  styleId={selectedStyleId}
                  style={currentStyle}
                  swapAnimation={animatingSections.find(a => a.index === sectionIndex)?.direction || null}
                  selectedChordIds={selectedChordIds}
                  onVariationChange={handleSectionVariationChange}
                  onAddChord={handleSectionAddChord}
                  onChordClick={handleChordClick}
                  onChordSelect={handleChordSelect}
                  onChordDelete={handleChordDelete}
                  onChordDuplicate={handleChordDuplicate}
                  onRepeatChange={handleRepeatChange}
                  onNameChange={handleSectionNameChange}
                  onDelete={handleDeleteSection}
                  onDuplicate={handleDuplicateSection}
                  onToggleLoop={handleToggleSectionLoop}
                  onMoveUp={handleMoveSectionUp}
                  onMoveDown={handleMoveSectionDown}
                  onSetProgression={handleSetProgression}
                />
              ))}
            </div>
          </SortableContext>
          
          {/* Drag overlay for chord being dragged */}
          <DragOverlay>
            {activeChord && (
              <div className="opacity-90">
                <ChordBlock
                  chord={activeChord.chord}
                  isPlaying={false}
                  transposition={transposition}
                  preferFlats={preferFlats}
                  onDelete={() => {}}
                  onDuplicate={() => {}}
                  isDragging
                  fixedWidth
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <Button variant="outline" onClick={handleAddSection} className="w-full hover:border-primary/40 h-9">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Add Section
        </Button>

      </main>

      {/* Guided tour for first-time users — skipped for shared-link visitors, see above */}
      {showOnboarding && !hasDeepLinkedProgression && <GuidedTour onDismiss={dismissOnboarding} />}

      {/* Multi-select floating toolbar */}
      {selectedChordIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-card shadow-xl"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
        >
          <span className="text-xs font-medium text-muted-foreground pr-1 border-r border-border">
            {selectedChordIds.size} selected
          </span>
          <button
            onClick={handleDuplicateSelected}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16H3a1 1 0 01-1-1V3a1 1 0 011-1h12a1 1 0 011 1v1"/></svg>
            Duplicate
          </button>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            Delete
          </button>
          <button
            onClick={() => setSelectedChordIds(new Set())}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors text-sm leading-none px-1"
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      <ChordEditModal
        chord={editingChord?.chord || null}
        open={!!editingChord}
        onClose={() => setEditingChord(null)}
        onSave={handleChordSave}
        onDelete={editingChord ? () => handleChordDelete(editingChord.sectionIndex, editingChord.chordIndex) : undefined}
        onDuplicate={editingChord ? () => handleChordDuplicate(editingChord.sectionIndex, editingChord.chordIndex) : undefined}
        onPreview={handleChordPreview}
        songKey={soundingKey}
        transposition={transposition}
        preferFlats={preferFlats}
      />

      <AddChordModal
        open={!!addChordSection}
        sectionName={addChordSection?.name || ''}
        onClose={() => setAddChordSection(null)}
        onAdd={handleAddChord}
        songKey={soundingKey}
        transposition={transposition}
        preferFlats={preferFlats}
      />

      <InstrumentsPanel
        open={instrumentsPanelOpen}
        onClose={() => setInstrumentsPanelOpen(false)}
        instruments={instruments}
        onInstrumentChange={setInstruments}
        currentStyle={currentStyle}
      />

      <RhythmEditor
        open={rhythmEditorOpen}
        onClose={() => {
          setRhythmEditorOpen(false);
          setEditingNewStyle(null);
          setLiveEditedStyle(null);
        }}
        style={editingNewStyle || currentStyle}
        allStyles={[...customStyles, ...MUSICAL_STYLES]}
        isNewStyle={!!editingNewStyle}
        onStyleChange={setLiveEditedStyle}
        onStyleSelect={(styleId) => {
          setSelectedStyleId(styleId);
          setEditingNewStyle(null);
          setLiveEditedStyle(null);
        }}
        onDelete={(styleId) => {
          setCustomStyles(getCustomStyles());
          window.dispatchEvent(new Event('customStylesChanged'));
          if (selectedStyleId === styleId) {
            setSelectedStyleId(MUSICAL_STYLES[0].id);
          }
        }}
        onSave={(savedStyle) => {
          setCustomStyles(getCustomStyles());
          window.dispatchEvent(new Event('customStylesChanged'));
          setLiveEditedStyle(null);
          setSelectedStyleId(savedStyle.id);
          setEditingNewStyle(null);
          setRhythmEditorOpen(false);
        }}
        referenceRootMidi={bassReferenceChord.rootMidi}
        referenceQuality={bassReferenceChord.quality}
      />

      <CreateRhythmModal
        open={createRhythmModalOpen}
        onClose={() => setCreateRhythmModalOpen(false)}
        customStyles={customStyles}
        onCreateEmpty={(newStyle) => {
          setCreateRhythmModalOpen(false);
          setEditingNewStyle(newStyle);
          setRhythmEditorOpen(true);
        }}
        onCreateFromTemplate={(newStyle) => {
          setCreateRhythmModalOpen(false);
          setEditingNewStyle(newStyle);
          setRhythmEditorOpen(true);
        }}
      />

      {/* Progression Templates Modal */}
      <ProgressionTemplatesModal
        open={templatesModalOpen}
        onOpenChange={setTemplatesModalOpen}
        onSelect={handleLoadTemplate}
      />

      {/* Countdown Overlay */}
      {showCountdown && (
        <CountdownOverlay
          bpm={bpm}
          onComplete={handleCountdownComplete}
          onCancel={handleCountdownCancel}
        />
      )}

      {/* Mixing Console */}
      <MixingConsole
        open={mixingConsoleOpen}
        onOpenChange={setMixingConsoleOpen}
      />

      <AccountPromptModal
        open={accountPromptOpen}
        onOpenChange={setAccountPromptOpen}
        onContinue={() => {
          setAccountPromptOpen(false);
          setAuthModalOpen(true);
        }}
      />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        entryPoint={authModalEntryPoint}
        onSuccess={() => {
          refreshAuth();
          // Finish what they came for. Only reached on a real session — a signup that
          // still needs email confirmation never calls onSuccess, so this can't fire
          // while saveSongToCloud would silently no-op on a null user id.
          if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            handleSaveNewSong();
          }
        }}
      />
    </div>
  );
};

export default Index;
