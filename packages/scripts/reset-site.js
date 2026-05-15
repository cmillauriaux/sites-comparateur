#!/usr/bin/env node
/**
 * Wipe-and-redo helper for one (niche, market). Used to validate the pipeline
 * end-to-end on a fresh corpus when matching/validation logic changed and
 * existing articles can't be trusted.
 *
 * What it touches:
 *   - sites/<niche>/<market>/src/content/articles/*.mdx       — DELETED
 *   - sites/<niche>/<market>/public/images/{heroes,inline,products}/ — DELETED
 *   - data/published-urls.json                               — filtered
 *   - data/semrush-priorities.json[niche][market]             — opps reset to pending
 *   - data/amazon-gallery-cache/<market>-*.json               — deleted
 *   - data/match-validation-cache/<niche>-<market>-*.json     — deleted
 *
 * What it preserves:
 *   - sites/<niche>/<market>/src/content/pages/                — legal pages
 *   - sites/<niche>/<market>/public/*                          — favicon, static assets
 *   - data/indexation-requests.json                            — GSC log (existing URLs become 404, re-seed re-submits)
 *   - data/amazon-dfs-cache/                                   — DFS cache stays (cheap to re-use; not necessarily stale)
 *   - opp scoring / keywords in semrush-priorities.json        — only status/bundle/publishedUrl are reset
 *
 * Usage:
 *   node packages/scripts/reset-site.js --niche jardin-bricolage --market fr           # dry-run
 *   node packages/scripts/reset-site.js --niche jardin-bricolage --market fr --confirm # actually delete
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { REPO_ROOT, SITES_DIR, DATA_DIR } from './lib/env.js';
import { parseArgs } from './lib/site-config.js';

function listArticles(siteContentDir) {
  const articlesDir = join(siteContentDir, 'articles');
  if (!existsSync(articlesDir)) return [];
  return readdirSync(articlesDir)
    .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    .map(f => join(articlesDir, f));
}

function listImageDirs(publicDir) {
  const out = [];
  for (const sub of ['heroes', 'inline', 'products']) {
    const dir = join(publicDir, 'images', sub);
    if (existsSync(dir)) out.push(dir);
  }
  return out;
}

function listCacheFiles(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => join(dir, f));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { niche, market, confirm } = args;

  if (!niche || !market) {
    console.error('Usage: reset-site.js --niche <niche> --market <fr|us|gb> [--confirm]');
    process.exit(1);
  }

  const siteDir = resolve(SITES_DIR, niche, market);
  if (!existsSync(siteDir)) {
    console.error(`❌ ${niche}/${market}: site directory not found at ${siteDir}`);
    process.exit(1);
  }

  const articles = listArticles(join(siteDir, 'src/content'));
  const imageDirs = listImageDirs(join(siteDir, 'public'));
  const amazonGalleryCacheFiles = listCacheFiles(join(DATA_DIR, 'amazon-gallery-cache'), `${market}-`);
  const matchValidationCacheFiles = listCacheFiles(join(DATA_DIR, 'match-validation-cache'), `${niche}-${market}-`);

  const publishedPath = resolve(DATA_DIR, 'published-urls.json');
  const prioritiesPath = resolve(DATA_DIR, 'semrush-priorities.json');
  const publishedAll = existsSync(publishedPath) ? JSON.parse(readFileSync(publishedPath, 'utf-8')) : [];
  const publishedForSite = publishedAll.filter(e => e.niche === niche && e.market === market);

  const prioritiesAll = existsSync(prioritiesPath) ? JSON.parse(readFileSync(prioritiesPath, 'utf-8')) : {};
  const oppsForSite = prioritiesAll?.[niche]?.[market] ?? [];

  console.log(`\nReset plan for ${niche}/${market}:`);
  console.log(`  articles to delete:                ${articles.length}`);
  console.log(`  image dirs to delete:              ${imageDirs.length} (${imageDirs.map(d => d.replace(siteDir + '/', '')).join(', ') || '–'})`);
  console.log(`  published-urls.json entries:       ${publishedForSite.length} → 0`);
  console.log(`  semrush-priorities opps to reset:  ${oppsForSite.length}`);
  console.log(`  amazon-gallery-cache files:        ${amazonGalleryCacheFiles.length}`);
  console.log(`  match-validation-cache files:      ${matchValidationCacheFiles.length}`);

  if (!confirm) {
    console.log(`\nDry-run. Re-run with --confirm to actually delete.`);
    return;
  }

  console.log(`\n🧹 Deleting…`);

  // 1) Articles
  for (const path of articles) rmSync(path, { force: true });
  console.log(`  ✅ ${articles.length} articles deleted`);

  // 2) Image dirs (recursive)
  for (const dir of imageDirs) rmSync(dir, { recursive: true, force: true });
  console.log(`  ✅ ${imageDirs.length} image dirs deleted`);

  // 3) published-urls.json — filter out site entries
  const publishedKept = publishedAll.filter(e => !(e.niche === niche && e.market === market));
  writeFileSync(publishedPath, JSON.stringify(publishedKept, null, 2) + '\n');
  console.log(`  ✅ published-urls.json: kept ${publishedKept.length} / removed ${publishedForSite.length}`);

  // 4) semrush-priorities — reset each opp for this (niche, market)
  if (prioritiesAll?.[niche]?.[market]) {
    for (const opp of prioritiesAll[niche][market]) {
      delete opp.bundle;
      opp.status = 'pending';
      delete opp.publishedUrl;
      delete opp.generatedAt;
      opp.errorCount = 0;
      delete opp.lastError;
    }
    writeFileSync(prioritiesPath, JSON.stringify(prioritiesAll, null, 2) + '\n');
    console.log(`  ✅ ${oppsForSite.length} priorities opps reset to pending`);
  }

  // 5) Caches
  for (const path of amazonGalleryCacheFiles) rmSync(path, { force: true });
  console.log(`  ✅ ${amazonGalleryCacheFiles.length} amazon-gallery-cache files deleted`);
  for (const path of matchValidationCacheFiles) rmSync(path, { force: true });
  console.log(`  ✅ ${matchValidationCacheFiles.length} match-validation-cache files deleted`);

  console.log(`\n🌱 Ready to re-seed: node packages/scripts/article-generator.js --seed --niche ${niche} --market ${market} --bundles 6`);
}

main();
