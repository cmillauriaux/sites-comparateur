#!/usr/bin/env node
/**
 * One-shot repair for articles whose product attributes (asin/price/image)
 * were resolved by an earlier, looser matcher. Wipes the cached sidecars for
 * the article's products, re-runs fetchProductImages with the current
 * matcher, strips the stale attributes from the .mdx, and re-injects.
 *
 * Also (idempotent) injects inline images for long articles that pre-date
 * the inline-image pipeline.
 *
 * Usage:
 *   node packages/scripts/repair-products.js --niche cuisine --market fr --slug machine-a-cafe-a-grain-professionnelle
 *   node packages/scripts/repair-products.js --niche cuisine --market fr --all   # all articles in this (niche, market)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SITES_DIR } from './lib/env.js';
import { loadSiteConfig, parseArgs, resolveTargets } from './lib/site-config.js';
import {
  fetchProductImages,
  injectImagePaths,
  injectImageAttributes,
  injectAffiliateAsins,
  injectPrices,
  injectMerchantUrls,
} from './lib/product-images.js';
import { injectInlineImages } from './lib/inline-images.js';
import { fetchProductGallery } from './lib/amazon-gallery.js';
import { closeBrowser } from './lib/browser.js';
import { applyAvisRetroLinks } from './lib/cross-links.js';
import { refreshBundleSiblings } from './lib/bundle-siblings.js';
import { DATA_DIR } from './lib/env.js';
import Slugger from 'github-slugger';

function readPriorities() {
  const path = resolve(DATA_DIR, 'semrush-priorities.json');
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}
const slugger = new Slugger();

const args = parseArgs(process.argv.slice(2));

const PRODUCT_CARD_RE = /<ProductCard\b([\s\S]*?)\/>/g;
const COMPARISON_TABLE_RE = /(<ComparisonTable\b[\s\S]*?products=\{\[)([\s\S]*?)(\]\}[\s\S]*?\/?>)/g;

function readFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m?.[1] ?? '';
}

function readKeyword(content) {
  const fm = readFrontmatter(content);
  const m = fm.match(/^keyword:\s*(.+)$/m);
  return m?.[1].trim().replace(/^["']|["']$/g, '') ?? null;
}

function readIntent(content) {
  const fm = readFrontmatter(content);
  const m = fm.match(/^intent:\s*(.+)$/m);
  return m?.[1].trim().replace(/^["']|["']$/g, '') ?? null;
}

function extractProductNames(content) {
  const names = new Set();
  for (const m of content.matchAll(PRODUCT_CARD_RE)) {
    const body = m[1];
    const name = body.match(/\bname\s*=\s*(["'])([^"']+)\1/)?.[2];
    if (name) names.add(name.trim());
  }
  for (const m of content.matchAll(COMPARISON_TABLE_RE)) {
    const arr = m[2];
    for (const sub of arr.matchAll(/\bname\s*:\s*(["'])([^"']+)\1/g)) {
      names.add(sub[2].trim());
    }
  }
  return [...names];
}

function stripAttr(attr) {
  // Match `attr="..."` (with leading whitespace) and `, attr: "..."` inside
  // ComparisonTable product objects. Used to wipe stale asin/price/image
  // before re-injection.
  return [
    new RegExp(`\\s+${attr}\\s*=\\s*"[^"]*"`, 'g'),
    new RegExp(`,\\s*${attr}\\s*:\\s*"[^"]*"`, 'g'),
  ];
}

function stripStaleAttrs(content) {
  let out = content;
  for (const a of ['asin', 'price', 'image', 'merchantUrl', 'merchant']) {
    for (const re of stripAttr(a)) out = out.replace(re, '');
  }
  return out;
}

function clearSidecars(niche, market, articleSlug, productNames) {
  const dir = resolve(SITES_DIR, niche, market, 'public/images/products', articleSlug);
  if (!existsSync(dir)) return;
  // We can't slugify the product name here without importing slugger — but
  // sidecars are siblings to .jpg files with matching base. Just nuke the
  // whole directory: fetchProductImages re-creates it.
  rmSync(dir, { recursive: true, force: true });
}

async function repairOne({ niche, market, articleSlug }) {
  const path = resolve(SITES_DIR, niche, market, 'src/content/articles', `${articleSlug}.mdx`);
  if (!existsSync(path)) {
    console.warn(`  ⚠️  ${articleSlug}: file not found at ${path}`);
    return;
  }
  const original = readFileSync(path, 'utf-8');
  const productNames = extractProductNames(original);
  const keyword = readKeyword(original) ?? articleSlug.replace(/-/g, ' ');

  console.log(`📦 ${niche}/${market}/${articleSlug}`);
  console.log(`   ${productNames.length} product${productNames.length === 1 ? '' : 's'}: ${productNames.join(', ') || '(none)'}`);

  let content = original;

  if (productNames.length > 0) {
    // 1) Wipe sidecars so the new matcher decides afresh.
    clearSidecars(niche, market, articleSlug, productNames);

    // 2) Strip stale attributes (asin/price/image/merchantUrl/merchant) so
    //    the next inject pass doesn't see them as already-set and skip.
    content = stripStaleAttrs(content);

    // 3) Re-fetch with current matcher.
    const { imageMap, asinMap, priceMap, nonAffiliateMap } = await fetchProductImages({
      niche, market, articleSlug, products: productNames,
    });

    // 4) Re-inject the resolved attributes (same order as the generator).
    content = injectImagePaths(content, imageMap);
    content = injectImageAttributes(content, imageMap);
    content = injectAffiliateAsins(content, asinMap);
    content = injectPrices(content, priceMap);
    content = injectMerchantUrls(content, nonAffiliateMap);
  }

  // 5) Inline images — idempotent rebuild. Strip any existing
  //    `![alt](/images/inline/<slug>/...)` markdown lines AND wipe the dir
  //    so the new query strategy (keyword-anchored, cuisine vocab) runs
  //    fresh. Skipping when present would lock in earlier off-topic photos.
  const inlineDir = resolve(SITES_DIR, niche, market, 'public/images/inline', articleSlug);
  const inlineRe = new RegExp(`^!\\[[^\\]]*\\]\\(/images/inline/${articleSlug}/[^)]+\\)\\n+`, 'gm');
  const beforeStrip = content;
  content = content.replace(inlineRe, '');
  if (content !== beforeStrip) console.log(`   🧹 stripped existing inline image markdown`);
  if (existsSync(inlineDir)) rmSync(inlineDir, { recursive: true, force: true });

  // Avis articles get inline images from the product's Amazon gallery
  // (multiple angles of the actual product). Everything else falls back to
  // the Pexels inline path.
  let productImages = [];
  let productAlt = '';
  const intent = readIntent(content);
  if (intent === 'avis' && productNames.length > 0) {
    const primaryName = productNames[0];
    // Re-read the sidecar to pick up the asin we just wrote.
    slugger.reset();
    const productSlug = slugger.slug(primaryName);
    const sidecar = resolve(SITES_DIR, niche, market, 'public/images/products', articleSlug, `${productSlug}.json`);
    if (existsSync(sidecar)) {
      try {
        const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
        if (meta.asin) {
          const gallery = await fetchProductGallery(meta.asin, { market });
          // Skip the first image — it's already the ProductCard main shot.
          productImages = gallery.slice(1);
          productAlt = primaryName;
          console.log(`   📸 product gallery: ${productImages.length} additional images for ${primaryName}`);
        }
      } catch { /* ignore, fall back to Pexels */ }
    }

    // Replace the stale Pexels hero with the actual product photo. Avis
    // readers expect to see the product, not a category stock shot.
    const productPath = `/images/products/${articleSlug}/${productSlug}.jpg`;
    const onDisk = resolve(SITES_DIR, niche, market, 'public', productPath.replace(/^\//, ''));
    if (existsSync(onDisk)) {
      content = content.replace(/^heroImage:\s*.+$/m, `heroImage: ${productPath}`);
      content = content.replace(/^heroImageAlt:\s*.+$/m, `heroImageAlt: ${primaryName}`);
      // Insert if missing entirely.
      if (!/^heroImage:/m.test(content)) {
        content = content.replace(/^---\n/, `---\nheroImage: ${productPath}\nheroImageAlt: ${primaryName}\n`);
      }
      console.log(`   🖼  avis hero → product photo (${productPath})`);
    }
  }

  const { content: withInline, count: inlineCount } = await injectInlineImages({
    niche, market, articleSlug, content, keyword,
    productImages, productAlt,
  });
  if (inlineCount > 0) content = withInline;

  if (content !== original) {
    writeFileSync(path, content);
    console.log(`   ✏  rewrote ${articleSlug}.mdx`);
  } else {
    console.log(`   ✓ no changes`);
  }

  // For avis articles, also retro-link the parent comparatif + pillar
  // guide so readers can navigate from those pages to this avis via body
  // callouts (not just the sidebar). Idempotent — the cross-link module
  // skips files that already carry the avis-link marker.
  if (intent === 'avis') {
    const priorities = readPriorities();
    const opps = priorities?.[niche]?.[market] || [];
    // Find the bundle whose avis slug matches this article.
    const opp = opps.find(o => o.bundle?.avis?.slug === articleSlug);
    if (opp?.bundle) {
      const { patched } = applyAvisRetroLinks({ niche, market }, opp.bundle);
      if (patched.length > 0) {
        console.log(`   🔗 retro-linked avis into: ${patched.join(', ')}`);
      }
    }
  }

  // Refresh bundleSiblings frontmatter on EVERY sibling of this article's
  // bundle, regardless of intent. Catches stale "machine a cafe a grain
  // professionnelle" raw-keyword titles in the sidebar — replaces them
  // with the editorial title from each sibling's frontmatter.
  const priorities = readPriorities();
  const opps = priorities?.[niche]?.[market] || [];
  const myUrl = `${articleSlug}/`;
  const myOpp = opps.find(o => o.bundle && Object.values(o.bundle).some(s => s?.url?.endsWith(`/${articleSlug}/`)));
  if (myOpp) {
    const { patched: patchedSiblings } = refreshBundleSiblings({ niche, market }, myOpp);
    if (patchedSiblings.length > 0) {
      console.log(`   🧾 refreshed bundleSiblings on: ${patchedSiblings.join(', ')}`);
    }
  }
}

async function main() {
  const targets = resolveTargets(args);
  if (targets.length === 0) {
    console.error('No targets resolved. Pass --niche and --market.');
    process.exit(1);
  }
  for (const { niche, market } of targets) {
    await loadSiteConfig(niche, market);
    const articlesDir = resolve(SITES_DIR, niche, market, 'src/content/articles');
    const slugs = args.slug
      ? [args.slug]
      : args.all
        ? readdirSync(articlesDir).filter(f => f.endsWith('.mdx')).map(f => f.replace(/\.mdx$/, ''))
        : [];
    if (slugs.length === 0) {
      console.error(`No slugs to repair for ${niche}/${market}. Pass --slug <slug> or --all.`);
      continue;
    }
    for (const slug of slugs) {
      await repairOne({ niche, market, articleSlug: slug });
    }
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => closeBrowser());
