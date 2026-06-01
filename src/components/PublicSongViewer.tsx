import { useState, useEffect } from 'react';
import { PlaybackProvider } from '@/contexts/PlaybackContext';
import { getPublicSongBySlug } from '@/lib/publicSongs';
import type { PublicSong } from '@/lib/publicSongs';
import SongChordPlayer from '@/components/SongChordPlayer';
import type { Song } from '@/data/songs';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Pencil } from 'lucide-react';

function slugFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] ?? '';
}

function toSong(pub: PublicSong): Song {
  return {
    slug: pub.slug,
    title: pub.title,
    artist: pub.artist,
    album: pub.album,
    year: pub.year,
    genre: pub.genre,
    key: pub.key,
    capo: pub.capo,
    bpm: pub.bpm,
    style: pub.style,
    description: pub.description,
    tags: pub.tags,
    relatedProgressions: pub.relatedProgressions,
    sections: pub.sections,
  };
}

export default function PublicSongViewer() {
  const [song, setSong] = useState<PublicSong | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const slug = slugFromPath();
    if (!slug || slug === 'c') { setNotFound(true); setLoading(false); return; }
    getPublicSongBySlug(slug).then(async data => {
      if (data) {
        setSong(data);
        // Check if current user is the creator
        if (supabase && data.created_by) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id === data.created_by) setCanEdit(true);
        }
      } else {
        setNotFound(true);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !song) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold text-foreground mb-2">Song not found</h1>
        <p className="text-muted-foreground mb-6">This chord chart doesn't exist or has been removed.</p>
        <a href="/songs/" className="text-sm text-primary hover:underline">← All songs</a>
      </div>
    );
  }

  const allChords = song.sections.flatMap(s =>
    s.lines.flatMap(line => {
      const matches = line.match(/\[([^\]]+)\]/g) ?? [];
      return matches.map(m => m.slice(1, -1));
    })
  );
  const uniqueChords = [...new Set(allChords)];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
      {/* Edit button for the creator */}
      {canEdit && (
        <div className="flex justify-end mb-4">
          <a
            href={`/songs/new/?edit=${song!.slug}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:border-primary/40"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit song
          </a>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
        <a href="/" className="hover:text-foreground transition-colors">Home</a>
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        <a href="/songs/" className="hover:text-foreground transition-colors">Songs</a>
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        <span className="text-foreground truncate">{song.title}</span>
      </nav>

      {/* Info hint */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <p className="text-xs text-muted-foreground">
          Press <strong className="text-foreground">Play song</strong> to hear the chords.
          The active chord highlights above the lyrics in real time.
        </p>
      </div>

      {/* Player */}
      <PlaybackProvider>
        <SongChordPlayer song={toSong(song)} />
      </PlaybackProvider>

      {/* Chord summary */}
      {uniqueChords.length > 0 && (
        <div className="mt-10 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Chords used
          </h2>
          <div className="flex flex-wrap gap-2">
            {uniqueChords.map(chord => (
              <span key={chord} className="text-sm font-bold font-mono px-3 py-1.5 rounded-lg border border-border bg-background text-foreground">
                {chord}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
        <h2 className="text-base font-semibold text-foreground mb-1">Build your own chord progression</h2>
        <p className="text-sm text-muted-foreground mb-4">Take any of these chords and create something new.</p>
        <a href="/app/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-sm">
          Open Chord Player →
        </a>
      </div>

      <div className="mt-8 text-center">
        <a href="/songs/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← All chord charts
        </a>
      </div>
    </div>
  );
}
