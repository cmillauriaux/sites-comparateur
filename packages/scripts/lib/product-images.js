/**
 * Fetch product images + ASINs from Amazon search results, using the same
 * Playwright browser singleton as the source scraper. Saves images to
 * /sites/<niche>/public/images/products/<article-slug>/<product-slug>.jpg.
 *
 * Why scrape Amazon: PA-API requires ~3 sales before approval. Until then,
 * the search-page hero image + ASIN of the first organic result is the best proxy.
 *
 * Hotlinking is avoided because Amazon's CDN URLs are session-tied and rotate.
 * The ASIN is persisted to a sidecar `<product-slug>.asin` so re-runs that
 * skip the image download still recover it.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { asciiSlug } from './slugify.js';
import { SITES_DIR } from './env.js';
import { findGoogleShoppingProduct } from './google-shopping.js';
import { searchAmazonProducts } from './amazon-dfs.js';
import { evaluateMatch, PRICE_FLOOR, PRICE_LOW_PENALTY, MIN_TITLE_MATCH, tokenize } from './match.js';
import { validateMatchesWithClaude } from './match-validator.js';

// Amazon search hostname per market.
const AMAZON_HOST = {
  fr: 'www.amazon.fr',
  us: 'www.amazon.com',
  gb: 'www.amazon.co.uk',
};

/**
 * Score every Amazon SERP item against `productName` and return the top-N
 * candidates that pass HARD gates (brand-required + model-id + non-brand).
 *
 * Why multiple candidates instead of "the best one": the matcher's adjusted
 * score is reliable enough to filter obvious junk (different brand, wrong
 * SKU) but not reliable enough to distinguish "the headline product" from
 * "a high-end accessory matching all tokens" — the Husqvarna Automower 310
 * vs the "Batterie Husqvarna Automower 310" case. We delegate that final
 * pick to a Claude-validator step (match-validator.js) that reads the
 * candidate titles and prices and refuses obvious accessories.
 *
 * Candidates carry their adjusted score + accessory flag so the validator
 * prompt can present them in a meaningful order without re-deriving signals.
 * Items failing a HARD gate are dropped (would only add noise to the prompt).
 */
export async function findAmazonCandidates(productName, { market = 'fr', maxCandidates = 5 } = {}) {
  if (!AMAZON_HOST[market]) throw new Error(`findAmazonCandidates: unknown market "${market}"`);
  try {
    const items = await searchAmazonProducts(productName, { market });
    if (items.length === 0) return [];

    const candidates = [];
    for (let i = 0; i < Math.min(MAX_BLOCKS_TO_INSPECT, items.length); i++) {
      const it = items[i];
      if (!it.title || !it.asin) continue;
      const { score, accessory, reason } = scoreTitleMatch(productName, it.title);

      // HARD gate: drop items failing brand/model-id/non-brand-match. These
      // are noise the validator shouldn't even see (different products
      // entirely). Soft signals (accessory penalty, low price) stay on the
      // candidate so the validator can use them to reject accessories.
      if (reason) continue;

      let adjusted = score;
      if (Number.isFinite(it.priceValue) && it.priceValue < PRICE_FLOOR[market]) {
        adjusted -= PRICE_LOW_PENALTY;
      }

      candidates.push({
        idx: i,
        asin: it.asin,
        title: it.title,
        imageUrl: it.imageUrl,
        price: it.price,
        priceValue: it.priceValue,
        rawScore: score,
        adjustedScore: adjusted,
        accessory,
      });
    }

    candidates.sort((a, b) => b.adjustedScore - a.adjustedScore);
    return candidates.slice(0, maxCandidates);
  } catch (err) {
    console.warn(`    ⚠️  amazon-dfs: ${err.message}`);
    return [];
  }
}

/**
 * Legacy single-best wrapper around `findAmazonCandidates`. Kept for callers
 * outside the article-gen pipeline (repair-products, probe scripts) that
 * don't have a Claude-validation step. Applies the original MIN_TITLE_MATCH
 * gate on `adjustedScore` so behaviour is unchanged for them.
 */
