import type { Section } from './sections';
import type { InstrumentState } from './instruments';

/**
 * Local holding pen for a copy made from someone else's shared song.
 *
 * A visitor who forks a shared song has nowhere to put the result yet — there's no
 * local song store anymore (songStorage.ts is a pure shim over Supabase) and they may
 * not even have an account. The fork lives in React state, which survives the signup
 * modal (AuthModal calls onSuccess, it doesn't reload) but not a refresh. This is the
 * refresh insurance, and nothing more: once the copy is saved to the cloud the draft
 * is dropped.
 */

const KEY = 'chord-player-fork-draft-v1';

// Older than this and restoring it would feel like the editor is haunted rather than
// helpful — the visitor has long moved on.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ForkDraft {
  title: string;
  sections: Section[];
  bpm: number;
  styleId: string;
  transposition: number;
  metronomeEnabled: boolean;
  instruments: InstrumentState[];
  /** Id of the shared song this was copied from — kept for analytics/attribution only. */
  forkedFromId: string;
  savedAt: number;
}

export function saveForkDraft(draft: Omit<ForkDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Quota or private-mode failure — the draft is a convenience, never block the editor.
  }
}

export function loadForkDraft(): ForkDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ForkDraft;
    if (!draft?.sections?.length || typeof draft.savedAt !== 'number') return null;
    if (Date.now() - draft.savedAt > MAX_AGE_MS) {
      clearForkDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearForkDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Whether a stored draft should be offered on this page load. Only on the bare
 * /chord-player/ URL: any song id, ?data=, ?chords= or ?title= means the visitor
 * asked for something specific and restoring over it would hijack their intent.
 */
export function shouldRestoreForkDraft(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.includes('/chord-player/song_')) return false;
  const params = new URLSearchParams(window.location.search);
  return !params.get('data') && !params.get('chords') && !params.get('title');
}
