import { useState, useCallback, useRef, useEffect } from 'react';
import { Chord } from '@/lib/musicTheory';
import { getAudioContext, scheduleProgression, renderProgressionOffline, stopPlayback } from '@/lib/audioEngine';
import { encodeAndDownloadMp3 } from '@/lib/mp3Encoder';
import { ChordSelector } from '@/components/ChordSelector';
import { ChordTimeline } from '@/components/ChordTimeline';
import { TransportControls } from '@/components/TransportControls';
import { Music2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Chord Player - Main Application
 * 
 * A web-based chord progression editor with audio playback and WAV export.
 * Features continuous looping playback that resets on any modification.
 */
const Index = () => {
  // Chord progression state
  const [chords, setChords] = useState<Chord[]>([]);
  const [bpm, setBpm] = useState(120);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChordIndex, setCurrentChordIndex] = useState(-1);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);
  
  // Ref for cleanup and restart
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const shouldRestartRef = useRef(false);
  const chordsRef = useRef<Chord[]>([]);
  const bpmRef = useRef(120);
  const metronomeRef = useRef(true);
  
  // Keep refs in sync
  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);
  
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  
  useEffect(() => {
    metronomeRef.current = metronomeEnabled;
  }, [metronomeEnabled]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelPlaybackRef.current) {
        cancelPlaybackRef.current();
      }
    };
  }, []);
  
  // Start looping playback
  const startPlayback = useCallback(() => {
    if (chordsRef.current.length === 0) return;
    
    getAudioContext();
    setIsPlaying(true);
    setCurrentChordIndex(0);
    
    const { cancel } = scheduleProgression(
      chordsRef.current,
      bpmRef.current,
      (index) => setCurrentChordIndex(index),
      {
        loop: true,
        metronome: metronomeRef.current,
        onLoopEnd: () => {
          // Check if we need to restart with new chords/settings
          if (shouldRestartRef.current) {
            shouldRestartRef.current = false;
            // Will automatically start new loop with updated refs
          }
          setCurrentChordIndex(0);
        }
      }
    );
    
    cancelPlaybackRef.current = cancel;
  }, []);
  
  // Stop playback completely
  const stopPlaybackCompletely = useCallback(() => {
    if (cancelPlaybackRef.current) {
      cancelPlaybackRef.current();
      cancelPlaybackRef.current = null;
    }
    stopPlayback();
    setIsPlaying(false);
    setCurrentChordIndex(-1);
  }, []);
  
  // Handle changes during playback - restart from beginning
  const handleChangeWhilePlaying = useCallback(() => {
    if (isPlaying) {
      stopPlaybackCompletely();
      // Small delay to let audio context close, then restart
      setTimeout(() => {
        startPlayback();
      }, 50);
    }
  }, [isPlaying, stopPlaybackCompletely, startPlayback]);
  
  // Add a new chord
  const handleAddChord = useCallback((chord: Chord) => {
    setChords(prev => [...prev, chord]);
    toast.success(`Added ${chord.root}${chord.quality}`);
  }, []);
  
  // Effect to restart when chords change during playback
  useEffect(() => {
    if (isPlaying && chords.length > 0) {
      handleChangeWhilePlaying();
    } else if (isPlaying && chords.length === 0) {
      stopPlaybackCompletely();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chords]);
  
  // Restart on BPM or metronome change during playback
  useEffect(() => {
    if (isPlaying) {
      handleChangeWhilePlaying();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, metronomeEnabled]);
  
  // Delete a chord
  const handleDeleteChord = useCallback((index: number) => {
    setChords(prev => {
      const newChords = [...prev];
      const removed = newChords.splice(index, 1)[0];
      toast.info(`Removed ${removed.root}${removed.quality}`);
      return newChords;
    });
  }, []);
  
  // Reorder chords (drag and drop)
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setChords(prev => {
      const newChords = [...prev];
      const [removed] = newChords.splice(fromIndex, 1);
      newChords.splice(toIndex, 0, removed);
      return newChords;
    });
  }, []);
  
  // Play the progression
  const handlePlay = useCallback(() => {
    if (chords.length === 0) return;
    startPlayback();
  }, [chords.length, startPlayback]);
  
  // Stop playback
  const handleStop = useCallback(() => {
    stopPlaybackCompletely();
  }, [stopPlaybackCompletely]);
  
  // Reset to beginning
  const handleReset = useCallback(() => {
    handleStop();
    setCurrentChordIndex(-1);
  }, [handleStop]);
  
  // Export to WAV
  const handleExport = useCallback(async () => {
    if (chords.length === 0) return;
    
    setIsExporting(true);
    toast.info('Rendering audio...');
    
    try {
      const audioBuffer = await renderProgressionOffline(chords, bpm);
      toast.info('Creating WAV file...');
      await encodeAndDownloadMp3(audioBuffer, 'chord-progression.wav');
      toast.success('WAV exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [chords, bpm]);
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chord Player</h1>
              <p className="text-sm text-muted-foreground">Create chord progressions & export to WAV</p>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Transport Controls */}
        <TransportControls
          isPlaying={isPlaying}
          isExporting={isExporting}
          bpm={bpm}
          metronomeEnabled={metronomeEnabled}
          onPlay={handlePlay}
          onStop={handleStop}
          onReset={handleReset}
          onExport={handleExport}
          onBpmChange={setBpm}
          onMetronomeToggle={setMetronomeEnabled}
          hasChords={chords.length > 0}
        />
        
        {/* Timeline */}
        <ChordTimeline
          chords={chords}
          currentChordIndex={currentChordIndex}
          onReorder={handleReorder}
          onDelete={handleDeleteChord}
        />
        
        {/* Chord Selector */}
        <ChordSelector onAddChord={handleAddChord} />
      </main>
      
      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Built with Web Audio API • Drag chords to reorder • Loops continuously • Changes restart playback
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
