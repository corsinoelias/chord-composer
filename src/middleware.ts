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
    // accounts.google.com (script/style/connect/frame) is Google Identity Services —
    // the inline "Sign in with Google" button in AuthModal, which renders its button
    // and consent UI in an iframe from that origin rather than redirecting the page
    // away. style-src needs it too: GIS loads its own stylesheet
    // (accounts.google.com/gsi/style) for the button — without it the button renders
    // unstyled/broken, a CSP violation easy to miss since it doesn't block the script.
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' blob: https://*.supabase.co https://cdn.jsdelivr.net https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://accounts.google.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://accounts.google.com; frame-ancestors 'none';",
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

  // Edge-cache dynamic song pages — content only changes when a song is published.
  //
  // Aug 2026 measurement: 9 of 12 song pages were cold on a first request from a single PoP
  // (the other 3 were warm only because earlier requests in the same session had warmed
  // them). Cold TTFB was 0.6–4.7s against 0.32s warm. The previous config could never stay
  // warm at this volume: ~106 song-page views/day spread over 61 songs and dozens of edge
  // nodes puts the average song well under one view per node per day, so a 1h s-maxage
  // always expired before the next visitor arrived — the cache was effectively decorative.
  //
  // `durable` opts into Netlify's Durable Cache, a shared layer that every edge node reads
  // from, so one origin render serves all regions instead of one render per node. That is
  // the part that actually fixes the hit rate; the longer TTL alone would not.
  //
  // Two headers on purpose: Netlify-CDN-Cache-Control governs the CDN and takes precedence
  // there, while the plain Cache-Control governs browsers. The browser one revalidates
  // every time (cheap 304 against a warm CDN) so a republished song shows up on the next
  // visit instead of being pinned in someone's browser for a day.
  //
  // Invalidation rides on deploys: publishing a song fires the Supabase webhook → Netlify
  // build hook documented at the top of netlify.toml, and a new deploy drops the durable
  // cache. Worth confirming on the first publish after this ships — if it does not, a song
  // edit could serve stale for up to the s-maxage below.
  if (pathname.startsWith('/songs/') && !pathname.startsWith('/songs/new')) {
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    response.headers.set(
      'Netlify-CDN-Cache-Control',
      'public, s-maxage=86400, stale-while-revalidate=604800, durable',
    );
  }

  return response;
});
