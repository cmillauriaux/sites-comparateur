#!/usr/bin/env node
/**
 * Generate a grounded article for the next pending keyword in a (niche, market).
 *
 * Flow:
 *   1. Pick highest-score pending keyword for (niche, market)
 *   2. Mark "writing" → scrape sources from sources.config.js[niche][market]
 *   3. Abort if < 2 sources reachable (anti-plagiarism: forces synthesis)
 *   4. Build a per-market grounded prompt (Les Numériques voice for FR,
 *      Wirecutter voice for US, Which?/TechRadar voice for GB)
 *   5. Spawn Claude Code CLI; CLI writes the .mdx
 *   6. Validate output → fetch Amazon image+ASIN+price (correct marketplace)
 *      → inject placeholders → update queue → "published"
 *
 * Usage:
 *   node packages/scripts/article-generator.js --niche jardin-bricolage --market fr
 *   node packages/scripts/article-generator.js --site jardin-bricolage-us
 *   MAX_ARTICLES_PER_RUN=3 node packages/scripts/article-generator.js
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import slugger from 'github-slugger';

import { REPO_ROOT, SITES_DIR, requireEnv } from './lib/env.js';
import { readQueue, writeQueue, appendPublished, getBucket } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, isLaunched } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import { fetchProductImages, injectImagePaths, injectImageAttributes, injectAffiliateAsins, injectPrices } from './lib/product-images.js';
import { buildPrompt } from './lib/prompts.js';
import { getSourcesFor } from '@comparateur/config/sources';

const MAX_ARTICLES_PER_RUN = parseInt(process.env.MAX_ARTICLES_PER_RUN || '2', 10);
const MIN_SOURCES = 2;
const slug = new slugger();

function pickNextPending(queue, niche, market) {
  const bucket = queue?.[niche]?.[market] || [];
  return bucket
    .filter(k => k.status === 'pending' && (k.errorCount || 0) < 3)
    .sort((a, b) => b.score - a.score)[0];
}

async function generateOne(siteConfig) {
  const { niche, market } = siteConfig;
  const queue = readQueue();
  const next = pickNextPending(queue, niche, market);

  if (!next) {
    console.log(`ℹ️  ${niche}/${market}: no pending keyword (queue empty or all errored). Run dataforseo-keywords or content-updater.`);
    return null;
  }

  console.log(`\n✍️  ${niche}/${market}: "${next.keyword}" (vol=${next.volume}, kd=${next.kd}, score=${next.score}, intent=${next.intent})`);

  // Reserve the slot to prevent parallel duplication.
  next.status = 'writing';
  writeQueue(queue);

  try {
    // 1. Scrape sources whitelisted for this (niche, market)
    const sources = getSourcesFor(niche, market);
    if (sources.length === 0) {
      throw new Error(`no sources configured for (${niche}, ${market}) — add entries to sources.config.js`);
    }
    console.log(`  🔍 Scraping ${sources.filter(s => s.scrape).length} sources…`);
    const { sources: scraped, failed, enough } = await scrapeSourcesForKeyword(sources, next.keyword, { minSuccess: MIN_SOURCES });
    console.log(`  📥 ${scraped.length} sources collected (${failed.length} failed)`);

    if (!enough) {
      throw new Error(`only ${scraped.length} sources collected, need ${MIN_SOURCES} minimum (anti-plagiarism)`);
    }

    // 2. Compute slug + output path. Articles are .mdx so they can embed
    // Astro components (<ProductCard />, <ComparisonTable />, ...).
    const articleSlug = slug.slug(next.keyword);
    const outputDir = resolve(SITES_DIR, niche, market, 'src/content/articles');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(outputDir, `${articleSlug}.mdx`);

    if (existsSync(outputPath)) {
      throw new Error(`output already exists: ${outputPath}`);
    }

    // 3. Build prompt and invoke Claude Code CLI
    const prompt = buildPrompt({
      keyword: next.keyword,
      intent: next.intent,
      scrapedSources: scraped,
      siteConfig,
      market,
      articleSlug,
      outputPath,
    });

    console.log(`  🤖 Invoking Claude Code CLI…`);
    const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
    const result = spawnSync('claude', ['-p', '--dangerously-skip-permissions', prompt], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
      cwd: REPO_ROOT,
    });

    if (result.status !== 0) {
      throw new Error(`claude CLI exited with status ${result.status}`);
    }

    // 4. Verify output
    if (!existsSync(outputPath)) {
      throw new Error(`Claude finished but did not write ${outputPath} (possible ERROR_INSUFFICIENT_SOURCES)`);
    }
    const written = readFileSync(outputPath, 'utf-8');
    if (written.includes('ERROR_INSUFFICIENT_SOURCES')) {
      throw new Error('Claude reported ERROR_INSUFFICIENT_SOURCES in the article body');
    }
    if (!written.startsWith('---')) {
      throw new Error('Generated file is missing YAML frontmatter');
    }

    // 5. Post-pass: fetch images + ASINs from Amazon (correct marketplace) and inject.
    const productNames = new Set();
    for (const m of written.matchAll(/\bimage\s*[:=]\s*(["'])auto:([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<AffiliateButton\b[\s\S]*?\bproduct\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<ProductCard\b[\s\S]*?\bname\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());

    if (productNames.size > 0) {
      const productList = [...productNames];
      console.log(`  🛒 Fetching ${productList.length} products from amazon (${market})…`);
      const { imageMap, asinMap, priceMap } = await fetchProductImages({ niche, market, articleSlug, products: productList });
      let updated = injectImagePaths(written, imageMap);
      updated = injectImageAttributes(updated, imageMap);
      updated = injectAffiliateAsins(updated, asinMap);
      updated = injectPrices(updated, priceMap);
      writeFileSync(outputPath, updated);
      const imgs = Object.values(imageMap).filter(Boolean).length;
      const asins = Object.values(asinMap).filter(Boolean).length;
      const prices = Object.values(priceMap).filter(Boolean).length;
      console.log(`  🖼  ${imgs}/${productList.length} images · 🔗 ${asins}/${productList.length} ASINs · 💶 ${prices}/${productList.length} prices`);
    }

    // 6. Promote in queue + register published URL. The URL subdirectory is
    // localized per market (FR: comparatifs / avis / guides ; US/GB:
    // comparisons / reviews / guides). Source of truth = packages/config/
    // i18n.js#slugComparisons/slugReviews/slugGuides — must stay in lockstep
    // with the Astro page directory names under src/pages/<slug>/.
    const subdirByIntent = {
      fr: { comparatif: 'comparatifs', avis: 'avis',     guide: 'guides' },
      us: { comparatif: 'comparisons', avis: 'reviews',  guide: 'guides' },
      gb: { comparatif: 'comparisons', avis: 'reviews',  guide: 'guides' },
    };
    const subdir = subdirByIntent[market]?.[next.intent] ?? 'guides';
    const publishedUrl = `https://${siteConfig.domain}/${subdir}/${articleSlug}/`;

    const fresh = readQueue();
    const bucket = getBucket(fresh, niche, market);
    const idx = bucket.findIndex(k => k.keyword === next.keyword);
    if (idx !== -1) {
      bucket[idx].status = 'published';
      bucket[idx].publishedUrl = publishedUrl;
      bucket[idx].publishedAt = new Date().toISOString();
      writeQueue(fresh);
    }

    appendPublished({
      url: publishedUrl,
      niche,
      market,
      keyword: next.keyword,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });

    console.log(`  ✅ Published: ${publishedUrl}`);
    return publishedUrl;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    const fresh = readQueue();
    const bucket = fresh?.[niche]?.[market] || [];
    const idx = bucket.findIndex(k => k.keyword === next.keyword);
    if (idx !== -1) {
      bucket[idx].status = 'pending';
      bucket[idx].errorCount = (bucket[idx].errorCount || 0) + 1;
      bucket[idx].lastError = err.message;
      writeQueue(fresh);
    }
    return null;
  }
}

async function run(targets) {
  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    let written = 0;
    for (let i = 0; i < MAX_ARTICLES_PER_RUN; i++) {
      const url = await generateOne(siteConfig);
      if (url) written++;
      else break;
    }
    console.log(`\n📊 ${niche}/${market}: ${written}/${MAX_ARTICLES_PER_RUN} articles generated`);
  }
}

const args = parseArgs(process.argv.slice(2));
const targets = resolveTargets(args);
run(targets).catch(err => {
  console.error(err);
  process.exit(1);
});
