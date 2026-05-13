/**
 * Extract the multi-image gallery from an Amazon product detail page.
 *
 * Used by avis (single-product review) articles where the inline-image
 * post-process should NOT inject generic Pexels stock photos — the reader
 * wants to see the actual product they're considering, from several angles.
 * For comparatif / guide articles the Pexels path stays unchanged
 * (lib/inline-images.js).
 *
 * Extraction: Amazon embeds a `colorImages` JSON inside an inline script on
 * /dp/<asin>/ pages. Each entry has `hiRes`, `large`, `thumb` URLs. We grep
 * the HTML for `"hiRes":"<url>"` matches and dedupe — robust against minor
 * markup shifts, and the hiRes resolution (1500px) crops cleanly at any
 * article width.
 *
 * WAFs: Amazon FR currently lets the existing browser singleton's stealth
 * UA through on /dp/ pages (verified via Playwright headed locally and
 * headless on CI). If that flips, the fallback is to return [] — the avis
 * then drops back to the Pexels inline-image path. No hard failure.
 *
 * Cache: disk, 30-day TTL. Gallery rarely changes; cheap to keep stale-ish.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { load as loadHTML } from 'cheerio';
import { DATA_DIR } from './env.js';
import { fetchWithBrowser } from './browser.js';

const CACHE_DIR = resolve(DATA_DIR, 'amazon-gallery-cache');
const CACHE_TTL_DAYS = 30;

const AMAZON_HOST = {
  fr: 'www.amazon.fr',
  us: 'www.amazon.com',
  gb: 'www.amazon.co.uk',
};

function cachePath(asin, market) {
  return join(CACHE_DIR, `${market}-${asin}.json`);
}

function readCache(path) {
  if (!existsSync(path)) return null;
  const ageMs = Date.now() - statSync(path).mtimeMs;
  if (ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

/**
 * Return up to `max` hi-res image URLs for the given Amazon ASIN, or [] on
 * any failure (page blocked, no gallery JSON, parse error). The caller
 * gracefully degrades to Pexels.
 */
export async function fetchProductGallery(asin, { market = 'fr', max = 6, noCache = false } = {}) {
  if (!asin || !AMAZON_HOST[market]) return [];
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const file = cachePath(asin, market);
  if (!noCache) {
    const cached = readCache(file);
    if (cached?.images) return cached.images.slice(0, max);
  }

  const url = `https://${AMAZON_HOST[market]}/dp/${asin}/`;
  let html;
  try {
    const result = await fetchWithBrowser(url, { market, waitFor: 'domcontentloaded', timeoutMs: 20_000 });
    if (!result || result.status >= 500 || !result.html) {
      writeFileSync(file, JSON.stringify({ asin, market, images: [], fetchedAt: new Date().toISOString() }, null, 2));
      return [];
    }
    html = result.html;
  } catch (err) {
    return [];
  }

  // Extract from `data-a-dynamic-image="{...}"` attributes. The JSON inside
  // is HTML-encoded (`&quot;`) and maps image URL → [width, height] for
  // multiple resolutions of the same image. We:
  //   1. Find every attribute value.
  //   2. HTML-decode + JSON-parse it.
  //   3. Pick the highest-resolution URL per attribute (largest w*h).
  //   4. Dedupe by image ID (Amazon URL path between /I/ and the next .).
  // Image ID stays stable across resolution variants, so two attributes
  // with the same ID = same product photo at different sizes — we only
  // want one of them.
  const attrRe = /data-a-dynamic-image="(\{(?:[^"]|&quot;)*?\})"/g;
  const byId = new Map();   // image-id → highest-res URL
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const decoded = m[1].replace(/&quot;/g, '"');
    let obj;
    try { obj = JSON.parse(decoded); } catch { continue; }
    // Find the largest variant in this attribute.
    let best = null;
    for (const [url, dims] of Object.entries(obj)) {
      if (!url.startsWith('https://') || !Array.isArray(dims)) continue;
      const area = (dims[0] || 0) * (dims[1] || 0);
      if (!best || area > best.area) best = { url, area };
    }
    if (!best) continue;
    // Image ID = path segment after /I/ up to the first . (e.g.
    // "81D1w+QuF2L" in ".../I/81D1w+QuF2L._AC_SX679_.jpg"). Different IDs
    // = different angles; same ID = same angle, different resolution.
    const idMatch = best.url.match(/\/I\/([^.\/]+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    // Keep the highest-area URL per ID.
    const prev = byId.get(id);
    if (!prev || best.area > prev.area) byId.set(id, best);
  }

  const images = [...byId.values()].map(b => b.url);
  writeFileSync(file, JSON.stringify({ asin, market, images, fetchedAt: new Date().toISOString() }, null, 2));
  return images.slice(0, max);
}
