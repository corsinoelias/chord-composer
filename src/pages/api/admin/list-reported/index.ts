import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Same localhost-only + service-role pattern as ../update-song — no admin/role system
// exists in this app, so review happens by running the site locally.
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

  const { data, error } = await adminClient
    .from('public_songs')
    .select('id, slug, title, artist, composer_name, is_published, report_count, reported_at, report_reason')
    .gt('report_count', 0)
    .order('reported_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ songs: data ?? [] }), { status: 200 });
};
