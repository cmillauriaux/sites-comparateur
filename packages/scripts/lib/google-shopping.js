/**
 * DataForSEO Google Shopping client — fallback for products that don't resolve
 * on Amazon (the affiliate-default marketplace). Used after the Amazon search
 * cascade in product-images.js exhausts its retries.
 *
 * Why a fallback exists: niche brands (Lavor, Kranzle, regional manufacturers)
 * are routinely absent from Amazon FR. Without a fallback, comparatif articles
 * ship with empty product cards (image coverage <80% → article rejected) AND
 * the site reads as Amazon-affiliate-spam to Google. Mixing in non-affiliate
 * merchant links restores both content quality and E-E-A-T signal.
 *
 * Endpoint: /merchant/google/products/task_post + /task_get/advanced/<id>
 * (asynchronous; Google Shopping has no live endpoint per the v3 docs). We
 * post a task then poll task_get with linear backoff until ready, typically
 * 5-15s. Cost ≈ $0.0025/req.
 *
 * Cache: 14-day TTL on disk (data/google-shopping-cache/), keyed by query +
 * market. Same TTL as the Semrush cache — product availability shifts but
 * not faster than that for the queries we run.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR, requireEnv } from './env.js';
import { MARKET_DATAFORSEO } from '@comparateur/config/niches';

const BASE_URL = 'https://api.dataforseo.com/v3';
const CACHE_DIR = resolve(DATA_DIR, 'google-shopping-cache');
const CACHE_TTL_DAYS = 14;
const POLL_INTERVAL_MS = 2000;        // 2s linear backoff
const POLL_MAX_ATTEMPTS = 30;         // 60s total — most tasks complete in 5-10s,
                                      // but cold-start spikes to 30-45s observed on FR/EU markets

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function authHeader() {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
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

function tokenize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t && t.length >= 2);
}

function scoreMatch(query, title) {
  const q = new Set(tokenize(query));
  const t = new Set(tokenize(title));
  if (q.size === 0) return 0;
  let matched = 0;
  for (const tok of q) if (t.has(tok)) matched++;
  return matched / q.size;
}

const MIN_TITLE_MATCH = 0.5;       // looser than Amazon (more noise in shopping listings)

// Match against the `seller` string returned by DataForSEO (e.g. "Amazon.fr",
// "Cdiscount", "ManoMano.fr") — not URL hostnames. The Google Shopping
// response sets `domain: null` and only exposes a google.fr redirect URL,
// so seller-name matching is the only signal we have.
const PREFERRED_SELLERS = [
  'manomano', 'leroy merlin', 'castorama', 'bricomarche', 'mr bricolage',
  'mr-bricolage', 'cdiscount', 'darty', 'fnac', 'boulanger', 'brico depot',
  'bricodepot',
];
const BLOCKED_SELLERS = [
  // We already exhausted the Amazon affiliate route — don't loop the user
  // back. Skip comparison engines + classifieds — the experience is poor.
  'amazon', 'shopping.google', 'idealo', 'leguide', 'lesnumeriques',
  'kelkoo', 'pricerunner', 'google.com', 'leboncoin',
];

function sellerMatches(seller, list) {
  if (!seller) return false;
  const s = seller.toLowerCase();
  return list.some(needle => s.includes(needle));
}

function extractItemFields(item) {
  // Map DataForSEO Google Shopping items → uniform shape.
  //  - `seller` is the merchant display name ("Amazon.fr", "Cdiscount", ...)
  //  - `shopping_url` is a google.fr redirect to the product detail page;
  //    that's what we link to (Google then routes to the actual merchant).
  //    Direct merchant URLs aren't exposed by this endpoint.
  //  - `price` is a NUMBER, not an object; `currency` is a sibling string.
  //  - `product_images` is an array; first is featured.
  const title = item.title ?? '';
  const url = item.shopping_url || item.url || item.shop_ad_aclk || '';
  const imageUrl = Array.isArray(item.product_images) && item.product_images.length > 0
    ? item.product_images[0]
    : null;
  const priceCurrent = typeof item.price === 'number' ? item.price : null;
  const currency = item.currency || '';
  const price = priceCurrent != null
    ? (currency ? `${priceCurrent} ${currency}` : String(priceCurrent))
    : null;
  const merchant = item.seller || item.domain || '';
  return { title, url, imageUrl, price, merchant };
}

function pickBest(items, query) {
  if (!items?.length) return null;
  const candidates = items
    .filter(it => {
      // Item types we want: paid + organic shopping listings. Skip carousels
      // of related products / "sponsored carousel" headers without prices.
      const t = it.type || '';
      return t === 'google_shopping_serp' || t === 'google_shopping_paid';
    })
    .map(it => {
      const f = extractItemFields(it);
      const titleScore = scoreMatch(query, f.title);
      let merchantBonus = 0;
      if (sellerMatches(f.merchant, BLOCKED_SELLERS)) merchantBonus = -2;       // hard reject
      else if (sellerMatches(f.merchant, PREFERRED_SELLERS)) merchantBonus = 0.2;
      const completenessBonus = (f.imageUrl ? 0.05 : 0) + (f.price ? 0.05 : 0);
      return { ...f, _score: titleScore + merchantBonus + completenessBonus };
    })
    .filter(c => !sellerMatches(c.merchant, BLOCKED_SELLERS));

  candidates.sort((a, b) => b._score - a._score);
  const best = candidates[0];
  if (!best || best._score < MIN_TITLE_MATCH) return null;
  if (!best.url) return null;
  return best;
}

/**
 * Submit a Google Shopping task and poll until it returns ready, or time out.
 *
 * Linear backoff at POLL_INTERVAL_MS for POLL_MAX_ATTEMPTS attempts
 * (≈ 30s ceiling). Most tasks complete in 5-10s.
 */
