/**
 * /chord-player/<songId>  →  the prerendered /chord-player/ page (rewrite, URL unchanged,
 * so EditorApp can still read the song id off window.location.pathname).
 *
 * Why an edge function and not a [[redirects]] rule in netlify.toml, or the
 * context.rewrite() in src/middleware.ts:
 *
 * Both of those lose. /chord-player/ is `prerender = true`, so Astro registers no route
 * under that path; the Netlify adapter's catch-all SSR function still receives the request
 * and answers it with its built-in `notFoundContent` (a plain 404) before Astro middleware
 * ever runs — which is why every deep link 404'd in production, and why the middleware
 * rewrite silently did nothing. A `/chord-player/* → /chord-player/ 200` rule in
 * netlify.toml does not fix it either: the framework function is matched ahead of
 * netlify.toml's redirect engine, verified locally against the real built output
 * (`netlify dev --dir dist`), with and without `force = true` — both still 404.
 *
 * Edge functions are the one layer that runs before all of that, and unlike an Astro route
 * they see the raw path, so this also covers the slash-less form. That matters: every link
 * that exists today omits the trailing slash (Songs.tsx's window.location.href, the Share
 * button's URL in Index.tsx, and the history.pushState after a save), and `trailingSlash:
 * 'always'` makes SSR routes strict — /songs/wonderwall-oasis 404s while
 * /songs/wonderwall-oasis/ is 200, so a real Astro [songId] route would only have fixed
 * half the links and none of the already-shared ones.
 */

interface EdgeContext {
  rewrite: (url: string | URL) => Promise<Response>;
}

export default async (request: Request, context: EdgeContext): Promise<Response | undefined> => {
  const url = new URL(request.url);

  // The page itself is a normal static hit. Returning nothing hands the request back to
  // the regular pipeline (and is also what stops the rewrite below from looping, since the
  // rewritten path re-enters here matching this same branch).
  if (url.pathname === '/chord-player' || url.pathname === '/chord-player/') return;

  // Query string has to survive: /chord-player/<id>?export=true is a real entry point
  // (Songs.tsx's "export" action), as is ?data=/?bpm=/?style= on the bare page.
  const target = new URL('/chord-player/', url);
  target.search = url.search;

  const response = await context.rewrite(target);

  // These URLs are one per saved song and all serve byte-identical HTML whose canonical
  // points at /chord-player/. The bare /chord-player/ must stay indexable — it's the page
  // that has to rank for "chord player" — so the noindex goes here, on the deep links only,
  // where it also replaces the X-Robots-Tag src/middleware.ts used to (never actually) set.
  const out = new Response(response.body, response);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
};

export const config = { path: '/chord-player/*' };
