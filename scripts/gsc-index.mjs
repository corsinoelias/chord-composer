#!/usr/bin/env node
/**
 * Indexing side of Search Console, from the command line.
 *
 * `gsc.mjs` reports what already ranks. This one answers "does Google know this page
 * exists yet, and what can we actually do about it".
 *
 * WHAT CANNOT BE AUTOMATED, so nobody wastes an afternoon looking for it: there is no
 * API that requests indexing of an ordinary page. The Indexing API
 * (indexing.googleapis.com) is documented as supporting JobPosting and BroadcastEvent
 * only -- calling it for a normal page is not supported and is not a reliable way to get
 * anything crawled. The "Request indexing" button in the Search Console UI has no API
 * equivalent. So the supported levers are exactly two, and both are here:
 *
 *   1. Submit or resubmit the sitemap, which tells Google to re-read the URL list.
 *   2. Inspect a URL to see where it actually stands.
 *
 * Auth reuses the service account gsc.mjs uses (GOOGLE_APPLICATION_CREDENTIALS in
 * .mcp.json), which holds siteOwner on sc-domain:chordsequence.com. Submitting a sitemap
 * is a write, so this asks for the read/write scope rather than the readonly one.
 *
 * Usage:
 *   node scripts/gsc-index.mjs status                      list submitted sitemaps
 *   node scripts/gsc-index.mjs inspect <url> [<url>...]    coverage state of each URL
 *   node scripts/gsc-index.mjs submit [sitemap-index.xml]  resubmit a sitemap
 *
 * Pass inspect URLs in full (https://chordsequence.com/...): Git Bash rewrites a bare
 * leading "/" into a Windows path.
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const SITE = process.env.GSC_SITE || 'sc-domain:chordsequence.com';
const ORIGIN = 'https://chordsequence.com';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';
const rest = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};

const keyPath = flag('key', process.env.GOOGLE_APPLICATION_CREDENTIALS
  || 'C:/Users/Eliascorsino/Documents/elias-corsino-key.json');

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
    // Read/write: `submit` is a PUT. The readonly scope gsc.mjs uses would reject it.
    scope: 'https://www.googleapis.com/auth/webmasters',
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

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (json.error) throw new Error(JSON.stringify(json.error, null, 2));
  if (!res.ok) throw new Error(res.status + ' ' + text);
  return json;
}

const sitemapsUrl = (feedpath) =>
  'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SITE) + '/sitemaps'
  + (feedpath ? '/' + encodeURIComponent(feedpath) : '');

async function status() {
  const { sitemap = [] } = await call(sitemapsUrl());
  if (!sitemap.length) {
    console.log('No hay ningun sitemap enviado para ' + SITE + '.');
    return;
  }
  console.log('Sitemaps enviados para ' + SITE + ':\n');
  for (const s of sitemap) {
    const submitted = s.lastSubmitted ? s.lastSubmitted.slice(0, 10) : '—';
    const downloaded = s.lastDownloaded ? s.lastDownloaded.slice(0, 10) : 'nunca';
    const urls = (s.contents || []).reduce((n, c) => n + Number(c.submitted || 0), 0);
    console.log('  ' + s.path);
    console.log('    enviado ' + submitted + '   leido por Google ' + downloaded
      + '   urls ' + (urls || '—')
      + (s.isPending ? '   PENDIENTE' : '')
      + (s.errors > 0 ? '   errores ' + s.errors : '')
      + (s.warnings > 0 ? '   avisos ' + s.warnings : ''));
  }
}

async function submit(feedpath) {
  const full = feedpath.startsWith('http') ? feedpath : ORIGIN + '/' + feedpath.replace(/^\//, '');
  await call(sitemapsUrl(full), { method: 'PUT' });
  console.log('Reenviado: ' + full);
  console.log('Esto le dice a Google que vuelva a leer la lista de URLs. No es una peticion'
    + '\nde indexacion: sigue decidiendo el cuando y el si.');
}

async function inspect(urls) {
  for (const raw of urls) {
    const url = raw.startsWith('http') ? raw : ORIGIN + '/' + raw.replace(/^\//, '');
    const { inspectionResult: r } = await call(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      { method: 'POST', body: { inspectionUrl: url, siteUrl: SITE, languageCode: 'es' } },
    );
    const i = r.indexStatusResult || {};
    console.log('\n' + url);
    console.log('  veredicto        ' + (i.verdict || '—'));
    console.log('  cobertura        ' + (i.coverageState || '—'));
    console.log('  rastreo permit.  ' + (i.robotsTxtState || '—'));
    console.log('  indexacion       ' + (i.indexingState || '—'));
    console.log('  ultimo rastreo   ' + (i.lastCrawlTime ? i.lastCrawlTime.slice(0, 10) : 'nunca'));
    console.log('  canonica Google  ' + (i.googleCanonical || '—'));
    console.log('  canonica pagina  ' + (i.userCanonical || '—'));
    if (i.sitemap?.length) console.log('  en sitemap       ' + i.sitemap.join(', '));
    if (i.referringUrls?.length) console.log('  enlazada desde   ' + i.referringUrls.slice(0, 3).join(', '));
    if (r.inspectionResultLink) console.log('  abrir en GSC     ' + r.inspectionResultLink);
  }
}

async function main() {
  token = await accessToken();
  if (cmd === 'status') return status();
  if (cmd === 'submit') return submit(rest[0] || 'sitemap-index.xml');
  if (cmd === 'inspect') {
    if (!rest.length) {
      console.error('Falta la URL: node scripts/gsc-index.mjs inspect ' + ORIGIN + '/progressions/gospel/');
      process.exit(1);
    }
    return inspect(rest);
  }
  console.error('Comando desconocido: ' + cmd + '\nUsa: status | inspect <url> | submit [sitemap]');
  process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
