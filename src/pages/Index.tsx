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
 * A web-based chord progression editor with audio playback and MP3 export.
 */
const Index = () => {
  // Chord progression state
  const [chords, setChords] = useState<Chord[]>([]);
  const [bpm, setBpm] = useState(120);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChordIndex, setCurrentChordIndex] = useState(-1);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);
  
  // Ref for cleanup
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const playbackTimeoutRef = useRef<number | null>(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelPlaybackRef.current) {
        cancelPlaybackRef.current();
      }
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
    };
  }, []);
  
  // Add a new chord
  const handleAddChord = useCallback((chord: Chord) => {
    setChords(prev => [...prev, chord]);
    toast.success(`Added ${chord.root}${chord.quality}`);
  }, []);
  
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
    
    // Initialize audio context (requires user interaction)
    getAudioContext();
    
    setIsPlaying(true);
    setCurrentChordIndex(0);
    
    // Schedule the progression
    const { duration, cancel } = scheduleProgression(chords, bpm, (index) => {
      setCurrentChordIndex(index);
    });
    
    cancelPlaybackRef.current = cancel;
    
    // Auto-stop after progression completes
    playbackTimeoutRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      setCurrentChordIndex(-1);
      cancelPlaybackRef.current = null;
    }, duration * 1000 + 100);
  }, [chords, bpm]);
  
  // Stop playback
  const handleStop = useCallback(() => {
    if (cancelPlaybackRef.current) {
      cancelPlaybackRef.current();
      cancelPlaybackRef.current = null;
    }
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    stopPlayback();
    setIsPlaying(false);
    setCurrentChordIndex(-1);
  }, []);
  
  // Reset to beginning
  const handleReset = useCallback(() => {
    handleStop();
    setCurrentChordIndex(-1);
  }, [handleStop]);
  
  // Export to MP3
  const handleExport = useCallback(async () => {
    if (chords.length === 0) return;
    
    setIsExporting(true);
    toast.info('Rendering audio...');
    
    try {
      // Render the progression offline
      const audioBuffer = await renderProgressionOffline(chords, bpm);
      
      toast.info('Encoding MP3...');
      
      // Encode to MP3 and download
      await encodeAndDownloadMp3(audioBuffer, 'chord-progression.mp3');
      
      toast.success('MP3 exported successfully!');
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
              <p className="text-sm text-muted-foreground">Create chord progressions & export to MP3</p>
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
          onPlay={handlePlay}
          onStop={handleStop}
          onReset={handleReset}
          onExport={handleExport}
          onBpmChange={setBpm}
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
            Built with Web Audio API • Drag chords to reorder • Click × to delete
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
