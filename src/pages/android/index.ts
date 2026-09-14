import type { APIRoute } from 'astro'

// /android/ → the Chord Player listing on Google Play. Every "get the app" link on the
// site points here instead of at Play directly, so the store URL and its campaign tags
// live in one place: sending these links to a landing page later, or to a song, is a
// change to this file, not to every page that links to the app.
//
// A server endpoint rather than a netlify.toml redirect: the Astro adapter's catch-all
// SSR function is matched ahead of netlify.toml's redirect engine (see the note on
// /chord-player/<songId> deep links in netlify.toml), so a rule there cannot be trusted to win.
//
// `?from=<placement>` becomes the utm_campaign Play Console reports installs under, so
// the footer badge and any later banner can be told apart. 302 and no-store, because the
// destination is expected to change and a cached or permanent redirect would outlive it.
const PACKAGE = 'com.eliascorsino.chord_sequencer'

export const GET: APIRoute = ({ url }) => {
  const from = url.searchParams.get('from') ?? ''
  const campaign = /^[a-z0-9_-]{1,32}$/.test(from) ? from : 'unknown'

  const play = new URL('https://play.google.com/store/apps/details')
  play.searchParams.set('id', PACKAGE)
  play.searchParams.set(
    'referrer',
    new URLSearchParams({
      utm_source: 'chordsequence',
      utm_medium: 'web',
      utm_campaign: campaign,
    }).toString(),
  )

  return new Response(null, {
    status: 302,
    headers: {
      Location: play.toString(),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
