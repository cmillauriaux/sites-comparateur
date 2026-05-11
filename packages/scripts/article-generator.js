#!/usr/bin/env node
/**
 * Generate a grounded article for the next pending keyword in a (niche, market).
 *
 * Flow:
 *   1. Pick highest-score pending keyword for (niche, market)
 *   2. Mark "writing" → scrape sources from sources.config.js[niche][market]
 *   3. Abort if < 3 sources reachable (anti-plagiarism + anti scaled-content-abuse)
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import slugger from 'github-slugger';
import YAML from 'yaml';

import { REPO_ROOT, SITES_DIR, DATA_DIR, requireEnv } from './lib/env.js';
import { readQueue, writeQueue, appendPublished, getBucket, readPublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, isLaunched } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import { fetchProductImages, injectImagePaths, injectImageAttributes, injectAffiliateAsins, injectPrices, injectMerchantUrls } from './lib/product-images.js';
import { buildPrompt } from './lib/prompts.js';
import { validateGeneratedArticle } from './lib/article-validator.js';
import { extractFaqFromBody } from './lib/faq-extract.js';
import { scrubRawPrices } from './lib/price-scrubber.js';
import { fetchArticleHero } from './lib/hero-image.js';
import { tokenize } from './lib/cluster.js';
import { extractTopicFromKeyword } from './lib/intent.js';
import { getCadence } from './lib/cadence.js';
import { getSourcesFor } from '@comparateur/config/sources';
import { i18n } from '@comparateur/config';
import { MARKET_SEMRUSH } from '@comparateur/config/niches';

const MAX_ARTICLES_PER_RUN = parseInt(process.env.MAX_ARTICLES_PER_RUN || '2', 10);
// 3 = anti scaled-content-abuse floor (matches Zod schema + validator).
// Bumped from 2 in the anti-AI-spam pass — see CLAUDE.md "Anti-spam AI".
const MIN_SOURCES = 3;
const slug = new slugger();

/**
 * Parse the article's `## FAQ` section and persist it as `faq: [{ q, a }]` in
 * frontmatter so ArticleLayout can emit the FAQPage JSON-LD at build time.
 * Silent no-op when no FAQ section is found or already present.
 */
