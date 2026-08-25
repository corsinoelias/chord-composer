import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Triage side of ../list-feedback: flips one row's status. Localhost-only + service-role,
// same as every other route under /api/admin.
//
// Unlike ../update-song (which takes an arbitrary `payload`), this accepts nothing but a
// status. There is no reason for review to rewrite what a reporter wrote, and a route that
// can't do it can't do it by accident.
const STATUSES = new Set(['new', 'triaged', 'done', 'wontfix']);

export const POST: APIRoute = async ({ request, url }) => {
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

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const status = typeof body.status === 'string' ? body.status : '';
  if (!id || !STATUSES.has(status)) {
    return new Response(JSON.stringify({ error: 'id and a valid status are required' }), { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await adminClient
    .from('feedback')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
