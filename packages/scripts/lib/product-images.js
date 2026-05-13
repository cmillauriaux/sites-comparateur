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
import { SITES_DIR } from './env.js';
import { findGoogleShoppingProduct } from './google-shopping.js';
import { searchAmazonProducts } from './amazon-dfs.js';

const slug = new slugger();

// Amazon search hostname per market.
const AMAZON_HOST = {
  fr: 'www.amazon.fr',
  us: 'www.amazon.com',
  gb: 'www.amazon.co.uk',
};

/**
 * Returns `{ imageUrl, asin, price, title, matchScore, pickedIdx }` for the
 * best matching Amazon search result on the given market's marketplace.
 *
 * Backend: DataForSEO Amazon Products (live endpoint). Replaces the previous
 * Playwright scrape that was 100% bot-blocked on GitHub-hosted runners (every
 * `s?k=` request returned a 195-char "Robot check" stub from Amazon's WAF).
 * DataForSEO routes through its own proxy pool and returns structured items.
 *
 * Strategy:
 *   1. Hit the live endpoint (~10-15s) — get up to 20 ranked items.
 *   2. Score the first MAX_BLOCKS_TO_INSPECT by token overlap against the
 *      product name, with the same accessory + price-floor penalties as the
 *      previous HTML-scraping version.
 *   3. Pick the highest-adjusted-score candidate, gated by MIN_TITLE_MATCH.
 *      Below the gate, return nulls — better an empty card than a wrong link.
 */
export async function findAmazonProduct(productName, { market = 'fr' } = {}) {
  if (!AMAZON_HOST[market]) throw new Error(`findAmazonProduct: unknown market "${market}"`);
  try {
    const items = await searchAmazonProducts(productName, { market });
    if (items.length === 0) return { imageUrl: null, asin: null, price: null, title: null, matchScore: 0 };

    let best = null;
    for (let i = 0; i < Math.min(MAX_BLOCKS_TO_INSPECT, items.length); i++) {
      const it = items[i];
      if (!it.title || !it.asin) continue;
      const { score, accessory } = scoreTitleMatch(productName, it.title);

      // Cheap-price soft-gate: same logic as the legacy HTML version. A
      // high title-match with a price below the "headline product" floor
      // (e.g. 19,99 € for an SV450 hit) is almost certainly an accessory
      // whose listing happens to contain the product name.
      let adjusted = score;
      if (Number.isFinite(it.priceValue) && it.priceValue < PRICE_FLOOR[market]) {
        adjusted -= PRICE_LOW_PENALTY;
      }

      const cand = { idx: i, score, adjusted, accessory, ...it };
      if (!best || cand.adjusted > best.adjusted) best = cand;
    }

    // Acceptance gate uses ADJUSTED score (raw - accessory - price-low penalty).
    // Raw score alone lets through screen protectors / spare parts that happen
    // to contain the full product name in their title — exactly the kind of
    // match we want to reject. The accessory + price penalties are calibrated
    // precisely so this gate filters them.
    if (!best || best.adjusted < MIN_TITLE_MATCH) {
      return { imageUrl: null, asin: null, price: null, title: null, matchScore: best?.adjusted ?? 0 };
    }

    return {
      imageUrl: best.imageUrl,
      asin: best.asin,
      price: best.price,
      title: best.title,
      matchScore: best.score,
      pickedIdx: best.idx,
    };
  } catch (err) {
    console.warn(`    ⚠️  amazon-dfs: ${err.message}`);
    return { imageUrl: null, asin: null, price: null, title: null, matchScore: 0 };
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

// Strip all non-alphanumerics + accents and lowercase. Used by the brand-
// required gate so spelling variations like "De'Longhi" / "De Longhi" /
// "DeLonghi" all collapse to "delonghi" and match equivalently.
const stripToAlnum = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function scoreTitleMatch(query, title) {
  const qTokens = tokenize(query);
  const tTokensArr = tokenize(title);
  const tTokens = new Set(tTokensArr);
  if (qTokens.length === 0) return { score: 0, accessory: false };

  // Hard gate 0 — brand-required. The first whitespace-separated word of the
  // ORIGINAL query (almost always the brand, e.g. "Jura" / "Sage" / "DeLonghi")
  // MUST appear as a substring in the punctuation-stripped title. Catches
  // cross-category mismatches that score gates miss — e.g. fallback query "E6"
  // matching an "EVERCROSS E6 Trottinette" listing with a perfect token score
  // because they happen to share the SKU-like suffix.
  // Skipped for short first words (< 3 chars) like "Le"/"La"/"The".
  const firstWord = query.trim().split(/\s+/)[0];
  const brandKey = stripToAlnum(firstWord);
  if (brandKey.length >= 3) {
    const titleKey = stripToAlnum(title);
    if (!titleKey.includes(brandKey)) {
      return { score: 0, accessory: false, reason: 'brand-missing' };
    }
  }

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
      const { asin, price, nonAffiliate } = readSidecar(jsonSidecar, legacyAsinSidecar);
      imageMap[productName] = publicPath;
      asinMap[productName] = asin;
      priceMap[productName] = price;
      if (nonAffiliate) nonAffiliateMap[productName] = nonAffiliate;
      continue;
    }

    try {
      let result = await findAmazonProduct(productName, { market });
      // Cascading fallback when the full name yields no match. The retries go
      // narrower → narrower:
      //   1. brand + sku (e.g. "Stihl RE 100" from "Stihl RE 100 Plus Control")
      //   2. sku alone   (e.g. "DCD999" from "DeWalt DCD999")
      //   3. progressive shortening — drop trailing words one at a time
      //      (e.g. "Lavor Galaxy 160" → "Lavor Galaxy"). Catches consumer
      //      brand families where the model id isn't SKU-shaped.
      // The narrower query forces Amazon's relevance ranker to put the SKU's
      // own listing first instead of "drills compatible with DCD999" noise.
      if (!result.asin) {
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
        // Amazon exhausted. Try Google Shopping for a non-affiliate fallback —
        // a niche brand that Amazon doesn't carry will often show up on a
        // dedicated retailer (Manomano, Leroy Merlin, Castorama). Better a
        // sourced non-affiliate link than an empty product card.
        if (verbose) console.log(`    🌐 Amazon miss → Google Shopping fallback for "${productName}"`);
        let gsMatch = null;
        try {
          gsMatch = await findGoogleShoppingProduct({ productName, market });
        } catch (err) {
          if (verbose) console.warn(`    ⚠️  Google Shopping failed: ${err.message}`);
        }

        if (gsMatch) {
          // Download the merchant's product image so it's served from our own
          // public/images path (same caching/CDN behaviour as Amazon images).
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

        if (verbose) console.warn(`    ⚠️  ${productName} — rejected (Amazon score=${matchScore?.toFixed(2) ?? '0.00'}, no Google Shopping match)`);
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
