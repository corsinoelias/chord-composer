import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// Public and unauthenticated, same as ../report-song and ../suggest-song and for the same
// reason: nothing on this site needs an account until you want to save your own work, and
// a login wall in front of "this is broken" would collect reports from the small minority
// of visitors least likely to hit a first-run bug. See the note at the top of
// supabase/migrations/20260826_feedback.sql.
//
// Runs with the service-role key so no RLS policy has to grant anonymous writes on a table
// whose rows hold a reply-to address and free text.

const MAX_MESSAGE = 2000;
const MAX_EMAIL = 200;
const MAX_URL = 500;
const MAX_USER_AGENT = 400;
const MIN_MESSAGE = 10;

const KINDS = new Set(['bug', 'idea', 'other']);

// Not RFC-complete on purpose — this only has to reject obvious typos so the reporter
// finds out now rather than by never hearing back. Anything shaped like an address is
// accepted; the field is a reply-to hint, not an identity.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort per-IP throttle. Netlify runs this as a serverless function, so the Map
// lives per warm instance and a determined flooder spread across cold starts gets more
// than LIMIT through — that is fine. This exists to stop a stuck retry loop or a bored
// visitor hammering the button from filling the table, not to stop an attacker, who has
// nothing to gain here. Entries are pruned on write so the Map cannot grow unbounded.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
  const recent = hits.get(ip) ?? [];
  if (recent.length >= LIMIT) return true;
  hits.set(ip, [...recent, now]);
  return false;
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// `context` is client-supplied and jsonb has no length limit of its own, so an oversized
// blob would land in the table verbatim. Dropped whole rather than truncated: half a JSON
// object is not parseable, and context is a diagnostic bonus — never a reason to lose the
// report it came with.
const MAX_CONTEXT_BYTES = 2000;

function boundedContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > MAX_CONTEXT_BYTES) return null;
    return value as Record<string, unknown>;
  } catch {
    // Circular or otherwise unserializable — the caller sent something it shouldn't have.
    return null;
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Feedback is not configured' }), { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  // Honeypot: a field hidden from humans that only a form-filling bot completes. Answered
  // with a 200 rather than an error so the bot has no signal to adapt to — it "worked".
  if (str(body.website, 50)) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const message = str(body.message, MAX_MESSAGE);
  if (message.length < MIN_MESSAGE) {
    return new Response(
      JSON.stringify({ error: `Please describe it in at least ${MIN_MESSAGE} characters.` }),
      { status: 400 },
    );
  }

  const replyEmail = str(body.replyEmail, MAX_EMAIL);
  if (replyEmail && !EMAIL_SHAPE.test(replyEmail)) {
    return new Response(JSON.stringify({ error: "That email doesn't look right." }), { status: 400 });
  }

  // clientAddress throws on a prerendered route; this one is server-rendered, but the
  // throttle is a nicety and must never be the reason a real report is lost.
  let ip = 'unknown';
  try {
    ip = clientAddress || 'unknown';
  } catch {
    /* no address available — fall through unthrottled */
  }
  if (ip !== 'unknown' && rateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Thanks — you have sent a few already. Try again in a bit.' }),
      { status: 429 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The user id is resolved from the caller's own access token, never taken from the body:
  // a client-supplied user_id would let anyone attribute a report to any account. The
  // header is absent for signed-out reporters, which is the expected case.
  let userId: string | null = null;
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    const { data } = await adminClient.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  const { error } = await adminClient.from('feedback').insert({
    kind: KINDS.has(body.kind as string) ? (body.kind as string) : 'other',
    message,
    reply_email: replyEmail || null,
    user_id: userId,
    page_url: str(body.pageUrl, MAX_URL) || null,
    user_agent: str(request.headers.get('user-agent'), MAX_USER_AGENT) || null,
    viewport: str(body.viewport, 20) || null,
    context: boundedContext(body.context),
    entry_point: str(body.entryPoint, 40) || null,
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
