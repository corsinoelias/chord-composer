import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Same localhost-only + service-role pattern as ../list-reported — no admin/role system
// exists in this app, so review happens by running the site locally.
//
// This is the read side of the song-request feature. It exists so the requests are an
// actual worklist and not a table that silently fills up: ordered most-requested first,
// which is the order the next charts should be built in.
export const GET: APIRoute = async ({ url }) => {
  const host = url.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not set in .env' }),
      { status: 500 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // `status` is accepted as a query param so a triaged row can still be looked up later;
  // it defaults to the open worklist.
  const status = url.searchParams.get('status') ?? 'new';

  let query = adminClient
    .from('song_requests')
    .select('id, title, artist, note, search_term, entry_point, request_count, status, created_at, updated_at')
    .order('request_count', { ascending: false })
    .order('updated_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ requests: data ?? [] }), { status: 200 });
};
