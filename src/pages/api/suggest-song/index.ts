import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { normalizeForSearch } from '@/lib/searchText';

// Public and unauthenticated, same as ../report-song and for the same reason: the site's
// whole ethos is that nothing needs an account until you want to save your own work, and a
// login wall in front of "the song I wanted isn't here" would collect nothing.
//
// Runs with the service-role key so no RLS policy has to grant anonymous writes on
// song_requests — see the long note in supabase/migrations/20260818_song_requests.sql for
// why an anon policy can't express "insert, or increment this one counter".
const MAX_TITLE = 120;
const MAX_ARTIST = 120;
const MAX_NOTE = 500;

export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Song requests are not configured' }), { status: 500 });
  }

  let body: { title?: string; artist?: string; note?: string; searchTerm?: string; entryPoint?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : '';
  const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, MAX_ARTIST) : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';
  const searchTerm = typeof body.searchTerm === 'string' ? body.searchTerm.trim().slice(0, MAX_TITLE) : '';
  const entryPoint = body.entryPoint === 'search_empty' ? 'search_empty' : 'library';

  if (!title) {
    return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });
  }

  // Same normalizer the search box uses, so a request dedupes against itself the way a
  // visitor would expect ("Wonderwáll  Oasis" === "wonderwall oasis").
  const dedupeKey = normalizeForSearch(`${title} ${artist}`);
  if (!dedupeKey) {
    return new Response(JSON.stringify({ error: 'title must contain letters or numbers' }), { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Select-then-write rather than a single upsert: PostgREST's upsert can't express
  // "request_count = request_count + 1", and the counter is the reason this table is
  // useful. Same two-step shape as ../report-song. A race between two requests for the
  // same song loses at most one increment, which does not change any decision this data
  // informs.
  const { data: existing, error: fetchError } = await adminClient
    .from('song_requests')
    .select('id, request_count, search_term')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (fetchError) return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });

  if (existing) {
    const { error } = await adminClient
      .from('song_requests')
      .update({
        request_count: (existing.request_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
        // A repeat request re-opens a rejected/done row: the second person asking is new
        // information, not a duplicate of the decision to skip it.
        status: 'new',
        // Backfill only. Whoever requested this from the library entry point left
        // search_term empty, and a later request from the zero-result state carries the
        // words someone actually typed looking for it — the most useful field on the row,
        // and it would otherwise be dropped for good. Never overwrites an existing value:
        // the first real query is as good as the second and doesn't deserve to be lost.
        ...(!existing.search_term && searchTerm ? { search_term: searchTerm } : {}),
      })
      .eq('id', existing.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, deduped: true }), { status: 200 });
  }

  const { error } = await adminClient.from('song_requests').insert({
    dedupe_key: dedupeKey,
    title,
    artist: artist || null,
    note: note || null,
    search_term: searchTerm || null,
    entry_point: entryPoint,
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, deduped: false }), { status: 200 });
};
