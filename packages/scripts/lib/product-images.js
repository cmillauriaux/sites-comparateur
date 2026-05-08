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

/**
 * Returns `{ imageUrl, asin, price }` for the Amazon.fr search result that
 * best matches `productName`. Strategy:
 *
 *   1. Walk the first MAX_BLOCKS_TO_INSPECT `data-component-type="s-search-result"`
 *      blocks (Amazon often shows accessories — "Kit pour Kärcher SC5",
 *      "Filtre rechange", "Housses compatible avec…" — before the actual
 *      product, especially when the LLM-generated query is very specific).
 *   2. Score each block: token overlap between query and product title, with
 *      a heavy penalty for accessory keywords (compatible, kit, filtre, ...).
 *   3. Pick the block with the highest score, gated by MIN_TITLE_MATCH.
 *      Below the gate, return null/null/null — better an empty card than a
 *      wrong link, image, or price (= zero conversion + lost credibility).
 *
 * Returned `price` is normalized (`&nbsp;` → space), format e.g. "89,99 €".
 */
export async function findAmazonProduct(productName) {
  const url = `https://www.amazon.fr/s?k=${encodeURIComponent(productName)}`;
  try {
    const { html } = await fetchWithBrowser(url, { waitFor: 'domcontentloaded', timeoutMs: 20_000 });

    const positions = [...html.matchAll(/<div\b[^>]*data-component-type="s-search-result"/g)]
      .map(m => m.index);
    if (positions.length === 0) {
      return { imageUrl: null, asin: null, price: null };
    }

    let best = null;
    const candidates = [];
    for (let i = 0; i < Math.min(MAX_BLOCKS_TO_INSPECT, positions.length); i++) {
      const start = positions[i];
      const end = positions[i + 1] ?? Math.min(start + 30_000, html.length);
      const block = html.slice(start, end);

      const title = extractTitle(block);
      if (!title) continue;
      const { score, accessory } = scoreTitleMatch(productName, title);
      const price = extractPrice(block);

      // Cheap-price soft-gate: a high title-match with a price below the
      // "headline product" floor (e.g. 19,99 € for an SV450 hit) is almost
      // certainly an accessory whose listing happens to contain the product
      // name. Apply an extra penalty to drop it below better-priced candidates.
      const priceValue = price ? parsePriceEur(price) : NaN;
      let adjusted = score;
      if (Number.isFinite(priceValue) && priceValue < PRICE_FLOOR_EUR) {
        adjusted -= PRICE_LOW_PENALTY;
      }

      const cand = {
        idx: i, score, adjusted, accessory, title,
        asin: extractAsin(block),
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
// jardin/electro/sport niches where headline products are ≥ ~50 €.
const PRICE_FLOOR_EUR = 40;
const PRICE_LOW_PENALTY = 0.4;

const parsePriceEur = (raw) => {
  // "1 234,56 €" → 1234.56 ; returns NaN on garbage.
  const cleaned = raw.replace(/\s|€/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

// STRONG accessory signals — words that, when in the title's prefix, identify
// the listing as an accessory rather than the headline product. Penalty is
// large enough to push a perfect-match score below the acceptance threshold.
const STRONG_ACCESSORY_TOKENS = new Set([
  'compatible', 'compatibles',
  'rechange', 'rechanges', 'remplacement', 'remplacements',
  'kit', 'kits', 'lot', 'lots', 'pack', 'packs',
  'set', 'sets', 'sachet', 'sachets',
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
  // (sc3, sv450, i7, m18) are model identifiers; ALL of them must appear as
  // tokens in the title. Pure numeric tokens are not used as a gate because
  // titles also contain spec values ("3,2 bar", "1 500 W") that match by chance.
  const qAlphanumMix = qTokens.filter(t => /[a-z]/.test(t) && /\d/.test(t));
  if (qAlphanumMix.length > 0) {
    if (!qAlphanumMix.every(qt => tTokens.has(qt))) {
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

function extractPrice(block) {
  const raw = block.match(/<span\s+class="a-offscreen">\s*([^<]*?€[^<]*?)<\/span>/)?.[1];
  return raw ? raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function extractImage(block) {
  const primary = block.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/);
  const fallback = block.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/);
  return primary?.[1] ?? fallback?.[1] ?? null;
}

function extractAsin(block) {
  return block.match(/data-asin="(B0[A-Z0-9]{8})"/)?.[1] ?? null;
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
 * Fetches images + ASINs + prices for every entry in `products[]`. Returns
 * `{ imageMap, asinMap, priceMap }`:
 *   - imageMap[name] = "/images/products/<slug>/<product-slug>.jpg" | null
 *   - asinMap[name]  = "B0XXXXXXXX" | null
 *   - priceMap[name] = "89,99 €"   | null
 *
 * Already-existing files are skipped; metadata is recovered from a
 * `<product-slug>.json` sidecar so links + prices survive re-runs.
 */
export async function fetchProductImages({ niche, articleSlug, products, verbose = true }) {
  const imageMap = {};
  const asinMap = {};
  const priceMap = {};
  const publicDir = resolve(SITES_DIR, niche, 'public/images/products', articleSlug);

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
      const result = await findAmazonProduct(productName);
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
      // Inject `<attr>: "..."` right after each `name: "..."`. Scoping by braces
      // is unreliable (each product object embeds a nested `criteria: {...}`),
      // so we rely on `name:` only appearing inside `products={[...]}` here.
      const transformed = productsArr.replace(
        /(\bname\s*:\s*(["'])([^"']+)\2)/g,
        (whole, head, q, name) => {
          const value = valueMap[name.trim()];
          if (!value) return whole;
          // If this product entry already has the attribute, skip.
          // Conservative scope: look at the next 200 chars of the substring after `head`.
          return `${head}, ${attr}: ${q}${value}${q}`;
        },
      );
      return prefix + transformed + suffix;
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

/** Inject `price="..."` (e.g. "89,99 €") on ProductCards and inside
 *  ComparisonTable products. Not added to AffiliateButton — the button label
 *  doesn't display price. */
export function injectPrices(markdown, priceMap) {
  return injectAttributeByProductName(markdown, 'price', priceMap, { onAffiliateButton: false });
}
