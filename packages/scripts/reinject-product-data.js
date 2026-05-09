#!/usr/bin/env node
/**
 * Re-run the post-generation Amazon enrichment (image / ASIN / price) on an
 * already-generated article without re-invoking Claude. Useful after tuning
 * findAmazonProduct or the injection logic — saves a Claude credit and keeps
 * the body text untouched.
 *
 * Usage:
 *   node packages/scripts/reinject-product-data.js --niche jardin-bricolage --market us --slug best-cordless-drill
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITES_DIR } from './lib/env.js';
import { parseArgs } from './lib/site-config.js';
import { fetchProductImages, injectImagePaths, injectImageAttributes, injectAffiliateAsins, injectPrices } from './lib/product-images.js';
import { closeBrowser } from './lib/browser.js';

const args = parseArgs(process.argv.slice(2));
const { niche, market, slug } = args;
if (!niche || !market || !slug) {
  console.error('Usage: --niche <n> --market <m> --slug <article-slug>');
  process.exit(1);
}

const articlePath = resolve(SITES_DIR, niche, market, 'src/content/articles', `${slug}.mdx`);
let written = readFileSync(articlePath, 'utf-8');

// Strip previously-injected empty attributes so the matcher can refill them.
// A prior run that failed leaves `image=""` / `asin=""` / `price=""` markers
// which look "already set" to injectAttributeByProductName and cause it to
// skip the entry. Removing them puts the components back in a clean state.
written = written
  .replace(/\s*\bimage\s*=\s*(["'])\s*\1/g, '')
  .replace(/\s*\basin\s*=\s*(["'])\s*\1/g, '')
  .replace(/\s*\bprice\s*=\s*(["'])\s*\1/g, '');

const productNames = new Set();
for (const m of written.matchAll(/\bimage\s*[:=]\s*(["'])auto:([^"']+)\1/g)) productNames.add(m[2].trim());
for (const m of written.matchAll(/<AffiliateButton\b[\s\S]*?\bproduct\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());
for (const m of written.matchAll(/<ProductCard\b[\s\S]*?\bname\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());

const products = [...productNames];
console.log(`🛒 Re-fetching ${products.length} products from amazon (${market})…`);
const { imageMap, asinMap, priceMap } = await fetchProductImages({ niche, market, articleSlug: slug, products });

let updated = injectImagePaths(written, imageMap);
updated = injectImageAttributes(updated, imageMap);
updated = injectAffiliateAsins(updated, asinMap);
updated = injectPrices(updated, priceMap);
writeFileSync(articlePath, updated);

const imgs = Object.values(imageMap).filter(Boolean).length;
const asins = Object.values(asinMap).filter(Boolean).length;
const prices = Object.values(priceMap).filter(Boolean).length;
console.log(`🖼  ${imgs}/${products.length} images · 🔗 ${asins}/${products.length} ASINs · 💶 ${prices}/${products.length} prices`);

await closeBrowser();
