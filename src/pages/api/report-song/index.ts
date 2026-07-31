import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Public, unauthenticated — matches the site's low-friction ethos (publishing itself
// needs no review either, see SongCreator). Runs with the service-role key specifically
// so no RLS policy has to grant anonymous UPDATE on public_songs (which, since RLS can't
// scope by column, would also let anyone rewrite title/lyrics/chords on any published
// song — see the comment in supabase/migrations/20260731_add_composer_and_moderation.sql).
// This route is the only place report_* columns are ever written.
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Reporting is not configured' }), { status: 500 });
  }

  let body: { slug?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  if (!slug || !reason) {
    return new Response(JSON.stringify({ error: 'slug and reason are required' }), { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: fetchError } = await adminClient
    .from('public_songs')
    .select('id, report_count')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (fetchError) return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  if (!existing) return new Response(JSON.stringify({ error: 'Song not found' }), { status: 404 });

  const { error: updateError } = await adminClient
    .from('public_songs')
    .update({
      report_count: (existing.report_count ?? 0) + 1,
      reported_at: new Date().toISOString(),
      report_reason: reason,
    })
    .eq('id', existing.id);

  if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
