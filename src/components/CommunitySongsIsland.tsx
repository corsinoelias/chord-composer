import { useState, useEffect } from 'react';
import { getPublishedSongs } from '@/lib/publicSongs';
import type { PublicSong } from '@/lib/publicSongs';
import { Loader2, Plus } from 'lucide-react';

export default function CommunitySongsIsland() {
  const [songs, setSongs] = useState<PublicSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublishedSongs().then(data => {
      setSongs(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (songs.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-foreground">Community chord charts</h2>
        <a
          href="/songs/new/"
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add a song
        </a>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {songs.map(song => (
          <a
            key={song.id}
            href={`/songs/c/${song.slug}/`}
            className="group flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors truncate">
                  {song.title}
                </h3>
                <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
              </div>
              <svg className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-border/50">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Key: {song.key}
              </span>
              {song.capo && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  Capo {song.capo}
                </span>
              )}
              {song.genre.slice(0, 2).map(g => (
                <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">
                  {g}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
