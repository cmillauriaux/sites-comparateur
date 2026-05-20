/**
 * Verified product layer for prompt grounding — the durable WAF bypass.
 *
 * Retailer HTML scraping (Amazon/ManoMano/Leroy Merlin/Cdiscount) is WAF-blocked
 * on GitHub-hosted runners, so comparatif/avis generation had no product data to
 * ground on. Both sources below route through DataForSEO's own proxy pool, so
 * neither hits the retailer WAF:
 *
 *   1. Amazon Products (amazon-dfs.js)        — primary; affiliate-default
 *      marketplace, carries ASIN + rating + bestseller signals.
 *   2. Google Shopping (google-shopping.js)   — fallback; cross-merchant, covers
 *      niche/pro brands routinely absent from Amazon FR.
 *
 * Shared by article-generator.js (new articles) and content-updater.js (weekly
 * refresh) so both stay protected. Never throws — returns an empty list on total
 * failure, and the callers degrade to source-only grounding.
 */
import { searchAmazonProducts } from './amazon-dfs.js';
import { searchGoogleShoppingProducts } from './google-shopping.js';

/**
 * @param {string} keyword
 * @param {{ market?: 'fr'|'us'|'gb', limit?: number }} [opts]
 * @returns {Promise<{ products: Array, source: 'amazon'|'google-shopping'|null }>}
 */
export async function fetchVerifiedProducts(keyword, { market = 'fr', limit = 8 } = {}) {
  // Primary: Amazon.
  try {
    const amz = await searchAmazonProducts(keyword, { market });
    const products = (amz ?? []).filter(i => i.title && i.title.length > 3).slice(0, limit);
    if (products.length > 0) return { products, source: 'amazon' };
  } catch (err) {
    console.warn(`  ⚠️  Amazon DataForSEO indisponible (${err.message})`);
  }

  // Fallback: Google Shopping (non-Amazon merchants / niche brands).
  try {
    const gs = await searchGoogleShoppingProducts(keyword, { market, limit });
    const products = (gs ?? []).filter(i => i.title && i.title.length > 3).slice(0, limit);
    if (products.length > 0) return { products, source: 'google-shopping' };
  } catch (err) {
    console.warn(`  ⚠️  Google Shopping indisponible (${err.message})`);
  }

  return { products: [], source: null };
}
