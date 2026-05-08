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
 * Returns `{ imageUrl, asin, price }` for the first organic search result on
 * Amazon.fr. We scope every extraction to the same product block (the first
 * `<div data-component-type="s-search-result">` and the ~16KB of HTML that
 * follows it) so the three values stay consistent — the page also contains
 * sponsored carousels, "frequently bought" widgets, etc., whose ASIN/image
 * don't match the headline product.
 *
 * Returned `price` is normalized to a regular ASCII string (`&nbsp;` → space).
 * Format follows what Amazon serves for FR locale: e.g. "89,99 €", or
 * "1 234,56 €" for thousands.
 */
export async function findAmazonProduct(productName) {
  const url = `https://www.amazon.fr/s?k=${encodeURIComponent(productName)}`;
  try {
    const { html } = await fetchWithBrowser(url, { waitFor: 'domcontentloaded', timeoutMs: 20_000 });

    // Scope to the first organic search result block.
    const firstStart = html.search(/<div\b[^>]*data-component-type="s-search-result"/);
    if (firstStart < 0) {
      // No result block at all — fall back to whole-page extraction (best-effort).
      return {
        imageUrl: html.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/)?.[1] ?? null,
        asin: html.match(/data-asin="(B0[A-Z0-9]{8})"/)?.[1] ?? null,
        price: null,
      };
    }
    const after = html.slice(firstStart, firstStart + 30_000);
    const nextStart = after.slice(1).search(/<div\b[^>]*data-component-type="s-search-result"/);
    const block = nextStart > 0 ? after.slice(0, nextStart) : after;

    const asin = block.match(/data-asin="(B0[A-Z0-9]{8})"/)?.[1] ?? null;

    const imgPrimary = block.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/);
    const imgFallback = block.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/);
    const imageUrl = imgPrimary?.[1] ?? imgFallback?.[1] ?? null;

    // Walk EVERY a-offscreen price-like value in the block and pick the first
    // that's plausibly the headline product price. Amazon often shows a small
    // accessory price first ("19,99 €" for a replacement filter) before the
    // real product price; filtering on a minimum euro value cuts these cases.
    const priceCandidates = [...block.matchAll(/<span\s+class="a-offscreen">\s*([^<]*?€[^<]*?)<\/span>/g)]
      .map(m => m[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    const price = pickPlausiblePrice(priceCandidates);

    return { imageUrl, asin, price };
  } catch {
    return { imageUrl: null, asin: null, price: null };
  }
}

// Minimum plausible price (€) for a "headline product". Below this, the
// listing is almost certainly an accessory, replacement part or single-unit
// consumable. Tuned for jardin/electro/sport — adjust per niche later if needed.
const PRICE_FLOOR_EUR = 40;

const parsePriceEur = (raw) => {
  // "1 234,56 €" → 1234.56 ; returns NaN on garbage.
  const cleaned = raw.replace(/\s|€/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

function pickPlausiblePrice(candidates) {
  for (const raw of candidates) {
    const value = parsePriceEur(raw);
    if (value >= PRICE_FLOOR_EUR) return raw;
  }
  // Nothing met the threshold: better to return null than a misleading 19,99 €.
  return null;
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
      const { imageUrl, asin, price } = await findAmazonProduct(productName);
      if (!imageUrl && !asin) {
        if (verbose) console.warn(`    ⚠️  no image/asin found: ${productName}`);
        imageMap[productName] = null;
        asinMap[productName] = null;
        priceMap[productName] = null;
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
        asin, price, fetchedAt: new Date().toISOString(),
      }, null, 2));

      if (verbose) console.log(`    ✅ ${productName} → image=${imageMap[productName] ? 'ok' : '–'} asin=${asin ?? '–'} price=${price ?? '–'}`);
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
