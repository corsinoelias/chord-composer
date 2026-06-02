-- Webhook: trigger a Netlify rebuild when a song is published.
-- Uses pg_net (enabled by default on Supabase).
-- Build hook URL created via Netlify CLI on 2026-06-02.

CREATE OR REPLACE FUNCTION public.notify_netlify_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when a song is published (new row or toggled to published)
  IF NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM true) THEN
    PERFORM net.http_post(
      url  := 'https://api.netlify.com/build_hooks/6a1ec4757f92a5800892a23d',
      body := '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_song_published ON public.public_songs;

CREATE TRIGGER on_song_published
  AFTER INSERT OR UPDATE ON public.public_songs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_netlify_on_publish();
