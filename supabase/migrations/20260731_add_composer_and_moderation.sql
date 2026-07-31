-- Two independent additions to public_songs, prompted by the 2026-07-31 SEO audit:
--
-- 1. composer_name: the MusicComposition JSON-LD and "Who wrote X" FAQ copy on
--    /songs/[slug] both derived composer directly from `artist` (the performer), which
--    mis-attributes any cover song to whoever performed it rather than who wrote it
--    (e.g. "Ain't No Mountain High Enough" crediting Marvin Gaye & Tammi Terrell instead
--    of Ashford & Simpson, in both visible copy and structured data). Nullable — falls
--    back to `artist` in the app when unset, so existing correctly-attributed songs need
--    no data migration.
--
-- 2. report_count/reported_at/report_reason: publishing is entirely self-service
--    (SongCreator sets is_published: true with no review step, see src/lib/publicSongs.ts)
--    and there was no way for a visitor to flag a factual error. This adds a lightweight
--    async report mechanism — reporting doesn't unpublish anything by itself, it just
--    surfaces the song on the localhost-only admin review list (see
--    src/pages/api/admin/list-reported/index.ts) for a human to check.

ALTER TABLE public.public_songs
  ADD COLUMN composer_name text,
  ADD COLUMN report_count int NOT NULL DEFAULT 0,
  ADD COLUMN reported_at timestamptz,
  ADD COLUMN report_reason text;

-- No RLS policy is added for reporting on purpose: Postgres RLS does not distinguish by
-- column, so a policy permissive enough to let anonymous visitors bump report_count would
-- also let them rewrite title/lyrics/chords/anything else on any published song. The
-- report-song API route (src/pages/api/report-song/index.ts) instead runs server-side
-- with the service-role key — same bypass-RLS-deliberately pattern as
-- src/pages/api/admin/update-song/index.ts — and only ever touches the report_* columns.
