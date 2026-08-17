import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { analytics } from '@/lib/analytics';

type Status = 'idle' | 'sending' | 'sent' | 'error';
type EntryPoint = 'search_empty' | 'library';

// The event the vanilla search script on /songs/ dispatches to open this form pre-filled
// with a query that matched nothing. Going through a CustomEvent rather than having the
// script poke at React state keeps the two independent: the search works with this island
// absent, and this island works with the search absent.
export const OPEN_EVENT = 'suggest-song:open';

export interface OpenSuggestDetail {
  title?: string;
  searchTerm?: string;
}

// Handoff for the one case an event alone cannot cover: this island is client:idle, so a
// visitor who searches and clicks "Request this song" within the first moment can fire
// OPEN_EVENT before the listener exists, and the click would silently do nothing. The
// dispatcher also parks the detail here and hydration drains it. `window` rather than a
// shared module because the page script and the island are separate bundles with separate
// module instances.
declare global {
  interface Window {
    __pendingSongSuggestion?: OpenSuggestDetail;
  }
}

// Turns the /songs/ zero-result state into a demand signal. GA4 already records which
// searches found nothing (search_no_results), but only the term — this captures the artist
// the visitor actually meant, dedupes repeats into a count, and survives GA4's long-tail
// "(other)" bucketing. See supabase/migrations/20260818_song_requests.sql.
export default function SuggestSongForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const entryPoint = useRef<EntryPoint>('library');
  const searchTerm = useRef('');
  const titleInput = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openWith(detail: OpenSuggestDetail) {
      entryPoint.current = 'search_empty';
      searchTerm.current = detail.searchTerm ?? '';
      // Pre-filling the title with the failed query is the entire point of this entry
      // point: the visitor already typed the song name once.
      setTitle(detail.title ?? '');
      setStatus('idle');
      setOpen(true);
      analytics.songRequestOpened('search_empty');
      // The empty state that triggers this sits above the form, so without scrolling the
      // form can open off-screen and read as "the button did nothing".
      requestAnimationFrame(() => {
        wrapper.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        titleInput.current?.focus();
      });
    }

    function onOpen(event: Event) {
      // The dispatcher parks the same detail on window for the not-yet-hydrated case;
      // clear it here so an already-handled click can't be replayed on a later mount.
      delete window.__pendingSongSuggestion;
      openWith((event as CustomEvent<OpenSuggestDetail>).detail ?? {});
    }

    window.addEventListener(OPEN_EVENT, onOpen);

    // Drain a click that landed before this island hydrated.
    const pending = window.__pendingSongSuggestion;
    if (pending) {
      delete window.__pendingSongSuggestion;
      openWith(pending);
    }

    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  async function submit() {
    if (!title.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/suggest-song/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          note: note.trim(),
          searchTerm: searchTerm.current,
          entryPoint: entryPoint.current,
        }),
      });
      if (!res.ok) { setStatus('error'); return; }
      setStatus('sent');
      analytics.songRequested(entryPoint.current);
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div ref={wrapper} className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Thanks — request logged.</p>
        <p className="text-sm text-muted-foreground">
          Requests are worked through most-asked-for first. In the meantime you can build
          this one yourself in the <a href="/chord-player/" className="text-primary underline">free editor</a>.
        </p>
        <button
          type="button"
          onClick={() => { setTitle(''); setArtist(''); setNote(''); setStatus('idle'); }}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Suggest another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div ref={wrapper} className="mt-12">
        <button
          type="button"
          onClick={() => {
            entryPoint.current = 'library';
            searchTerm.current = '';
            setOpen(true);
            analytics.songRequestOpened('library');
            requestAnimationFrame(() => titleInput.current?.focus());
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          Can’t find a song? Suggest it
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapper} className="mt-12 rounded-xl border border-border bg-card p-5 max-w-lg">
      <h2 className="text-base font-bold text-foreground mb-1">Suggest a song</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Tell us what to chart next. No account needed.
      </p>

      <label htmlFor="suggest-title" className="block text-xs font-semibold text-foreground mb-1.5">
        Song title <span className="text-muted-foreground font-normal">(required)</span>
      </label>
      <input
        id="suggest-title"
        ref={titleInput}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="e.g. Holy Forever"
        className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 mb-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <label htmlFor="suggest-artist" className="block text-xs font-semibold text-foreground mb-1.5">
        Artist
      </label>
      <input
        id="suggest-artist"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        maxLength={120}
        placeholder="e.g. Chris Tomlin"
        className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 mb-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <label htmlFor="suggest-note" className="block text-xs font-semibold text-foreground mb-1.5">
        Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
      </label>
      <textarea
        id="suggest-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. the live version, or a specific key"
        className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || status === 'sending'}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {status === 'error' && (
          <span className="text-sm text-destructive">Couldn’t send — try again.</span>
        )}
      </div>
    </div>
  );
}
