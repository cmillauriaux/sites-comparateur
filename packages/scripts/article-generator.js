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
import { asciiSlug } from './lib/slugify.js';
import YAML from 'yaml';

import { REPO_ROOT, SITES_DIR, DATA_DIR, requireEnv } from './lib/env.js';
import { appendPublished, readPublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, isLaunched } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import { fetchVerifiedProducts } from './lib/product-search.js';
import { fetchProductImages, injectImagePaths, injectImageAttributes, injectAffiliateAsins, injectPrices, injectMerchantUrls } from './lib/product-images.js';
import { buildPrompt } from './lib/prompts.js';
import { validateGeneratedArticle } from './lib/article-validator.js';
import { reviewArticle } from './lib/editorial-reviewer.js';
import { pickNextBundleSlot, initBundle, markBundleSlotShipped, markBundleSlotFailed, BUNDLE_SLOTS, SLOT_INTENT, slugFromKeyword, bundleSlotUrl } from './lib/bundle.js';
import { extractFaqFromBody } from './lib/faq-extract.js';
import { scrubRawPrices } from './lib/price-scrubber.js';
import { scrubInlineSourceList, scrubMdxImports, stripBrokenInternalLinks, scrubLeadingH1 } from './lib/article-postprocess.js';
import { fetchArticleHero } from './lib/hero-image.js';
import { injectInlineImages } from './lib/inline-images.js';
import { fetchProductGallery } from './lib/amazon-gallery.js';
import { applyAvisRetroLinks } from './lib/cross-links.js';
import { refreshBundleSiblings } from './lib/bundle-siblings.js';
import { tokenize } from './lib/cluster.js';
import { extractTopicFromKeyword } from './lib/intent.js';
import { getCadence } from './lib/cadence.js';
import { getSourcesFor } from '@comparateur/config/sources';
import { i18n } from '@comparateur/config';
import { MARKET_SEMRUSH } from '@comparateur/config/niches';

const MAX_ARTICLES_PER_RUN = parseInt(process.env.MAX_ARTICLES_PER_RUN || '2', 10);

/** Build the canonical set of internal URLs already published for a
 *  (niche, market) — used by stripBrokenInternalLinks to reject any
 *  markdown link Claude invented that doesn't resolve on the live site. */
function buildPublishedUrlSet(niche, market) {
  const set = new Set();
  for (const e of readPublished()) {
    if (e?.niche === niche && e?.market === market && typeof e.url === 'string') {
      // Normalise to trailing-slash form so callers don't have to.
      try {
        const u = new URL(e.url);
        const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
        set.add(`${u.origin}${path}`);
      } catch { /* skip malformed entry */ }
    }
  }
  return set;
}

/**
 * Refresh the `bundleSiblings` frontmatter field on every already-shipped
 * slot of a bundle so the "Articles liés" block in the layout always
 * reflects the current bundle state.
 *
 * Called from runBundle() right after markBundleSlotShipped() — at that
 * point the newly-shipped article exists on disk and the bundle's roll-up
 * state is current. We iterate all generated slots, compute their .mdx
 * paths from slug, and overwrite the frontmatter field with the current
 * siblings list (excluding the slot itself so an article never lists
 * itself among its "related" siblings).
 */
// refreshBundleSiblings moved to lib/bundle-siblings.js so the repair
// script can call it too. See the imports above.

/** Best-effort intent reconstruction from a published URL, for the
 *  internal-linking input. Falls back to 'comparatif' (the most common
 *  intent in this codebase) when the path matches nothing. */
