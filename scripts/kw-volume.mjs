#!/usr/bin/env node
/**
 * Monthly Google search volume per keyword, from the Google Ads Keyword Planner.
 *
 * Search Console only reports queries this site already shows up for, so it cannot say
 * how big a song is before its page exists. The Keyword Planner can, and it is free with
 * the Google Ads API access we already have -- use this instead of DataForSEO.
 *
 * Auth reads the Google Ads credentials from the sibling "Google Ads" project's .env
 * (GOOGLE_ADS_DEVELOPER_TOKEN, _CLIENT_ID, _CLIENT_SECRET, _REFRESH_TOKEN, _CUSTOMER_ID,
 * _LOGIN_CUSTOMER_ID). Override the path with ADS_ENV. That account runs someone else's
 * campaigns; generateKeywordHistoricalMetrics only reads planner data and touches none of
 * them. If auth fails with invalid_grant, the refresh token expired: run
 * `node get_refresh_token.mjs` in that folder (Python is no longer installed here).
 *
 * Usage:
 *   node scripts/kw-volume.mjs "firm foundation chords" "holy forever chords"
 *   node scripts/kw-volume.mjs --file keywords.txt          one keyword per line
 *   node scripts/kw-volume.mjs --geo 2840 ...               geo target id (2840 = US); default worldwide
 *   node scripts/kw-volume.mjs --lang 1003 ...              language id (1000 = en, 1003 = es); default 1000
 *
 * Volumes are Google's rounded buckets (10, 20, ... 74000). A title shared by several songs
 * ("new wine chords") reports all of them together, and a keyword Google folds into a
 * close variant can come back as 0 -- a 0 for a famous song means "look it up another way".
 */
import { readFileSync } from 'node:fs';

const ENV_PATH = process.env.ADS_ENV || 'C:/Users/Eliascorsino/Documents/CodiFlash/Google Ads/.env';
const API = 'https://googleads.googleapis.com/v22';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};
const positional = argv.filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
const file = flag('file');
const keywords = [
  ...positional,
  ...(file ? readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []),
];
if (keywords.length === 0) {
  console.error('Sin keywords. Uso: node scripts/kw-volume.mjs "kw 1" "kw 2" [--geo 2840] [--lang 1000] [--file f.txt]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});
const token = await tokenRes.json();
if (!token.access_token) {
  console.error('Auth fallida:', JSON.stringify(token));
  if (token.error === 'invalid_grant') console.error('El refresh token caduco: ejecuta `node get_refresh_token.mjs` en la carpeta de Google Ads.');
  process.exit(1);
}

const customerId = env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
const geo = flag('geo');
const body = {
  keywords,
  language: `languageConstants/${flag('lang', '1000')}`,
  keywordPlanNetwork: 'GOOGLE_SEARCH',
  ...(geo ? { geoTargetConstants: geo.split(',').map((g) => `geoTargetConstants/${g}`) } : {}),
};

// The planner allows about one call per few seconds per account; retry on 429 instead of failing.
let data;
for (let attempt = 0; attempt < 4; attempt++) {
  const res = await fetch(`${API}/customers/${customerId}:generateKeywordHistoricalMetrics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'login-customer-id': env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, ''),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  data = await res.json();
  if (res.status !== 429) {
    if (!res.ok) { console.error(JSON.stringify(data, null, 2)); process.exit(1); }
    break;
  }
  await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
}

const rows = (data.results || [])
  .map((r) => ({ text: r.text, volume: Number(r.keywordMetrics?.avgMonthlySearches ?? 0), variants: r.closeVariants }))
  .sort((a, b) => b.volume - a.volume);

console.log(`Busquedas/mes - ${geo ? `geo ${geo}` : 'mundial'}, idioma ${flag('lang', '1000')}`);
for (const r of rows) {
  console.log(`${String(r.volume).padStart(8)}  ${r.text}${r.variants ? `  [~ ${r.variants.join(', ')}]` : ''}`);
}