export async function findAmazonProduct(productName, { market = 'fr' } = {}) {
  const candidates = await findAmazonCandidates(productName, { market, maxCandidates: 1 });
  const best = candidates[0];
  if (!best || best.adjustedScore < MIN_TITLE_MATCH) {
    return { imageUrl: null, asin: null, price: null, title: null, matchScore: best?.adjustedScore ?? 0 };
  }
  return {
    imageUrl: best.imageUrl,
    asin: best.asin,
    price: best.price,
    title: best.title,
    matchScore: best.rawScore,
    pickedIdx: best.idx,
  };
}

// How many search-result blocks to scan before giving up. Past N, ranking falls
// off a cliff and we're better off returning null than picking noise.
const MAX_BLOCKS_TO_INSPECT = 8;
// The matcher gates + constants now live in lib/match.js (shared with
// google-shopping.js). PRICE_FLOOR / PRICE_LOW_PENALTY / MIN_TITLE_MATCH /
// tokenize / evaluateMatch are imported above.

/**
 * Build a focused fallback query when the full product name yields no Amazon
 * match. Strategy: keep the brand and the SKU/model id, drop everything else.
 *
 * Crucially, the SKU is extracted from the ORIGINAL name (preserving case +
 * spaces), not from `tokenize()` — the search engine on amazon.com / .co.uk
 * is space-sensitive: "RE 100" and "RE100" return different result sets.
 * `tokenize()` collapses "RE 100" → "re100" (good for matching title text,
 * bad for constructing a search query).
 *
 *   "DeWalt DCD771C2 20V Max Cordless Drill Driver Set" → "DeWalt DCD771C2"
 *   "Stihl RE 100 Plus Control"                         → "Stihl RE 100"
 *   "Nilfisk Core 140-6 Power Control"                  → "Nilfisk Core 140-6"
 *   "Aspirateur Dyson V15"                              → "Dyson V15"
 */
// Spec-value patterns ("40V", "1500W", "18Ah") that look like SKU suffixes
// but are units. Excluded from SKU runs in buildModelIdQuery.
const UNIT_SUFFIX_RE = /^[0-9.,]+(V|W|kW|A|Ah|mA|mAh|kg|lb|lbs|in|ft|hp|psi|bar|nm|cc)$/i;

function buildModelIdFallbacks(productName) {
  const withBrand = buildModelIdQuery(productName);
  if (!withBrand) return [];
  // NEVER fall back to SKU-only ("E6", "DCD771") — a 2-3 char alphanumeric
  // token without a brand matches anything that happens to contain it
  // (scooters, light bulbs, knockoff brands). The brand-required hard gate
  // in scoreTitleMatch would catch most, but skipping the bad query entirely
  // avoids burning a DataForSEO call on it.
  return [withBrand];
}

/**
 * Progressive shortening fallback for product names where buildModelIdQuery
 * misses (consumer brand families with no SKU-style suffix):
 *   "Lavor Galaxy 160" → ["Lavor Galaxy"]
 *   "Bosch Professional GST 18 V-Li S" → ["Bosch Professional GST 18 V-Li", "Bosch Professional GST 18", "Bosch Professional GST", "Bosch Professional"]
 *   "Karcher K5 Premium Full Control" → ["Karcher K5 Premium Full", "Karcher K5 Premium", "Karcher K5"]
 *
 * Returns longest-first so we prefer specific matches (less generic noise).
 * Stops at brand+1 word — anything shorter is too generic and would match
 * accessories/related products.
 */
function buildShortenedNameFallbacks(productName) {
  const words = productName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return [];          // already short enough; nothing to shorten
  const fallbacks = [];
  for (let len = words.length - 1; len >= 2; len--) {
    fallbacks.push(words.slice(0, len).join(' '));
  }
  return fallbacks;
}

