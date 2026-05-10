/**
 * Multi-market site registry.
 *
 *   NICHES        — vertical themes ("jardin-bricolage", ...). One subfolder
 *                   per niche under sites/.
 *   MARKETS       — geographic targets ("fr", "us", "gb"). Each becomes a
 *                   distinct domain + Astro build + Cloudflare Pages project.
 *   ENABLED_SITES — the (niche, market) pairs that are actually wired up
 *                   end-to-end (site.config.js exists, env vars present,
 *                   Cloudflare project created). Pipelines iterate this list
 *                   exclusively — adding a row here is the single switch that
 *                   turns a market on for a niche.
 *
 * `siteId(niche, market)` is the canonical "<niche>-<market>" identifier used
 * everywhere a single string is needed (Cloudflare project name, GitHub
 * matrix entry, log prefix). The data files (data/*.json) keep niche and
 * market separate to remain queryable along either axis.
 */

export const NICHES = ['jardin-bricolage', 'sport-fitness', 'cuisine', 'maison-elec'];
export const MARKETS = ['fr', 'us', 'gb'];

// Source of truth for what the daily pipeline runs against.
// Add an entry here only when the matching `sites/<niche>/<market>/` exists
// AND its env vars (Amazon tag, Cloudflare project, domain) are populated.
export const ENABLED_SITES = [
  { niche: 'jardin-bricolage', market: 'fr' },
  { niche: 'jardin-bricolage', market: 'us' },
  { niche: 'jardin-bricolage', market: 'gb' },
];

export function isValidNiche(niche) {
  return NICHES.includes(niche);
}

export function isValidMarket(market) {
  return MARKETS.includes(market);
}

export function isEnabled(niche, market) {
  return ENABLED_SITES.some(s => s.niche === niche && s.market === market);
}

export function siteId(niche, market) {
  return `${niche}-${market}`;
}

export function parseSiteId(id) {
  // siteId form is "<niche>-<market>". Niches contain hyphens themselves, so
  // we split on the LAST hyphen to recover the market suffix.
  const i = id.lastIndexOf('-');
  if (i === -1) return null;
  const niche = id.slice(0, i);
  const market = id.slice(i + 1);
  if (!isValidNiche(niche) || !isValidMarket(market)) return null;
  return { niche, market };
}

// DataForSEO location + language codes per market. Used by
// dataforseo-keywords.js when populating the queue.
export const MARKET_DATAFORSEO = {
  fr: { location_code: 2250, location_name: 'France',         language_code: 'fr', language_name: 'French' },
  us: { location_code: 2840, location_name: 'United States',  language_code: 'en', language_name: 'English' },
  gb: { location_code: 2826, location_name: 'United Kingdom', language_code: 'en', language_name: 'English' },
};

// Semrush database codes per market. Used by semrush-prioritize.js.
// Semrush uses `uk` (not `gb`) for the United Kingdom database.
export const MARKET_SEMRUSH = {
  fr: { database: 'fr', language: 'fr' },
  us: { database: 'us', language: 'en' },
  gb: { database: 'uk', language: 'en' },
};
