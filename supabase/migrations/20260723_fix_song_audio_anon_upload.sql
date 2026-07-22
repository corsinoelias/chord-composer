-- Fixes a security gap in the previous migration's insert policy: the "bootstrap"
-- branch (allowing the very first write into a songId folder with no public_songs
-- row yet) didn't require auth.uid() to be non-null, so a fully anonymous visitor
-- (anon key, no session) could upload arbitrary files into any fresh folder. Verified
-- live: an unauthenticated upload succeeded before this fix. Both branches now require
-- a real logged-in user.

DROP POLICY IF EXISTS "song-audio insert (owner or new song)" ON storage.objects;

CREATE POLICY "song-audio insert (owner or new song)"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'song-audio'
    AND auth.uid() IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.public_songs
              WHERE id = ((storage.foldername(name))[1])::uuid AND created_by = auth.uid())
      OR NOT EXISTS (SELECT 1 FROM public.public_songs
                     WHERE id = ((storage.foldername(name))[1])::uuid)
    )
  );
