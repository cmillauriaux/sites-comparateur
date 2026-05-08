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
 * Returns `{ imageUrl, asin }` for the first search result on Amazon.fr.
 * `s-image` is Amazon's product thumbnail class; `data-asin` lives on the
 * `<div data-component-type="s-search-result">` wrapper. Both are stable.
 */
export async function findAmazonProduct(productName) {
  const url = `https://www.amazon.fr/s?k=${encodeURIComponent(productName)}`;
  try {
    const { html } = await fetchWithBrowser(url, { waitFor: 'domcontentloaded', timeoutMs: 20_000 });

    // First organic search result block — attribute order varies, scan tags one by one.
    let asin = null;
    for (const m of html.matchAll(/<div\b[^>]*data-component-type="s-search-result"[^>]*>/g)) {
      const a = m[0].match(/data-asin="(B0[A-Z0-9]{8})"/);
      if (a) { asin = a[1]; break; }
    }
    // Fallback: any ASIN-shaped data-asin on the page.
    if (!asin) asin = html.match(/data-asin="(B0[A-Z0-9]{8})"/)?.[1] ?? null;

    const imgPrimary = html.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/);
    const imgFallback = html.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/);
    const imageUrl = imgPrimary?.[1] ?? imgFallback?.[1] ?? null;

    return { imageUrl, asin };
  } catch {
    return { imageUrl: null, asin: null };
  }
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
 * Fetches images + ASINs for every entry in `products[]`. Returns
 * `{ imageMap, asinMap }`:
 *   - imageMap[name] = "/images/products/<slug>/<product-slug>.jpg" | null
 *   - asinMap[name]  = "B0XXXXXXXX" | null
 *
 * Already-existing files are skipped (same file path = same article slug + product);
 * the cached ASIN is recovered from a sidecar `.asin` file so links survive re-runs.
 */
export async function fetchProductImages({ niche, articleSlug, products, verbose = true }) {
  const imageMap = {};
  const asinMap = {};
  const publicDir = resolve(SITES_DIR, niche, 'public/images/products', articleSlug);

  for (const productName of products) {
    const productSlug = slug.slug(productName);
    const localPath = join(publicDir, `${productSlug}.jpg`);
    const asinSidecar = join(publicDir, `${productSlug}.asin`);
    const publicPath = `/images/products/${articleSlug}/${productSlug}.jpg`;

    if (existsSync(localPath)) {
      if (verbose) console.log(`    📷 cached: ${productName}`);
      imageMap[productName] = publicPath;
      asinMap[productName] = existsSync(asinSidecar)
        ? readFileSync(asinSidecar, 'utf-8').trim() || null
        : null;
      continue;
    }

    try {
      const { imageUrl, asin } = await findAmazonProduct(productName);
      if (!imageUrl && !asin) {
        if (verbose) console.warn(`    ⚠️  no image/asin found: ${productName}`);
        imageMap[productName] = null;
        asinMap[productName] = null;
        continue;
      }
      if (imageUrl) {
        await downloadTo(imageUrl, localPath);
        imageMap[productName] = publicPath;
      } else {
        imageMap[productName] = null;
      }
      asinMap[productName] = asin;
      if (asin) {
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(asinSidecar, asin);
      }
      if (verbose) console.log(`    ✅ ${productName} → image=${imageMap[productName] ? 'ok' : '–'} asin=${asin ?? '–'}`);
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  ${productName}: ${err.message}`);
      imageMap[productName] = null;
      asinMap[productName] = null;
    }
  }

  return { imageMap, asinMap };
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
 * Inject `asin="B0XXXXXXXX"` (or `asin: "..."` inside ComparisonTable) so the
 * AffiliateButton component generates direct product URLs (amazon.fr/dp/<asin>)
 * instead of falling back to the search page. Without this, conversion tanks.
 *
 * Targets:
 *   - <ProductCard ... name="X" ... />              → adds attribute
 *   - <AffiliateButton ... product="X" ... />|>     → adds attribute
 *   - <ComparisonTable products={[ {name: "X", ...} ]} ... /> → adds object key
 *
 * Tag-attribute injection (ProductCard / AffiliateButton) is idempotent.
 * ComparisonTable injection is not — runs once per article, after generation.
 */
export function injectAffiliateAsins(markdown, asinMap) {
  let out = markdown;

  out = out.replace(/<ProductCard\b([\s\S]*?)\/>/g, (full, body) => {
    if (/\basin\s*=/.test(body)) return full;
    const m = body.match(/\bname\s*=\s*(["'])([^"']+)\1/);
    if (!m) return full;
    const asin = asinMap[m[2].trim()];
    if (!asin) return full;
    return `<ProductCard${body.replace(/\s+$/, '')} asin="${asin}" />`;
  });

  out = out.replace(/<AffiliateButton\b([\s\S]*?)(\/?)>/g, (full, body, slash) => {
    if (/\basin\s*=/.test(body)) return full;
    const m = body.match(/\bproduct\s*=\s*(["'])([^"']+)\1/);
    if (!m) return full;
    const asin = asinMap[m[2].trim()];
    if (!asin) return full;
    const trimmed = body.replace(/\s+$/, '');
    return slash
      ? `<AffiliateButton${trimmed} asin="${asin}" />`
      : `<AffiliateButton${trimmed} asin="${asin}">`;
  });

  out = out.replace(
    /(<ComparisonTable\b[\s\S]*?products=\{\[)([\s\S]*?)(\]\}[\s\S]*?\/?>)/g,
    (_full, prefix, productsArr, suffix) => {
      // Inject `asin: "..."` right after each `name: "..."`. Scoping by braces
      // is unreliable (each product object embeds a nested `criteria: {...}`),
      // so we rely on `name:` only appearing inside `products={[...]}` here,
      // which holds for the LLM-generated output we control.
      const transformed = productsArr.replace(
        /(\bname\s*:\s*(["'])([^"']+)\2)/g,
        (whole, head, q, name) => {
          const asin = asinMap[name.trim()];
          if (!asin) return whole;
          return `${head}, asin: ${q}${asin}${q}`;
        },
      );
      return prefix + transformed + suffix;
    },
  );

  return out;
}
