import { defineMiddleware } from 'astro:middleware';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    // media-src includes blob: (leftover from an earlier local-only prototype, harmless
    // to keep) plus https://*.supabase.co for the real vocal-reference audio files now
    // served from Supabase Storage (the <audio> scrub element in the editor, and the
    // public song page's playback both load directly from that origin).
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' blob: https://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none';",
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);

  // Rewrite /chord-player/<songId> → /chord-player/ so the SPA island handles the ID.
  // X-Robots-Tag at HTTP level speeds up deindexing of any shared chord-player URLs Google crawled.
  // (Old /editor/* links 301 to here via netlify.toml before ever reaching this middleware.)
  if (/^\/chord-player\/.+/.test(pathname)) {
    const response = await context.rewrite('/chord-player/');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

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
