// Notifies Bing/Yandex via the IndexNow protocol that our URLs may have changed,
// so they crawl the site instead of waiting for the next scheduled visit.
// Runs as a postbuild step (see netlify.toml) — never fails the build on error.
const SITE = 'https://chordsequence.com';
const KEY = '5dfcedacd6ba170de9192bf55e49254d';
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
