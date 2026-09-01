-- Chord Sheet Maker's own table — deliberately NOT public_songs. A chord sheet has no
-- tempo, no rhythm arrangement, and no synced playback; it's a plain, static print/read
-- chart (title, artist, key, capo, and a ChordPro text blob). Mixing it into public_songs
-- would have meant faking bpm/style values so the row satisfies that table's NOT NULL
-- columns — and /songs/[slug].astro uses those for real: it mounts SongChordPlayerIsland
-- (plays a full backing arrangement keyed off `style`), and generates "played at N BPM —
-- an upbeat feel" copy from `bpm`. A faked style/bpm there would render a real Play button
-- that performs a made-up arrangement with no relation to the actual chart. Kept fully
-- separate instead — its own table, own RLS, own routes under /chord-sheet-maker/.
--
-- This is a brand-new table (unlike the ALTER-table migrations elsewhere in this folder),
-- so — unlike public_songs/progressions, whose base RLS predates the migrations folder —
-- every policy it needs is defined here, not partly in the Supabase dashboard.
create table public.chord_sheets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default '',
  artist text not null default '',
  base_key text not null default 'C',
  capo int,
  text text not null default '',
  -- Presentation only (instrument, chart notation, and from Chord Sheet Maker's Phase C:
  -- style preset/fonts/paper/columns/background assets) — never musical content.
  layout jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chord_sheets enable row level security;

-- Owner can always read their own rows, published or not (drafts included).
create policy "chord_sheets owner select" on public.chord_sheets
  for select using (created_by = auth.uid());

-- Anyone (including signed-out visitors) can read published rows.
create policy "chord_sheets public select" on public.chord_sheets
  for select using (is_published = true);

create policy "chord_sheets owner insert" on public.chord_sheets
  for insert with check (created_by = auth.uid());

create policy "chord_sheets owner update" on public.chord_sheets
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "chord_sheets owner delete" on public.chord_sheets
  for delete using (created_by = auth.uid());