async function submitAndAwaitTask({ phrase, dfsLoc }) {
  // 1. Post the task.
  const postRes = await fetch(`${BASE_URL}/merchant/google/products/task_post`, {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword: phrase,
      location_code: dfsLoc.location_code,
      language_code: dfsLoc.language_code,
      depth: 20,
    }]),
  });
  if (!postRes.ok) {
    throw new Error(`task_post HTTP ${postRes.status}: ${await postRes.text()}`);
  }
  const postData = await postRes.json();
  const task = postData.tasks?.[0];
  if (!task || (task.status_code !== 20100 && task.status_code !== 20000)) {
    throw new Error(`task_post task error: ${task?.status_code} ${task?.status_message}`);
  }
  const taskId = task.id;

  // 2. Poll task_get/advanced/<id> until ready. Codes:
  //    20000 = Ok (results available)
  //    20100 = Task Created
  //    40602 = Task In Queue
  //    40601 = Task Handed
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const getRes = await fetch(`${BASE_URL}/merchant/google/products/task_get/advanced/${taskId}`, {
      headers: { 'Authorization': authHeader() },
    });
    if (!getRes.ok) continue;     // transient — retry
    const getData = await getRes.json();
    const t = getData.tasks?.[0];
    if (!t) continue;
    if (t.status_code === 20000) {
      return t.result?.[0]?.items ?? [];
    }
    if (t.status_code !== 40602 && t.status_code !== 40601 && t.status_code !== 20100) {
      throw new Error(`task_get task error: ${t.status_code} ${t.status_message}`);
    }
  }
  throw new Error(`task_get timed out after ${POLL_MAX_ATTEMPTS} polls (${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000).toFixed(0)}s)`);
}

/**
 * Find a non-Amazon product listing on Google Shopping for `productName`.
 *
 * @param {object} opts
 * @param {string} opts.productName        Full product name (e.g. "Lavor Galaxy 160")
 * @param {'fr'|'us'|'gb'} opts.market     Drives location_code/language_code
 * @param {boolean} [opts.noCache]         Bypass disk cache
 * @returns {Promise<{ merchant: string, merchantUrl: string, imageUrl: string|null, price: string|null, title: string, matchScore: number }|null>}
 */
export async function findGoogleShoppingProduct({ productName, market, noCache = false }) {
  ensureCacheDir();
  const file = cachePath(productName, market);

  if (!noCache && isCacheFresh(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf-8'));
    return cached.match;        // null OR the resolved match object
  }

  const dfs = MARKET_DATAFORSEO[market];
  if (!dfs) throw new Error(`No DataForSEO mapping for market ${market}`);

  let items;
  try {
    items = await submitAndAwaitTask({ phrase: productName, dfsLoc: dfs });
  } catch (err) {
    // Not a fatal failure — caller treats null as "no fallback found".
    console.warn(`    ⚠️  Google Shopping API: ${err.message}`);
    writeFileSync(file, JSON.stringify({ match: null, fetchedAt: new Date().toISOString() }, null, 2));
    return null;
  }

  const best = pickBest(items, productName);
  const match = best ? {
    merchant: best.merchant,
    merchantUrl: best.url,
    imageUrl: best.imageUrl,
    price: best.price,
    title: best.title,
    matchScore: Number(best._score.toFixed(2)),
  } : null;

  writeFileSync(file, JSON.stringify({ match, fetchedAt: new Date().toISOString() }, null, 2));
  return match;
}
