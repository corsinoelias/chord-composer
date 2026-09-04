// Fails if any page declares a banned JSON-LD @type. Started as an FAQPage-only check
// (Google restricted FAQ rich results to government/health sites in Aug 2023, and this
// site doesn't qualify) but that single-type check let a HowTo schema (deprecated by
// Google since Sept 2023) slip onto a new page a cycle later — same failure mode, new
// type. This is a denylist so the next banned type doesn't need a new script. Run before
// every deploy (wired into netlify.toml's build command, not just available manually).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from the module URL, not `import.meta.dirname`: that only exists from
// Node 20.11, and on anything older it is `undefined` — which made `join()` throw
// before a single page was scanned. A guard that crashes instead of checking is
// worse than no guard, because the crash looks like an unrelated tooling problem.
const PAGES_DIR = fileURLToPath(new URL('../src/pages/', import.meta.url));
const BANNED_TYPES = ['FAQPage', 'HowTo'];

function walk(dir) {
  const hits = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      hits.push(...walk(full));
    } else if (entry.endsWith('.astro')) {
      const content = readFileSync(full, 'utf-8');
      for (const type of BANNED_TYPES) {
        const pattern = new RegExp(`['"]@type['"]\\s*:\\s*['"]${type}['"]`);
        if (pattern.test(content)) hits.push({ file: full, type });
      }
    }
  }
  return hits;
}

function main() {
  const hits = walk(PAGES_DIR);
  if (hits.length > 0) {
    console.error('Banned JSON-LD schema type(s) found:');
    for (const { file, type } of hits) console.error(`  ${type} — ${file}`);
    process.exit(1);
  }
  console.log('No banned schema types found.');
}

main();
