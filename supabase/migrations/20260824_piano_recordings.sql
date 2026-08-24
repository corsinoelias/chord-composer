-- Shareable Virtual Piano recordings.
--
-- Until now a piano recording could only leave the browser as a downloaded WAV/MIDI
-- file — "My Songs" (src/lib/virtualPiano/mySongs.ts) is localStorage-only, and there
-- was no server-side row to point a link at. This adds a real table so a recording can
-- get a /piano/r/<id> link, mirroring how progressions.is_public works for chord-player
-- songs (see 20260727_share_progressions.sql) — but versioning every RLS policy here
-- from the start, since that migration's own header flags that progressions' owner
-- policies predate the migrations folder and were never captured in one.
--
-- Sharing stores the full-fidelity recorder buffer (per-note velocity + instrument,
-- src/lib/virtualPiano/pianoAudio.ts's RecEvent[]), not the lossy MySongNote shape
-- My Songs saves locally — a share link should sound like what was actually played.
--
-- Sharing requires an account (recording, playing back, downloading, and My Songs all
-- stay login-free) and is per-recording, opt-in, off by default — never a side effect
-- of saving, same contract as progressions.is_public.

create table public.piano_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- { v: 1, name, durationSec, events: RecEvent[] } — see pianoShare.ts. Versioned
  -- (`v`) so a future schema change can be read alongside old rows instead of
  -- migrating them all at once.
  data jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No listing UI reads "all of a user's shared recordings" today (share is fire-and-copy
-- from the recording modal, not a managed list), but the index costs little and matches
-- the shape My Songs would need if that ever changes.
create index piano_recordings_user_idx
  on public.piano_recordings (user_id, created_at desc);

alter table public.piano_recordings enable row level security;

-- Owner can always read their own rows (needed to resolve is_public/ownership for the
-- "Stop sharing" toast action even before anyone else has seen the link).
create policy "piano_recordings owner read"
  on public.piano_recordings for select
  using (user_id = auth.uid());

-- Widens reads to anyone with the link, once shared. Additive with the policy above —
-- Postgres OR's permissive policies together.
create policy "piano_recordings public read"
  on public.piano_recordings for select
  using (is_public = true);

create policy "piano_recordings owner insert"
  on public.piano_recordings for insert
  with check (user_id = auth.uid());

-- Owner-scoped both ways: USING pins which existing row can be touched, WITH CHECK
-- pins what it can be changed to — without WITH CHECK a clever UPDATE could reassign
-- user_id and hand the row to someone else.
create policy "piano_recordings owner update"
  on public.piano_recordings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "piano_recordings owner delete"
  on public.piano_recordings for delete
  using (user_id = auth.uid());
