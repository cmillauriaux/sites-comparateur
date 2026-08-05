#!/usr/bin/env node
/**
 * Post-build guard: fail if the built site ships untagged Amazon links.
 *
 * Why this exists: `AffiliateButton.astro` resolves the Associates tag at BUILD
 * time from `AMAZON_AFFILIATE_ID_<MARKET>`. When that env var is absent from the
 * build step (it lived only on the article-generation step until 2026-08),
 * `buildAmazonUrl` silently emits `https://www.amazon.fr/dp/<asin>/` with no
 * `tag=` — the site looks perfectly normal and earns zero commission. A console
 * warning is not enough; this turns it into a red build before deploy.
 *
 * Usage: node packages/scripts/check-affiliate-tags.js --niche <n> --market <m>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const MARKETPLACE = { fr: 'amazon.fr', us: 'amazon.com', gb: 'amazon.co.uk' };

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const niche = arg('niche');
const market = arg('market');
if (!niche || !market) {
  console.error('usage: check-affiliate-tags.js --niche <niche> --market <fr|us|gb>');
  process.exit(2);
}
const host = MARKETPLACE[market];
if (!host) {
  console.error(`unknown market "${market}" (expected fr, us or gb)`);
  process.exit(2);
}

const dist = join(REPO_ROOT, 'sites', niche, market, 'dist');

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* htmlFiles(full);
    else if (entry.endsWith('.html')) yield full;
  }
}

// Only monetised CTAs are in scope. `AffiliateButton` stamps `data-affiliate`
// on those and omits it on the non-affiliate merchant fallback; `<SourceList>`
// citations may legitimately point at Amazon untagged, so anchor-level matching
// (not a bare URL grep) is what keeps this check honest.
const anchorRe = /<a\b[^>]*\bdata-affiliate=[^>]*>/g;
const hrefRe = /\bhref="([^"]*)"/;
const hostRe = new RegExp(`^https://www\\.${host.replace(/\./g, '\\.')}/`);

const untagged = [];
let tagged = 0;

for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const anchor of html.match(anchorRe) ?? []) {
    const url = anchor.match(hrefRe)?.[1];
    if (!url || !hostRe.test(url)) continue;   // Awin / other programs: out of scope
    // Astro HTML-escapes `&` as `&#38;`, so accept both separators.
    if (/[?&](amp;|#38;)?tag=[^&"']+/.test(url)) tagged++;
    else untagged.push({ file: file.slice(dist.length + 1), url });
  }
}

if (tagged === 0 && untagged.length === 0) {
  console.log(`· no ${host} affiliate CTA in sites/${niche}/${market}/dist — nothing to check.`);
  process.exit(0);
}

if (untagged.length > 0) {
  console.error(
    `\n✗ ${untagged.length} untagged ${host} link(s) in sites/${niche}/${market}/dist ` +
    `— AMAZON_AFFILIATE_ID_${market.toUpperCase()} was missing at build time.\n`
  );
  for (const { file, url } of untagged.slice(0, 10)) console.error(`  ${file}: ${url}`);
  if (untagged.length > 10) console.error(`  ... and ${untagged.length - 10} more`);
  process.exit(1);
}

console.log(`✓ ${tagged} ${host} link(s), all tagged (${niche}/${market}).`);
