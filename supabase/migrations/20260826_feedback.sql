-- Feedback and bug reports.
--
-- Deliberately NOT login-gated. Two of the three apps in this repo (the bass tab player,
-- the standalone tools) never touch Supabase at all, and the chord editor is fully usable
-- signed out — a login wall in front of "this is broken" would collect reports from the
-- small minority of visitors least likely to hit a first-run bug. `user_id` is therefore
-- nullable and is resolved SERVER-SIDE from the caller's own access token when they
-- happen to be signed in (see src/pages/api/feedback), never read from the request body.
--
-- `on delete set null` rather than cascade: a bug report outlives the account that filed
-- it. Deleting the account should drop the link to the person, not the knowledge that the
-- bug exists. (progressions.user_id cascades — the opposite choice, and the right one
-- there, since a deleted account's songs are nobody's.)

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'bug' check (kind in ('bug', 'idea', 'other')),
  message text not null,
  -- Optional and separate from auth.users.email: an anonymous reporter can leave an
  -- address to be replied to, and a signed-in one may want replies somewhere else. Not
  -- unique, not verified — it is a reply-to hint, not an identity.
  reply_email text,
  user_id uuid references auth.users (id) on delete set null,
  -- Everything below is captured automatically by the widget. The single most common
  -- reason a bug report is unactionable is not knowing WHERE the person was and on WHAT,
  -- and asking them to type it never works.
  page_url text,
  user_agent text,
  -- "1280x720" — separates a genuine layout bug from a mobile-only one without needing a
  -- user-agent parser. This repo has shipped several mobile-overflow fixes; that class of
  -- bug is invisible without it.
  viewport text,
  -- Free-form per-entry-point extras (song id, style id, bpm, track hash…). jsonb so a
  -- new entry point can attach whatever is diagnostic for it without a migration.
  context jsonb,
  -- Which UI opened the widget ('footer' | 'contact' | …). Named entry_point to match the
  -- convention in src/lib/analytics.ts — never `source`, which GA4 reads as traffic
  -- attribution and which has already corrupted this property's channel data once.
  entry_point text,
  status text not null default 'new' check (status in ('new', 'triaged', 'done', 'wontfix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin queue reads newest-open-first; the partial index keeps triaged rows out of it.
create index feedback_open_idx
  on public.feedback (created_at desc)
  where status = 'new';

alter table public.feedback enable row level security;

-- Deliberately no policies at all — same reasoning as song_requests
-- (20260818_song_requests.sql). RLS-enabled-with-no-policies denies every anon and
-- authenticated request, and the service-role key bypasses RLS entirely, so the only way
-- in is through the server-side routes: src/pages/api/feedback for writes,
-- src/pages/api/admin/list-feedback and .../update-feedback for reads and triage.
--
-- An anon INSERT policy would technically work for the write, but reads must NOT be open:
-- rows carry a reply_email and whatever free text the reporter typed, which regularly
-- includes personal detail ("my email is…", "here's my song"). Keeping the whole table
-- server-side means there is no policy to get subtly wrong later.
