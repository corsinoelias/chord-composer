import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Deleting a user requires the Auth Admin API, which requires the service-role key —
// that can never reach the browser, so this is the one place the deletion actually
// happens. The caller proves who they are with their own access token (verified below
// via getUser(token), not just decoded/trusted), so this can only ever delete the
// account making the request — never an arbitrary user id someone might pass in.
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Account deletion is not configured' }), { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing access token' }), { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: verifyError } = await adminClient.auth.getUser(token);
  if (verifyError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
