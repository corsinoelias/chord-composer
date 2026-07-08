// Fails if any page declares FAQPage JSON-LD. Google restricted FAQ rich results to
// government/health sites in Aug 2023 — this site doesn't qualify, and this exact bug
// has recurred twice already (fixed page-by-page in June, reappeared on 10 new pages
// by July because there was no shared component or guard). Run before every deploy.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = join(import.meta.dirname, '..', 'src', 'pages');
const PATTERN = /['"]@type['"]\s*:\s*['"]FAQPage['"]/;

function walk(dir) {
  const hits = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      hits.push(...walk(full));
    } else if (entry.endsWith('.astro')) {
      const content = readFileSync(full, 'utf-8');
      if (PATTERN.test(content)) hits.push(full);
    }
  }
  return hits;
}

function main() {
  const hits = walk(PAGES_DIR);
  if (hits.length > 0) {
    console.error('FAQPage schema found — not allowed on this site (gov/health only, Aug 2023 Google restriction):');
    for (const hit of hits) console.error(`  ${hit}`);
    process.exit(1);
  }
  console.log('No FAQPage schema found.');
}

main();
