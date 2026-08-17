-- Song requests: the counterpart to the /songs/ search's zero-result state.
--
-- The search already reports every term that matched nothing to GA4 (search_no_results),
-- but GA4 tells you the term and nothing else — it can't tell you the artist the visitor
-- meant, it drops anything that looks like PII, and its top-terms report collapses the
-- long tail into "(other)". This table is the durable, deduplicated version: an ordered
-- list of songs people came here for and did not find, which is the input for deciding
-- which chart to build next. Song pages are the traffic driver, so that decision matters.
--
-- dedupe_key is a normalized "title artist" computed in the API route with the very same
-- normalizeForSearch() the search box uses (src/lib/searchText.ts), so "Wonderwall Oasis",
-- "wonderwall  oasis" and "Wonderwáll — Oasis" all collapse onto one row whose
-- request_count climbs. Without it this table would be a pile of near-duplicates that
-- nobody could rank; with it, "requested 14 times" is the whole point.

create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  title text not null,
  artist text,
  note text,
  -- The failed search query that led here, when the request came from the empty state.
  -- Kept alongside the cleaned-up title because they differ in useful ways: the raw query
  -- is what someone actually typed (typos, partial titles, wrong artist), which is exactly
  -- what the search matcher needs to get better at.
  search_term text,
  -- Which UI opened the form ('search_empty' | 'library'). Named entry_point to match the
  -- convention in src/lib/analytics.ts — never `source`, which GA4 reads as traffic
  -- attribution and which has already corrupted this property's channel data once.
  entry_point text,
  request_count int not null default 1,
  status text not null default 'new' check (status in ('new', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin list reads "most wanted first"; the partial index keeps triaged rows out of it.
create index song_requests_ranked_idx
  on public.song_requests (request_count desc, updated_at desc)
  where status = 'new';

alter table public.song_requests enable row level security;

-- Deliberately no policies at all. RLS-enabled-with-no-policies denies every anon and
-- authenticated request, and the service-role key bypasses RLS entirely — so the only way
-- in is through the two server-side routes (src/pages/api/suggest-song for writes,
-- src/pages/api/admin/list-song-requests for reads). Same reasoning as the report_*
-- columns in 20260731_add_composer_and_moderation.sql: an anon INSERT policy would be
-- fine, but an anon policy broad enough to also bump request_count on an existing row is
-- an anon UPDATE policy, and Postgres RLS cannot scope UPDATE by column — it would let
-- anyone rewrite status or title on any row. Keeping the write server-side avoids the
-- whole question.
