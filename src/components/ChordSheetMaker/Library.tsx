import { useEffect, useState } from 'react';
import { getMyChordSheets, getPublishedChordSheets, deleteChordSheet, type ChordSheet } from '@/lib/chordSheets';
import { ensureAuth } from '@/lib/supabase';

type Tab = 'mine' | 'public';

interface Props {
  onOpen: (sheet: ChordSheet) => void;
  onNew: () => void;
  onDuplicate: (sheet: ChordSheet) => void;
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

export function Library({ onOpen, onNew, onDuplicate, refreshToken }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [sheets, setSheets] = useState<ChordSheet[]>([]);
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
        const pub = await getPublishedChordSheets();
        if (!cancelled) { setSheets(pub); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [tab, refreshToken]);

  async function handleDelete(sheet: ChordSheet) {
    if (!window.confirm(`Delete "${sheet.title}"? This can't be undone.`)) return;
    const ok = await deleteChordSheet(sheet.id);
    if (ok) setSheets((prev) => prev.filter((s) => s.id !== sheet.id));
  }

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

        {!loading && sheets.length === 0 && (tab === 'public' || signedIn) && (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-sm text-muted-foreground">{tab === 'mine' ? "You haven't saved a chart yet." : 'Nothing published yet.'}</p>
          </div>
        )}

        {!loading && sheets.length > 0 && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sheets.map((sheet) => (
              tab === 'mine'
                ? (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    mine
                    onOpen={() => onOpen(sheet)}
                    onDuplicate={() => onDuplicate(sheet)}
                    onDelete={() => handleDelete(sheet)}
                  />
                )
                : (
                  <a key={sheet.id} href={`/chord-sheet-maker/${sheet.slug}/`} className="block">
                    <SheetCard sheet={sheet} mine={false} onOpen={() => {}} />
                  </a>
                )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