function buildModelIdQuery(productName) {
  // Find the longest contiguous "model id" run in the original string. A model
  // id run is one of:
  //   - "ABC123" (letter+digit token, possibly with hyphens like "140-6")
  //   - "AB 123" (short letter prefix + digits)
  //   - "AB 123-4" (combination)
  // We scan tokens (split on whitespace) and absorb adjacent ones when they
  // continue the pattern.
  const words = productName.trim().split(/\s+/);
  if (words.length === 0) return null;

  let bestRun = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Token must contain a digit AND look like a SKU (≤ 12 chars, not pure word).
    if (!/\d/.test(w) || w.length > 12) continue;
    if (/^\d+$/.test(w) && (i === 0 || !/^[A-Z]{1,4}$/i.test(words[i - 1]))) continue; // pure numeric without letter prefix is noise
    if (UNIT_SUFFIX_RE.test(w)) continue;            // "1600W" / "18Ah" / "20V" are specs, not SKUs
    // Absorb a preceding short letter prefix (e.g. "RE" before "100", "PW" before "235R")
    let start = i;
    if (i > 0 && /^[A-Z]{1,4}$/i.test(words[i - 1])) start = i - 1;
    // Absorb a trailing numeric/dash continuation (e.g. "140-6", "140 6", "235R")
    // but NOT a spec value disguised as one ("40V", "1500W", "18Ah") — those
    // are unit-suffixed numbers and don't belong in a SKU search query.
    let end = i;
    while (
      end + 1 < words.length &&
      /^[0-9-]+[A-Z]?$/i.test(words[end + 1]) &&
      words[end + 1].length <= 6 &&
      !UNIT_SUFFIX_RE.test(words[end + 1])
    ) {
      end++;
    }
    const run = words.slice(start, end + 1).join(' ');
    if (!bestRun || run.length > bestRun.length) bestRun = run;
  }
  if (!bestRun) return null;

  // Prepend the brand (first word) when it isn't already part of the run.
  const brand = words[0];
  if (bestRun.toLowerCase().startsWith(brand.toLowerCase())) return bestRun;
  return `${brand} ${bestRun}`;
}

// scoreTitleMatch / tokenize / accessory tokens now live in lib/match.js
// (re-exported as evaluateMatch). Wrapper kept here so the call sites below
// can keep using the local name without touching the rest of the file.
const scoreTitleMatch = evaluateMatch;

async function downloadTo(url, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buf);
}

/**
 * Read a `<product-slug>.json` sidecar with backward-compat for the legacy
 * `.asin` text file (which only stored the ASIN). Returns
 * `{ asin, price, fetchedAt }` — any field may be null when missing.
 */
function readSidecar(jsonPath, asinPath) {
  if (existsSync(jsonPath)) {
    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      return {
        asin: data.asin ?? null,
        price: data.price ?? null,
        fetchedAt: data.fetchedAt ?? null,
        // Non-Amazon merchant fallback (Google Shopping path). null when the
        // sidecar predates the fallback feature OR when the product resolved
        // on Amazon (no need for fallback metadata).
        nonAffiliate: data.nonAffiliate ?? null,
      };
    } catch { /* fall through */ }
  }
  if (existsSync(asinPath)) {
    return {
      asin: readFileSync(asinPath, 'utf-8').trim() || null,
      price: null, fetchedAt: null, nonAffiliate: null,
    };
  }
  return { asin: null, price: null, fetchedAt: null, nonAffiliate: null };
}

/**
 * Fetches images + ASINs + prices for every entry in `products[]` from the
 * marketplace matching `market`. Returns `{ imageMap, asinMap, priceMap }`:
 *   - imageMap[name] = "/images/products/<slug>/<product-slug>.jpg" | null
 *   - asinMap[name]  = "B0XXXXXXXX" | null
 *   - priceMap[name] = "89,99 €" / "$89.99" / "£79.99" | null
 *
 * Already-existing files are skipped; metadata is recovered from a
 * `<product-slug>.json` sidecar so links + prices survive re-runs.
 */
