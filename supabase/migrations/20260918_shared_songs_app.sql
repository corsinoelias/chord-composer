-- Web ↔ app shared data (docs/plan-paridad-web-app.md, phase 7 prerequisites).
--
-- NOT applied automatically. Run it in the Supabase SQL editor, then run the checks at the
-- bottom. The Flutter app writes to `progressions` directly through PostgREST (same anon
-- key as the web), so the database — not the client — has to be what stops one user from
-- overwriting another's song.

-- ── 1. progressions: owner-only writes ─────────────────────────────────────────────────
-- The policies on this table predate the migrations folder (see 20260727_share_progressions
-- .sql). These are additive and named so they can be told apart; if the dashboard shows an
-- older UPDATE/DELETE policy that is NOT scoped to user_id = auth.uid(), drop it, because
-- permissive policies are OR'ed and a broad one would make these pointless.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progressions' AND policyname = 'progressions owner insert') THEN
    CREATE POLICY "progressions owner insert" ON public.progressions
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progressions' AND policyname = 'progressions owner update') THEN
    CREATE POLICY "progressions owner update" ON public.progressions
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progressions' AND policyname = 'progressions owner delete') THEN
    CREATE POLICY "progressions owner delete" ON public.progressions
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- updated_at is what the app compares before overwriting (sync conflict guard). Make sure
-- it exists and moves on every write, whoever writes.
ALTER TABLE public.progressions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS progressions_touch_updated_at ON public.progressions;
CREATE TRIGGER progressions_touch_updated_at
  BEFORE UPDATE ON public.progressions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 2. user_settings: "Mis ritmos" and style retouches in the cloud ──────────────────────
-- Until now the web kept these only in localStorage (src/lib/userSettings.ts), so 53 of
-- 300 saved songs (18 Sep) point at a rhythm that exists in one browser only. The web now
-- writes them here once the user is logged in, and the app reads them.
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  custom_styles jsonb NOT NULL DEFAULT '[]'::jsonb,
  style_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- upsert(onConflict: 'user_id') needs a unique constraint; harmless if it is the PK already.
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_key ON public.user_settings (user_id);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'user_settings owner all') THEN
    CREATE POLICY "user_settings owner all" ON public.user_settings
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS user_settings_touch_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_touch_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Checks (run after applying; each should return what the comment says) ─────────────
-- Every policy on both tables — no UPDATE/DELETE/INSERT policy without auth.uid():
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename IN ('progressions', 'user_settings') ORDER BY tablename, cmd;
