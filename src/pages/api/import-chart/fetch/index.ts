import type { APIRoute } from 'astro';

// Fetches an analysis JSON from a public URL on the server's behalf. Doing it from the
// browser fails on most hosts because they don't send CORS headers, and we don't control
// where these files are published.
//
// Same localhost-only guard as ../admin/* — /songs/new/ already redirects away when not
// on localhost, so this endpoint is only ever reachable from a local dev session. That
// gate is what keeps a server-side fetch of an arbitrary URL contained.

const MAX_BYTES = 20 * 1024 * 1024;

function forbidden(message: string, status = 403) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const host = url.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    return forbidden('Forbidden');
  }

  const target = url.searchParams.get('url');
  if (!target) return forbidden('Falta el parámetro url', 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return forbidden('La URL no es válida', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return forbidden('Solo se aceptan URLs http o https', 400);
  }

  try {
    const res = await fetch(parsed, { redirect: 'follow' });
    if (!res.ok) return forbidden(`El servidor respondió ${res.status}`, 502);

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) return forbidden('El archivo es demasiado grande', 413);

    const text = await res.text();
    if (text.length > MAX_BYTES) return forbidden('El archivo es demasiado grande', 413);

    // Parsed here rather than passed through, so a page that isn't JSON fails with a
    // clear message instead of blowing up in the browser.
    try {
      JSON.parse(text);
    } catch {
      return forbidden('Lo que hay en esa URL no es JSON', 415);
    }

    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return forbidden('No se pudo descargar esa URL', 502);
  }
};
