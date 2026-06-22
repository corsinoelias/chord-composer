import { useState, useCallback } from 'react';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { Play } from 'lucide-react';

interface InversionDemoProps {
  chord: string;
  root: string;    // "C E G"
  first: string;   // "E G C"
  second: string;  // "G C E"
  third?: string;  // "B C E G" — seventh chords only
}

const NOTE_SEMI: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function assignMidi(notes: string[]): number[] {
  let octave = 4;
  let prevSemi = -1;
  return notes.map(note => {
    const semi = NOTE_SEMI[note] ?? 0;
    if (prevSemi !== -1 && semi <= prevSemi) octave++;
    prevSemi = semi;
    return (octave + 1) * 12 + semi;
  });
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playChord(notes: string[]) {
  try {
    const ctx = new AudioContext();
    const midiNotes = assignMidi(notes);
    midiNotes.forEach(midi => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(midi);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.setTargetAtTime(0.001, now + 0.08, 0.6);
      osc.start(now);
      osc.stop(now + 2.5);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch {
    // AudioContext not available (SSR)
  }
}

const LABELS = ['Root Position', 'First Inversion', 'Second Inversion', 'Third Inversion'];

const BADGE_STYLES = [
  'bg-sky-500/10 text-sky-400 border-sky-500/30',
  'bg-violet-500/10 text-violet-400 border-violet-500/30',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'bg-orange-500/10 text-orange-400 border-orange-500/30',
];

interface CardProps {
  notes: string[];
  positionIndex: number;
}

function InversionCard({ notes, positionIndex }: CardProps) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    playChord(notes);
    setTimeout(() => setPlaying(false), 2000);
  }, [notes]);

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col items-center gap-3 p-4">
      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${BADGE_STYLES[positionIndex]}`}>
        {LABELS[positionIndex]}
      </span>

      <div className="flex items-center gap-1 font-mono text-sm font-bold">
        {notes.map((n, i) => (
          <span key={`${n}-${i}`} className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded border ${i === 0 ? 'bg-primary/20 text-primary border-primary/40' : 'bg-muted text-foreground border-border'}`}>
              {n}
            </span>
            {i < notes.length - 1 && (
              <span className="text-muted-foreground text-xs">–</span>
            )}
          </span>
        ))}
      </div>

      <PianoKeyboard activeNotes={notes} className="w-full" />

      <p className="text-xs text-muted-foreground">
        Bass: <span className="font-semibold text-foreground">{notes[0]}</span>
      </p>

      <button
        onClick={handlePlay}
        disabled={playing}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        <Play className="w-3.5 h-3.5" />
        {playing ? 'Playing…' : 'Play'}
      </button>
    </div>
  );
}

export default function InversionDemo({ chord, root, first, second, third }: InversionDemoProps) {
  const positions = [root, first, second, ...(third ? [third] : [])].map(s =>
    s.trim().split(/\s+/),
  );
  const cols = positions.length === 4
    ? 'grid-cols-2 sm:grid-cols-4'
    : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div className="not-prose my-6">
      {chord && (
        <p className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {chord}
        </p>
      )}
      <div className={`grid gap-3 ${cols}`}>
        {positions.map((notes, i) => (
          <InversionCard key={i} notes={notes} positionIndex={i} />
        ))}
      </div>
    </div>
  );
}
