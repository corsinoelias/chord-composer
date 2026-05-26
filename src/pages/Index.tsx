import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  DndContext,
  closestCenter,
  rectIntersection,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  CollisionDetection,
  pointerWithin,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Chord, generateChordId } from '@/lib/musicTheory';
import { Section, createSection, getSectionDisplayName } from '@/lib/sections';
import { getDefaultInstrumentStates, InstrumentState } from '@/lib/instruments';
import { getStyleByIdWithOverrides, MUSICAL_STYLES, StylePattern } from '@/lib/styles';
import { getCustomStyles, getStyleOverride } from '@/lib/customStyles';
import { renderProgressionOffline, playChordPreview, areSamplesLoaded, preloadAudio } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { usePlayback } from '@/contexts/PlaybackContext';
import { useStyleInstruments, createInstrumentStatesFromStyle } from '@/hooks/useStyleInstruments';
import { Song, createSong } from '@/lib/songs';
import { getSongById, saveSong } from '@/lib/songStorage';
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
import { MixingConsole } from '@/components/MixingConsole';
import { Button } from '@/components/ui/button';
import { Music2, Plus, ArrowLeft, Check, Loader2, FileMusic, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SEO_OG, SITE_ORIGIN, editorCanonicalUrl } from '@/lib/seo';

