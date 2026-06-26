import type { APIRoute } from 'astro'

// Proxies the acoustic guitar steel soundfont from jsDelivr so the browser
// request stays on our own origin, bypassing CSP connect-src restrictions.
// JSON format: no JS eval needed, no .js URL tricks required.
const UPSTREAM = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_guitar_steel-mp3.json'

export const GET: APIRoute = async () => {
  try {
    const res = await fetch(UPSTREAM)
    if (!res.ok) return new Response('Upstream error', { status: 502 })
    const text = await res.text()
    return new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    })
  } catch {
    return new Response('Failed to fetch soundfont', { status: 502 })
  }
}
