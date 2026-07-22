import { useState, useEffect } from 'react';
import { PlaybackProvider } from '@/contexts/PlaybackContext';
import MetaStep from './MetaStep';
import LyricsStep from './LyricsStep';
import ChordStep from './ChordStep';
import TextModeStep from './TextModeStep';
import type { SongMeta, EditorSection } from './types';
import { sectionsToSongFormat, songSectionsToEditorSections } from './lyricsParser';
import { serializeToTextMode } from './textParser';
import { savePublicSong, updatePublicSong, upsertPublicSongBySlug, getPublicSongBySlug } from '@/lib/publicSongs';
import { SONGS } from '@/data/songs';
import { generateSlug } from '@/lib/musicKeys';
import { ensureAuth } from '@/lib/supabase';
import { AuthModal } from '@/components/AuthModal';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, AlignLeft, LayoutList } from 'lucide-react';

type Step = 'meta' | 'lyrics' | 'chords' | 'done';
type Mode = 'steps' | 'text';

const STEPS: { key: Step; label: string }[] = [
  { key: 'meta', label: 'Details' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'chords', label: 'Chords' },
];

const DEFAULT_META: SongMeta = {
  // 'pop_1' — a real MUSICAL_STYLES id, so the style picker shows an actual
  // selection for a brand-new song instead of the empty "Seleccionar estilo" placeholder.
  title: '', artist: '', album: '', key: 'C', capo: 0, bpm: 100, genre: [], style: 'pop_1',
};

function getParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function SongCreator() {
  const [step, setStep] = useState<Step>('meta');
  const [mode, setMode] = useState<Mode>('steps');
  const [meta, setMeta] = useState<SongMeta>(DEFAULT_META);
  const [rawLyrics, setRawLyrics] = useState('');
  const [sections, setSections] = useState<EditorSection[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState<string>('');
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingSections, setPendingSections] = useState<EditorSection[] | null>(null);

  useEffect(() => {
    const editSlugParam = getParam('edit');
    const fromStatic = getParam('from-static');

    if (editSlugParam) {
      // Load existing community song for editing
      setLoadingEdit(true);
      getPublicSongBySlug(editSlugParam).then(song => {
        if (!song) { toast.error('Song not found'); setLoadingEdit(false); return; }
        setEditId(song.id);
        setEditSlug(editSlugParam);
        setMeta({ title: song.title, artist: song.artist, album: song.album ?? '', key: song.key, capo: song.capo ?? 0, bpm: song.bpm, genre: song.genre, style: song.style });
        setSections(songSectionsToEditorSections(song.sections));
        setLoadingEdit(false);
        setStep('chords');
      });

    } else if (fromStatic) {
      // Load a static song (data/songs.ts) into the editor.
      // If a community version already exists, load that instead so the user
      // sees their previously published edits and we can update by ID (not upsert).
      const staticSong = SONGS.find(s => s.slug === fromStatic);
      if (!staticSong) { toast.error('Static song not found'); return; }

      setLoadingEdit(true);
      const communitySlug = generateSlug(staticSong.title, staticSong.artist);
      getPublicSongBySlug(communitySlug).then(existing => {
        if (existing) {
          setEditId(existing.id);
          setEditSlug(communitySlug);
          setMeta({ title: existing.title, artist: existing.artist, album: existing.album ?? '', key: existing.key, capo: existing.capo ?? 0, bpm: existing.bpm, genre: existing.genre, style: existing.style });
          setSections(songSectionsToEditorSections(existing.sections));
        } else {
          setMeta({
            title: staticSong.title,
            artist: staticSong.artist,
            album: staticSong.album ?? '',
            key: staticSong.key,
            capo: staticSong.capo ?? 0,
            bpm: staticSong.bpm,
            genre: staticSong.genre,
            style: staticSong.style,
          });
          setSections(songSectionsToEditorSections(staticSong.sections));
        }
        setLoadingEdit(false);
        setStep('chords');
      });
    }
  }, []);

  const stepIndex = STEPS.findIndex(s => s.key === step);

  function handleAuthSuccess() {
    if (!pendingSections) return;
    const sections = pendingSections;
    setPendingSections(null);
    handlePublish(sections);
  }

  function handleTextImport(parsedMeta: Partial<SongMeta>, parsedSections: EditorSection[]) {
    setMeta({
      title:  parsedMeta.title  ?? meta.title,
      artist: parsedMeta.artist ?? meta.artist,
      album:  parsedMeta.album  ?? meta.album,
      key:    parsedMeta.key    ?? meta.key,
      capo:   parsedMeta.capo   ?? meta.capo,
      bpm:    parsedMeta.bpm    ?? meta.bpm,
      genre:  parsedMeta.genre  ?? meta.genre,
      style:  parsedMeta.style  ?? meta.style,
    });
    setSections(parsedSections);
    setMode('steps');
    setStep('chords');
  }

  async function handlePublish(finalSections: EditorSection[]) {
    const userId = await ensureAuth();
    if (!userId) {
      setPendingSections(finalSections);
      setAuthModalOpen(true);
      return;
    }

    setIsPublishing(true);
    try {
      const songSections = sectionsToSongFormat(finalSections);

      if (editId) {
        // Update existing song
        const ok = await updatePublicSong(editId, {
          title: meta.title,
          artist: meta.artist,
          album: meta.album || undefined,
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
        setPublishedSlug(editSlug || getParam('edit') || '');
      } else {
        const slug = generateSlug(meta.title, meta.artist);
        const songPayload = {
          slug,
          title: meta.title,
          artist: meta.artist,
          album: meta.album || undefined,
          key: meta.key,
          capo: meta.capo || undefined,
          bpm: meta.bpm,
          style: meta.style,
          genre: meta.genre,
          tags: [...meta.genre],
          description: `${meta.title} by ${meta.artist} — interactive chord chart with lyrics. Key of ${meta.key}.`,
          relatedProgressions: [] as string[],
          sections: songSections,
          is_published: true,
        };

        // If coming from a static song, upsert by slug (update if exists, create if not)
        const isFromStatic = !!getParam('from-static');
        const saved = isFromStatic
          ? await upsertPublicSongBySlug(slug, songPayload)
          : await savePublicSong(songPayload);

        if (!saved) { toast.error('Failed to publish.'); return; }
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
            href={`/songs/${publishedSlug}/`}
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
      {/* Mode toggle — hidden once in chords step */}
      {step !== 'chords' && (
        <div className="flex items-center gap-1 mb-8 p-1 bg-muted/50 rounded-xl w-fit border border-border">
          {(['steps', 'text'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors
                ${mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {m === 'steps' ? <><LayoutList className="w-3.5 h-3.5" /> Step by step</> : <><AlignLeft className="w-3.5 h-3.5" /> From text</>}
            </button>
          ))}
        </div>
      )}

      {/* Text mode */}
      {mode === 'text' && (
        <TextModeStep
          initialText={serializeToTextMode(meta, sections)}
          onImport={handleTextImport}
          onBack={() => setMode('steps')}
        />
      )}

      {/* Step-by-step mode */}
      {mode === 'steps' && (
        <>
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
        </>
      )}

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
