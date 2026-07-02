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
import { getDefaultInstrumentStates, type InstrumentState } from '@/lib/instruments';
import { getStyleByIdWithOverrides, resolveActiveStyle, MUSICAL_STYLES, type StylePattern } from '@/lib/styles';
import { getCustomStyles, getStyleOverride, saveStyleOverride, saveCustomStyle, isCustomStyle, initCustomStylesCache } from '@/lib/customStyles';
import { renderProgressionOffline, playChordPreview, areSamplesLoaded, preloadAudio } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { exportMidi } from '@/lib/midiExporter';
import { usePlayback } from '@/contexts/PlaybackContext';
import { useStyleInstruments, createInstrumentStatesFromStyle } from '@/hooks/useStyleInstruments';
import { type Song, createSong } from '@/lib/songs';
import { parseChordString } from '@/lib/chordParser';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { getSongById, saveSongWithSync } from '@/lib/songStorage';
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
import { WelcomeOverlay } from '@/components/WelcomeOverlay';
import { BeatIndicator } from '@/components/BeatIndicator';
import { CountdownOverlay } from '@/components/CountdownOverlay';
import { ProgressionTemplatesModal } from '@/components/ProgressionTemplatesModal';
import { ShortcutsHelp } from '@/components/ShortcutsHelp';
import { WaveformVisualizer } from '@/components/WaveformVisualizer';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { MixingConsole } from '@/components/MixingConsole';
import { Button } from '@/components/ui/button';
import { Music2, Plus, ArrowLeft, Check, Loader2, FileMusic, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface IndexProps {
  songId?: string;
}

const Index = ({ songId }: IndexProps) => {
  const { showOnboarding, dismissOnboarding } = useFirstTimeUser();
  const { state: playbackState, play, stop: stopPlayback, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex, currentStep: currentPlayheadStep } = playbackState;

  // Song loading state
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [songCreatedAt, setSongCreatedAt] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when editor was opened via ?chords= link (e.g. from homepage embeds)
  const isFromEmbedRef = useRef(!songId && !!new URLSearchParams(window.location.search).get('chords'));
  // Becomes true after the initial render cycle — used to distinguish init from user changes
  const initialRenderDoneRef = useRef(false);

  // Default chords for new songs
  const defaultChords: Chord[] = [
    { id: generateChordId(), root: 'E', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'D', accidental: '', quality: 'maj', duration: 4 },
    { id: generateChordId(), root: 'B', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'C', accidental: '', quality: 'maj', duration: 4 },
  ];

  // Sections state — if opening from a blog link (?chords=...), use those chords
  const [sections, setSections] = useState<Section[]>(() => {
    const chordsParam = new URLSearchParams(window.location.search).get('chords');
    const fromUrl = chordsParam ? parseChordString(chordsParam) : [];
    return [{
      ...createSection('Section A'),
      chords: fromUrl.length > 0 ? fromUrl : defaultChords,
    }];
  });
  const [customStyles, setCustomStyles] = useState<StylePattern[]>(getCustomStyles());

  // Determine initial style — prefer ?style= URL param, then merengue (only for new songs)
  const getInitialStyleId = () => {
    const styleParam = new URLSearchParams(window.location.search).get('style');
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    if (styleParam && allStyles.some(s => s.id === styleParam)) return styleParam;
    // When loading an existing song the real styleId arrives async from Supabase.
    // Use a neutral placeholder so the pre-load render doesn't apply the wrong style
    // overrides. For new songs (no id in path) default to merengue as before.
    const hasSongInUrl = window.location.pathname.includes('/editor/song_');
    if (hasSongInUrl) return 'rock_basic';
    return allStyles.find(s => s.id === 'merengue')?.id || 'rock_basic';
  };

  const [selectedStyleId, setSelectedStyleId] = useState(getInitialStyleId);
  const [bpm, setBpm] = useState(() => {
    const bpmParam = new URLSearchParams(window.location.search).get('bpm');
    if (bpmParam) {
      const parsed = parseInt(bpmParam, 10);
      if (!isNaN(parsed) && parsed >= 40 && parsed <= 300) return parsed;
    }
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    const hasSongInUrl = window.location.pathname.includes('/editor/song_');
    const initialId = hasSongInUrl ? 'rock_basic' : (allStyles.find(s => s.id === 'merengue')?.id || 'rock_basic');
    return allStyles.find(s => s.id === initialId)?.bpm ?? 100;
  });
  const [instruments, setInstruments] = useState<InstrumentState[]>(getDefaultInstrumentStates());
  const [songTitle, setSongTitle] = useState(() => {
    const now = new Date();
    const date = now.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `My Song · ${date}`;
  });
  const [transposition, setTransposition] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
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
      getSongById(songId).then(song => {
        if (song) {
          console.log(`[SONG] Song loaded — styleId: "${song.styleId}", bpm: ${song.bpm}, sections: ${song.sections.length}`);
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
          setMetronomeEnabled(song.metronomeEnabled);
          setSongTitle(song.title);
          if (song.instrumentSettings.length > 0) {
            setInstruments(song.instrumentSettings);
          }
          setCurrentSongId(song.id);
          setSongCreatedAt(song.createdAt);
          setLastSavedAt(new Date(song.updatedAt));
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
          window.location.href = '/app';
        }
      });
    } else if (!songId && !currentSongId && !isFromEmbedRef.current) {
      // New song - create and save immediately
      const newSong = createSong(songTitle);
      newSong.sections = sections;
      newSong.bpm = bpm;
      newSong.styleId = selectedStyleId;
      newSong.transposition = transposition;
      newSong.metronomeEnabled = metronomeEnabled;
      newSong.instrumentSettings = instruments;
      saveSongWithSync(newSong);
      setCurrentSongId(newSong.id);
      setSongCreatedAt(newSong.createdAt);
      setLastSavedAt(new Date());
      window.history.replaceState({}, '', `/editor/${newSong.id}`);
    } else if (!songId && !currentSongId && isFromEmbedRef.current) {
      // Opened from embed — mark initial render done after one tick so auto-save
      // can distinguish init from actual user changes
      setTimeout(() => { initialRenderDoneRef.current = true; }, 0);
    }
  }, [songId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!currentSongId) {
      // If opened from embed and user has made a change, create the song now
      if (isFromEmbedRef.current && initialRenderDoneRef.current) {
        const newSong = createSong(songTitle);
        newSong.sections = sections;
        newSong.bpm = bpm;
        newSong.styleId = selectedStyleId;
        newSong.transposition = transposition;
        newSong.metronomeEnabled = metronomeEnabled;
        newSong.instrumentSettings = instruments;
        saveSongWithSync(newSong);
        setCurrentSongId(newSong.id);
        setSongCreatedAt(newSong.createdAt);
        setLastSavedAt(new Date());
        window.history.replaceState({}, '', `/editor/${newSong.id}`);
        isFromEmbedRef.current = false;
      }
      return;
    }

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
  }, [currentSongId, songTitle, sections, bpm, selectedStyleId, transposition, instruments, metronomeEnabled, songCreatedAt]);

  // Handle export from Songs page
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('export') === 'true' && currentSongId) {
      // Remove export param from URL
      window.history.replaceState({}, '', `/editor/${currentSongId}`);
      // Trigger export after a short delay to let everything load
      setTimeout(() => {
        handleExport();
      }, 500);
    }
  }, [currentSongId]);

  const handleBackToSongs = useCallback(() => {
    stopPlayback();
    window.location.href = '/app';
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
  }, []);

  const handleDuplicateSection = useCallback((index: number) => {
    const section = sectionsRef.current[index];
    const newSection = {
      ...createSection(section.name + ' Copy'),
      chords: section.chords.map(c => ({ ...c, id: generateChordId() })),
      repeatCount: section.repeatCount
    };
    setSections(prev => [...prev.slice(0, index + 1), newSection, ...prev.slice(index + 1)]);
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

  const handleExport = useCallback(async () => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;

    setIsExporting(true);
    toast.info('Rendering audio...');

    try {
      const style = resolveActiveStyle(selectedStyleId, liveEditedStyle, customStyles, getStyleOverride);
      const audioBuffer = await renderProgressionOffline(sections, bpm, instruments, style, transposition);
      const filename = songTitle.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') || 'chord-progression';
      await encodeAndDownloadMp3(audioBuffer, `${filename}.wav`);
      toast.success('WAV exported successfully!');
      analytics.exportWav();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [sections, bpm, instruments, selectedStyleId, songTitle, transposition, liveEditedStyle]);

  const handleExportMidi = useCallback(() => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;
    try {
      const filename = songTitle.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') || 'chord-progression';
      exportMidi(sections, bpm, transposition, filename);
      toast.success('MIDI exported successfully!');
      analytics.exportMidi();
    } catch (error) {
      console.error('MIDI export failed:', error);
      toast.error('MIDI export failed. Please try again.');
    }
  }, [sections, bpm, transposition, songTitle]);

  const hasChords = sections.some(s => s.chords.length > 0);

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

  const activeNotes = useMemo(
    () => (visualChord ? getChordNotes(visualChord, transposition) : []),
    [visualChord, transposition],
  );

  const currentChordDisplayName = useMemo(
    () => (visualChord ? getTransposedChordName(visualChord, transposition) : ''),
    [visualChord, transposition],
  );

  const guitarVoicing = useMemo(
    () => (visualChord ? getGuitarVoicing(visualChord, transposition) : null),
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
    setShowCountdown(true);
  }, [hasChords, isExporting, selectedStyleId]);

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
    onMetronomeToggle: () => setMetronomeEnabled(prev => !prev),
    enabled: !showCountdown && !templatesModalOpen && !editingChord && !addChordSection,
  });

  // Update browser tab title dynamically (SEO static meta is handled by Astro)
  useEffect(() => {
    document.title = songTitle
      ? `${songTitle} — Chord Player editor | Chord Sequence`
      : 'Chord progression editor — Chord Player | Chord Sequence';
  }, [songTitle]);

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

              {/* Breadcrumb */}
              <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                <a href="/app/" className="hover:text-foreground transition-colors shrink-0">My library</a>
                <span className="opacity-30 mx-0.5">/</span>
                <span className="text-foreground font-medium truncate max-w-[160px] md:max-w-xs">{songTitle || 'New progression'}</span>
              </div>

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
              
              {/* Beat indicator - only on desktop */}
              {isPlaying && (
                <div className="hidden md:block">
                  <BeatIndicator
                    currentStep={currentPlayheadStep}
                    isPlaying={isPlaying}
                  />
                </div>
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
              
              {/* Save status */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {isSaving ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </span>
                ) : lastSavedAt ? (
                  <span className="flex items-center gap-1 text-[hsl(var(--success))]">
                    <Check className="h-3 w-3" />
                    <span className="hidden xs:inline">Saved</span>
                  </span>
                ) : null}
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
          }}
          onStyleChange={(id) => {
            setSelectedStyleId(id);
            setLiveEditedStyle(null);
            analytics.styleChanged(id);
          }}
          onSongTitleChange={setSongTitle}
          onTranspositionChange={setTransposition}
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
        />

        {/* Chord visualizer — always visible when chords exist */}
        {hasChords && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground text-center mb-3">
              {isPlaying ? 'Now playing' : 'Chord preview'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              {guitarVoicing && (
                <GuitarChordDiagram
                  voicing={guitarVoicing}
                  chordName={currentChordDisplayName}
                  className="w-28 sm:w-32 flex-shrink-0"
                />
              )}
              <PianoKeyboard
                activeNotes={activeNotes}
                chordName={guitarVoicing ? undefined : currentChordDisplayName}
                className="w-full max-w-xs sm:max-w-sm"
              />
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
            <div className="space-y-3">
              {sections.map((section, sectionIndex) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  transposition={transposition}
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
                  onDelete={() => {}}
                  onDuplicate={() => {}}
                  isDragging
                  fixedWidth
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <Button variant="outline" onClick={handleAddSection} className="w-full border-dashed border-border/50 hover:border-primary/40 h-9">
          <Plus className="h-4 w-4 mr-2" />
          Add Section
        </Button>

      </main>

      {/* Welcome Overlay for first-time users */}
      {showOnboarding && <WelcomeOverlay onDismiss={dismissOnboarding} />}

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
        transposition={transposition}
      />

      <AddChordModal
        open={!!addChordSection}
        sectionName={addChordSection?.name || ''}
        onClose={() => setAddChordSection(null)}
        onAdd={handleAddChord}
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
    </div>
  );
};

export default Index;
