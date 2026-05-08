/**
 * Fetch product images from Amazon search results, using the same Playwright
 * browser singleton as the source scraper. Saves to /sites/<niche>/public/images/products/<article-slug>/<product-slug>.jpg.
 *
 * Why scrape Amazon: PA-API requires ~3 sales before approval. Until then,
 * the search-page hero image of the first organic result is the best proxy.
 *
 * Hotlinking is avoided because Amazon's CDN URLs are session-tied and rotate.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import slugger from 'github-slugger';
import { fetchWithBrowser } from './browser.js';
import { SITES_DIR } from './env.js';

const slug = new slugger();

/**
 * Returns the URL of the first organic-result image on Amazon.fr search.
 * `s-image` is Amazon's product thumbnail class (stable for years).
 */
export async function findAmazonImageUrl(productName) {
  const url = `https://www.amazon.fr/s?k=${encodeURIComponent(productName)}`;
  try {
    const { html } = await fetchWithBrowser(url, { waitFor: 'domcontentloaded', timeoutMs: 20_000 });
    // Amazon's first product thumbnail.
    const match = html.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/);
    if (match) return match[1];
    // Fallback: any image in a search result link
    const fallback = html.match(/<img[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+\.jpg)"/);
    return fallback?.[1] ?? null;
  } catch {
    return null;
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
 * Fetches product images for every entry in `products[]`. Returns a map
 * { productName: publicPath } — the publicPath is the URL the article will use
 * (relative to the site root, e.g. /images/products/<slug>/dreame-a2.jpg).
 *
 * Already-existing files are skipped (same file path = same article slug + product).
 */
export async function fetchProductImages({ niche, articleSlug, products, verbose = true }) {
  const map = {};
  const publicDir = resolve(SITES_DIR, niche, 'public/images/products', articleSlug);

  for (const productName of products) {
    const productSlug = slug.slug(productName);
    const localPath = join(publicDir, `${productSlug}.jpg`);
    const publicPath = `/images/products/${articleSlug}/${productSlug}.jpg`;

    if (existsSync(localPath)) {
      if (verbose) console.log(`    📷 cached: ${productName}`);
      map[productName] = publicPath;
      continue;
    }

    try {
      const imgUrl = await findAmazonImageUrl(productName);
      if (!imgUrl) {
        if (verbose) console.warn(`    ⚠️  no image found: ${productName}`);
        map[productName] = null;
        continue;
      }
      await downloadTo(imgUrl, localPath);
      if (verbose) console.log(`    ✅ ${productName} → ${publicPath}`);
      map[productName] = publicPath;
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  ${productName}: ${err.message}`);
      map[productName] = null;
    }
  }

  return map;
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
