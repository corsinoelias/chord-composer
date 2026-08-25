import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Same localhost-only + service-role pattern as ../list-reported and
// ../list-song-requests — no admin/role system exists in this app, so review happens by
// running the site locally.
//
// This is the read side of the feedback widget. It exists so reports are an actual
// worklist and not a table that silently fills up: newest open first, since unlike song
// requests there is nothing to rank by (a bug reported once is still a bug).
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
  const kind = url.searchParams.get('kind');

  let query = adminClient
    .from('feedback')
    .select('id, kind, message, reply_email, user_id, page_url, user_agent, viewport, context, entry_point, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status !== 'all') query = query.eq('status', status);
  if (kind && kind !== 'all') query = query.eq('kind', kind);

  const { data, error } = await query;

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ feedback: data ?? [] }), { status: 200 });
};
