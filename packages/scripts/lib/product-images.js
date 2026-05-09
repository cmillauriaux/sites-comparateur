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
import slugger from 'github-slugger';
import { fetchWithBrowser } from './browser.js';
import { SITES_DIR } from './env.js';

const slug = new slugger();

// Amazon search hostname per market.
const AMAZON_HOST = {
  fr: 'www.amazon.fr',
  us: 'www.amazon.com',
  gb: 'www.amazon.co.uk',
};

// Currency-symbol pattern for price extraction per market. Amazon uses a
// trailing "€" on .fr and a leading "$" / "£" on .com / .co.uk.
const PRICE_PATTERN = {
  fr: /<span\s+class="a-offscreen">\s*([^<]*?€[^<]*?)<\/span>/,
  us: /<span\s+class="a-offscreen">\s*(\$[^<]*?)<\/span>/,
  gb: /<span\s+class="a-offscreen">\s*(£[^<]*?)<\/span>/,
};

/**
 * Returns `{ imageUrl, asin, price }` for the best matching Amazon search
 * result on the given market's marketplace. Strategy:
 *
 *   1. Walk the first MAX_BLOCKS_TO_INSPECT product blocks. Amazon's HTML
 *      structure changes regularly (used to be `data-component-type=
 *      "s-search-result"` per product, now it's a single wrapper with
 *      lazy-loaded children). We anchor on `/dp/<ASIN>` href patterns,
 *      take each unique ASIN in DOM order, and slice the HTML between
 *      consecutive ASIN positions as that ASIN's "block".
 *   2. Score each block: token overlap between query and product title, with
 *      heavy penalties for accessory keywords (compatible, kit, filtre, ...)
 *      and suspiciously low prices.
 *   3. Pick the block with the highest score, gated by MIN_TITLE_MATCH.
 *      Below the gate, return null/null/null — better an empty card than a
 *      wrong link, image, or price (= zero conversion + lost credibility).
 *
 * `waitFor: 'networkidle'` is required: Amazon now hydrates results client-
 * side, so 'domcontentloaded' returns the shell HTML without ASINs.
 */
export async function findAmazonProduct(productName, { market = 'fr' } = {}) {
  const host = AMAZON_HOST[market];
  if (!host) throw new Error(`findAmazonProduct: unknown market "${market}"`);
  const url = `https://${host}/s?k=${encodeURIComponent(productName)}`;
  try {
    // Pass `market` so the browser uses the matching locale + timezone:
    // a fr-FR session on amazon.co.uk gets EUR prices, an en-GB session gets
    // GBP. Without this the price extractor (which keys on £/$/€) misses
    // every entry.
    const { html } = await fetchWithBrowser(url, { waitFor: 'networkidle', timeoutMs: 30_000, market });

    // Collect unique ASINs in DOM order (first occurrence wins).
    const asinFirstSeen = new Map();
    for (const m of html.matchAll(/\/dp\/(B0[A-Z0-9]{8})/g)) {
      if (!asinFirstSeen.has(m[1])) asinFirstSeen.set(m[1], m.index);
    }
    const asinsByPosition = [...asinFirstSeen.entries()]
      .sort((a, b) => a[1] - b[1]);

    if (asinsByPosition.length === 0) {
      return { imageUrl: null, asin: null, price: null };
    }

    // Build a (position → asin) list with a sentinel at end for slicing.
    const positions = asinsByPosition.map(([asin, idx], i) => ({
      asin,
      start: Math.max(0, idx - 2000),   // include some context before the link (image/title sit before)
      end: i + 1 < asinsByPosition.length ? asinsByPosition[i + 1][1] : Math.min(idx + 6000, html.length),
    }));

    let best = null;
    const candidates = [];
    for (let i = 0; i < Math.min(MAX_BLOCKS_TO_INSPECT, positions.length); i++) {
      const { asin, start, end } = positions[i];
      const block = html.slice(start, end);

      const title = extractTitle(block);
      if (!title) continue;
      const { score, accessory } = scoreTitleMatch(productName, title);
      const price = extractPrice(block, market);

      // Cheap-price soft-gate: a high title-match with a price below the
      // "headline product" floor (e.g. 19,99 € for an SV450 hit) is almost
      // certainly an accessory whose listing happens to contain the product
      // name. Apply an extra penalty to drop it below better-priced candidates.
      const priceValue = price ? parsePrice(price) : NaN;
      let adjusted = score;
      if (Number.isFinite(priceValue) && priceValue < PRICE_FLOOR[market]) {
        adjusted -= PRICE_LOW_PENALTY;
      }

      const cand = {
        idx: i, score, adjusted, accessory, title,
        asin,
        imageUrl: extractImage(block),
        price,
      };
      candidates.push(cand);
      if (!best || cand.adjusted > best.adjusted) best = cand;
    }

    if (!best || best.score < MIN_TITLE_MATCH) {
      // No plausible match — return nothing rather than misleading data.
      return { imageUrl: null, asin: null, price: null, title: null, matchScore: best?.score ?? 0 };
    }

    return {
      imageUrl: best.imageUrl,
      asin: best.asin,
      price: best.price,
      title: best.title,
      matchScore: best.score,
      pickedIdx: best.idx,
    };
  } catch {
    return { imageUrl: null, asin: null, price: null };
  }
}