export async function fetchProductImages({ niche, market = 'fr', articleSlug, products, verbose = true }) {
  const imageMap = {};
  const asinMap = {};
  const priceMap = {};
  // nonAffiliateMap[name] = { merchantUrl, merchant } when Amazon search missed
  // and Google Shopping found a non-Amazon listing. The renderer (AffiliateButton)
  // uses these to swap into outline-style "Voir sur <merchant>" buttons that
  // bypass the Amazon affiliate program — they read as outbound clicks in
  // analytics, which dilutes the "scaled-affiliate-spam" signal.
  const nonAffiliateMap = {};
  const publicDir = resolve(SITES_DIR, niche, market, 'public/images/products', articleSlug);
  // Per-product candidate sets collected during pass 1; consumed by the
  // batched Claude-validator + materialization pass below.
  const pendingValidation = [];

  for (const productName of products) {
    const productSlug = asciiSlug(productName);
    const localPath = join(publicDir, `${productSlug}.jpg`);
    const jsonSidecar = join(publicDir, `${productSlug}.json`);
    const legacyAsinSidecar = join(publicDir, `${productSlug}.asin`);
    const publicPath = `/images/products/${articleSlug}/${productSlug}.jpg`;

    // Cache hit only if both image AND fresh metadata sidecar exist. Image-only
    // caches (or legacy .asin-only) trigger a re-fetch so we get a current price.
    if (existsSync(localPath) && existsSync(jsonSidecar)) {
      if (verbose) console.log(`    📷 cached: ${productName}`);
      const { asin, price, nonAffiliate } = readSidecar(jsonSidecar, legacyAsinSidecar);
      imageMap[productName] = publicPath;
      asinMap[productName] = asin;
      priceMap[productName] = price;
      if (nonAffiliate) nonAffiliateMap[productName] = nonAffiliate;
      continue;
    }

    try {
      // Multi-candidate matching: collect up to 5 candidates passing hard
      // gates from the primary query, falling back to narrower queries when
      // the primary yields nothing. Final pick (or rejection) is delegated
      // to the Claude-validator step further down.
      let candidates = await findAmazonCandidates(productName, { market });
      if (candidates.length === 0) {
        const seen = new Set([productName.toLowerCase()]);
        const dedup = (q) => {
          const k = q?.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        };
        const fallbacks = [
          ...buildModelIdFallbacks(productName),
          ...buildShortenedNameFallbacks(productName),
        ].filter(dedup);
        // Cap: products that genuinely don't exist on Amazon (Chinese SKUs
        // like ONEVAN / ZUUKO / Nature Pro) burn 40+ fallback queries
        // ($0.0033 each via DataForSEO) for zero candidates. After 3
        // shortened-name attempts, accept that Amazon has nothing and fall
        // through to Google Shopping.
        const MAX_FALLBACK_QUERIES = 3;
        for (const fallback of fallbacks.slice(0, MAX_FALLBACK_QUERIES)) {
          if (verbose) console.log(`    🔁 fallback query: "${fallback}"`);
          candidates = await findAmazonCandidates(fallback, { market });
          if (candidates.length > 0) break;
        }
      }
      pendingValidation.push({ productName, candidates, productSlug, localPath, jsonSidecar, publicPath, publicDir });
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  ${productName}: ${err.message}`);
      imageMap[productName] = null;
      asinMap[productName] = null;
      priceMap[productName] = null;
    }
  }

  // BATCHED CLAUDE VALIDATION across all pending products. One call per
  // article keeps cost flat regardless of how many products the comparatif
  // covers. The validator caches per (productName, candidate ASINs) so
  // re-runs that hit the same DFS results don't pay twice.
  const candidatesByProduct = {};
  for (const item of pendingValidation) {
    candidatesByProduct[item.productName] = item.candidates;
  }
  const picksByProduct = pendingValidation.length > 0
    ? await validateMatchesWithClaude({ niche, market, candidatesByProduct, verbose })
    : {};

  for (const item of pendingValidation) {
    const { productName, productSlug, localPath, jsonSidecar, publicPath, publicDir } = item;
    const pick = picksByProduct[productName] ?? null;

    try {
      if (!pick) {
        // No Amazon pick: fall through to Google Shopping. Same logic as
        // before, just triggered by validator-null instead of matcher-null.
        if (verbose) console.log(`    🌐 Amazon validator → none, trying Google Shopping for "${productName}"`);
        let gsMatch = null;
        try {
          gsMatch = await findGoogleShoppingProduct({ productName, market });
        } catch (err) {
          if (verbose) console.warn(`    ⚠️  Google Shopping failed: ${err.message}`);
        }

        if (gsMatch) {
          if (gsMatch.imageUrl && !existsSync(localPath)) {
            mkdirSync(publicDir, { recursive: true });
            try {
              await downloadTo(gsMatch.imageUrl, localPath);
            } catch (err) {
              if (verbose) console.warn(`    ⚠️  image download failed: ${err.message}`);
            }
          }
          imageMap[productName] = existsSync(localPath) ? publicPath : null;
          asinMap[productName] = null;
          priceMap[productName] = gsMatch.price;
          nonAffiliateMap[productName] = {
            merchantUrl: gsMatch.merchantUrl,
            merchant: gsMatch.merchant,
          };
          mkdirSync(publicDir, { recursive: true });
          writeFileSync(jsonSidecar, JSON.stringify({
            asin: null,
            price: gsMatch.price,
            title: gsMatch.title,
            matchScore: gsMatch.matchScore,
            nonAffiliate: { merchantUrl: gsMatch.merchantUrl, merchant: gsMatch.merchant },
            fetchedAt: new Date().toISOString(),
          }, null, 2));
          if (verbose) console.log(`    ✅ ${productName} → ${gsMatch.merchant} (price=${gsMatch.price ?? '–'})`);
          continue;
        }

        if (verbose) console.warn(`    ⚠️  ${productName} — rejected by validator + no Google Shopping match`);
        imageMap[productName] = null;
        asinMap[productName] = null;
        priceMap[productName] = null;
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(jsonSidecar, JSON.stringify({
          asin: null, price: null, title: null, matchScore: 0,
          fetchedAt: new Date().toISOString(),
        }, null, 2));
        continue;
      }

      const { asin, title, imageUrl, price } = pick;
      if (imageUrl && !existsSync(localPath)) {
        await downloadTo(imageUrl, localPath);
        imageMap[productName] = publicPath;
      } else if (existsSync(localPath)) {
        imageMap[productName] = publicPath;
      } else {
        imageMap[productName] = null;
      }
      asinMap[productName] = asin;
      priceMap[productName] = price;

      mkdirSync(publicDir, { recursive: true });
      writeFileSync(jsonSidecar, JSON.stringify({
        asin, price, title, matchScore: null, pickedBy: 'claude-validator',
        fetchedAt: new Date().toISOString(),
      }, null, 2));

      if (verbose) {
        console.log(`    ✅ ${productName} → asin=${asin} price=${price ?? '–'}`);
      }
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  ${productName}: ${err.message}`);
      imageMap[productName] = null;
      asinMap[productName] = null;
      priceMap[productName] = null;
    }
  }

  return { imageMap, asinMap, priceMap, nonAffiliateMap };
}