function inferIntentFromUrl(url) {
  if (!url) return 'comparatif';
  if (/\/(avis|reviews)\//.test(url))           return 'avis';
  if (/\/(comparatifs|comparisons)\//.test(url)) return 'comparatif';
  if (/\/(guides|guide)\//.test(url))           return 'guide';
  if (/\/(infos|informationnels|insights|articles)\//.test(url)) return 'informational';
  return 'comparatif';
}
// 3 = anti scaled-content-abuse floor (matches Zod schema + validator).
// Bumped from 2 in the anti-AI-spam pass — see CLAUDE.md "Anti-spam AI".
const MIN_SOURCES = 3;

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

/**
 * Core generation pipeline — pure function of (siteConfig, keyword inputs).
 *
 * Used by the cluster-driven path (generateFromCluster, runTopClusters) and
 * the bundle runner (runBundle). The registry bookkeeping (mark writing →
 * published, errorCount, etc.) lives in the wrappers — this function only
 * knows how to turn a keyword brief into a published .mdx, and throws on
 * any failure.
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
 * Force-rewrite `publishedAt` + `updatedAt` on disk. The prompt template
 * already injects the backdated value, but Claude occasionally falls back to
 * the real date, so we re-stamp the frontmatter after generation. Used by
 * the --seed flow to make a fresh site look like it has weeks of history.
 */
function setPublishedAtFrontmatter(path, isoString) {
  if (!isoString) return;
  const content = readFileSync(path, 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return;
  let frontmatter;
  try { frontmatter = YAML.parse(m[1]) ?? {}; } catch { return; }
  frontmatter.publishedAt = isoString;
  frontmatter.updatedAt = isoString;
  const yamlText = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  writeFileSync(path, `---\n${yamlText}\n---\n${m[2]}`);
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

async function generateArticle(siteConfig, { keyword, intent, secondaryKeywords = [], parentComparatifUrl, parentComparatifTitle, publishedAt }) {
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

  // Verified product layer (DataForSEO Amazon) for product-based intents.
  // Retailer HTML scraping is WAF-blocked on CI runners, so a comparatif/avis
  // had no real products to ground on. DataForSEO routes through its own proxy
  // pool and returns structured listings — this is the WAF bypass. Non-fatal:
  // if it errors, generation falls back to source-only grounding.
  let productData = [];
  if (intent === 'comparatif' || intent === 'avis') {
    const { products, source } = await fetchVerifiedProducts(keyword, { market, limit: 8 });
    productData = products;
    if (productData.length > 0) {
      console.log(`  🛒 ${productData.length} produits ${source} injectés dans le prompt (bypass WAF marchand)`);
    } else {
      console.warn(`  ⚠️  aucun produit (Amazon + Google Shopping) pour "${keyword}" — grounding sur sources seules`);
    }
  }

  // 2. Compute slug + output path. Articles are .mdx so they can embed
  // Astro components (<ProductCard />, <ComparisonTable />, ...).
  const articleSlug = asciiSlug(keyword);
  const outputDir = resolve(SITES_DIR, niche, market, 'src/content/articles');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${articleSlug}.mdx`);

  if (existsSync(outputPath)) {
    throw new Error(`output already exists: ${outputPath}`);
  }

  // 3. Build prompt and invoke Claude Code CLI
  // Internal-linking input: pass the 20 most recent published URLs in the
  // same (niche, market) so the model can hyperlink into them and form a
  // SEO cluster instead of writing isolated pages. We also tag each entry
  // with its `intent` so the prompt can apply directional linking rules
  // (comparatif ↔ guide hub-and-spoke).
  const existingArticles = readPublished()
    .filter(u => u.niche === niche && u.market === market && u.url)
    .slice(-20)
    .map(u => ({
      title: u.keyword,
      url: u.url,
      // Older entries pre-date the intent field — infer from the URL path.
      intent: u.intent ?? inferIntentFromUrl(u.url),
    }));
  const prompt = buildPrompt({
    keyword,
    intent,
    secondaryKeywords,
    scrapedSources: scraped,
    productData,
    siteConfig,
    market,
    articleSlug,
    outputPath,
    existingArticles,
    // Only consumed by buildGuidePrompt — pillar pages must link 2× to their
    // parent comparatif. Undefined for other intents.
    parentComparatifUrl,
    parentComparatifTitle,
    // Backdate hint for the seed/bootstrap flow. When set, the prompt template
    // emits `publishedAt: "<past-date>"`; we still force-rewrite the frontmatter
    // below since Claude may ignore the hint and use the real date.
    today: publishedAt,
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

  let topProductName = null;
  let topProductAsin = null;
  if (productNames.size > 0) {
    const productList = [...productNames];
    console.log(`  🛒 Fetching ${productList.length} products from amazon (${market})…`);
    const { imageMap, asinMap, priceMap, nonAffiliateMap } = await fetchProductImages({ niche, market, articleSlug, products: productList });
    // The "top product" seeds the bundle's avis slot. Claude writes
    // ProductCards in descending verdict-score so productList[0] is the
    // editorial winner — but if it has no resolved ASIN or no image, the
    // downstream avis WILL fail (ERROR_INSUFFICIENT_SOURCES on obscure SKUs
    // like Parkside PAMRS 1000 A1, Oregon spare chains, Stihl BGA 60). Pick
    // the first product that has BOTH a validated ASIN AND a downloaded
    // image — these are the products with editorial coverage that a deep-
    // dive review can actually be grounded in. When no product qualifies,
    // topProductName stays null and the avis slot is skipped.
    topProductName = productList.find(name => asinMap[name] && imageMap[name]) ?? null;
    topProductAsin = topProductName ? asinMap[topProductName] : null;
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

    // Layout already renders the H1 from the frontmatter title — strip any
    // duplicate H1 the model wrote at the top of the body to avoid the
    // double-H1 SEO finding.
    const h1 = scrubLeadingH1(updated);
    if (h1.count > 0) {
      console.log(`  🧹 Stripped duplicate leading H1 (layout renders it from frontmatter)`);
      updated = h1.content;
    }

    // Layout already renders SourceList — strip any inline copy the model
    // wrote in violation of the prompt instruction.
    const sl = scrubInlineSourceList(updated);
    if (sl.count > 0) {
      console.log(`  🧹 Stripped ${sl.count} inline <SourceList /> (layout adds it once)`);
      updated = sl.content;
    }

    // .mdx files in this project never declare imports — components are
    // injected by the dynamic page route's <Content components={...} /> prop.
    // Stray imports from the model resolve to relative paths that don't
    // exist (the components live in a different workspace package), which
    // crashes the build.
    const imp = scrubMdxImports(updated);
    if (imp.count > 0) {
      console.log(`  🧹 Stripped ${imp.count} stray import statement${imp.count > 1 ? 's' : ''} from .mdx body`);
      updated = imp.content;
    }

    // Strip markdown links Claude invented to URLs that don't exist on the
    // live site (404s on click). The anchor text is preserved so prose
    // still reads naturally.
    const siteOrigin = `https://${siteConfig.domain}`;
    const existingUrls = buildPublishedUrlSet(niche, market);
    const linkCheck = stripBrokenInternalLinks(updated, { existingUrls, siteOrigin });
    if (linkCheck.count > 0) {
      console.log(`  🧹 Removed ${linkCheck.count} broken internal link${linkCheck.count > 1 ? 's' : ''}: ${linkCheck.removed.map(r => r.url).slice(0, 3).join(', ')}${linkCheck.count > 3 ? '…' : ''}`);
      updated = linkCheck.content;
    }

    writeFileSync(outputPath, updated);
    const validationErrors = validateGeneratedArticle(updated);
    if (validationErrors.length > 0) {
      throw new Error(`article validation failed: ${validationErrors.join('; ')}`);
    }
    // Programmatic editorial checks (prix tronqués, score math, gender, etc.)
    // — runs post-product-injection so images/prices are already resolved.
    const reviewEarly = reviewArticle(outputPath);
    if (reviewEarly.status === 'ko') {
      const koIssues = reviewEarly.issues.filter(i => i.level === 'ko').map(i => i.message).join('; ');
      throw new Error(`editorial review KO: ${koIssues}`);
    }
    for (const i of reviewEarly.issues.filter(x => x.level === 'warn')) {
      console.warn(`  ⚠️  editorial [${i.code}]: ${i.message}`);
    }
    const imgs = Object.values(imageMap).filter(Boolean).length;
    const asins = Object.values(asinMap).filter(Boolean).length;
    const prices = Object.values(priceMap).filter(Boolean).length;
    const nonAff = Object.values(nonAffiliateMap || {}).filter(Boolean).length;
    console.log(`  🖼  ${imgs}/${productList.length} images · 🔗 ${asins}/${productList.length} ASINs · 🌐 ${nonAff} non-affiliés · 💶 ${prices}/${productList.length} prices`);
  } else {
    // No product post-pass to run — still scrub prices, scrub inline
    // <SourceList />, drop broken internal links, then validate so the
    // grounding gate + (for informational) the no-affiliate gate trip here.
    const scrubbed = scrubRawPrices(written);
    let finalContent = written;
    if (scrubbed.count > 0) {
      console.log(`  🧹 Scrubbed ${scrubbed.count} raw price${scrubbed.count > 1 ? 's' : ''} from prose`);
      finalContent = scrubbed.content;
    }
    const h1 = scrubLeadingH1(finalContent);
    if (h1.count > 0) {
      console.log(`  🧹 Stripped duplicate leading H1 (layout renders it from frontmatter)`);
      finalContent = h1.content;
    }
    const sl = scrubInlineSourceList(finalContent);
    if (sl.count > 0) {
      console.log(`  🧹 Stripped ${sl.count} inline <SourceList /> (layout adds it once)`);
      finalContent = sl.content;
    }
    const imp = scrubMdxImports(finalContent);
    if (imp.count > 0) {
      console.log(`  🧹 Stripped ${imp.count} stray import statement${imp.count > 1 ? 's' : ''} from .mdx body`);
      finalContent = imp.content;
    }
    const siteOrigin = `https://${siteConfig.domain}`;
    const existingUrls = buildPublishedUrlSet(niche, market);
    const linkCheck = stripBrokenInternalLinks(finalContent, { existingUrls, siteOrigin });
    if (linkCheck.count > 0) {
      console.log(`  🧹 Removed ${linkCheck.count} broken internal link${linkCheck.count > 1 ? 's' : ''}: ${linkCheck.removed.map(r => r.url).slice(0, 3).join(', ')}${linkCheck.count > 3 ? '…' : ''}`);
      finalContent = linkCheck.content;
    }
    if (finalContent !== written) writeFileSync(outputPath, finalContent);
    const validationErrors = validateGeneratedArticle(finalContent);
    if (validationErrors.length > 0) {
      throw new Error(`article validation failed: ${validationErrors.join('; ')}`);
    }
    // Same programmatic editorial checks as the product branch above.
    const reviewNoProduct = reviewArticle(outputPath);
    if (reviewNoProduct.status === 'ko') {
      const koIssues = reviewNoProduct.issues.filter(i => i.level === 'ko').map(i => i.message).join('; ');
      throw new Error(`editorial review KO: ${koIssues}`);
    }
    for (const i of reviewNoProduct.issues.filter(x => x.level === 'warn')) {
      console.warn(`  ⚠️  editorial [${i.code}]: ${i.message}`);
    }
  }

  injectFaqFrontmatter(outputPath);

  // Per-article hero image: fetch a topic-specific photo from Pexels/Pixabay
  // and write `heroImage` + `heroImageAlt` into the frontmatter. The prompt
  // intentionally omits these fields so we have a clean injection point
  // here — otherwise every article would ship with the same generic
  // /images/hero.jpg (niche-level photo from fetch-pillar-images.js), which
  // reads as templated content and breaks topic-image relevance.
  // Avis articles: prefer the actual product photo as hero (the reader is
  // here to see THIS product, not a stock-photo category shot). Falls back
  // to Pexels when no product image was resolved.
  let usedProductHero = false;
  if (intent === 'avis' && topProductName) {
    // The product image was already downloaded and the path is in the
    // ProductCard via injectImagePaths. Re-derive the same path.
    const productSlug = asciiSlug(topProductName);
    const productPath = `/images/products/${articleSlug}/${productSlug}.jpg`;
    const onDisk = resolve(SITES_DIR, niche, market, 'public', productPath.replace(/^\//, ''));
    if (existsSync(onDisk)) {
      setAvisHeroFromProduct(outputPath, { publicPath: productPath, alt: topProductName });
      usedProductHero = true;
      console.log(`  🖼  avis hero → product photo (${productPath})`);
    }
  }
  if (!usedProductHero) {
    try {
      const hero = await fetchArticleHero({ niche, market, articleSlug, keyword });
      if (hero) injectHeroFrontmatter(outputPath, hero);
    } catch (err) {
      console.warn(`  ⚠️  hero fetch failed: ${err.message}`);
    }
  }

  // Inline images at H2 boundaries (long articles only). Runs after the hero
  // is persisted so we can exclude the hero's photo id from the inline pool
  // (no duplicate photo across the same article). Failures are non-fatal —
  // an article ships without inline images rather than failing the run.
  //
  // Avis articles with a resolved Amazon ASIN get inline images from the
  // product's own gallery (multiple angles of the actual product). Other
  // intents — and avis whose product fell to the Google Shopping fallback
  // (no ASIN) — fall back to the Pexels categorical path.
  try {
    const current = readFileSync(outputPath, 'utf-8');
    let productImages = [];
    let productAlt = '';
    const finalIntentNow = readFrontmatterIntent(outputPath) ?? intent;
    if (finalIntentNow === 'avis' && topProductAsin) {
      const gallery = await fetchProductGallery(topProductAsin, { market });
      // Skip the first image — it's the ProductCard main shot.
      productImages = gallery.slice(1);
      productAlt = topProductName ?? '';
      if (productImages.length > 0) {
        console.log(`  📸 product gallery: ${productImages.length} additional images for ${topProductName}`);
      }
    }
    const { content: withInline, count } = await injectInlineImages({
      niche, market, articleSlug, content: current, keyword,
      productImages, productAlt,
    });
    if (count > 0) writeFileSync(outputPath, withInline);
  } catch (err) {
    console.warn(`  ⚠️  inline image injection failed: ${err.message}`);
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
  // Backdate override (seed flow): force the frontmatter timestamps to the
  // requested past date. Runs last so it survives every prior frontmatter
  // mutation (hero, faq, noAffiliate, etc.).
  if (publishedAt) setPublishedAtFrontmatter(outputPath, publishedAt);

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

  return { publishedUrl, articleSlug, outputPath, finalIntent, topProductName, topProductAsin };
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
 * For avis articles, replace the (often weak) Pexels hero with an actual
 * product photo. Same call site as injectHeroFrontmatter but force-writes
 * the field (a stale Pexels hero is worse than the product image — an avis
 * reader expects to see the thing they're considering).
 */
function setAvisHeroFromProduct(path, { publicPath, alt }) {
  if (!publicPath) return;
  const content = readFileSync(path, 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return;
  let frontmatter;
  try { frontmatter = YAML.parse(m[1]) ?? {}; } catch { return; }
  frontmatter.heroImage = publicPath;
  frontmatter.heroImageAlt = alt || frontmatter.heroImageAlt || '';
  const yamlText = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  writeFileSync(path, `---\n${yamlText}\n---\n${m[2]}`);
}

/**
 * Best-effort cleanup of an aborted run: remove the .mdx Claude wrote so the
 * next retry doesn't trip the `output already exists` guard.
 *
 * Uses `asciiSlug()` (one-shot) — it instantiates a fresh slugger each call,
 * so there's no risk of inheriting a `-1` suffix from an earlier successful
 * slug() on the module-level slugger.
 */
function cleanupOutput(siteConfig, keyword) {
  try {
    const articleSlug = asciiSlug(keyword);
    const outputPath = resolve(SITES_DIR, siteConfig.niche, siteConfig.market, 'src/content/articles', `${articleSlug}.mdx`);
    if (existsSync(outputPath)) unlinkSync(outputPath);
  } catch { /* best-effort */ }
}

// ──────────────────────────────────────────────────────── CLUSTER-DRIVEN PATH
// The Semrush flow — sole keyword source. Looks up an opportunity in
// semrush-priorities.json by id and runs the generation pipeline with
// secondary keywords injected into the prompt, then marks the opportunity
// `generated`.

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
      intent: finalIntent,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });

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
  //
  // BYPASS_CADENCE=true is propagated from the workflow_dispatch manual test
  // path so a sandbox-stage site can still validate the full pillar pipeline
  // end-to-end without first publishing 10+ comparatifs. The flag is OFF for
  // every cron-triggered run — it requires explicit operator action.
  const bypassCadence = process.env.BYPASS_CADENCE === 'true';
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
        if (!bypassCadence) {
          // Site stage forbids this intent right now → drop the candidate.
          const cad = cadenceFor(niche, market);
          if (opp.intent === 'guide' && cad.guideCap <= 0) continue;
          if (opp.intent === 'comparatif' && cad.affiliateCap <= 0) continue;
          if (opp.intent === 'avis' && cad.affiliateCap <= 0) continue;
        }
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

// ─────────────────────────────────────────────────────── BUNDLE PATH
// One-stop daily-content runner. For each target (niche, market):
//
//   1. Respect cadence (active-day + cross-workflow 1/day rule).
//   2. Ask bundle.js for the next slot to ship (resume partial → start new).
//   3. If no bundle work: log + skip (operator runs semrush-prioritize.js).
//   4. Persist bundle state on success/failure so the next active day knows
//      which slot to pick.
//
// Order of slots within a bundle is comparatif → pillar → avis, enforced by
// pickNextBundleSlot. This guarantees every cross-link points at an
// already-published URL — no fabricated forward references.
async function runBundle(targets) {
  const bypassCadence = process.env.BYPASS_CADENCE === 'true';

  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    const cadence = getCadence(niche, market);
    if (!bypassCadence && cadence.publishedToday > 0) {
      console.log(`⏭  ${niche}/${market}: publishedToday=${cadence.publishedToday} → skip (cross-workflow 1/day rule)`);
      continue;
    }

    const siteOrigin = `https://${siteConfig.domain}`;
    const priorities = readPriorities();
    const pick = pickNextBundleSlot(priorities, niche, market);

    if (!pick) {
      console.log(`📦 ${niche}/${market}: no bundle work pending. Run semrush-prioritize.js to refill data/semrush-priorities.json.`);
      continue;
    }

    if (pick.kind === 'bundle-fresh') initBundle(pick.opp, market);
    const slotMeta = pick.opp.bundle[pick.slot];
    console.log(`\n📦 BUNDLE ${pick.opp.id} → slot=${pick.slot} (${pick.kind})`);
    console.log(`   keyword="${slotMeta.keyword}" slug="${slotMeta.slug}"`);

    // Parent comparatif URL/title for pillar + avis slots — used by the
    // prompts to insert mandatory cross-links into the live comparatif.
    let parentComparatifUrl, parentComparatifTitle;
    if (pick.slot !== 'comparatif') {
      parentComparatifUrl   = pick.opp.bundle.comparatif.url;
      parentComparatifTitle = pick.opp.bundle.comparatif.keyword;
    }

    try {
      const { publishedUrl, finalIntent, topProductName, topProductAsin } = await generateArticle(siteConfig, {
        keyword: slotMeta.keyword,
        intent: SLOT_INTENT[pick.slot],
        secondaryKeywords: pick.opp.secondaryKeywords || [],
        parentComparatifUrl,
        parentComparatifTitle,
      });

      // Persist bundle state + roll-up. Re-read priorities to avoid
      // clobbering parallel mining writes.
      const fresh = readPriorities();
      const target = fresh?.[niche]?.[market]?.find(o => o.id === pick.opp.id);
      if (target) {
        if (!target.bundle) initBundle(target, market);
        markBundleSlotShipped(target, pick.slot, {
          url: publishedUrl,
          publishedAt: new Date().toISOString(),
          topProductName,
          topProductAsin,
        });
        // Seal the avis slot upfront when the comparatif shipped without a
        // viable product (no ASIN+image). The picker would skip-and-cycle
        // forever otherwise — explicit failed makes the rollup status read
        // as `partial` permanently and stops the iteration cleanly.
        if (pick.slot === 'comparatif' && !topProductName) {
          markBundleSlotFailed(target, 'avis', 'no-validated-product');
        }
        writePriorities(fresh);

        // Retro-link previously-shipped siblings of this bundle. After the
        // comparatif ships there's nothing to update; after the pillar
        // ships the comparatif gains a sibling link; after the avis ships
        // both the comparatif and the pillar gain the final sibling. The
        // layout's "Articles liés" section consumes the frontmatter field.
        refreshBundleSiblings(siteConfig, target);

        // After the avis specifically: inject "Notre test détaillé"
        // body callouts into the comparatif (under the ProductCard of the
        // reviewed product) and the pillar guide (before the FAQ). The
        // sidebar block alone isn't enough — readers landing on the
        // comparatif rarely look at sidebars, but they DO read the body
        // around products that interest them.
        if (pick.slot === 'avis') {
          const { patched } = applyAvisRetroLinks(siteConfig, target.bundle);
          if (patched.length > 0) {
            console.log(`  🔗 retro-linked avis into: ${patched.join(', ')}`);
          }
        }
      }

      appendPublished({
        url: publishedUrl,
        niche, market,
        keyword: slotMeta.keyword,
        bundleId: pick.opp.id,
        bundleSlot: pick.slot,
        intent: finalIntent,
        publishedAt: new Date().toISOString(),
        indexationStatus: 'pending',
      });
      console.log(`📊 ${niche}/${market}: bundle slot ${pick.slot} shipped → ${publishedUrl}`);
    } catch (err) {
      console.error(`❌ Bundle ${pick.opp.id} slot=${pick.slot} failed: ${err.message}`);
      const fresh = readPriorities();
      const target = fresh?.[niche]?.[market]?.find(o => o.id === pick.opp.id);
      if (target?.bundle) {
        target.bundle[pick.slot].errorCount = (target.bundle[pick.slot].errorCount || 0) + 1;
        if (target.bundle[pick.slot].errorCount >= 3) markBundleSlotFailed(target, pick.slot, err.message);
        writePriorities(fresh);
      }
    }
  }
}

// ──────────────────────────────────────────────────────── SEED (BOOTSTRAP) PATH
// One-shot seeding for a brand-new site. Generates N complete bundles
// (comparatif + pillar + avis = 3 articles each) back-to-back, bypassing
// cadence, and backdates `publishedAt` so the corpus reads as if the site
// has weeks of publishing history. The cross-workflow 1/day rule is the
// thing we explicitly DEFEAT here — that's the whole point of seeding.
//
// Schedule: 8-week window. Bundles are evenly spaced (~12 days apart);
// inside each bundle the comparatif → pillar → avis slots are 3 then 2
// days apart (matching the natural daily-pipeline rhythm). Hours are
// jittered across 08-21 UTC so the timestamps don't all sit on the same
// minute.
const SEED_TOTAL_DAYS = 56;
const SEED_SLOT_OFFSETS = [0, 3, 5];   // days INTO the bundle for comp / pillar / avis
const SEED_MIN_DAYS_AGO = 3;           // most-recent slot can't be today (would defeat the "natural rhythm" pretense)

/**
 * Precompute the chronological publishedAt schedule for `count` bundles
 * (3 slots each). Result is sorted ascending so the i-th element pairs
 * with the i-th slot consumed by pickNextBundleSlot. The picker always
 * finishes a partial bundle before starting a new one, so consumption
 * order is comp_A → pillar_A → avis_A → comp_B → … and the schedule
 * follows that pattern by construction.
 */
function buildSeedSchedule(count, { now = Date.now(), anchorMs = null } = {}) {
  const dayMs = 86_400_000;
  // Most-recent bundle's last slot lands at SEED_MIN_DAYS_AGO. Bundle 0's
  // first slot lands at SEED_TOTAL_DAYS (full window) — UNLESS we're resuming
  // a seed (anchorMs = latest publishedAt of an already-seeded slot), in
  // which case we start ~12 days after the anchor so the new bundles read
  // chronologically AFTER the existing ones instead of overlapping.
  const bundleSpanDays = Math.max(...SEED_SLOT_OFFSETS);          // 5
  const newestBundleStart = SEED_MIN_DAYS_AGO + bundleSpanDays;    // 8
  let oldestBundleStart = SEED_TOTAL_DAYS;                          // 56 (default)
  if (anchorMs !== null) {
    const anchorDaysAgo = (now - anchorMs) / dayMs;
    // 12-day stride between bundles is the natural rhythm; -bundleSpanDays
    // backs us off from the anchor's last slot so the new comparatif doesn't
    // collide with the anchor's avis (which was 5 days INTO that bundle).
    oldestBundleStart = Math.max(newestBundleStart, anchorDaysAgo - 12 + bundleSpanDays);
  }
  const stride = count > 1 ? (oldestBundleStart - newestBundleStart) / (count - 1) : 0;

  const schedule = [];
  for (let i = 0; i < count; i++) {
    const bundleStartDaysAgo = oldestBundleStart - i * stride;
    for (const offset of SEED_SLOT_OFFSETS) {
      const jitter = (Math.random() - 0.5) * 1.5;                  // ±0.75 day
      const daysAgo = Math.max(SEED_MIN_DAYS_AGO, bundleStartDaysAgo - offset + jitter);
      const hour = 8 + Math.floor(Math.random() * 14);             // 08-21 UTC
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const d = new Date(now - daysAgo * dayMs);
      d.setUTCHours(hour, minute, second, 0);
      schedule.push(d.toISOString());
    }
  }
  schedule.sort();   // chronological — bundle i's slots come before bundle i+1's
  return schedule;
}

async function runSeed(targets, count) {
  if (targets.length !== 1) {
    throw new Error(`--seed targets exactly one (niche, market). Got ${targets.length}. Use --niche X --market Y.`);
  }
  const { niche, market } = targets[0];

  const siteConfig = await loadSiteConfig(niche, market);
  if (!isLaunched(siteConfig)) {
    throw new Error(`${niche}/${market}: domain still placeholder (${siteConfig.domain}). Wire the real domain in site.config.js before seeding.`);
  }

  // Pre-flight: registry must hold ≥count pending comparatif opportunities
  // for this (niche, market). Otherwise we'd run out mid-seed and ship a
  // partial corpus. Tell the operator to run semrush-prioritize first.
  const registry = readPriorities();
  const opps = registry?.[niche]?.[market] || [];
  const pendingComparatifs = opps.filter(o =>
    o.status !== 'generated' &&
    o.status !== 'rejected' &&
    (o.errorCount || 0) < 3 &&
    // Either a fresh opp (intent='comparatif') or a partial bundle whose
    // comparatif slot is still pending.
    ((!o.bundle && o.intent === 'comparatif') ||
     (o.bundle?.comparatif?.status === 'pending'))
  );
  if (pendingComparatifs.length < count) {
    throw new Error(
      `${niche}/${market}: need ${count} pending comparatif opportunities, have ${pendingComparatifs.length}.\n` +
      `   Run: node packages/scripts/semrush-prioritize.js --niche ${niche} --market ${market} --longtail`
    );
  }

  // Resume-aware anchor: latest publishedAt of any already-shipped SEED slot.
  // We filter on `seedRun === true` (set below in appendPublished). Filtering
  // on `bundleSlot` alone is wrong because cron-generated bundle ships ALSO
  // carry that field — using them as anchor would push the new schedule
  // up against "today" and collapse the backdate window (seen on the FR
  // resume run: ~6 days squeezed onto 4 calendar days). seedRun is the
  // explicit signal that an entry was intentionally backdated.
  const seedShipped = readPublished()
    .filter(e => e.niche === niche && e.market === market && e.seedRun === true && e.publishedAt);
  const anchorMs = seedShipped.length === 0
    ? null
    : Math.max(...seedShipped.map(e => new Date(e.publishedAt).getTime()));

  // Pre-clean: any partial bundle slot left with errorCount ≥ 1 from a prior
  // seed run gets force-marked failed. Without this the picker would re-pick
  // the same broken slot and likely fail again (e.g., obscure product with
  // insufficient sources won't suddenly gain sources). Seed is one-shot —
  // we trade the daily mode's 3-strikes budget for forward progress.
  {
    const fresh = readPriorities();
    let cleaned = 0;
    for (const opp of (fresh?.[niche]?.[market] || [])) {
      if (!opp.bundle) continue;
      for (const slot of BUNDLE_SLOTS) {
        const s = opp.bundle[slot];
        if (s?.status === 'pending' && (s.errorCount || 0) >= 1) {
          markBundleSlotFailed(opp, slot, s.lastError ?? 'sealed-by-seed-resume');
          cleaned++;
        }
      }
    }
    if (cleaned > 0) {
      writePriorities(fresh);
      console.log(`🧹 Sealed ${cleaned} previously-failing slot${cleaned > 1 ? 's' : ''} so the picker skips them.`);
    }
  }

  const schedule = buildSeedSchedule(count, { anchorMs });
  if (anchorMs !== null) {
    const daysAgo = ((Date.now() - anchorMs) / 86_400_000).toFixed(1);
    console.log(`\n🌱 SEED ${niche}/${market}: resuming after anchor (latest seed publishedAt = ${daysAgo}d ago)`);
  }
  console.log(`\n🌱 SEED ${niche}/${market}: ${count} bundles (${count * 3} articles)`);
  console.log(`   Schedule (oldest → newest):`);
  for (let i = 0; i < schedule.length; i++) {
    const slot = ['comparatif', 'pillar', 'avis'][i % 3];
    const bundleIdx = Math.floor(i / 3) + 1;
    console.log(`     bundle ${bundleIdx}/${count}  ${slot.padEnd(10)}  ${schedule[i]}`);
  }
  console.log();

  let shipped = 0;
  for (const publishedAt of schedule) {
    const fresh = readPriorities();
    const pick = pickNextBundleSlot(fresh, niche, market);
    if (!pick) {
      console.warn(`⚠️  No more bundle work pending after ${shipped} ship(s). Run semrush-prioritize and retry.`);
      break;
    }
    if (pick.kind === 'bundle-fresh') {
      initBundle(pick.opp, market);
      // Persist the freshly-initialised bundle BEFORE generateArticle so a
      // mid-flight failure can be sealed against a real bundle on disk.
      // Without this, the catch block below sees `target.bundle === undefined`
      // (because we never wrote the init), can't markBundleSlotFailed, and
      // the next picker iteration re-selects the same opp → infinite retry.
      const freshReg = readPriorities();
      const t = freshReg?.[niche]?.[market]?.find(o => o.id === pick.opp.id);
      if (t && !t.bundle) {
        initBundle(t, market);
        writePriorities(freshReg);
      }
    }
    const slotMeta = pick.opp.bundle[pick.slot];
    console.log(`\n📦 [${shipped + 1}/${schedule.length}] BUNDLE ${pick.opp.id} → slot=${pick.slot}  publishedAt=${publishedAt}`);
    console.log(`   keyword="${slotMeta.keyword}" slug="${slotMeta.slug}"`);

    let parentComparatifUrl, parentComparatifTitle;
    if (pick.slot !== 'comparatif') {
      parentComparatifUrl   = pick.opp.bundle.comparatif.url;
      parentComparatifTitle = pick.opp.bundle.comparatif.keyword;
    }

    try {
      const { publishedUrl, finalIntent, topProductName, topProductAsin } = await generateArticle(siteConfig, {
        keyword: slotMeta.keyword,
        intent: SLOT_INTENT[pick.slot],
        secondaryKeywords: pick.opp.secondaryKeywords || [],
        parentComparatifUrl,
        parentComparatifTitle,
        publishedAt,
      });

      const after = readPriorities();
      const target = after?.[niche]?.[market]?.find(o => o.id === pick.opp.id);
      if (target) {
        if (!target.bundle) initBundle(target, market);
        markBundleSlotShipped(target, pick.slot, {
          url: publishedUrl,
          publishedAt,
          topProductName,
          topProductAsin,
        });
        // Seal the avis slot when the comparatif's #1 validated product is
        // null — no editorial subject to write about. Same rationale as
        // runBundle(); without this the seed schedule would waste a
        // timestamp on a slot the picker refuses to return.
        if (pick.slot === 'comparatif' && !topProductName) {
          markBundleSlotFailed(target, 'avis', 'no-validated-product');
        }
        writePriorities(after);
        refreshBundleSiblings(siteConfig, target);
        if (pick.slot === 'avis') {
          const { patched } = applyAvisRetroLinks(siteConfig, target.bundle);
          if (patched.length > 0) console.log(`  🔗 retro-linked avis into: ${patched.join(', ')}`);
        }
      }

      appendPublished({
        url: publishedUrl,
        niche, market,
        keyword: slotMeta.keyword,
        bundleId: pick.opp.id,
        bundleSlot: pick.slot,
        intent: finalIntent,
        publishedAt,
        indexationStatus: 'pending',
        // Distinguishes seed-shipped (backdated) entries from cron/manual
        // bundle ships. Read by the anchor logic when resuming a seed so
        // we don't confuse "real article shipped today" with "seed entry
        // intentionally dated 8 weeks ago".
        seedRun: true,
      });
      shipped++;
      console.log(`  ✅ ${publishedUrl}`);
    } catch (err) {
      console.error(`❌ slot=${pick.slot} failed: ${err.message}`);
      const after = readPriorities();
      const target = after?.[niche]?.[market]?.find(o => o.id === pick.opp.id);
      if (target?.bundle) {
        // Seed mode: one strike → marked failed. Daily mode keeps a
        // 3-strikes budget; in seed we want forward progress instead of
        // retrying the same obscure-product avis 3× in a row.
        target.bundle[pick.slot].errorCount = (target.bundle[pick.slot].errorCount || 0) + 1;
        markBundleSlotFailed(target, pick.slot, err.message);
        writePriorities(after);
      }
      // If comparatif fails the bundle is unusable (pillar + avis depend on
      // its URL / top product) — the picker will naturally fall through to
      // the next opportunity since the comparatif slot is now `failed`.
      // For pillar/avis failures the bundle survives partially. Continue.
      console.error(`   ↳ slot sealed as failed; moving to next bundle.`);
      continue;
    }
  }

  console.log(`\n🌱 Seed done: ${shipped}/${schedule.length} articles shipped for ${niche}/${market}.`);
}

const args = parseArgs(process.argv.slice(2));

if (typeof args.cluster === 'string') {
  // --cluster <id> → generate that exact cluster
  generateFromCluster(args.cluster).then(() => process.exit(0)).catch(err => {
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
  runTopClusters(targets, count, { longtail, guideOnly }).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (args.bundle === true) {
  // --bundle → unified daily-content runner. Picks the next bundle slot
  // from semrush-priorities and respects the cross-workflow 1/day cap.
  const targets = resolveTargets(args);
  runBundle(targets).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (args.seed === true) {
  // --seed → bootstrap a fresh (niche, market) with N complete bundles
  // (= 3N articles: N comparatifs + N pillars + N avis), backdated over
  // 8 weeks. Bypasses cadence. Expects the priorities registry already
  // primed with ≥N pending comparatif opportunities for the target.
  const count = parseInt(args.bundles ?? '5', 10);
  if (!Number.isFinite(count) || count < 1) {
    console.error(`Invalid --bundles: ${args.bundles}`);
    process.exit(1);
  }
  const targets = resolveTargets(args);
  runSeed(targets, count).then(() => process.exit(0)).catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
} else {
  console.error('Usage: article-generator.js --bundle | --cluster [<id>] [--count N] [--longtail] [--guide-only]');
  console.error('       article-generator.js --seed --niche X --market Y [--bundles 5]');
  console.error('       (--niche/--market/--site flags scope the run; defaults to all ENABLED_SITES)');
  process.exit(1);
}
