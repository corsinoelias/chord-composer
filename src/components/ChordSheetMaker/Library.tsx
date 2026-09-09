import { useEffect, useMemo, useState } from 'react';
import { getMyChordSheets, getPublishedChordSheets, deleteChordSheet, type ChordSheet } from '@/lib/chordSheets';
import { getPublishedSongSummaries, type PublicSongSummary } from '@/lib/publicSongs';
import { normalizeForSearch } from '@/lib/searchText';
import { ensureAuth } from '@/lib/supabase';

type Tab = 'mine' | 'public';

interface Props {
  onOpen: (sheet: ChordSheet) => void;
  onNew: () => void;
  onDuplicate: (sheet: ChordSheet) => void;
  /** Forks a song from the Songs catalogue into a new editable sheet. Wired to
   *  ChordSheetMaker's seedFromSongSlug, the same function `?from=` links use. */
  onSeedSong: (slug: string) => void;
  /** Bumped by the caller after a save/delete so an already-fetched "mine" list refreshes. */
  refreshToken: number;
}

function SheetCard({ sheet, mine, onOpen, onDuplicate, onDelete }: {
  sheet: ChordSheet;
  mine: boolean;
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const chordCount = sheet.text.match(/\[[^\]]+\]/g)?.length ?? 0;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button type="button" onClick={onOpen} className="flex-1 cursor-pointer p-4 text-left">
        <p className="truncate font-serif text-base font-bold text-foreground">{sheet.title || 'Untitled'}</p>
        <p className="truncate text-xs text-muted-foreground">{sheet.artist || 'Unknown artist'}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">KEY {sheet.baseKey}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">{chordCount} chords</span>
          {mine && (
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide ${sheet.is_published ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {sheet.is_published ? 'Public' : 'Private'}
            </span>
          )}
        </div>
      </button>
      {mine && (
        <div className="flex gap-1.5 border-t border-border p-2.5">
          <button type="button" onClick={onOpen} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">Open</button>
          {onDuplicate && <button type="button" onClick={onDuplicate} className="rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-accent/40">Copy</button>}
          {onDelete && <button type="button" onClick={onDelete} className="rounded-lg border border-border px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Delete</button>}
        </div>
      )}
    </div>
  );
}

/** A song from the Songs catalogue, not a chart anyone made here. It deliberately does NOT
 *  link out to /songs/<slug>/ — clicking it forks the song into the visitor's own sheet,
 *  which is the only thing this screen is for. The chord count a SheetCard shows is
 *  missing on purpose: it would mean pulling every song's lyrics down to render a badge
 *  (see getPublishedSongSummaries). */
function SongCard({ song, onSeed }: { song: PublicSongSummary; onSeed: () => void }) {
  return (
    <button
      type="button"
      onClick={onSeed}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50"
    >
      <p className="truncate font-serif text-base font-bold text-foreground group-hover:text-primary">{song.title}</p>
      <p className="truncate text-xs text-muted-foreground">{song.artist || 'Unknown artist'}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">KEY {song.key}</span>
        {song.capo ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">CAPO {song.capo}</span>
        ) : null}
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-primary">SONG</span>
      </div>
      <span className="mt-3 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Start my own copy →
      </span>
    </button>
  );
}

export function Library({ onOpen, onNew, onDuplicate, onSeedSong, refreshToken }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [sheets, setSheets] = useState<ChordSheet[]>([]);
  const [songs, setSongs] = useState<PublicSongSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (tab === 'mine') {
        const userId = await ensureAuth();
        if (cancelled) return;
        setSignedIn(!!userId);
        if (!userId) { setSheets([]); setLoading(false); return; }
        const mine = await getMyChordSheets();
        if (!cancelled) { setSheets(mine); setLoading(false); }
      } else {
        // Both halves of the public shelf, fetched together: charts published here, and
        // the Songs catalogue. Without the second one this tab reads "Nothing published
        // yet" against a catalogue of 60+ songs sitting one table away.
        const [pub, cat] = await Promise.all([getPublishedChordSheets(), getPublishedSongSummaries()]);
        if (!cancelled) { setSheets(pub); setSongs(cat); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [tab, refreshToken]);

  // Same normalisation the songs index uses, so "Dont Stop" finds "Don't Stop" here too.
  const filteredSongs = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return songs;
    return songs.filter((s) => normalizeForSearch(`${s.title} ${s.artist}`).includes(q));
  }, [songs, query]);

  async function handleDelete(sheet: ChordSheet) {
    if (!window.confirm(`Delete "${sheet.title}"? This can't be undone.`)) return;
    const ok = await deleteChordSheet(sheet.id);
    if (ok) setSheets((prev) => prev.filter((s) => s.id !== sheet.id));
  }

  const gridClass = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">♪</div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-foreground">Chord Sheet Maker</div>
            <div className="text-[10px] tracking-wide text-muted-foreground">MY LIBRARY</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            + New song
          </button>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
          <button type="button" onClick={() => setTab('mine')} className={`rounded-md px-3.5 py-1.5 text-xs font-semibold ${tab === 'mine' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Mine</button>
          <button type="button" onClick={() => setTab('public')} className={`rounded-md px-3.5 py-1.5 text-xs font-semibold ${tab === 'public' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Public</button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-5 py-6">
        {loading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}

        {!loading && tab === 'mine' && signedIn === false && (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="mb-2 text-sm font-semibold text-foreground">Sign in to see your charts</p>
            <p className="text-sm text-muted-foreground">Your charts save to your account so they follow you between devices. Building a new one doesn't need an account — you're only asked to sign in when you save.</p>
          </div>
        )}

        {!loading && tab === 'mine' && signedIn && sheets.length === 0 && (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-sm text-muted-foreground">You haven't saved a chart yet.</p>
          </div>
        )}

        {!loading && tab === 'mine' && sheets.length > 0 && (
          <div className={gridClass}>
            {sheets.map((sheet) => (
              <SheetCard
                key={sheet.id}
                sheet={sheet}
                mine
                onOpen={() => onOpen(sheet)}
                onDuplicate={() => onDuplicate(sheet)}
                onDelete={() => handleDelete(sheet)}
              />
            ))}
          </div>
        )}

        {!loading && tab === 'public' && (
          <div className="flex flex-col gap-10">
            {sheets.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-bold text-foreground">Published charts</h2>
                <p className="mb-4 text-xs text-muted-foreground">Charts other people wrote here. Open one to read or print it.</p>
                <div className={gridClass}>
                  {sheets.map((sheet) => (
                    <a key={sheet.id} href={`/chord-sheet-maker/${sheet.slug}/`} className="block">
                      <SheetCard sheet={sheet} mine={false} onOpen={() => {}} />
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="mb-1 text-sm font-bold text-foreground">From the song catalogue</h2>
                  <p className="text-xs text-muted-foreground">
                    Pick a song and it opens as your own editable copy — change the key, cut the verses you don't play, print it.
                  </p>
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter songs…"
                  aria-label="Filter the song catalogue"
                  className="h-9 w-full max-w-[15rem] rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {filteredSongs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {songs.length === 0 ? "Couldn't load the song catalogue." : `Nothing matches “${query.trim()}”.`}
                </p>
              ) : (
                <div className={gridClass}>
                  {filteredSongs.map((song) => (
                    <SongCard key={song.id} song={song} onSeed={() => onSeedSong(song.slug)} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