/**
 * Replace `image="auto:Some Product Name"` markers in the article markdown
 * with actual local paths from the imageMap. Matches both attribute syntax
 * (`image="auto:..."` in <ProductCard>) and object-property syntax
 * (`image: "auto:..."` inside <ComparisonTable products={[{...}]} />).
 */
export function injectImagePaths(markdown, imageMap) {
  return markdown.replace(/image\s*([:=])\s*(["'])auto:([^"']+)\2/g, (_full, sep, quote, name) => {
    const path = imageMap[name.trim()];
    if (!path) return `image${sep === ':' ? ': ' : '='}${quote}${quote}`;
    return `image${sep === ':' ? ': ' : '='}${quote}${path}${quote}`;
  });
}

/**
 * Inject an attribute (e.g. `asin="..."`, `price="..."`) into the article
 * markdown wherever a recognised product reference exists. Targets:
 *   - <ProductCard ... name="X" ... />              → adds attribute
 *   - <AffiliateButton ... product="X" ... />|>     → adds attribute (opt-in)
 *   - <ComparisonTable products={[ {name: "X", ...} ]} ... /> → adds object key
 *
 * Already-set attributes are left alone, so multiple post-passes (asin then
 * price then …) compose without stomping each other.
 */
function injectAttributeByProductName(markdown, attr, valueMap, { onAffiliateButton = false } = {}) {
  let out = markdown;

  out = out.replace(/<ProductCard\b([\s\S]*?)\/>/g, (full, body) => {
    if (new RegExp(`\\b${attr}\\s*=`).test(body)) return full;
    const m = body.match(/\bname\s*=\s*(["'])([^"']+)\1/);
    if (!m) return full;
    const value = valueMap[m[2].trim()];
    if (!value) return full;
    return `<ProductCard${body.replace(/\s+$/, '')} ${attr}="${value}" />`;
  });

  if (onAffiliateButton) {
    out = out.replace(/<AffiliateButton\b([\s\S]*?)(\/?)>/g, (full, body, slash) => {
      if (new RegExp(`\\b${attr}\\s*=`).test(body)) return full;
      const m = body.match(/\bproduct\s*=\s*(["'])([^"']+)\1/);
      if (!m) return full;
      const value = valueMap[m[2].trim()];
      if (!value) return full;
      const trimmed = body.replace(/\s+$/, '');
      return slash
        ? `<AffiliateButton${trimmed} ${attr}="${value}" />`
        : `<AffiliateButton${trimmed} ${attr}="${value}">`;
    });
  }

  out = out.replace(
    /(<ComparisonTable\b[\s\S]*?products=\{\[)([\s\S]*?)(\]\}[\s\S]*?\/?>)/g,
    (_full, prefix, productsArr, suffix) => {
      // Inject `<attr>: "..."` right after each `name: "..."`, but only if
      // the entry doesn't already declare the attribute. Per-entry scope is
      // approximated as "from this name: to the next name:" since each
      // product object embeds a nested `criteria: {...}` that breaks naive
      // brace counting.
      const matches = [...productsArr.matchAll(/\bname\s*:\s*(["'])([^"']+)\1/g)];
      if (matches.length === 0) return prefix + productsArr + suffix;
      const attrRe = new RegExp(`\\b${attr}\\s*:`);
      let out2 = '';
      let cursor = 0;
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const headEnd = m.index + m[0].length;
        const nextStart = matches[i + 1]?.index ?? productsArr.length;
        const entryBody = productsArr.slice(headEnd, nextStart);
        const value = valueMap[m[2].trim()];
        out2 += productsArr.slice(cursor, headEnd);
        if (value && !attrRe.test(entryBody)) {
          out2 += `, ${attr}: "${value}"`;
        }
        cursor = headEnd;
      }
      out2 += productsArr.slice(cursor);
      return prefix + out2 + suffix;
    },
  );

  return out;
}

/** Inject `asin="..."` everywhere products are referenced — for direct Amazon
 *  product links (amazon.fr/dp/<asin>) instead of search pages.
 *  Targets ProductCard, AffiliateButton, ComparisonTable. */
export function injectAffiliateAsins(markdown, asinMap) {
  return injectAttributeByProductName(markdown, 'asin', asinMap, { onAffiliateButton: true });
}

/** Inject `image="..."` on ProductCards and ComparisonTable products that lack
 *  one. Used as a safety net after `injectImagePaths`: if Claude forgets the
 *  `image="auto:..."` placeholder, we still wire the resolved local path by
 *  matching on product name. */
export function injectImageAttributes(markdown, imageMap) {
  return injectAttributeByProductName(markdown, 'image', imageMap, { onAffiliateButton: false });
}

/** Inject `price="..."` (e.g. "89,99 €") on ProductCards and inside
 *  ComparisonTable products. Not added to AffiliateButton — the button label
 *  doesn't display price. */
export function injectPrices(markdown, priceMap) {
  return injectAttributeByProductName(markdown, 'price', priceMap, { onAffiliateButton: false });
}

/** Inject `merchantUrl="..."` and `merchant="..."` for products that resolved
 *  via the Google Shopping fallback (Amazon ASIN missing). Both ProductCard
 *  AND AffiliateButton receive the attrs — AffiliateButton uses them to
 *  switch into outline non-affiliate mode, ProductCard uses them to relabel
 *  the price tile ("Prix sur Manomano" instead of "Prix Amazon"). */
export function injectMerchantUrls(markdown, nonAffiliateMap) {
  if (!nonAffiliateMap || Object.keys(nonAffiliateMap).length === 0) return markdown;
  const urlMap = {};
  const merchantMap = {};
  for (const [name, na] of Object.entries(nonAffiliateMap)) {
    if (na?.merchantUrl) urlMap[name] = na.merchantUrl;
    if (na?.merchant) merchantMap[name] = na.merchant;
  }
  let out = injectAttributeByProductName(markdown, 'merchantUrl', urlMap, { onAffiliateButton: true });
  out = injectAttributeByProductName(out, 'merchant', merchantMap, { onAffiliateButton: true });
  return out;
}
