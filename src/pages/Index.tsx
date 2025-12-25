import { useState, useCallback, useRef, useEffect } from 'react';
import { Chord, generateChordId } from '@/lib/musicTheory';
import { Section, createSection, getSectionDisplayName } from '@/lib/sections';
import { getDefaultInstrumentStates, InstrumentState, isInstrumentAudible } from '@/lib/instruments';
import { getStyleById, MUSICAL_STYLES } from '@/lib/styles';
import { getAudioContext, scheduleProgression, renderProgressionOffline, stopPlayback } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { SectionCard } from '@/components/SectionCard';
import { TransportControls } from '@/components/TransportControls';
import { ChordEditModal } from '@/components/ChordEditModal';
import { AddChordModal } from '@/components/AddChordModal';
import { InstrumentsPanel } from '@/components/InstrumentsPanel';
import { Button } from '@/components/ui/button';
import { Music2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  // Sections state
  const [sections, setSections] = useState<Section[]>([createSection('Section A')]);
  const [bpm, setBpm] = useState(120);
  const [selectedStyleId, setSelectedStyleId] = useState('rock_basic');
  const [instruments, setInstruments] = useState<InstrumentState[]>(getDefaultInstrumentStates());
  const [songTitle, setSongTitle] = useState('My Song');
  const [transposition, setTransposition] = useState(0); // Semitones
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChordIndex, setCurrentChordIndex] = useState(-1);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [loopingSectionIndex, setLoopingSectionIndex] = useState<number | null>(null);
  
  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [editingChord, setEditingChord] = useState<{ sectionIndex: number; chordIndex: number; chord: Chord } | null>(null);
  const [addChordSection, setAddChordSection] = useState<{ index: number; name: string } | null>(null);
  const [instrumentsPanelOpen, setInstrumentsPanelOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverSectionIndex, setDragOverSectionIndex] = useState<number | null>(null);
  
  // Refs
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  const bpmRef = useRef(120);
  const metronomeRef = useRef(true);
  const instrumentsRef = useRef<InstrumentState[]>(getDefaultInstrumentStates());
  const transpositionRef = useRef(0);
  const styleRef = useRef(selectedStyleId);
  const loopingSectionRef = useRef<number | null>(null);
  
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metronomeRef.current = metronomeEnabled; }, [metronomeEnabled]);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { styleRef.current = selectedStyleId; }, [selectedStyleId]);
  useEffect(() => { loopingSectionRef.current = loopingSectionIndex; }, [loopingSectionIndex]);
  useEffect(() => { transpositionRef.current = transposition; }, [transposition]);
  
  useEffect(() => {
    return () => { cancelPlaybackRef.current?.(); };
  }, []);

  const startPlayback = useCallback(() => {
    const currentSections = sectionsRef.current;
    const loopIdx = loopingSectionRef.current;
    
    // If looping a section, only play that section
    const sectionsToPlay = loopIdx !== null 
      ? [currentSections[loopIdx]] 
      : currentSections;
    
    const hasChords = sectionsToPlay.some(s => s.chords.length > 0);
    if (!hasChords) return;
    
    getAudioContext();
    setIsPlaying(true);
    setCurrentChordIndex(0);
    
    const style = getStyleById(styleRef.current) || MUSICAL_STYLES[0];
    
    const { cancel } = scheduleProgression(sectionsToPlay, bpmRef.current, {
      loop: true,
      metronome: metronomeRef.current,
      instruments: instrumentsRef.current,
      style,
      transposition: transpositionRef.current,
      onChordChange: setCurrentChordIndex,
      onLoopEnd: () => setCurrentChordIndex(0),
    });
    
    cancelPlaybackRef.current = cancel;
  }, []);

  const stopPlaybackCompletely = useCallback(() => {
    cancelPlaybackRef.current?.();
    cancelPlaybackRef.current = null;
    stopPlayback();
    setIsPlaying(false);
    setCurrentChordIndex(-1);
  }, []);

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

  // Section drag & drop
  const handleSectionDragStart = (e: React.DragEvent, index: number) => {
    setDraggedSectionIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/section', index.toString());
  };

  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/section')) {
      setDragOverSectionIndex(index);
    }
  };

  const handleSectionDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('application/section'));
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      setSections(prev => {
        const newSections = [...prev];
        const [removed] = newSections.splice(fromIndex, 1);
        newSections.splice(toIndex, 0, removed);
        return newSections;
      });
    }
    setDraggedSectionIndex(null);
    setDragOverSectionIndex(null);
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

  // Cross-section chord move
  const handleMoveChordToSection = (fromSectionIndex: number, chordIndex: number, toSectionIndex: number) => {
    if (fromSectionIndex === toSectionIndex) return;
    
    const chord = sections[fromSectionIndex].chords[chordIndex];
    setSections(prev => prev.map((s, i) => {
      if (i === fromSectionIndex) {
        return { ...s, chords: s.chords.filter((_, j) => j !== chordIndex) };
      }
      if (i === toSectionIndex) {
        return { ...s, chords: [...s.chords, chord] };
      }
      return s;
    }));
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
      const style = getStyleById(selectedStyleId) || MUSICAL_STYLES[0];
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
  }, [sections, bpm, instruments, selectedStyleId, songTitle, transposition]);

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
          onPlay={startPlayback}
          onStop={stopPlaybackCompletely}
          onReset={() => { stopPlaybackCompletely(); setCurrentChordIndex(-1); }}
          onExport={handleExport}
          onBpmChange={setBpm}
          onMetronomeToggle={setMetronomeEnabled}
          onStyleChange={setSelectedStyleId}
          onSongTitleChange={setSongTitle}
          onTranspositionChange={setTransposition}
          onOpenInstruments={() => setInstrumentsPanelOpen(true)}
          hasChords={hasChords}
        />

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, sectionIndex) => (
            <SectionCard
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
              onReorder={(from, to) => handleChordReorder(sectionIndex, from, to)}
              onMoveChordToSection={handleMoveChordToSection}
              onRepeatChange={(count) => handleRepeatChange(sectionIndex, count)}
              onNameChange={(name) => handleSectionNameChange(sectionIndex, name)}
              onDelete={() => handleDeleteSection(sectionIndex)}
              onDuplicate={() => handleDuplicateSection(sectionIndex)}
              onToggleLoop={() => handleToggleSectionLoop(sectionIndex)}
              isFirst={sectionIndex === 0}
              isLast={sectionIndex === sections.length - 1}
              onSectionDragStart={(e) => handleSectionDragStart(e, sectionIndex)}
              onSectionDragOver={(e) => handleSectionDragOver(e, sectionIndex)}
              onSectionDrop={(e) => handleSectionDrop(e, sectionIndex)}
              isSectionDragOver={dragOverSectionIndex === sectionIndex && draggedSectionIndex !== sectionIndex}
            />
          ))}

          <Button variant="outline" onClick={handleAddSection} className="w-full border-dashed">
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </div>
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
    </div>
  );
};

export default Index;
