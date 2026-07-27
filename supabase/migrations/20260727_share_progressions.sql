-- Shareable chord-player songs.
--
-- Until now `progressions` was strictly private: the only SELECT policy matched
-- user_id = auth.uid(), so a /chord-player/<id> link handed to anyone else (or opened
-- logged out) returned zero rows and the editor bounced them to /app with "Song not
-- found". This adds an opt-in public flag plus the matching read policy.
--
-- Sharing is per-song and off by default — flipping it is an explicit act in the
-- editor (setSongVisibility in src/lib/songStorageCloud.ts), never a side effect of
-- saving.

ALTER TABLE public.progressions
  ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Additive: Postgres OR's permissive policies together, so the existing owner-read
-- policy keeps working untouched and this only widens reads to shared songs.
CREATE POLICY "progressions public read"
  ON public.progressions FOR SELECT
  USING (is_public = true);

-- IMPORTANT — verify before relying on this in production:
-- The client's save path (saveSongToCloud) upserts {id, user_id, data}. A non-owner
-- editing a shared song is prevented client-side (the editor forks the song into a new
-- id instead of writing back), but the DB must be the real backstop. That requires an
-- UPDATE policy whose USING clause pins the EXISTING row to its owner, e.g.
--
--   CREATE POLICY "progressions owner update" ON public.progressions
--     FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--
-- With that in place, `INSERT ... ON CONFLICT DO UPDATE` against someone else's row
-- fails the USING check and errors out instead of overwriting it. The policies on this
-- table predate the migrations folder and are not versioned here — confirm in the
-- Supabase dashboard (Auth > Policies > progressions) that UPDATE is owner-scoped and
-- that the new SELECT policy above did NOT accidentally widen UPDATE/DELETE.
