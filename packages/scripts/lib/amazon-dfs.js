/**
 * Amazon Products search via DataForSEO live endpoint.
 *
 * Replaces the Playwright-based `s?k=` scrape that was 100% bot-blocked on
 * GitHub-hosted runners (Amazon FR served a 195-char "Robot check" stub for
 * every query). DataForSEO routes through its own proxy pool and returns
 * structured listings: title, ASIN, price, image, rating, bestseller flag.
 *
 * Cost: $0.0033 per query (live endpoint). At 5 products/article × 30
 * articles/month per site ≈ $0.50/month — acceptable for the conversion
 * gain over having no Amazon affiliate URLs at all.
 *
 * Endpoint:        /v3/merchant/amazon/products/live/advanced
 * Polling:         none (live, synchronous, ~10-15s)
 * Cache TTL:       14 days, same as google-shopping-cache
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR, requireEnv } from './env.js';

const BASE_URL = 'https://api.dataforseo.com/v3';
const CACHE_DIR = resolve(DATA_DIR, 'amazon-dfs-cache');
const CACHE_TTL_DAYS = 14;
const REQUEST_TIMEOUT_MS = 60_000;  // live endpoint typically returns in 10-15s

// DataForSEO Amazon endpoint requires locale-specific language codes
// ('fr_FR' not 'fr'). The Google Shopping endpoint uses the shorter form,
// so we can't share MARKET_DATAFORSEO directly.
const AMAZON_LOC = {
  fr: { location_code: 2250, language_code: 'fr_FR' },
  us: { location_code: 2840, language_code: 'en_US' },
  gb: { location_code: 2826, language_code: 'en_GB' },
};

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(query, market) {
  const sig = JSON.stringify({ query, market });
  const key = createHash('sha1').update(sig).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${market}-${key}.json`);
}

function isCacheFresh(path) {
  if (!existsSync(path)) return false;
  const ageMs = Date.now() - statSync(path).mtimeMs;
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function authHeader() {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

/** Normalise a raw API item to the shape product-images.js consumes.
 *
 *  `price` is returned as a localized string ("148,99 €" / "$148.99" /
 *  "£148.99") to match what extractPrice produced before — keeps
 *  parsePrice() and the FR/US/GB display layer working unchanged.
 */
function normalizeItem(item, market) {
  const price = typeof item.price_from === 'number'
    ? item.price_from
    : (typeof item.price_to === 'number' ? item.price_to : null);
  const currency = item.currency || (market === 'fr' ? 'EUR' : market === 'gb' ? 'GBP' : 'USD');
  const priceStr = price != null ? formatPrice(price, currency, market) : null;

  return {
    asin: item.data_asin || null,
    title: item.title || '',
    url:   item.url   || null,
    imageUrl: item.image_url || null,
    price: priceStr,           // localized display string
    priceValue: price,         // raw number for downstream gating
    currency,
    rating:        item.rating?.value ?? null,
    votesCount:    item.rating?.votes_count ?? null,
    boughtPastMonth: item.bought_past_month ?? null,
    isSponsored:   item.type === 'amazon_paid',
    isBestSeller:  Boolean(item.is_best_seller),
    isAmazonChoice: Boolean(item.is_amazon_choice),
    rank: item.rank_absolute ?? null,
  };
}

/** "148.99 EUR" → "148,99 €" for FR display.
 *  Other markets: "$148.99" / "£148.99". */
function formatPrice(value, currency, market) {
  if (market === 'fr') {
    return `${value.toFixed(2).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
  }
  if (market === 'gb') return `£${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

/** Submit a live Amazon Products search and return the parsed item list.
 *  Throws on API error. Returns [] on empty SERP. */
async function fetchAmazonItems({ keyword, market }) {
  const loc = AMAZON_LOC[market];
  if (!loc) throw new Error(`amazon-dfs: unknown market "${market}"`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/merchant/amazon/products/live/advanced`, {
      method: 'POST',
      headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword,
        location_code: loc.location_code,
        language_code: loc.language_code,
        depth: 20,
      }]),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`amazon-dfs HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const task = data.tasks?.[0];
    if (!task) throw new Error('amazon-dfs: no task in response');
    if (task.status_code !== 20000) {
      throw new Error(`amazon-dfs task error: ${task.status_code} ${task.status_message}`);
    }
    const items = task.result?.[0]?.items;
    if (!Array.isArray(items)) return [];
    return items
      .filter(i => i.type === 'amazon_serp' || i.type === 'amazon_paid')
      .map(i => normalizeItem(i, market));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public API: returns up to N normalised Amazon search results for `keyword`
 * on the given market. Disk-cached (14d TTL) keyed on (keyword, market).
 *
 * Empty array means: search returned no items. Errors are surfaced to the
 * caller — product-images.js retries with truncated queries before falling
 * back to Google Shopping.
 */
export async function searchAmazonProducts(keyword, { market = 'fr', noCache = false } = {}) {
  ensureCacheDir();
  const file = cachePath(keyword, market);

  if (!noCache && isCacheFresh(file)) {
    try {
      const cached = JSON.parse(readFileSync(file, 'utf-8'));
      if (Array.isArray(cached?.items)) return cached.items;
    } catch { /* fall through to live fetch */ }
  }

  const items = await fetchAmazonItems({ keyword, market });
  try {
    writeFileSync(file, JSON.stringify({ keyword, market, fetchedAt: new Date().toISOString(), items }, null, 2));
  } catch { /* cache write failure is non-fatal */ }
  return items;
}
