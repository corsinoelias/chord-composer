-- Vocal/reference audio track for public_songs — a single shared file per song,
-- sliced per section (audioRange, already carried inside the existing `sections`
-- jsonb column — no new column needed for that part) or as one continuous span for
-- the whole song (audio_whole_start_sec/audio_whole_end_sec below).

ALTER TABLE public.public_songs
  ADD COLUMN audio_url text,
  ADD COLUMN audio_path text,
  ADD COLUMN audio_whole_start_sec numeric,
  ADD COLUMN audio_whole_end_sec numeric;

INSERT INTO storage.buckets (id, name, public)
VALUES ('song-audio', 'song-audio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "song-audio public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'song-audio');

-- Path scheme: {songId}/{timestamp}-{random}.{ext} — scoped to the SONG, not the
-- uploader, since a song's audio should stay attached to the song regardless of who
-- uploaded it. A brand-new song has no public_songs row yet (the client generates and
-- uses its id before the first save), so this must also allow the very first write
-- into a folder with no matching row — that id is a random client-generated UUID,
-- not guessable, and even if squatted, the row itself is still owned/RLS-protected by
-- created_by so a squatter's file can never actually become that song's real audio.
CREATE POLICY "song-audio insert (owner or new song)"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'song-audio'
    AND (
      EXISTS (SELECT 1 FROM public.public_songs
              WHERE id = ((storage.foldername(name))[1])::uuid AND created_by = auth.uid())
      OR NOT EXISTS (SELECT 1 FROM public.public_songs
                     WHERE id = ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "song-audio update (owner only)"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'song-audio'
    AND EXISTS (SELECT 1 FROM public.public_songs
                WHERE id = ((storage.foldername(name))[1])::uuid AND created_by = auth.uid())
  );

CREATE POLICY "song-audio delete (owner only)"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'song-audio'
    AND EXISTS (SELECT 1 FROM public.public_songs
                WHERE id = ((storage.foldername(name))[1])::uuid AND created_by = auth.uid())
  );
