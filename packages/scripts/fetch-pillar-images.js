#!/usr/bin/env node
/**
 * Download free-license category images for a site's pillar pages.
 * Uses Pexels by default (PEXELS_API_KEY).
 *
 * Usage:
 *   node packages/scripts/fetch-pillar-images.js --site jardin-bricolage
 */
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SITES_DIR, requireEnv } from './lib/env.js';
import { parseArgs, resolveSiteArg } from './lib/site-config.js';
import { IMAGE_SOURCES, IMAGE_QUERIES } from '@comparateur/config/images';

async function searchPexels(query) {
  const key = requireEnv('PEXELS_API_KEY');
  const url = `${IMAGE_SOURCES.pexels.baseUrl}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const photo = data.photos?.[0];
  return photo?.src?.large2x || photo?.src?.large || null;
}

async function downloadImage(url, outputPath) {
  if (!url) return false;
  if (existsSync(outputPath)) {
    console.log(`  ⏭  exists: ${outputPath}`);
    return false;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(outputPath));
  console.log(`  ✅ ${outputPath}`);
  return true;
}

async function fetchForSite(niche) {
  const queries = IMAGE_QUERIES[niche];
  if (!queries) throw new Error(`Unknown niche: ${niche}`);

  const outputDir = resolve(SITES_DIR, niche, 'public/images');
  mkdirSync(outputDir, { recursive: true });

  console.log(`\n📷 ${niche}`);

  // Hero
  try {
    const heroUrl = await searchPexels(queries.hero[0]);
    await downloadImage(heroUrl, join(outputDir, 'hero.jpg'));
  } catch (err) {
    console.warn(`  ⚠️  hero failed: ${err.message}`);
  }

  // Categories
  for (const [category, terms] of Object.entries(queries.categories)) {
    try {
      const url = await searchPexels(terms[0]);
      await downloadImage(url, join(outputDir, `category-${category}.jpg`));
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.warn(`  ⚠️  ${category} failed: ${err.message}`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const targets = resolveSiteArg(args.site);
(async () => {
  for (const n of targets) await fetchForSite(n);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
