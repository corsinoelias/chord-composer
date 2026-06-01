import { useState, useEffect } from 'react';
import { PlaybackProvider } from '@/contexts/PlaybackContext';
import MetaStep from './MetaStep';
import LyricsStep from './LyricsStep';
import ChordStep from './ChordStep';
import type { SongMeta, EditorSection } from './types';
import { sectionsToSongFormat, songSectionsToEditorSections } from './lyricsParser';
import { savePublicSong, updatePublicSong, isSlugTaken, getPublicSongBySlug } from '@/lib/publicSongs';
import { SONGS } from '@/data/songs';
import { generateSlug } from '@/lib/musicKeys';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'meta' | 'lyrics' | 'chords' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'meta', label: 'Details' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'chords', label: 'Chords' },
];

const DEFAULT_META: SongMeta = {
  title: '', artist: '', key: 'C', capo: 0, bpm: 100, genre: [], style: 'pop_basic',
};

function getParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function SongCreator() {
  const [step, setStep] = useState<Step>('meta');
  const [meta, setMeta] = useState<SongMeta>(DEFAULT_META);
  const [rawLyrics, setRawLyrics] = useState('');
  const [sections, setSections] = useState<EditorSection[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  useEffect(() => {
    const editSlug = getParam('edit');
    const fromStatic = getParam('from-static');

    if (editSlug) {
      // Load existing community song for editing
      setLoadingEdit(true);
      getPublicSongBySlug(editSlug).then(song => {
        if (!song) { toast.error('Song not found'); setLoadingEdit(false); return; }
        setEditId(song.id);
        setMeta({ title: song.title, artist: song.artist, key: song.key, capo: song.capo ?? 0, bpm: song.bpm, genre: song.genre, style: song.style });
        setSections(songSectionsToEditorSections(song.sections));
        setLoadingEdit(false);
        setStep('chords');
      });

    } else if (fromStatic) {
      // Load a static song (data/songs.ts) into the editor
      const staticSong = SONGS.find(s => s.slug === fromStatic);
      if (!staticSong) { toast.error('Static song not found'); return; }
      setMeta({
        title: staticSong.title,
        artist: staticSong.artist,
        key: staticSong.key,
        capo: staticSong.capo ?? 0,
        bpm: staticSong.bpm,
        genre: staticSong.genre,
        style: staticSong.style,
      });
      setSections(songSectionsToEditorSections(staticSong.sections));
      setStep('chords');
    }
  }, []);

  const stepIndex = STEPS.findIndex(s => s.key === step);

  async function handlePublish(finalSections: EditorSection[]) {
    setIsPublishing(true);
    try {
      const songSections = sectionsToSongFormat(finalSections);

      if (editId) {
        // Update existing song
        const ok = await updatePublicSong(editId, {
          title: meta.title,
          artist: meta.artist,
          key: meta.key,
          capo: meta.capo || undefined,
          bpm: meta.bpm,
          style: meta.style,
          genre: meta.genre,
          tags: [...meta.genre],
          description: `${meta.title} by ${meta.artist} — interactive chord chart with lyrics. Key of ${meta.key}.`,
          sections: songSections,
        });
        if (!ok) { toast.error('Failed to update song.'); return; }
        setPublishedSlug(getParam('edit') ?? '');
      } else {
        // Create new song
        let slug = generateSlug(meta.title, meta.artist);
        if (await isSlugTaken(slug)) slug = `${slug}-${Date.now()}`;

        const saved = await savePublicSong({
          slug,
          title: meta.title,
          artist: meta.artist,
          key: meta.key,
          capo: meta.capo || undefined,
          bpm: meta.bpm,
          style: meta.style,
          genre: meta.genre,
          tags: [...meta.genre],
          description: `${meta.title} by ${meta.artist} — interactive chord chart with lyrics. Key of ${meta.key}.`,
          relatedProgressions: [],
          sections: songSections,
          is_published: true,
        });
        if (!saved) { toast.error('Failed to publish. Make sure you are logged in.'); return; }
        setPublishedSlug(slug);
      }

      setStep('done');
    } finally {
      setIsPublishing(false);
    }
  }

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Song published!</h2>
        <p className="text-muted-foreground mb-8 max-w-sm">
          <strong className="text-foreground">{meta.title}</strong> is now live on Chord Sequence.
        </p>
        <div className="flex gap-3">
          <a
            href={`/songs/c/${publishedSlug}/`}
            className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            View song →
          </a>
          <button
            onClick={() => { setStep('meta'); setMeta(DEFAULT_META); setRawLyrics(''); setSections([]); }}
            className="px-6 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Add another song
          </button>
        </div>
        <a href="/songs/" className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to all songs
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Step indicator */}
      <nav className="flex items-center gap-0 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-2 text-sm font-medium transition-colors
              ${i < stepIndex ? 'text-primary cursor-pointer' : i === stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => i < stepIndex && setStep(s.key)}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${i < stepIndex ? 'bg-primary text-primary-foreground' : i === stepIndex ? 'bg-primary/10 text-primary border border-primary/40' : 'bg-muted text-muted-foreground'}`}>
                {i < stepIndex ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px mx-2 ${i < stepIndex ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </nav>

      {step === 'meta' && (
        <MetaStep meta={meta} onChange={setMeta} onNext={() => setStep('lyrics')} />
      )}
      {step === 'lyrics' && (
        <LyricsStep
          initialText={rawLyrics}
          onNext={(parsed, raw) => { setSections(parsed); setRawLyrics(raw); setStep('chords'); }}
          onBack={() => setStep('meta')}
        />
      )}
      {step === 'chords' && (
        <PlaybackProvider>
          <ChordStep
            sections={sections}
            meta={meta}
            onMetaChange={setMeta}
            onBack={() => setStep('lyrics')}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isEditMode={!!editId}
          />
        </PlaybackProvider>
      )}
    </div>
  );
}
