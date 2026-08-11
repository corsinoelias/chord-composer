import { defineMiddleware } from 'astro:middleware';

// Keep in sync with the [[headers]] blocks in netlify.toml (`/*`, `/songs/`, `/songs/*`) —
// those don't reach SSR functions (see comment below), so this object is the only thing
// that actually governs headers on SSR routes like /songs/*. Two sources of truth; check
// both when changing either.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    // media-src includes blob: (leftover from an earlier local-only prototype, harmless
    // to keep) plus https://*.supabase.co for the real vocal-reference audio files now
    // served from Supabase Storage (the <audio> scrub element in the editor, and the
    // public song page's playback both load directly from that origin).
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' blob: https://*.supabase.co https://cdn.jsdelivr.net https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none';",
};

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const { pathname } = url;

  // Real pagination now lives in src/pages/songs/index.astro (?page=N), which validates
  // page numbers itself (invalid/out-of-range → Astro.redirect('/songs/', 301), a clean
  // URL with no query string, so it can't loop). This used to unconditionally strip any
  // ?page= here before pagination existed — do not reintroduce that, it would break
  // legitimate ?page=2+ URLs.

  // Rewrite /chord-player/<songId> → /chord-player/ so the SPA island handles the ID.
  //
  // DEV ONLY — this is what makes deep links work under `astro dev` (slashed form only:
  // /chord-player/<id>/ hits this, /chord-player/<id> 404s before it). In production it never
  // runs: /chord-player/ is prerendered, so no SSR route exists under that path and the Netlify
  // adapter's catch-all function answers with its own 404 before Astro middleware is invoked —
  // confirmed 2026-08-11, when every deep link 404'd in production and the response carried
  // none of the SECURITY_HEADERS below. Production is handled by
  // netlify/edge-functions/chord-player-deeplink.ts, which also sets the X-Robots-Tag; change
  // that file, not this one.
  // (Old /editor/* links 301 to here via netlify.toml before ever reaching this middleware.)
  if (/^\/chord-player\/.+/.test(pathname)) {
    const response = await context.rewrite('/chord-player/');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  // Trailing-slash normalization for SSR routes lives in netlify.toml, not here — a
  // request with no matching route (which includes any SSR route hit without its
  // required trailing slash, since trailingSlash: 'always' means the route pattern
  // itself requires it) never reaches this middleware at all. Netlify's [[redirects]]
  // run before the request is even routed to the SSR function or a 404 fallback; this
  // file only ever sees requests for routes that already matched something. Confirmed
  // empirically: a middleware-level redirect here silently never fired (verified via
  // astro dev — no route match means no middleware invocation, not even for the
  // built-in 404). See netlify.toml for the actual fix.

  const response = await next();

  // Security headers on every response (netlify.toml [[headers]] doesn't reach SSR functions)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // /tuner/ needs microphone access — override the global block
  if (pathname.startsWith('/tuner')) {
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  }

  // Edge-cache dynamic songs pages — content only changes when a song is published
  if (pathname.startsWith('/songs/') && !pathname.startsWith('/songs/new')) {
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  }

  return response;
});