const Index = () => {
  const { showOnboarding, dismissOnboarding } = useFirstTimeUser();
  const { songId } = useParams<{ songId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state: playbackState, play, stop: stopPlayback, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex, currentStep: currentPlayheadStep } = playbackState;

  // Song loading state
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default chords for new songs
  const defaultChords: Chord[] = [
    { id: generateChordId(), root: 'E', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'D', accidental: '', quality: 'maj', duration: 4 },
    { id: generateChordId(), root: 'B', accidental: '', quality: 'min', duration: 4 },
    { id: generateChordId(), root: 'C', accidental: '', quality: 'maj', duration: 4 },
  ];

  // Sections state
  const [sections, setSections] = useState<Section[]>([{
    ...createSection('Section A'),
    chords: defaultChords
  }]);
  const [customStyles, setCustomStyles] = useState<StylePattern[]>(getCustomStyles());

  // Determine initial style (prefer merengue if exists, fallback to rock_basic)
  const getInitialStyleId = () => {
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    return allStyles.find(s => s.id === 'merengue')?.id || 'rock_basic';
  };

  const [selectedStyleId, setSelectedStyleId] = useState(getInitialStyleId);
  const [bpm, setBpm] = useState(() => {
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    const initialId = allStyles.find(s => s.id === 'merengue')?.id || 'rock_basic';
    return allStyles.find(s => s.id === initialId)?.bpm ?? 100;
  });
  const [instruments, setInstruments] = useState<InstrumentState[]>(getDefaultInstrumentStates());
  const [songTitle, setSongTitle] = useState('My Song');
  const [transposition, setTransposition] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [loopingSectionIndex, setLoopingSectionIndex] = useState<number | null>(null);
  
  // Live edited style (for rhythm editor live mode)
  const [liveEditedStyle, setLiveEditedStyle] = useState<StylePattern | null>(null);
  
  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [editingChord, setEditingChord] = useState<{ sectionIndex: number; chordIndex: number; chord: Chord } | null>(null);
  const [addChordSection, setAddChordSection] = useState<{ index: number; name: string } | null>(null);
  const [instrumentsPanelOpen, setInstrumentsPanelOpen] = useState(false);
  const [rhythmEditorOpen, setRhythmEditorOpen] = useState(false);
  const [createRhythmModalOpen, setCreateRhythmModalOpen] = useState(false);
  const [editingNewStyle, setEditingNewStyle] = useState<StylePattern | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeChord, setActiveChord] = useState<{ chord: Chord; sectionIndex: number } | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [mixingConsoleOpen, setMixingConsoleOpen] = useState(false);
  const [animatingSections, setAnimatingSections] = useState<{ index: number; direction: 'up' | 'down' }[]>([]);
  
  // Refs for current values (used in callbacks)
  const sectionsRef = useRef<Section[]>([]);
  const bpmRef = useRef(100);
  const metronomeRef = useRef(true);
  const instrumentsRef = useRef<InstrumentState[]>(getDefaultInstrumentStates());
  const transpositionRef = useRef(0);
  const styleRef = useRef(selectedStyleId);
  const loopingSectionRef = useRef<number | null>(null);
  const liveEditedStyleRef = useRef<StylePattern | null>(null);
  const customStylesRef = useRef<StylePattern[]>([]);
  
  // Sync refs immediately (not in useEffect) to avoid race conditions
  sectionsRef.current = sections;
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metronomeRef.current = metronomeEnabled; }, [metronomeEnabled]);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { styleRef.current = selectedStyleId; }, [selectedStyleId]);
  loopingSectionRef.current = loopingSectionIndex;
  useEffect(() => { transpositionRef.current = transposition; }, [transposition]);
  useEffect(() => { liveEditedStyleRef.current = liveEditedStyle; }, [liveEditedStyle]);
  useEffect(() => { customStylesRef.current = customStyles; }, [customStyles]);

  // Memoize current style to avoid recalculating on every render
  const currentStyle = useMemo(() => {
    if (liveEditedStyle) return liveEditedStyle;
    return getStyleByIdWithOverrides(selectedStyleId, customStyles, getStyleOverride) || MUSICAL_STYLES[0];
  }, [selectedStyleId, customStyles, liveEditedStyle]);

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

  // Update playback options when liveEditedStyle changes during playback
  useEffect(() => {
    if (isPlaying) {
      updatePlaybackOptions({ liveEditedStyle });
    }
  }, [liveEditedStyle, isPlaying, updatePlaybackOptions]);

  // Load song from URL param
  useEffect(() => {
    if (songId && songId !== currentSongId) {
      const song = getSongById(songId);
      if (song) {
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
        setLastSavedAt(new Date(song.updatedAt));
      } else {
        toast.error('Song not found');
        navigate('/');
      }
    } else if (!songId && !currentSongId) {
      // New song - create and save immediately
      const newSong = createSong('My Song');
      newSong.sections = sections;
      newSong.bpm = bpm;
      newSong.styleId = selectedStyleId;
      newSong.transposition = transposition;
      newSong.metronomeEnabled = metronomeEnabled;
      newSong.instrumentSettings = instruments;
      saveSong(newSong);
      setCurrentSongId(newSong.id);
      setLastSavedAt(new Date());
      // Update URL without adding to history
      navigate(`/editor/${newSong.id}`, { replace: true });
    }
  }, [songId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!currentSongId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounce save by 1.5 seconds
    saveTimeoutRef.current = setTimeout(() => {
      const song: Song = {
        id: currentSongId,
        title: songTitle,
        createdAt: new Date().toISOString(), // Will be overwritten if exists
        updatedAt: new Date().toISOString(),
        sections,
        bpm,
        styleId: selectedStyleId,
        transposition,
        instrumentSettings: instruments,
        metronomeEnabled,
      };
      
      // Get existing song to preserve createdAt
      const existing = getSongById(currentSongId);
      if (existing) {
        song.createdAt = existing.createdAt;
      }
      
      saveSong(song);
      setLastSavedAt(new Date());
      setIsSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentSongId, songTitle, sections, bpm, selectedStyleId, transposition, instruments, metronomeEnabled]);

  // Handle export from Songs page
  useEffect(() => {
    if (searchParams.get('export') === 'true' && currentSongId) {
      // Remove export param from URL
      navigate(`/editor/${currentSongId}`, { replace: true });
      // Trigger export after a short delay to let everything load
      setTimeout(() => {
        handleExport();
      }, 500);
    }
  }, [currentSongId, searchParams]);

  const handleBackToSongs = useCallback(() => {
    stopPlayback();
    navigate('/');
  }, [navigate, stopPlayback]);


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
    });
  }, [play]);

  const stopPlaybackCompletely = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const handleChangeWhilePlaying = useCallback(() => {
    if (isPlaying) {
      stopPlaybackCompletely();
      setTimeout(() => startPlayback(), 50);
    }
  }, [isPlaying, stopPlaybackCompletely, startPlayback]);

  // Section handlers
  const handleAddSection = () => {
    const newSection = createSection(getSectionDisplayName(sections.length));
    setSections(prev => [...prev, newSection]);
  };

  const handleDeleteSection = (index: number) => {
    if (sections.length === 1) {
      toast.error('Cannot delete the only section');
      return;
    }
    if (loopingSectionIndex === index) {
      setLoopingSectionIndex(null);
    }
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateSection = (index: number) => {
    const section = sections[index];
    const newSection = { 
      ...createSection(section.name + ' Copy'), 
      chords: section.chords.map(c => ({ ...c, id: generateChordId() })), 
      repeatCount: section.repeatCount 
    };
    setSections(prev => [...prev.slice(0, index + 1), newSection, ...prev.slice(index + 1)]);
  };

  const handleSectionNameChange = (index: number, name: string) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  };

  const handleToggleSectionLoop = (index: number) => {
    setLoopingSectionIndex(prev => {
      const next = prev === index ? null : index;
      loopingSectionRef.current = next;
      return next;
    });
  };

  const handleRepeatChange = (sectionIndex: number, repeatCount: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIndex ? { ...s, repeatCount: Math.max(1, repeatCount) } : s));
  };


  // Chord handlers
  const handleAddChord = (chord: Chord) => {
    if (addChordSection === null) return;
    setSections(prev => prev.map((s, i) => i === addChordSection.index ? { ...s, chords: [...s.chords, chord] } : s));
    toast.success(`Added ${chord.root}${chord.accidental}${chord.quality} to ${addChordSection.name}`);
  };

  const handleChordClick = (sectionIndex: number, chordIndex: number) => {
    const chord = sections[sectionIndex].chords[chordIndex];
    // Play preview when not playing
    if (!isPlaying) {
      playChordPreview(chord);
    }
    setEditingChord({ sectionIndex, chordIndex, chord });
  };

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

  const handleChordDelete = (sectionIndex: number, chordIndex: number) => {
    // Count total chords across all sections
    const totalChords = sections.reduce((sum, s) => sum + s.chords.length, 0);
    if (totalChords <= 1) {
      toast.error('Cannot delete the last chord');
      return;
    }
    setSections(prev => prev.map((s, i) => 
      i === sectionIndex ? { ...s, chords: s.chords.filter((_, j) => j !== chordIndex) } : s
    ));
  };

  const handleChordDuplicate = (sectionIndex: number, chordIndex: number) => {
    const chord = sections[sectionIndex].chords[chordIndex];
    const newChord = { ...chord, id: generateChordId() };
    setSections(prev => prev.map((s, i) => 
      i === sectionIndex 
        ? { ...s, chords: [...s.chords.slice(0, chordIndex + 1), newChord, ...s.chords.slice(chordIndex + 1)] } 
        : s
    ));
  };

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

  // Restart on changes
  useEffect(() => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (isPlaying && hasChords) handleChangeWhilePlaying();
    else if (isPlaying && !hasChords) stopPlaybackCompletely();
  }, [sections]);

  // Changes that REQUIRE restart (structure changes)
  useEffect(() => {
    if (isPlaying) handleChangeWhilePlaying();
  }, [bpm, selectedStyleId, loopingSectionIndex]);

  // Changes that DO NOT require restart (update options dynamically)
  useEffect(() => {
    if (isPlaying) {
      updatePlaybackOptions({ 
        metronome: metronomeEnabled,
        instruments,
        transposition 
      });
    }
  }, [metronomeEnabled, instruments, transposition, isPlaying, updatePlaybackOptions]);

  const handleExport = useCallback(async () => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;
    
    setIsExporting(true);
    toast.info('Rendering audio...');
    
    try {
      const style = liveEditedStyle || getStyleByIdWithOverrides(selectedStyleId, customStyles, getStyleOverride) || MUSICAL_STYLES[0];
      const audioBuffer = await renderProgressionOffline(sections, bpm, instruments, style, transposition);
      const filename = songTitle.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') || 'chord-progression';
      await encodeAndDownloadMp3(audioBuffer, `${filename}.wav`);
      toast.success('WAV exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [sections, bpm, instruments, selectedStyleId, songTitle, transposition, liveEditedStyle]);

  const hasChords = sections.some(s => s.chords.length > 0);

  // Calculate global chord offset for each section (with repeats)
  const getGlobalOffset = (sectionIndex: number) => {
    // When looping, offset is always 0
    if (loopingSectionIndex !== null) return 0;
    
    let offset = 0;
    for (let i = 0; i < sectionIndex; i++) {
      offset += sections[i].chords.length * sections[i].repeatCount;
    }
    return offset;
  };

  // Handler for moving sections up/down
  const handleMoveSection = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= sections.length) return;
    
    // Trigger swap animation for both sections
    setAnimatingSections([
      { index: fromIndex, direction },
      { index: toIndex, direction: direction === 'up' ? 'down' : 'up' }
    ]);
    
    // Clear animation after it completes
    setTimeout(() => {
      setAnimatingSections([]);
    }, 350);
    
    setSections(prev => {
      const newSections = [...prev];
      const [removed] = newSections.splice(fromIndex, 1);
      newSections.splice(toIndex, 0, removed);
      return newSections;
    });
    
    // Update looping section index if needed
    if (loopingSectionIndex !== null) {
      if (loopingSectionIndex === fromIndex) {
        setLoopingSectionIndex(toIndex);
      } else if (fromIndex < loopingSectionIndex && toIndex >= loopingSectionIndex) {
        setLoopingSectionIndex(loopingSectionIndex - 1);
      } else if (fromIndex > loopingSectionIndex && toIndex <= loopingSectionIndex) {
        setLoopingSectionIndex(loopingSectionIndex + 1);
      }
    }
  };

  // Handler for loading a progression template
  const handleLoadTemplate = (chords: Chord[]) => {
    // Replace first section's chords with template
    setSections(prev => {
      const newSections = [...prev];
      if (newSections.length > 0) {
        newSections[0] = {
          ...newSections[0],
          chords,
        };
      }
      return newSections;
    });
    toast.success('Progression template loaded!');
  };

  // Countdown playback - starts countdown then plays
  const handlePlayWithCountdown = useCallback(() => {
    if (!hasChords || isExporting) return;
    setShowCountdown(true);
  }, [hasChords, isExporting]);

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

  const editorPageUrl = editorCanonicalUrl(songId ?? null);

  // Build a dynamic, per-song SEO description so every saved song
  // has unique metadata (sections, chord count, BPM, style).
  const seoDescription = useMemo(() => {
    const totalChords = sections.reduce((sum, s) => sum + s.chords.length, 0);
    const sectionCount = sections.length;
    const styleName =
      [...MUSICAL_STYLES, ...getCustomStyles()].find(s => s.id === selectedStyleId)?.name ?? 'custom';
    if (totalChords === 0) {
      return `Build "${songTitle}" on chordsequence.com — arrange sections, pick a rhythm style, transpose, and export to MP3.`;
    }
    return `"${songTitle}" — ${totalChords} chord${totalChords === 1 ? '' : 's'} across ${sectionCount} section${sectionCount === 1 ? '' : 's'} at ${bpm} BPM (${styleName} style). Edit and export to MP3 on chordsequence.com.`;
  }, [songTitle, sections, bpm, selectedStyleId]);

  const breadcrumbJsonLd = useMemo(
    () =>
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Songs', item: `${SITE_ORIGIN}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: songTitle || 'Editor',
            item: editorPageUrl,
          },
        ],
      }),
    [songTitle, editorPageUrl],
  );

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>
          {songTitle
            ? `${songTitle} — Chord Player editor | Chord Sequence`
            : 'Chord progression editor — Chord Player | Chord Sequence'}
        </title>
        <meta
          name="description"
          content={seoDescription}
        />
        {!songId && <meta name="robots" content="noindex, follow" />}
        <link rel="canonical" href={editorPageUrl} />
        <meta property="og:site_name" content={SEO_OG.siteName} />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content={songTitle ? `${songTitle} — Chord Player` : 'Chord Player — Chord progression editor'}
        />
        <meta
          property="og:description"
          content={seoDescription}
        />
        <meta property="og:url" content={editorPageUrl} />
        <meta property="og:image" content={SEO_OG.imageUrl} />
        <meta property="og:image:width" content={String(SEO_OG.imageWidth)} />
        <meta property="og:image:height" content={String(SEO_OG.imageHeight)} />
        <meta property="og:image:alt" content={SEO_OG.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content={songTitle ? `${songTitle} — Chord Player` : 'Chord Player — Chord progression editor'}
        />
        <meta
          name="twitter:description"
          content={seoDescription}
        />
        <meta name="twitter:image" content={SEO_OG.imageUrl} />
        <meta name="twitter:image:alt" content={SEO_OG.imageAlt} />
        <script type="application/ld+json">{breadcrumbJsonLd}</script>
      </Helmet>
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Logo + Title */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={handleBackToSongs} className="shrink-0 h-8 w-8" aria-label="Back to saved songs">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Music2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">Chord Player — Chord progression editor</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Chord Sequence · chordsequence.com</p>
              </div>
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
          onPlay={startPlayback}
          onStop={stopPlaybackCompletely}
          onReset={() => { stopPlaybackCompletely(); }}
          onExport={handleExport}
          onBpmChange={(newBpm) => {
            setBpm(newBpm);
          }}
          onMetronomeToggle={(enabled) => {
            setMetronomeEnabled(enabled);
          }}
          onStyleChange={(id) => {
            setSelectedStyleId(id);
            setLiveEditedStyle(null);
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
                  currentChordIndex={loopingSectionIndex === sectionIndex || loopingSectionIndex === null ? currentChordIndex : -1}
                  globalChordOffset={getGlobalOffset(sectionIndex)}
                  totalSections={sections.length}
                  isLooping={loopingSectionIndex === sectionIndex}
                  styleId={selectedStyleId}
                  swapAnimation={animatingSections.find(a => a.index === sectionIndex)?.direction || null}
                  onAddChord={() => setAddChordSection({ index: sectionIndex, name: section.name })}
                  onChordClick={(chordIndex) => handleChordClick(sectionIndex, chordIndex)}
                  onChordDelete={(chordIndex) => handleChordDelete(sectionIndex, chordIndex)}
                  onChordDuplicate={(chordIndex) => handleChordDuplicate(sectionIndex, chordIndex)}
                  onRepeatChange={(count) => handleRepeatChange(sectionIndex, count)}
                  onNameChange={(name) => handleSectionNameChange(sectionIndex, name)}
                  onDelete={() => handleDeleteSection(sectionIndex)}
                  onDuplicate={() => handleDuplicateSection(sectionIndex)}
                  onToggleLoop={() => handleToggleSectionLoop(sectionIndex)}
                  onMoveUp={() => handleMoveSection(sectionIndex, 'up')}
                  onMoveDown={() => handleMoveSection(sectionIndex, 'down')}
                  onSetProgression={(chords) => {
                    const newSections = [...sections];
                    newSections[sectionIndex] = {
                      ...newSections[sectionIndex],
                      chords: chords
                    };
                    setSections(newSections);
                  }}
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

      <ChordEditModal
        chord={editingChord?.chord || null}
        open={!!editingChord}
        onClose={() => setEditingChord(null)}
        onSave={handleChordSave}
        onDelete={editingChord ? () => handleChordDelete(editingChord.sectionIndex, editingChord.chordIndex) : undefined}
        onDuplicate={editingChord ? () => handleChordDuplicate(editingChord.sectionIndex, editingChord.chordIndex) : undefined}
        onPreview={handleChordPreview}
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
