import { useState, useCallback, useRef, useEffect } from 'react';
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
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Chord, generateChordId } from '@/lib/musicTheory';
import { Section, createSection, getSectionDisplayName } from '@/lib/sections';
import { getDefaultInstrumentStates, InstrumentState } from '@/lib/instruments';
import { getStyleById, getStyleByIdWithOverrides, MUSICAL_STYLES, StylePattern } from '@/lib/styles';
import { getCustomStyles, getStyleOverride } from '@/lib/customStyles';
import { renderProgressionOffline } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { usePlayback } from '@/contexts/PlaybackContext';
import { SortableSection } from '@/components/SortableSection';
import { TransportControls } from '@/components/TransportControls';
import { ChordEditModal } from '@/components/ChordEditModal';
import { AddChordModal } from '@/components/AddChordModal';
import { RhythmEditor } from '@/components/RhythmEditor';
import { CreateRhythmModal } from '@/components/CreateRhythmModal';
import { InstrumentsPanel } from '@/components/InstrumentsPanel';
import { ChordBlock } from '@/components/ChordBlock';
import { Button } from '@/components/ui/button';
import { Music2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const { state: playbackState, play, stop: stopPlayback, updatePlaybackOptions } = usePlayback();
  const { isPlaying, currentChordIndex, currentStep: currentPlayheadStep } = playbackState;

  // Sections state - default chords: G, D, Em, C (all 4 beats)
  const [sections, setSections] = useState<Section[]>([{
    ...createSection('Section A'),
    chords: [
      { id: generateChordId(), root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { id: generateChordId(), root: 'D', accidental: '', quality: 'maj', duration: 4 },
      { id: generateChordId(), root: 'E', accidental: '', quality: 'min', duration: 4 },
      { id: generateChordId(), root: 'C', accidental: '', quality: 'maj', duration: 4 },
    ]
  }]);
  const [bpm, setBpm] = useState(100);
  const [customStyles, setCustomStyles] = useState<StylePattern[]>(getCustomStyles());
  
  // Determine initial style (prefer pop_1 if exists, fallback to rock_basic)
  const getInitialStyleId = () => {
    const allStyles = [...getCustomStyles(), ...MUSICAL_STYLES];
    return allStyles.find(s => s.id === 'pop_1')?.id || 'rock_basic';
  };
  
  const [selectedStyleId, setSelectedStyleId] = useState(getInitialStyleId);
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
  
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metronomeRef.current = metronomeEnabled; }, [metronomeEnabled]);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { styleRef.current = selectedStyleId; }, [selectedStyleId]);
  useEffect(() => { loopingSectionRef.current = loopingSectionIndex; }, [loopingSectionIndex]);
  useEffect(() => { transpositionRef.current = transposition; }, [transposition]);
  useEffect(() => { liveEditedStyleRef.current = liveEditedStyle; }, [liveEditedStyle]);
  useEffect(() => { customStylesRef.current = customStyles; }, [customStyles]);

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

  // Listen for custom styles changes
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
    
    // If looping a section, only play that section
    const sectionsToPlay = loopIdx !== null 
      ? [currentSections[loopIdx]] 
      : currentSections;
    
    const hasChords = sectionsToPlay.some(s => s.chords.length > 0);
    if (!hasChords) return;
    
    await play(sectionsToPlay, {
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
    setLoopingSectionIndex(prev => prev === index ? null : index);
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
    setEditingChord({ sectionIndex, chordIndex, chord });
  };

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
    
    // Handle section drag
    if (activeId !== overId && !overId.startsWith('chord-') && !overId.startsWith('section-drop-')) {
      const oldIndex = sections.findIndex(s => s.id === activeId);
      const newIndex = sections.findIndex(s => s.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        setSections(prev => {
          const newSections = [...prev];
          const [removed] = newSections.splice(oldIndex, 1);
          newSections.splice(newIndex, 0, removed);
          return newSections;
        });
        
        // Update looping section index if needed
        if (loopingSectionIndex !== null) {
          if (loopingSectionIndex === oldIndex) {
            setLoopingSectionIndex(newIndex);
          } else if (oldIndex < loopingSectionIndex && newIndex >= loopingSectionIndex) {
            setLoopingSectionIndex(loopingSectionIndex - 1);
          } else if (oldIndex > loopingSectionIndex && newIndex <= loopingSectionIndex) {
            setLoopingSectionIndex(loopingSectionIndex + 1);
          }
        }
      }
    }
  };

  // Restart on changes
  useEffect(() => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (isPlaying && hasChords) handleChangeWhilePlaying();
    else if (isPlaying && !hasChords) stopPlaybackCompletely();
  }, [sections]);

  useEffect(() => {
    if (isPlaying) handleChangeWhilePlaying();
  }, [bpm, metronomeEnabled, selectedStyleId, instruments, loopingSectionIndex, transposition]);

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

  const sectionIds = sections.map(s => s.id);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chord Player</h1>
              <p className="text-sm text-muted-foreground">Create chord progressions & export</p>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
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
            handleChangeWhilePlaying();
          }}
          onMetronomeToggle={(enabled) => {
            setMetronomeEnabled(enabled);
            handleChangeWhilePlaying();
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

        {/* Sections - unified DndContext for both sections and chords */}
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {sections.map((section, sectionIndex) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  currentChordIndex={loopingSectionIndex === sectionIndex || loopingSectionIndex === null ? currentChordIndex : -1}
                  globalChordOffset={getGlobalOffset(sectionIndex)}
                  totalSections={sections.length}
                  isLooping={loopingSectionIndex === sectionIndex}
                  onAddChord={() => setAddChordSection({ index: sectionIndex, name: section.name })}
                  onChordClick={(chordIndex) => handleChordClick(sectionIndex, chordIndex)}
                  onChordDelete={(chordIndex) => handleChordDelete(sectionIndex, chordIndex)}
                  onChordDuplicate={(chordIndex) => handleChordDuplicate(sectionIndex, chordIndex)}
                  onChordReorder={(from, to) => handleChordReorder(sectionIndex, from, to)}
                  onRepeatChange={(count) => handleRepeatChange(sectionIndex, count)}
                  onNameChange={(name) => handleSectionNameChange(sectionIndex, name)}
                  onDelete={() => handleDeleteSection(sectionIndex)}
                  onDuplicate={() => handleDuplicateSection(sectionIndex)}
                  onToggleLoop={() => handleToggleSectionLoop(sectionIndex)}
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

        <Button variant="outline" onClick={handleAddSection} className="w-full border-dashed">
          <Plus className="h-4 w-4 mr-2" />
          Add Section
        </Button>
      </main>

      <ChordEditModal
        chord={editingChord?.chord || null}
        open={!!editingChord}
        onClose={() => setEditingChord(null)}
        onSave={handleChordSave}
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
      />

      <RhythmEditor
        open={rhythmEditorOpen}
        onClose={() => {
          setRhythmEditorOpen(false);
          setEditingNewStyle(null);
          setLiveEditedStyle(null);
        }}
        style={editingNewStyle || getStyleByIdWithOverrides(selectedStyleId, customStyles, getStyleOverride) || MUSICAL_STYLES[0]}
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
    </div>
  );
};

export default Index;