// How many search-result blocks to scan before giving up. Past N, ranking falls
// off a cliff and we're better off returning null than picking noise.
const MAX_BLOCKS_TO_INSPECT = 8;

// Minimum match score (in [0,1]) to accept a result. Anything below this and
// we treat the search as failed (return null rather than wrong product).
const MIN_TITLE_MATCH = 0.5;

// Below this price, a listing is treated as "almost certainly an accessory"
// and gets a heavy soft penalty in the candidate ranking. Tuned for the
// jardin/electro/sport niches where headline products are at the lower bound
// of these floors. Same magnitude across markets — currency conversion is
// approximate enough that finer tuning is not warranted.
const PRICE_FLOOR = { fr: 40, us: 40, gb: 35 };
const PRICE_LOW_PENALTY = 0.4;

const parsePrice = (raw) => {
  // "1 234,56 €" / "$1,234.56" / "£1,234.56" → 1234.56. Returns NaN on garbage.
  // Strategy: strip currency symbols and spaces; if the string contains both
  // "," and "." treat the LAST of them as the decimal separator and the other
  // as a thousands separator. Otherwise treat "," as decimal (FR) when no ".".
  const noSym = raw.replace(/[\s$£€]/g, '');
  let cleaned;
  const hasComma = noSym.includes(',');
  const hasDot = noSym.includes('.');
  if (hasComma && hasDot) {
    const lastComma = noSym.lastIndexOf(',');
    const lastDot = noSym.lastIndexOf('.');
    if (lastDot > lastComma) {
      cleaned = noSym.replace(/,/g, '');           // "$1,234.56" → "1234.56"
    } else {
      cleaned = noSym.replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
    }
  } else if (hasComma) {
    cleaned = noSym.replace(',', '.');             // "1234,56" → "1234.56"
  } else {
    cleaned = noSym;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

// STRONG accessory signals — words that, when in the title's prefix, identify
// the listing as an accessory rather than the headline product. Penalty is
// large enough to push a perfect-match score below the acceptance threshold.
//
// Note on power-tool listings: "kit" / "set" / "pack" are excluded because on
// amazon.com / .co.uk the legitimate bundled product is routinely titled e.g.
// "DeWalt 20V MAX Cordless Drill/Driver Kit (DCD771C2)" — penalising those
// would reject the headline product. Accessory-only listings still get caught
// via STRONG signals like "compatible" / "remplacement" / "replacement" or
// the cheap-price soft gate (PRICE_FLOOR).
const STRONG_ACCESSORY_TOKENS = new Set([
  'compatible', 'compatibles',
  'rechange', 'rechanges', 'remplacement', 'remplacements', 'replacement', 'replacements',
  'lot', 'lots', 'sachet', 'sachets',
  'chiffon', 'chiffons', 'lingette', 'lingettes',
]);
const STRONG_ACCESSORY_PENALTY = 0.6;
const PREFIX_CHARS_FOR_STRONG = 80;     // only check strong signals near the title start

// WEAK signals — accessory-typical nouns. Penalty is mild because legitimate
// products often list "filtres inclus" / "accessoires fournis" as features.
const WEAK_ACCESSORY_TOKENS = new Set([
  'filtre', 'filtres', 'cartouche', 'cartouches',
  'brosse', 'brosses', 'recharge', 'recharges',
  'housse', 'housses',
  'tube', 'tuyau', 'buse', 'embout', 'embouts',
  'joint', 'joints', 'patin', 'patins',
  'lingette', 'lingettes', 'tampon', 'tampons', 'chiffon', 'chiffons',
  'sac', 'sacs',
  'lame', 'lames',
  'fixation', 'support',
  'coque', 'coques', 'protection',
]);
const WEAK_ACCESSORY_PENALTY = 0.15;

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
  // Strip the leading brand word from `withBrand` to get the SKU-only form.
  // We assume the brand is everything up to the first space (or the full
  // string if there's no space).
  const firstSpace = withBrand.indexOf(' ');
  const skuOnly = firstSpace > 0 ? withBrand.slice(firstSpace + 1) : null;
  // Keep both, deduping if they're identical.
  return [withBrand, skuOnly].filter((v, i, a) => v && a.indexOf(v) === i);
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

// Tokenize for fuzzy product matching:
//  - lowercase + accent strip (NFD)
//  - collapse "<short letters> <digit>" → "<lettersdigit>" so "SC 3", "i 7",
//    "M 18" become single tokens that can match "SC3", "i7", "M18" in queries.
//  - alphanum split, drop tokens shorter than 2 chars
const tokenize = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z]{1,4})\s+(\d+)/g, '$1$2')
    .split(/[^a-z0-9]+/)
    .filter(t => t && t.length >= 2);

