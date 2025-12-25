import { useState, useCallback, useRef, useEffect } from 'react';
import { Chord } from '@/lib/musicTheory';
import { Section, createSection, expandSectionsToChords, getSectionDisplayName } from '@/lib/sections';
import { getDefaultInstrumentStates, InstrumentState } from '@/lib/instruments';
import { getAudioContext, scheduleProgression, renderProgressionOffline, stopPlayback } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { ChordSelector } from '@/components/ChordSelector';
import { SectionCard } from '@/components/SectionCard';
import { TransportControls } from '@/components/TransportControls';
import { ChordEditModal } from '@/components/ChordEditModal';
import { InstrumentsPanel } from '@/components/InstrumentsPanel';
import { Button } from '@/components/ui/button';
import { Music2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  // Sections state (replaces simple chords array)
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
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [instrumentsPanelOpen, setInstrumentsPanelOpen] = useState(false);
  
  // Refs
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  const bpmRef = useRef(120);
  const metronomeRef = useRef(true);
  
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metronomeRef.current = metronomeEnabled; }, [metronomeEnabled]);
  
  useEffect(() => {
    return () => { cancelPlaybackRef.current?.(); };
  }, []);

  const getAllChords = useCallback(() => expandSectionsToChords(sectionsRef.current), []);

  const startPlayback = useCallback(() => {
    const allChords = getAllChords();
    if (allChords.length === 0) return;
    
    getAudioContext();
    setIsPlaying(true);
    setCurrentChordIndex(0);
    
    const { cancel } = scheduleProgression(allChords, bpmRef.current, setCurrentChordIndex, {
      loop: true,
      metronome: metronomeRef.current,
      onLoopEnd: () => setCurrentChordIndex(0),
    });
    
    cancelPlaybackRef.current = cancel;
  }, [getAllChords]);

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
    setActiveSectionIndex(sections.length);
  };

  const handleDeleteSection = (index: number) => {
    if (sections.length === 1) {
      toast.error('Cannot delete the only section');
      return;
    }
    setSections(prev => prev.filter((_, i) => i !== index));
    if (activeSectionIndex >= index && activeSectionIndex > 0) {
      setActiveSectionIndex(prev => prev - 1);
    }
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
    setSections(prev => prev.map((s, i) => i === activeSectionIndex ? { ...s, chords: [...s.chords, chord] } : s));
    toast.success(`Added ${chord.root}${chord.accidental}${chord.quality}`);
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

  // Restart on changes
  useEffect(() => {
    const allChords = expandSectionsToChords(sections);
    if (isPlaying && allChords.length > 0) handleChangeWhilePlaying();
    else if (isPlaying && allChords.length === 0) stopPlaybackCompletely();
  }, [sections]);

  useEffect(() => {
    if (isPlaying) handleChangeWhilePlaying();
  }, [bpm, metronomeEnabled, selectedStyleId]);

  const handleExport = useCallback(async () => {
    const allChords = expandSectionsToChords(sections);
    if (allChords.length === 0) return;
    
    setIsExporting(true);
    toast.info('Rendering audio...');
    
    try {
      const audioBuffer = await renderProgressionOffline(allChords, bpm);
      await encodeAndDownloadMp3(audioBuffer, 'chord-progression.wav');
      toast.success('WAV exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [sections, bpm]);

  const hasChords = sections.some(s => s.chords.length > 0);

  // Calculate global chord offset for each section
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
              onAddChord={() => setActiveSectionIndex(sectionIndex)}
              onChordClick={(chordIndex) => handleChordClick(sectionIndex, chordIndex)}
              onChordDelete={(chordIndex) => handleChordDelete(sectionIndex, chordIndex)}
              onReorder={(from, to) => handleChordReorder(sectionIndex, from, to)}
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

        <ChordSelector onAddChord={handleAddChord} />
      </main>

      <ChordEditModal
        chord={editingChord?.chord || null}
        open={!!editingChord}
        onClose={() => setEditingChord(null)}
        onSave={handleChordSave}
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
