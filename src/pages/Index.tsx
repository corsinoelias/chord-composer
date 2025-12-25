import { useState, useCallback, useRef, useEffect } from 'react';
import { Chord } from '@/lib/musicTheory';
import { Section, createSection, getSectionDisplayName } from '@/lib/sections';
import { getDefaultInstrumentStates, InstrumentState } from '@/lib/instruments';
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
  const [selectedStyleId, setSelectedStyleId] = useState('pop1');
  const [instruments, setInstruments] = useState<InstrumentState[]>(getDefaultInstrumentStates());
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChordIndex, setCurrentChordIndex] = useState(-1);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  
  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [editingChord, setEditingChord] = useState<{ sectionIndex: number; chordIndex: number; chord: Chord } | null>(null);
  const [addChordSection, setAddChordSection] = useState<{ index: number; name: string } | null>(null);
  const [instrumentsPanelOpen, setInstrumentsPanelOpen] = useState(false);
  
  // Refs
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  const bpmRef = useRef(120);
  const metronomeRef = useRef(true);
  const instrumentsRef = useRef<InstrumentState[]>(getDefaultInstrumentStates());
  const styleRef = useRef(selectedStyleId);
  
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metronomeRef.current = metronomeEnabled; }, [metronomeEnabled]);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { styleRef.current = selectedStyleId; }, [selectedStyleId]);
  
  useEffect(() => {
    return () => { cancelPlaybackRef.current?.(); };
  }, []);

  const startPlayback = useCallback(() => {
    const currentSections = sectionsRef.current;
    const hasChords = currentSections.some(s => s.chords.length > 0);
    if (!hasChords) return;
    
    getAudioContext();
    setIsPlaying(true);
    setCurrentChordIndex(0);
    
    const style = getStyleById(styleRef.current) || MUSICAL_STYLES[0];
    
    const { cancel } = scheduleProgression(currentSections, bpmRef.current, {
      loop: true,
      metronome: metronomeRef.current,
      instruments: instrumentsRef.current,
      style,
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
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateSection = (index: number) => {
    const section = sections[index];
    const newSection = { ...createSection(section.name + ' Copy'), chords: [...section.chords], repeatCount: section.repeatCount };
    setSections(prev => [...prev.slice(0, index + 1), newSection, ...prev.slice(index + 1)]);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    setSections(prev => {
      const newSections = [...prev];
      [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
      return newSections;
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
  }, [bpm, metronomeEnabled, selectedStyleId, instruments]);

  const handleExport = useCallback(async () => {
    const hasChords = sections.some(s => s.chords.length > 0);
    if (!hasChords) return;
    
    setIsExporting(true);
    toast.info('Rendering audio...');
    
    try {
      const style = getStyleById(selectedStyleId) || MUSICAL_STYLES[0];
      const audioBuffer = await renderProgressionOffline(sections, bpm, instruments, style);
      await encodeAndDownloadMp3(audioBuffer, 'chord-progression.wav');
      toast.success('WAV exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [sections, bpm, instruments, selectedStyleId]);

  const hasChords = sections.some(s => s.chords.length > 0);

  // Calculate global chord offset for each section (with repeats)
  const getGlobalOffset = (sectionIndex: number) => {
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
          onPlay={startPlayback}
          onStop={stopPlaybackCompletely}
          onReset={() => { stopPlaybackCompletely(); setCurrentChordIndex(-1); }}
          onExport={handleExport}
          onBpmChange={setBpm}
          onMetronomeToggle={setMetronomeEnabled}
          onStyleChange={setSelectedStyleId}
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
              currentChordIndex={currentChordIndex}
              globalChordOffset={getGlobalOffset(sectionIndex)}
              totalSections={sections.length}
              onAddChord={() => setAddChordSection({ index: sectionIndex, name: section.name })}
              onChordClick={(chordIndex) => handleChordClick(sectionIndex, chordIndex)}
              onChordDelete={(chordIndex) => handleChordDelete(sectionIndex, chordIndex)}
              onReorder={(from, to) => handleChordReorder(sectionIndex, from, to)}
              onMoveChordToSection={(chordIndex, toSectionIndex) => handleMoveChordToSection(sectionIndex, chordIndex, toSectionIndex)}
              onRepeatChange={(count) => handleRepeatChange(sectionIndex, count)}
              onDelete={() => handleDeleteSection(sectionIndex)}
              onDuplicate={() => handleDuplicateSection(sectionIndex)}
              onMoveUp={() => handleMoveSection(sectionIndex, 'up')}
              onMoveDown={() => handleMoveSection(sectionIndex, 'down')}
              isFirst={sectionIndex === 0}
              isLast={sectionIndex === sections.length - 1}
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