function scoreTitleMatch(query, title) {
  const qTokens = tokenize(query);
  const tTokensArr = tokenize(title);
  const tTokens = new Set(tTokensArr);
  if (qTokens.length === 0) return { score: 0, accessory: false };

  // Hard gate 1 — model identifier match. Tokens that mix letters AND digits
  // (sc3, sv450, i7, m18) are model identifiers; ALL of them must appear in
  // the title — but as a substring inside any title token, not as an exact
  // token. Amazon listings frequently append a SKU suffix to the bare model
  // (DCD999 → DCD999B for the bare tool, XPH14 → XPH14T for the kit). Exact
  // token matching would reject those legitimate hits; substring lets them
  // through while still blocking unrelated products.
  // Pure numeric tokens are not used as a gate because titles also contain
  // spec values ("3,2 bar", "1 500 W") that match by chance.
  const qAlphanumMix = qTokens.filter(t => /[a-z]/.test(t) && /\d/.test(t));
  if (qAlphanumMix.length > 0) {
    const allFound = qAlphanumMix.every(qt =>
      tTokensArr.some(tt => tt.includes(qt))
    );
    if (!allFound) {
      return { score: 0, accessory: false, reason: 'model-id-mismatch' };
    }
  }

  // Substring match for fuzzy alignment ("easy" matches "easyfix").
  const matched = qTokens.filter(qt => tTokensArr.some(tt => tt.includes(qt))).length;
  let score = matched / qTokens.length;

  // Strong accessory signal: only counts if it appears near the start of the
  // title (where product-type words live), not when it's just describing
  // included accessories or features further along.
  const titleLow = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const prefixTokens = new Set(tokenize(titleLow.slice(0, PREFIX_CHARS_FOR_STRONG)));
  const strong = [...prefixTokens].some(t => STRONG_ACCESSORY_TOKENS.has(t));

  let penalty = 0;
  if (strong) {
    penalty = STRONG_ACCESSORY_PENALTY;
  } else if ([...tTokens].some(t => WEAK_ACCESSORY_TOKENS.has(t))) {
    penalty = WEAK_ACCESSORY_PENALTY;
  }
  score -= penalty;

  return { score, accessory: penalty > 0 };
}

