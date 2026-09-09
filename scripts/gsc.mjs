#!/usr/bin/env node
/**
 * Google Search Console reporting from the command line.
 *
 * GA4 tells you what happened after someone landed. This tells you what happened on the
 * results page itself -- impressions, average position and CTR per query and per page --
 * which is the half the analytics property cannot see.
 *
 * Auth reuses the service account the analytics MCP already uses (see .mcp.json). It
 * holds siteOwner on sc-domain:chordsequence.com, so nothing has to be granted in the
 * Search Console UI. Point GOOGLE_APPLICATION_CREDENTIALS at the key file or pass --key.
 * No dependency: the RS256 JWT is signed with node's own crypto rather than pulling in
 * googleapis, so this keeps working with no install step.
 *
 * Usage:
 *   node scripts/gsc.mjs queries [--days 28] [--limit 25]
 *   node scripts/gsc.mjs pages   [--days 28] [--limit 25]
 *   node scripts/gsc.mjs page /chord-player/ [--days 28]   what one page ranks for
 *   node scripts/gsc.mjs query "chord maker" [--days 28]  which pages serve one query
 *   node scripts/gsc.mjs weekly  [--days 90]               clicks/impressions/position by week
 *   node scripts/gsc.mjs compare [--days 28]               this window vs the one before it
 *   node scripts/gsc.mjs sites                             what this credential can read
 *
 * Search Console data lags about two days, so every window ends two days ago.
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const SITE = process.env.GSC_SITE || 'sc-domain:chordsequence.com';
const ORIGIN = 'https://chordsequence.com';
const LAG_DAYS = 2;

const argv = process.argv.slice(2);
const cmd = argv[0] || 'queries';
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));

const days = Number(flag('days', 28));
const limit = Number(flag('limit', 25));
const keyPath = flag('key', process.env.GOOGLE_APPLICATION_CREDENTIALS
  || 'C:/Users/Eliascorsino/Documents/elias-corsino-key.json');

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
const windowOf = (n, offset = 0) => ({
  startDate: iso(daysAgo(LAG_DAYS + offset + n - 1)),
  endDate: iso(daysAgo(LAG_DAYS + offset)),
});

let key;
try {
  key = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error('No pude leer la service account en:\n  ' + keyPath
    + '\n\nPasa --key <ruta> o exporta GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claims);
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).end().sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + sig,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('token: ' + JSON.stringify(json));
  return json.access_token;
}

let token;
async function api(path, body) {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: 'Bearer ' + token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error, null, 2));
  return json;
}

const query = async (body) => (await api('/' + encodeURIComponent(SITE) + '/searchAnalytics/query', body)).rows || [];

const pad = (v, n) => String(v).padStart(n);
const HEAD = pad('clicks', 6) + ' ' + pad('impres.', 8) + ' ' + pad('CTR', 7) + ' ' + pad('pos', 6);
const line = (r) => pad(r.clicks, 6) + ' ' + pad(r.impressions, 8) + ' '
  + pad((r.ctr * 100).toFixed(1), 6) + '% ' + pad(r.position.toFixed(1), 6);
const totals = (rows) => rows.reduce(
  (a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }),
  { clicks: 0, impressions: 0 },
);

async function byDimension(dim, label, strip) {
  const w = windowOf(days);
  const rows = await query({ ...w, dimensions: [dim], rowLimit: limit });
  console.log(label + ' - ' + w.startDate + ' a ' + w.endDate);
  console.log(HEAD);
  for (const r of rows) console.log(line(r) + '  ' + (strip ? r.keys[0].replace(ORIGIN, '') : r.keys[0]));
}

async function main() {
  token = await accessToken();

  if (cmd === 'sites') {
    for (const s of (await api('')).siteEntry || []) console.log(s.permissionLevel.padEnd(12) + ' ' + s.siteUrl);
    return;
  }

  if (cmd === 'queries') return byDimension('query', 'Consultas (' + days + 'd)', false);
  if (cmd === 'pages') return byDimension('page', 'Paginas (' + days + 'd)', true);

  if (cmd === 'page') {
    const target = positional[0];
    if (!target) {
      console.error('Falta la ruta: node scripts/gsc.mjs page chord-player/');
      process.exit(1);
    }
    // Git Bash rewrites an argument that starts with "/" into a Windows path, so
    // "/chord-player/" arrives as "C:/Program Files/Git/chord-player/". Say so plainly
    // rather than reporting zero rows for a page that ranks perfectly well.
    if (/^[A-Za-z]:[\\/]/.test(target)) {
      console.error('Git Bash convirtio la ruta en "' + target + '".'
        + '\nPasala sin la barra inicial:  node scripts/gsc.mjs page chord-player/'
        + '\no con la URL entera:          node scripts/gsc.mjs page ' + ORIGIN + '/chord-player/');
      process.exit(1);
    }
    const w = windowOf(days);
    const rows = await query({
      ...w,
      dimensions: ['query'],
      rowLimit: limit,
      dimensionFilterGroups: [{
        filters: [{
          dimension: 'page',
          operator: 'equals',
          expression: target.startsWith('http') ? target : ORIGIN + '/' + target.replace(/^\/+/, ''),
        }],
      }],
    });
    console.log('Consultas de ' + target + ' - ' + w.startDate + ' a ' + w.endDate);
    console.log(HEAD);
    for (const r of rows) console.log(line(r) + '  ' + r.keys[0]);
    return;
  }

  // The inverse of `page`: which URLs Google actually serves for one query. A query can
  // sit on page one in the site-wide report while the page you built for it ranks
  // nowhere -- the impressions belong to some other URL, and no amount of editing the
  // intended page moves them. Reading only the query report hides that completely.
  if (cmd === 'query') {
    const target = positional[0];
    if (!target) {
      console.error('Falta la consulta: node scripts/gsc.mjs query "chord maker"');
      process.exit(1);
    }
    const w = windowOf(days);
    const rows = await query({
      ...w,
      dimensions: ['page'],
      rowLimit: limit,
      dimensionFilterGroups: [{
        filters: [{ dimension: 'query', operator: 'equals', expression: target }],
      }],
    });
    console.log('Paginas para "' + target + '" - ' + w.startDate + ' a ' + w.endDate);
    console.log(HEAD);
    if (!rows.length) console.log('  (sin datos -- la consulta se escribe exactamente como en el informe)');
    for (const r of rows) console.log(line(r) + '  ' + r.keys[0].replace(ORIGIN, ''));
    return;
  }

  if (cmd === 'compare') {
    const cur = windowOf(days);
    const prev = windowOf(days, days);
    const a = totals(await query({ ...cur, dimensions: ['date'], rowLimit: 500 }));
    const b = totals(await query({ ...prev, dimensions: ['date'], rowLimit: 500 }));
    const pct = (x, y) => (y === 0 ? '-' : (x >= y ? '+' : '') + ((x / y - 1) * 100).toFixed(0) + '%');
    const ctr = (t) => (t.impressions === 0 ? '-' : (t.clicks / t.impressions * 100).toFixed(2) + '%');
    console.log('actual   ' + cur.startDate + '..' + cur.endDate + '  clicks ' + pad(a.clicks, 6)
      + '  impres ' + pad(a.impressions, 8) + '  CTR ' + ctr(a));
    console.log('anterior ' + prev.startDate + '..' + prev.endDate + '  clicks ' + pad(b.clicks, 6)
      + '  impres ' + pad(b.impressions, 8) + '  CTR ' + ctr(b));
    console.log('cambio                            clicks ' + pad(pct(a.clicks, b.clicks), 6)
      + '  impres ' + pad(pct(a.impressions, b.impressions), 8));
    return;
  }

  if (cmd === 'weekly') {
    const w = windowOf(Number(flag('days', 90)));
    const rows = await query({ ...w, dimensions: ['date'], rowLimit: 500 });
    const weeks = new Map();
    for (const r of rows) {
      const d = new Date(r.keys[0]);
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = iso(monday);
      const b = weeks.get(k) || { clicks: 0, impressions: 0, posWeighted: 0 };
      b.clicks += r.clicks;
      b.impressions += r.impressions;
      // Position is weighted by impressions. A plain mean of the daily averages lets a
      // quiet day count as much as a busy one, which drifts the trend line.
      b.posWeighted += r.position * r.impressions;
      weeks.set(k, b);
    }
    console.log('semana      ' + HEAD);
    for (const [k, b] of [...weeks].sort()) {
      console.log(k + '  ' + pad(b.clicks, 6) + ' ' + pad(b.impressions, 8) + ' '
        + pad((b.clicks / b.impressions * 100).toFixed(2), 6) + '% '
        + pad((b.posWeighted / b.impressions).toFixed(1), 6));
    }
    return;
  }

  console.error('Comando desconocido: ' + cmd
    + '\nUsa: queries | pages | page <ruta> | query <consulta> | weekly | compare | sites');
  process.exit(1);
}

main().catch((e) => { console.error('FALLO: ' + e.message); process.exit(1); });