function injectFaqFrontmatter(path) {
  const content = readFileSync(path, 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return;
  let frontmatter;
  try { frontmatter = YAML.parse(m[1]) ?? {}; } catch { return; }
  if (Array.isArray(frontmatter.faq) && frontmatter.faq.length > 0) return;
  const faq = extractFaqFromBody(m[2]);
  if (faq.length === 0) return;
  frontmatter.faq = faq;
  // lineWidth: 0 prevents YAML from re-flowing long Q/A strings into folded
  // blocks that re-render unpredictably.
  const yamlText = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  writeFileSync(path, `---\n${yamlText}\n---\n${m[2]}`);
  console.log(`  ❓ FAQ extracted: ${faq.length} Q&A`);
}

/**
 * Parse `git status --porcelain=v1 -z` output into a Set of paths.
 * Records are NUL-terminated; each is "XY <path>". Renames have a second
 * NUL-terminated path (the original name) — drop empties to skip those.
 */
function parseGitStatus(stdout) {
  return new Set(
    stdout.split('\0')
      .filter(Boolean)
      .map(record => record.length > 3 ? record.slice(3) : '')
      .filter(Boolean),
  );
}

function pickNextPending(queue, niche, market) {
  const bucket = queue?.[niche]?.[market] || [];
  return bucket
    .filter(k => k.status === 'pending' && (k.errorCount || 0) < 3)
    .sort((a, b) => b.score - a.score)[0];
}

/**
 * Core generation pipeline — pure function of (siteConfig, keyword inputs).
 *
 * Reused by both the queue-driven path (generateOne, the daily pipeline) and
 * the cluster-driven path (generateFromCluster, the manual Semrush flow).
 * The queue/registry bookkeeping (mark writing → published, errorCount, etc.)
 * lives in the wrappers — this function only knows how to turn a keyword brief
 * into a published .mdx, and throws on any failure.
 *
 * @returns {Promise<{publishedUrl: string, articleSlug: string, outputPath: string}>}
 */
/**
 * Strip every <AffiliateButton ...>…</AffiliateButton> (paired) + self-closing
 * <AffiliateButton .../> tag, plus every <ProductCard .../> self-closing tag.
 * Used by the avis no-affiliate fallback when zero ASIN resolves — we'd rather
 * publish the article as a no-CTA review than fail the run entirely.
 */
function stripAffiliateComponents(content) {
  return content
    .replace(/<AffiliateButton\b[^>]*>[\s\S]*?<\/AffiliateButton>/g, '')
    .replace(/<AffiliateButton\b[^>]*\/>/g, '')
    .replace(/<ProductCard\b[\s\S]*?\/>/g, '')
    // Collapse the blank lines left behind so the .mdx doesn't ship with
    // 4-line gaps where components used to sit.
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Set a top-level frontmatter scalar field. Used by the avis no-affiliate
 * fallback to flag the article so validator + Astro schema both know to skip
 * the affiliate gate.
 */
function setFrontmatterField(content, field, value) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return content;
  let frontmatter;
  try { frontmatter = YAML.parse(m[1]) ?? {}; } catch { return content; }
  frontmatter[field] = value;
  const yamlText = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlText}\n---\n${m[2]}`;
}

async function generateArticle(siteConfig, { keyword, intent, secondaryKeywords = [], parentComparatifUrl, parentComparatifTitle }) {
  const { niche, market } = siteConfig;

  // 1. Scrape sources whitelisted for this (niche, market)
  const sources = getSourcesFor(niche, market);
  if (sources.length === 0) {
    throw new Error(`no sources configured for (${niche}, ${market}) — add entries to sources.config.js`);
  }
  console.log(`  🔍 Scraping ${sources.filter(s => s.scrape).length} sources…`);
  const { sources: scraped, failed, enough, editorialCount } = await scrapeSourcesForKeyword(sources, keyword, { minSuccess: MIN_SOURCES, minEditorial: 1 });
  console.log(`  📥 ${scraped.length} sources collected (${failed.length} failed) — ${editorialCount} editorial`);

  if (!enough) {
    throw new Error(`insufficient sources: ${scraped.length} total / ${editorialCount} editorial (need ${MIN_SOURCES} total + 1 editorial)`);
  }

  // 2. Compute slug + output path. Articles are .mdx so they can embed
  // Astro components (<ProductCard />, <ComparisonTable />, ...).
  const articleSlug = slug.slug(keyword);
  const outputDir = resolve(SITES_DIR, niche, market, 'src/content/articles');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${articleSlug}.mdx`);

  if (existsSync(outputPath)) {
    throw new Error(`output already exists: ${outputPath}`);
  }

  // 3. Build prompt and invoke Claude Code CLI
  // Internal-linking input: pass the 20 most recent published URLs in the
  // same (niche, market) so the model can hyperlink into them and form a
  // SEO cluster instead of writing isolated pages.
  const existingArticles = readPublished()
    .filter(u => u.niche === niche && u.market === market && u.url)
    .slice(-20)
    .map(u => ({ title: u.keyword, url: u.url }));
  const prompt = buildPrompt({
    keyword,
    intent,
    secondaryKeywords,
    scrapedSources: scraped,
    siteConfig,
    market,
    articleSlug,
    outputPath,
    existingArticles,
    // Only consumed by buildGuidePrompt — pillar pages must link 2× to their
    // parent comparatif. Undefined for other intents.
    parentComparatifUrl,
    parentComparatifTitle,
  });

  // Snapshot the dirty paths BEFORE invoking Claude so we can diff against the
  // post-Claude state. Without this baseline, any pre-existing uncommitted
  // changes (e.g. local dev work) trip the post-flight check as false positives.
  const preDirty = parseGitStatus(spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout || '');

  console.log(`  🤖 Invoking Claude Code CLI…`);
  const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
  // Pipe prompt via stdin: argv has a ~128KB ARG_MAX cap on Linux that long
  // scrape blocks would blow up. Stdin has no such limit.
  const result = spawnSync('claude', ['-p', '--dangerously-skip-permissions'], {
    input: prompt,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
    cwd: REPO_ROOT,
  });

  if (result.status !== 0) {
    throw new Error(`claude CLI exited with status ${result.status}`);
  }

  // Post-flight: deny-list of paths Claude must NOT write under any
  // circumstance. Threat model = prompt-injection from scraped sources making
  // the CLI exfiltrate secrets or rewrite settings — NOT "Claude edits a
  // source file". The previous allow-list approach false-flagged whenever the
  // user edited project source concurrently with a long-running batch (the
  // pre/post diff can't tell user-edits-during-run from claude-writes).
  // Reframing as deny-list keeps protection on the actual threat surface
  // while letting the user iterate on the codebase during runs.
  const postDirty = parseGitStatus(spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: REPO_ROOT, encoding: 'utf-8' }).stdout || '');
  const newlyDirty = [...postDirty].filter(p => !preDirty.has(p));
  const offendingPaths = newlyDirty.filter(p =>
    /^\.env(\.|$)/.test(p) ||
    p.startsWith('.claude/settings') ||
    p.startsWith('/'),                          // absolute paths = outside repo (e.g. ~/.aws)
  );
  if (offendingPaths.length > 0) {
    throw new Error(`Claude touched protected paths: ${offendingPaths.slice(0, 5).join(', ')}`);
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
  // Skipped entirely for informational pieces — they have no product
  // components by design (weekly off-affiliate balance articles).
  const productNames = new Set();
  if (intent !== 'informational') {
    for (const m of written.matchAll(/\bimage\s*[:=]\s*(["'])auto:([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<AffiliateButton\b[\s\S]*?\bproduct\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<ProductCard\b[\s\S]*?\bname\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());
  }

  if (productNames.size > 0) {
    const productList = [...productNames];
    console.log(`  🛒 Fetching ${productList.length} products from amazon (${market})…`);
    const { imageMap, asinMap, priceMap, nonAffiliateMap } = await fetchProductImages({ niche, market, articleSlug, products: productList });
    let updated = injectImagePaths(written, imageMap);
    updated = injectImageAttributes(updated, imageMap);
    updated = injectAffiliateAsins(updated, asinMap);
    updated = injectPrices(updated, priceMap);
    updated = injectMerchantUrls(updated, nonAffiliateMap);

    // Avis no-affiliate fallback. When a single-product review can't resolve
    // any ASIN AND no non-affiliate merchant URL was found, the AffiliateButton
    // / ProductCard tags would render with broken or empty CTAs. Rather than
    // failing the run, strip the components and publish as an off-affiliate
    // review — the same dilution lever as informational/guide pieces. Validator
    // honours `noAffiliate: true` to skip the ≥3 CTA gate.
    if (intent === 'avis') {
      const hasAnyAsin = Object.values(asinMap).some(Boolean);
      const hasAnyNonAff = nonAffiliateMap && Object.values(nonAffiliateMap).some(Boolean);
      if (!hasAnyAsin && !hasAnyNonAff) {
        console.log(`  ℹ️  No ASIN / non-affiliate URL resolved — fallback to no-affiliate avis`);
        updated = stripAffiliateComponents(updated);
        updated = setFrontmatterField(updated, 'noAffiliate', true);
      }
    }

    // Pre-validation pass: strip raw prices the model leaked into prose.
    // Component attributes (where injected prices live) are preserved.
    const scrubbed = scrubRawPrices(updated);
    if (scrubbed.count > 0) {
      console.log(`  🧹 Scrubbed ${scrubbed.count} raw price${scrubbed.count > 1 ? 's' : ''} from prose`);
      updated = scrubbed.content;
    }

    const validationErrors = validateGeneratedArticle(updated);
    if (validationErrors.length > 0) {
      throw new Error(`article validation failed: ${validationErrors.join('; ')}`);
    }

    writeFileSync(outputPath, updated);
    const imgs = Object.values(imageMap).filter(Boolean).length;
    const asins = Object.values(asinMap).filter(Boolean).length;
    const prices = Object.values(priceMap).filter(Boolean).length;
    const nonAff = Object.values(nonAffiliateMap || {}).filter(Boolean).length;
    console.log(`  🖼  ${imgs}/${productList.length} images · 🔗 ${asins}/${productList.length} ASINs · 🌐 ${nonAff} non-affiliés · 💶 ${prices}/${productList.length} prices`);
  } else {
    // No product post-pass to run — still scrub prices and validate so the
    // grounding gate + (for informational) the no-affiliate gate trip here.
    const scrubbed = scrubRawPrices(written);
    let finalContent = written;
    if (scrubbed.count > 0) {
      console.log(`  🧹 Scrubbed ${scrubbed.count} raw price${scrubbed.count > 1 ? 's' : ''} from prose`);
      finalContent = scrubbed.content;
      writeFileSync(outputPath, finalContent);
    }
    const validationErrors = validateGeneratedArticle(finalContent);
    if (validationErrors.length > 0) {
      throw new Error(`article validation failed: ${validationErrors.join('; ')}`);
    }
  }

  injectFaqFrontmatter(outputPath);

  // Per-article hero image: fetch a topic-specific photo from Pexels/Pixabay
  // and write `heroImage` + `heroImageAlt` into the frontmatter. The prompt
  // intentionally omits these fields so we have a clean injection point
  // here — otherwise every article would ship with the same generic
  // /images/hero.jpg (niche-level photo from fetch-pillar-images.js), which
  // reads as templated content and breaks topic-image relevance.
  try {
    const hero = await fetchArticleHero({ niche, market, articleSlug, keyword });
    if (hero) injectHeroFrontmatter(outputPath, hero);
  } catch (err) {
    console.warn(`  ⚠️  hero fetch failed: ${err.message}`);
  }

  // 6. Compute the published URL. The intent → subdir mapping comes from the
  // SAME i18n source used by the Astro [type]/ dynamic route (single source
  // of truth: packages/config/i18n.js#slug{Comparisons,Reviews,Guides}).
  //
  // Read the intent from the FINAL frontmatter, not the input intent: Claude
  // is allowed to promote/demote (e.g. cluster intent="informational" with a
  // single-product structure → article frontmatter intent="avis"). The URL
  // must follow the frontmatter or it 404s in production (Astro builds the
  // path off `data.intent`).
  const finalIntent = readFrontmatterIntent(outputPath) ?? intent;
  const slugs = i18n(market);
  const subdirByIntent = {
    comparatif:    slugs.slugComparisons,
    avis:          slugs.slugReviews,
    guide:         slugs.slugGuides,
    informational: slugs.slugGuides,
  };
  const subdir = subdirByIntent[finalIntent] ?? slugs.slugGuides;
  const publishedUrl = `https://${siteConfig.domain}/${subdir}/${articleSlug}/`;

  return { publishedUrl, articleSlug, outputPath, finalIntent };
}

function readFrontmatterIntent(path) {
  try {
    const content = readFileSync(path, 'utf-8');
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const fm = YAML.parse(m[1]) ?? {};
    return typeof fm.intent === 'string' ? fm.intent : null;
  } catch {
    return null;
  }
}

/**
 * Write `heroImage` + `heroImageAlt` into the frontmatter. Skips if either
 * is already set — never overwrites a manual editorial choice.
 */
function injectHeroFrontmatter(path, hero) {
  const content = readFileSync(path, 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return;
  let frontmatter;
  try { frontmatter = YAML.parse(m[1]) ?? {}; } catch { return; }
  if (frontmatter.heroImage && frontmatter.heroImageAlt) return;
  frontmatter.heroImage = frontmatter.heroImage ?? hero.publicPath;
  frontmatter.heroImageAlt = frontmatter.heroImageAlt ?? hero.alt;
  const yamlText = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  writeFileSync(path, `---\n${yamlText}\n---\n${m[2]}`);
}

/**
 * Best-effort cleanup of an aborted run: remove the .mdx Claude wrote so the
 * next retry doesn't trip the `output already exists` guard.
 *
 * Uses a fresh `Slugger` instance — github-slugger's `.slug()` is stateful and
 * appends "-1", "-2" on repeat calls within the same instance, so reusing the
 * module-level `slug` would compute the wrong path here.
 */
function cleanupOutput(siteConfig, keyword) {
  try {
    const articleSlug = new slugger().slug(keyword);
    const outputPath = resolve(SITES_DIR, siteConfig.niche, siteConfig.market, 'src/content/articles', `${articleSlug}.mdx`);
    if (existsSync(outputPath)) unlinkSync(outputPath);
  } catch { /* best-effort */ }
}

// ───────────────────────────────────────────────────────── QUEUE-DRIVEN PATH
// The daily pipeline. Picks the highest-score pending keyword from
// keywords-queue.json, generates, and updates the queue + published-urls.json.

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
    const { publishedUrl } = await generateArticle(siteConfig, {
      keyword: next.keyword,
      intent: next.intent,
    });
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
      niche, market,
      keyword: next.keyword,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });
    console.log(`  ✅ Published: ${publishedUrl}`);
    return publishedUrl;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    cleanupOutput(siteConfig, next.keyword);
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

// ──────────────────────────────────────────────────────── CLUSTER-DRIVEN PATH
// The Semrush manual flow. Looks up an opportunity in semrush-priorities.json
// by id, runs the same generation pipeline with secondary keywords injected
// into the prompt, then marks the opportunity `generated` and absorbs any
// matching keywords from keywords-queue.json so the daily pipeline doesn't
// re-publish them.

const PRIORITIES_PATH = resolve(DATA_DIR, 'semrush-priorities.json');

function readPriorities() {
  if (!existsSync(PRIORITIES_PATH)) return {};
  return JSON.parse(readFileSync(PRIORITIES_PATH, 'utf-8'));
}

function writePriorities(data) {
  writeFileSync(PRIORITIES_PATH, JSON.stringify(data, null, 2) + '\n');
}

function findOpportunity(registry, clusterId) {
  for (const niche of Object.keys(registry)) {
    for (const market of Object.keys(registry[niche])) {
      const found = registry[niche][market].find(o => o.id === clusterId);
      if (found) return { opp: found, niche, market };
    }
  }
  return null;
}

/**
 * Mark every queue keyword that matches the cluster's primary or any secondary
 * as `absorbed-by-cluster` so daily-articles.yml doesn't re-publish the same
 * topic. Compare on lowercase trim — Semrush and DataForSEO routinely diverge
 * on case and trailing punctuation.
 */
function absorbCoveredQueueKeywords(opp, publishedUrl) {
  const queue = readQueue();
  const bucket = queue?.[opp.niche]?.[opp.market];
  if (!bucket) return 0;
  const covered = new Set([opp.primaryKeyword, ...(opp.secondaryKeywords || [])]
    .map(k => k.toLowerCase().trim()));
  let absorbed = 0;
  for (const k of bucket) {
    if (k.status !== 'pending') continue;
    if (covered.has((k.keyword || '').toLowerCase().trim())) {
      k.status = 'absorbed-by-cluster';
      k.absorbedBy = publishedUrl;
      k.absorbedAt = new Date().toISOString();
      absorbed++;
    }
  }
  if (absorbed > 0) writeQueue(queue);
  return absorbed;
}

/**
 * Append a synthetic pillar opportunity ("Comment choisir son <topic>") to
 * the priorities registry, derived from a freshly-generated comparatif. The
 * pillar is `intent: 'guide'`, status `pending`, and carries `parentPublishedUrl`
 * + `parentPrimaryKeyword` so buildGuidePrompt can inject the editorial link.
 *
 * Idempotent: if `<clusterId>-pillar` already exists in the bucket (regardless
 * of status), this is a no-op so re-running a cluster never spawns duplicates.
 *
 * Mutates `fresh` in place. The caller is responsible for `writePriorities(fresh)`.
 */
function enqueuePillarOpportunity({ fresh, niche, market, parentOpp, parentPublishedUrl }) {
  fresh[niche] = fresh[niche] || {};
  fresh[niche][market] = fresh[niche][market] || [];
  const bucket = fresh[niche][market];
  const pillarId = `${parentOpp.id}-pillar`;
  if (bucket.some(o => o.id === pillarId)) return;

  const topic = extractTopicFromKeyword(parentOpp.primaryKeyword);
  if (!topic) {
    console.warn(`  ⚠️  Could not derive topic from "${parentOpp.primaryKeyword}" — skipping pillar enqueue`);
    return;
  }
  const isFr = market === 'fr';
  const pillarKeyword = isFr ? `comment choisir ${topic}` : `how to choose ${topic}`;

  bucket.push({
    id: pillarId,
    niche, market,
    primaryKeyword: pillarKeyword,
    secondaryKeywords: [],
    intent: 'guide',
    status: 'pending',
    source: 'cluster-pillar',
    parentClusterId: parentOpp.id,
    parentPublishedUrl,
    parentPrimaryKeyword: parentOpp.primaryKeyword,
    // Inherit the parent's score so the pillar sorts alongside its source
    // cluster when --guide-only picks top-N by score.
    score: parentOpp.score ?? 0,
    totalVolume: parentOpp.totalVolume ?? 0,
    avgKD: parentOpp.avgKD ?? 0,
    createdAt: new Date().toISOString(),
  });
  console.log(`  🧭 Enqueued pillar: "${pillarKeyword}" (id=${pillarId})`);
}

async function generateFromCluster(clusterId) {
  const registry = readPriorities();
  const found = findOpportunity(registry, clusterId);
  if (!found) {
    console.error(`❌ No opportunity with id "${clusterId}" in ${PRIORITIES_PATH}`);
    console.error(`   Run: node packages/scripts/semrush-prioritize.js`);
    process.exit(1);
  }
  const { opp, niche, market } = found;

  if (opp.status === 'generated') {
    console.warn(`⚠️  Cluster "${clusterId}" already generated → ${opp.publishedUrl}`);
    return null;
  }

  const siteConfig = await loadSiteConfig(niche, market);
  if (!isLaunched(siteConfig)) {
    console.error(`❌ ${niche}/${market}: domain is placeholder (${siteConfig.domain}) — set the real domain in site.config.js first.`);
    process.exit(1);
  }

  console.log(`\n✍️  CLUSTER ${clusterId}: "${opp.primaryKeyword}"`);
  console.log(`   intent=${opp.intent} totalVolume=${opp.totalVolume} avgKD=${opp.avgKD} (${opp.secondaryKeywords?.length || 0} secondaries)`);

  try {
    const { publishedUrl, finalIntent } = await generateArticle(siteConfig, {
      keyword: opp.primaryKeyword,
      intent: opp.intent,
      secondaryKeywords: opp.secondaryKeywords || [],
      // For cluster-pillar opportunities: pass the parent comparatif URL +
      // its keyword (used as the link title in the pillar prompt).
      parentComparatifUrl: opp.parentPublishedUrl,
      parentComparatifTitle: opp.parentPrimaryKeyword,
    });

    // Mark the opportunity generated. Re-read the registry to avoid clobbering
    // a parallel mining run that may have added new opportunities since we
    // started.
    const fresh = readPriorities();
    const found2 = findOpportunity(fresh, clusterId);
    if (found2) {
      found2.opp.status = 'generated';
      found2.opp.publishedUrl = publishedUrl;
      found2.opp.generatedAt = new Date().toISOString();
    }

    // Auto-trigger pillar: when a comparatif cluster successfully ships, enqueue
    // its matching "Comment choisir son <topic>" pillar so the daily-guides
    // workflow can pick it up next. Idempotent — re-running the cluster never
    // duplicates the pillar. Skipped when the article's final intent isn't
    // `comparatif` (Claude is allowed to demote a cluster to avis/guide) or
    // when this opportunity is ITSELF a pillar (avoids recursion).
    if (finalIntent === 'comparatif' && opp.source !== 'cluster-pillar') {
      enqueuePillarOpportunity({ fresh, niche, market, parentOpp: opp, parentPublishedUrl: publishedUrl });
    }
    writePriorities(fresh);

    appendPublished({
      url: publishedUrl,
      niche, market,
      keyword: opp.primaryKeyword,
      secondaryKeywords: opp.secondaryKeywords || [],
      clusterId,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });

    const absorbed = absorbCoveredQueueKeywords(opp, publishedUrl);
    if (absorbed > 0) console.log(`  🔁 Absorbed ${absorbed} queue keyword(s) covered by this cluster`);

    console.log(`  ✅ Published: ${publishedUrl}`);
    return publishedUrl;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    cleanupOutput(siteConfig, opp.primaryKeyword);
    const fresh = readPriorities();
    const found2 = findOpportunity(fresh, clusterId);
    if (found2) {
      found2.opp.errorCount = (found2.opp.errorCount || 0) + 1;
      found2.opp.lastError = err.message;
      writePriorities(fresh);
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
    // Cadence ramp: the per-day affiliate cap depends on the site's maturity
    // (count of already-published URLs). Sandbox sites get cap=1, mature
    // sites get cap=2. The env-level `MAX_ARTICLES_PER_RUN` stays a hard
    // ceiling — cadence can lower it, never raise it.
    const cadence = getCadence(niche, market);
    const cap = Math.min(MAX_ARTICLES_PER_RUN, cadence.affiliateCap);
    console.log(`📊 cadence ${niche}/${market}: stage=${cadence.stage} published=${cadence.publishedCount} affCap=${cadence.affiliateCap} → run cap=${cap}`);
    let written = 0;
    for (let i = 0; i < cap; i++) {
      const url = await generateOne(siteConfig);
      if (url) written++;
      else break;
    }
    console.log(`\n📊 ${niche}/${market}: ${written}/${cap} articles generated`);
  }
}

// ─────────────────────────────────────────────────────── INFORMATIONAL PATH
// Weekly off-affiliate run. Picks the next pending keyword from the queue
// and rewrites it with intent='informational' (no product components, no
// affiliate links). Goal = dilute the affiliate-density signal that flags
// scaled content abuse. ALWAYS exactly 1 article per (niche, market) per
// invocation — this is a balance piece, not a volume play.
async function generateOneInformational(siteConfig) {
  const { niche, market } = siteConfig;
  const queue = readQueue();
  const next = pickNextPending(queue, niche, market);

  if (!next) {
    console.log(`ℹ️  ${niche}/${market}: no pending keyword for informational run.`);
    return null;
  }

  console.log(`\n📚 ${niche}/${market}: INFORMATIONAL "${next.keyword}" (vol=${next.volume}, kd=${next.kd})`);

  next.status = 'writing';
  writeQueue(queue);

  try {
    const { publishedUrl } = await generateArticle(siteConfig, {
      keyword: next.keyword,
      intent: 'informational',
    });
    const fresh = readQueue();
    const bucket = getBucket(fresh, niche, market);
    const idx = bucket.findIndex(k => k.keyword === next.keyword);
    if (idx !== -1) {
      bucket[idx].status = 'published';
      bucket[idx].publishedUrl = publishedUrl;
      bucket[idx].publishedAt = new Date().toISOString();
      bucket[idx].publishedAs = 'informational';
      writeQueue(fresh);
    }
    appendPublished({
      url: publishedUrl,
      niche, market,
      keyword: next.keyword,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
      isInformational: true,
    });
    console.log(`  ✅ Published (informational): ${publishedUrl}`);
    return publishedUrl;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    cleanupOutput(siteConfig, next.keyword);
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

async function runInformational(targets) {
  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    // Cadence gate: sandbox-stage sites publish ZERO informational pieces —
    // we'd rather concentrate the tiny weekly budget on one comparatif.
    // Warming+ stages allow it.
    const cadence = getCadence(niche, market);
    if (!cadence.allowInformational) {
      console.log(`⏭  ${niche}/${market}: informational disabled at stage=${cadence.stage} (published=${cadence.publishedCount})`);
      continue;
    }
    console.log(`📊 cadence ${niche}/${market}: stage=${cadence.stage} published=${cadence.publishedCount} → informational allowed`);
    await generateOneInformational(siteConfig);
  }
}

// Long-tail criteria (anti-sandbox): tight enough that picked clusters rank
// quickly without backlinks. Mirrors the LONGTAIL preset in semrush-prioritize.js.
const LONGTAIL_KD_CEILING = 19;
const LONGTAIL_MIN_TOKENS = 3;

/**
 * Pick the top N pending opportunities across the resolved (niche, market)
 * targets and generate them in score-desc order. Stops early on first failure
 * to avoid silently burning credits when something is broken (typically scrape
 * sources down or claude CLI auth expired).
 *
 * `longtail=true` restricts to clusters whose primary has ≥3 content tokens
 * AND avgKD ≤ 19 — the anti-sandbox profile for fresh sites. The flag works
 * even on a registry that was mined without --longtail (it just filters the
 * existing entries).
 */
async function runTopClusters(targets, count, { longtail = false, guideOnly = false } = {}) {
  const registry = readPriorities();
  const targetSet = new Set(targets.map(t => `${t.niche}/${t.market}`));

  const langByMarket = (m) => MARKET_SEMRUSH[m]?.language ?? 'fr';
  const isLongtail = (opp) => {
    if (opp.avgKD > LONGTAIL_KD_CEILING) return false;
    const tokens = tokenize(opp.primaryKeyword, langByMarket(opp.market));
    return tokens.size >= LONGTAIL_MIN_TOKENS;
  };

  // Defensive cadence cap (per (niche, market) in scope). The workflow-side
  // cadence-cli gate is the primary defence; this cache + filter protects
  // local runs where `--guide-only --count 5` would otherwise bypass the
  // stage caps for a sandbox-stage site.
  const cadenceCache = new Map();
  const cadenceFor = (niche, market) => {
    const key = `${niche}/${market}`;
    if (!cadenceCache.has(key)) cadenceCache.set(key, getCadence(niche, market));
    return cadenceCache.get(key);
  };

  // Flatten registry across the resolved scope, drop already-generated and
  // 3-strikes-out entries, sort by score desc.
  const candidates = [];
  for (const niche of Object.keys(registry)) {
    for (const market of Object.keys(registry[niche])) {
      if (!targetSet.has(`${niche}/${market}`)) continue;
      for (const opp of registry[niche][market]) {
        if (opp.status === 'generated') continue;
        if (opp.status === 'rejected') continue;
        if ((opp.errorCount || 0) >= 3) continue;
        if (longtail && !isLongtail(opp)) continue;
        if (guideOnly && opp.intent !== 'guide') continue;
        // Site stage forbids this intent right now → drop the candidate.
        const cad = cadenceFor(niche, market);
        if (opp.intent === 'guide' && cad.guideCap <= 0) continue;
        if (opp.intent === 'comparatif' && cad.affiliateCap <= 0) continue;
        if (opp.intent === 'avis' && cad.affiliateCap <= 0) continue;
        candidates.push(opp);
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    if (guideOnly) {
      // Normal/expected when no comparatif has been generated recently — pillars
      // are auto-enqueued only after a comparatif cluster ships.
      console.log(`ℹ️  No pending pillar (intent='guide') in scope. Generate a comparatif cluster first.`);
    } else if (longtail) {
      console.log(`ℹ️  No long-tail opportunities in scope (KD ≤ ${LONGTAIL_KD_CEILING}, ≥${LONGTAIL_MIN_TOKENS} tokens).`);
      console.log(`   Run: node packages/scripts/semrush-prioritize.js --longtail [scope]`);
    } else {
      console.log(`ℹ️  No pending opportunities in scope. Run semrush-prioritize first.`);
    }
    return;
  }

  const picks = candidates.slice(0, count);
  console.log(`🎯 Picking top ${picks.length} of ${candidates.length} pending${longtail ? ' long-tail' : ''} opportunities:`);
  for (const o of picks) {
    console.log(`   [${o.score.toString().padStart(6)}] ${o.intent.padEnd(13)} vol=${String(o.totalVolume).padStart(6)} kd=${String(Math.round(o.avgKD)).padStart(2)} ${o.niche}/${o.market}  ${o.primaryKeyword}`);
  }
  console.log();

  // Stop on N consecutive failures, not the first. A single article can fail
  // for article-specific reasons (model price-drift, ASIN miss, thin scrape)
  // without indicating a systemic issue — those are recoverable on the next
  // cluster. Two in a row points to auth expired, scrape pipeline down, or
  // similar — bail out before burning more credits.
  const MAX_CONSECUTIVE_FAILURES = 2;
  let written = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const opp of picks) {
    const url = await generateFromCluster(opp.id);
    if (url) {
      written++;
      consecutiveFailures = 0;
    } else {
      failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`⚠️  Stopping — ${consecutiveFailures} consecutive failures (likely systemic: auth, scrape pipeline). Investigate before re-running.`);
        break;
      }
      console.warn(`   ↳ continuing — single failure, possibly article-specific (model drift, ASIN miss)`);
    }
  }
  console.log(`\n📊 Generated ${written} of ${picks.length} (${failed} failed).`);
}

const args = parseArgs(process.argv.slice(2));

if (args.informational === true) {
  // Weekly off-affiliate run: 1 informational article per (niche, market).
  // Forces intent='informational' regardless of what the queue entry was
  // classified as — picks the same way as the daily run, just rewrites with
  // a different brief.
  const targets = resolveTargets(args);
  runInformational(targets).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (typeof args.cluster === 'string') {
  // --cluster <id> → generate that exact cluster
  generateFromCluster(args.cluster).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (args.cluster === true) {
  // --cluster (no id) → pick top N pending from the registry, scoped by
  // --niche/--market/--site (or all enabled if none).
  // --longtail restricts to anti-sandbox candidates (KD ≤ 19, ≥3 tokens).
  const count = parseInt(args.count ?? '1', 10);
  if (!Number.isFinite(count) || count < 1) {
    console.error(`Invalid --count: ${args.count}`);
    process.exit(1);
  }
  const targets = resolveTargets(args);
  const longtail = args.longtail === true;
  const guideOnly = args['guide-only'] === true || args.guideOnly === true;
  runTopClusters(targets, count, { longtail, guideOnly }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  const targets = resolveTargets(args);
  run(targets).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