function extractTitle(block) {
  const patterns = [
    /<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/,
    /aria-label="([^"]{20,300})"/,
    /<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([^<]+)<\/span>/,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m && m[1].trim().length > 15) return m[1].trim();
  }
  return null;
}

function extractPrice(block, market = 'fr') {
  const re = PRICE_PATTERN[market] ?? PRICE_PATTERN.fr;
  const raw = block.match(re)?.[1];
  return raw ? raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function extractImage(block) {
  const primary = block.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/);
  const fallback = block.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/);
  return primary?.[1] ?? fallback?.[1] ?? null;
}

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
      return { asin: data.asin ?? null, price: data.price ?? null, fetchedAt: data.fetchedAt ?? null };
    } catch { /* fall through */ }
  }
  if (existsSync(asinPath)) {
    return { asin: readFileSync(asinPath, 'utf-8').trim() || null, price: null, fetchedAt: null };
  }
  return { asin: null, price: null, fetchedAt: null };
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
  const publicDir = resolve(SITES_DIR, niche, market, 'public/images/products', articleSlug);

  for (const productName of products) {
    const productSlug = slug.slug(productName);
    const localPath = join(publicDir, `${productSlug}.jpg`);
    const jsonSidecar = join(publicDir, `${productSlug}.json`);
    const legacyAsinSidecar = join(publicDir, `${productSlug}.asin`);
    const publicPath = `/images/products/${articleSlug}/${productSlug}.jpg`;

    // Cache hit only if both image AND fresh metadata sidecar exist. Image-only
    // caches (or legacy .asin-only) trigger a re-fetch so we get a current price.
    if (existsSync(localPath) && existsSync(jsonSidecar)) {
      if (verbose) console.log(`    📷 cached: ${productName}`);
      const { asin, price } = readSidecar(jsonSidecar, legacyAsinSidecar);
      imageMap[productName] = publicPath;
      asinMap[productName] = asin;
      priceMap[productName] = price;
      continue;
    }

    try {
      let result = await findAmazonProduct(productName, { market });
      // Cascading fallback when the full name yields no match. The retries go
      // narrower → narrower:
      //   1. brand + sku (e.g. "Stihl RE 100" from "Stihl RE 100 Plus Control")
      //   2. sku alone   (e.g. "DCD999" from "DeWalt DCD999")
      // The narrower query forces Amazon's relevance ranker to put the SKU's
      // own listing first instead of "drills compatible with DCD999" noise.
      if (!result.asin) {
        const fallbacks = buildModelIdFallbacks(productName).filter(q => q && q.toLowerCase() !== productName.toLowerCase());
        for (const fallback of fallbacks) {
          if (verbose) console.log(`    🔁 fallback query: "${fallback}"`);
          const retry = await findAmazonProduct(fallback, { market });
          if (retry.asin || (retry.matchScore ?? 0) > (result.matchScore ?? 0)) {
            result = retry;
            if (retry.asin) break;
          }
        }
      }
      const { imageUrl, asin, price, title, matchScore, pickedIdx } = result;

      if (!imageUrl && !asin) {
        if (verbose) console.warn(`    ⚠️  ${productName} — rejected (score=${matchScore?.toFixed(2) ?? '0.00'})`);
        imageMap[productName] = null;
        asinMap[productName] = null;
        priceMap[productName] = null;
        // Persist a "no-match" sidecar so we don't refetch on every run.
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(jsonSidecar, JSON.stringify({
          asin: null, price: null, title: null, matchScore: matchScore ?? 0,
          fetchedAt: new Date().toISOString(),
        }, null, 2));
        continue;
      }
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
        asin, price, title, matchScore, pickedIdx,
        fetchedAt: new Date().toISOString(),
      }, null, 2));

      if (verbose) {
        const flag = matchScore >= 0.8 ? '✅' : '⚠️ ';
        console.log(`    ${flag} ${productName} → score=${matchScore.toFixed(2)} idx=${pickedIdx} asin=${asin ?? '–'} price=${price ?? '–'}`);
      }
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  ${productName}: ${err.message}`);
      imageMap[productName] = null;
      asinMap[productName] = null;
      priceMap[productName] = null;
    }
  }

  return { imageMap, asinMap, priceMap };
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
