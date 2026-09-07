import { useState, useCallback, useEffect } from 'react';
import { Play, Square, Download, FileMusic } from 'lucide-react';
import { ICONIC_SONGS, type IconicSong } from '@/data/iconicSongs';
import { playProgression, stopProgression, displayChordName } from '@/lib/progressionPreview';
import { downloadProgressionMidi, downloadProgressionWav } from '@/lib/progressionExport';

export default function IconicSongProgressions() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => () => { stopProgression(); }, []);

  const togglePlay = useCallback((song: IconicSong) => {
    if (playingId === song.id) {
      stopProgression();
      setPlayingId(null);
      setActiveStep(null);
      return;
    }
    setPlayingId(song.id);
    setActiveStep(0);
    playProgression(song.progression, song.bpm, { owner: song.id, onStep: setActiveStep });
  }, [playingId]);

  const exportWav = useCallback(async (song: IconicSong) => {
    setExportingId(song.id);
    try {
      await downloadProgressionWav(song.progression, song.title, song.bpm, song.style);
    } finally {
      setExportingId(null);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {ICONIC_SONGS.map((song) => {
        const isPlayingThis = playingId === song.id;

        return (
          <div
            key={song.id}
            className={`flex flex-col justify-between rounded-2xl border bg-card p-5 transition-colors ${
              isPlayingThis ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'
            }`}
          >
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                  {song.genre}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  Key: <strong className="text-primary">{displayChordName(song.key)}</strong> · {song.bpm} BPM
                </span>
              </div>

              <h3 className="font-serif text-lg font-bold text-foreground">{song.title}</h3>
              <p className="-mt-0.5 mb-4 text-xs text-muted-foreground">{song.artist}</p>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {song.progression.map((chord, i) => {
                  const stepActive = isPlayingThis && activeStep === i;
                  return (
                    <div
                      key={`${song.id}-${chord}-${i}`}
                      className={`rounded-xl border px-2.5 py-1.5 text-center transition-colors ${
                        stepActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-muted/50 text-foreground'
                      }`}
                    >
                      <span className={`block font-mono text-[9px] font-bold ${
                        stepActive ? 'text-primary-foreground/70' : 'text-primary'
                      }`}>
                        {song.romanNumerals[i] ?? ''}
                      </span>
                      <span className="font-mono text-xs font-bold">{displayChordName(chord)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <button
                onClick={() => togglePlay(song)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isPlayingThis
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isPlayingThis
                  ? (<><Square className="h-3.5 w-3.5 fill-current" /><span>Stop</span></>)
                  : (<><Play className="h-3.5 w-3.5 fill-current" /><span>Play</span></>)}
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => downloadProgressionMidi(song.progression, song.title, song.bpm)}
                  title="Download standard MIDI file of this song"
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-secondary"
                >
                  <Download className="h-3 w-3 text-primary" />
                  <span>MIDI</span>
                </button>
                <button
                  onClick={() => exportWav(song)}
                  disabled={exportingId === song.id}
                  title="Download high-resolution WAV audio stem"
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  <FileMusic className="h-3 w-3 text-primary" />
                  <span>{exportingId === song.id ? '…' : 'WAV'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
