// Notifies Bing/Yandex via the IndexNow protocol that our URLs may have changed,
// so they crawl the site instead of waiting for the next scheduled visit.
// Runs as a postbuild step (see netlify.toml) — never fails the build on error.
const SITE = 'https://chordsequence.com';
// La clave 5dfced… devuelve UserForbiddedToAccessSite: nunca llegó a verificarse contra
// api.indexnow.org, así que este postbuild llevaba fallando en silencio en cada deploy
// (main() traga el error para no romper la build). Ésta sí está verificada.
const KEY = '38082a18a9a3d2f333f10d258e0b0237';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const SITEMAPS = [`${SITE}/sitemap-0.xml`, `${SITE}/sitemap-songs.xml`];

async function fetchLocs(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const urlLists = await Promise.all(SITEMAPS.map(fetchLocs));
  const urlList = [...new Set(urlLists.flat())];

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  });

  console.log(`IndexNow: submitted ${urlList.length} URLs -> HTTP ${res.status}`);
}

main().catch((err) => {
  console.error('IndexNow submission failed (non-fatal):', err.message);
});
