/**
 * Multi-marketplace affiliate program registry + per-niche / per-market
 * product mapping.
 *
 * Amazon is split per market: amazon-fr → amazon.fr, amazon-us → amazon.com,
 * amazon-gb → amazon.co.uk. Each market has its own Associates tag (different
 * accounts; tags are NOT shareable across marketplaces).
 *
 * Awin remains FR-centric for now; UK retailers are also on Awin and can be
 * wired in later. US affiliate networks (CJ, Impact, Skimlinks) are NOT
 * configured yet — `findAffiliateLinks` falls back to amazon-us when no
 * non-Amazon program is mapped for a (niche, market) pair.
 */

const affiliate = {
  programs: {
    'amazon-fr': {
      tag:        process.env.AMAZON_AFFILIATE_ID_FR,
      marketplace: 'www.amazon.fr',
      locale:     'fr_FR',
      market:     'fr',
      siteStripe: 'linkCode=ll1&language=fr_FR&ref_=as_li_ss_tl',
      cookieDays: 1,
      commission: '3-5%',
    },
    'amazon-us': {
      tag:        process.env.AMAZON_AFFILIATE_ID_US,
      marketplace: 'www.amazon.com',
      locale:     'en_US',
      market:     'us',
      siteStripe: 'linkCode=ll1&language=en_US&ref_=as_li_ss_tl',
      cookieDays: 1,
      commission: '1-4%',
    },
    'amazon-gb': {
      tag:        process.env.AMAZON_AFFILIATE_ID_GB,
      marketplace: 'www.amazon.co.uk',
      locale:     'en_GB',
      market:     'gb',
      siteStripe: 'linkCode=ll1&language=en_GB&ref_=as_li_ss_tl',
      cookieDays: 1,
      commission: '1-4%',
    },
    'awin-leroy-merlin': { advertiserId: process.env.AWIN_LEROY_MERLIN_ID, baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-4%', cookieDays: 30 },
    'awin-mr-bricolage': { advertiserId: process.env.AWIN_MR_BRICOLAGE_ID, baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-4%', cookieDays: 30 },
    'awin-castorama':    { advertiserId: process.env.AWIN_CASTORAMA_ID,    baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-4%', cookieDays: 30 },
    'awin-boulanger':    { advertiserId: process.env.AWIN_BOULANGER_ID,    baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-3%', cookieDays: 30 },
    'awin-decathlon':    { advertiserId: process.env.AWIN_DECATHLON_ID,    baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '5%',   cookieDays: 30 },
    'awin-darty':        { advertiserId: process.env.AWIN_DARTY_ID,        baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-4%', cookieDays: 30 },
    'awin-fnac':         { advertiserId: process.env.AWIN_FNAC_ID,         baseUrl: 'https://www.awin1.com/cread.php', market: 'fr', commission: '2-3%', cookieDays: 30 },
  },

  // products[niche][market] → keyword-fragment → product spec.
  // Searched via case-insensitive substring match on the keyword.
  // ASINs and store fallback URLs are market-specific (e.g. Husqvarna 305 in FR
  // is not the same SKU as Husqvarna 115H in US).
  products: {
    'jardin-bricolage': {
      fr: {
        'robot tondeuse husqvarna':         { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=robot+tondeuse+husqvarna' },
        'nettoyeur haute pression karcher': { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=nettoyeur+karcher' },
        'perceuse visseuse bosch':          { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=perceuse+bosch' },
        'debroussailleuse stihl':           { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=debroussailleuse+stihl' },
      },
      us: {
        // Populate once amazon-us tag + ASINs are validated.
      },
      gb: {
        // Populate once amazon-gb tag + ASINs are validated.
      },
    },
    'sport-fitness': {
      fr: {
        'velo elliptique domyos':        { asin: null, program: 'awin-decathlon', fallbackUrl: 'https://www.decathlon.fr/sport/cardio-fitness/velo-elliptique/' },
        'tapis course nordictrack':      { asin: null, program: 'amazon-fr',      fallbackUrl: 'https://www.amazon.fr/s?k=tapis+course+nordictrack' },
        'trottinette electrique xiaomi': { asin: null, program: 'amazon-fr',      fallbackUrl: 'https://www.amazon.fr/s?k=trottinette+xiaomi' },
      },
      us: {},
      gb: {},
    },
    cuisine: {
      fr: {
        'air fryer ninja':         { asin: null, program: 'amazon-fr',  fallbackUrl: 'https://www.amazon.fr/s?k=air+fryer+ninja' },
        'robot cuisine thermomix': { asin: null, program: 'amazon-fr',  fallbackUrl: 'https://www.amazon.fr/s?k=robot+cuisine' },
        'cafetiere delonghi':      { asin: null, program: 'awin-darty', fallbackUrl: 'https://www.darty.com/nav/recherche/search?text=cafetiere+delonghi' },
      },
      us: {},
      gb: {},
    },
    'maison-elec': {
      fr: {
        'aspirateur dyson':         { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.amazon.fr/s?k=aspirateur+dyson' },
        'aspirateur robot irobot':  { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.amazon.fr/s?k=irobot+roomba' },
        'purificateur air philips': { asin: null, program: 'amazon-fr', fallbackUrl: 'https://www.amazon.fr/s?k=purificateur+air+philips' },
      },
      us: {},
      gb: {},
    },
  },
};

// Resolve the right Amazon program for a market. Single source of truth
// consumed by buildAmazonUrl when called without an explicit program.
const AMAZON_PROGRAM_BY_MARKET = {
  fr: 'amazon-fr',
  us: 'amazon-us',
  gb: 'amazon-gb',
};

const _warnedNoTag = new Set();

/**
 * Build an Amazon URL with the affiliate tag + SiteStripe params for a market.
 * Single source of truth — used both at article generation time
 * (buildAffiliateUrl below) and at render time (AffiliateButton.astro).
 *
 * @param {{ asin?: string, query?: string, market?: 'fr'|'us'|'gb', tag?: string }} opts
 *   - asin:   preferred — produces /dp/<asin>/?tag=...
 *   - query:  fallback — produces /s?k=<query>&tag=...
 *   - market: marketplace selector. Defaults to 'fr' for backward compat.
 *   - tag:    explicit Associates ID. When omitted, falls back to
 *             AMAZON_AFFILIATE_ID_<MARKET> from env. Falsy tag emits a one-shot
 *             warning and returns the URL untagged (no commission).
 */
export function buildAmazonUrl({ asin, query, market = 'fr', tag } = {}) {
  const programKey = AMAZON_PROGRAM_BY_MARKET[market];
  const program = affiliate.programs[programKey];
  if (!program) {
    throw new Error(`buildAmazonUrl: unknown market "${market}". Valid: fr, us, gb.`);
  }
  const resolvedTag = tag ?? program.tag;
  if (!resolvedTag && !_warnedNoTag.has(market)) {
    console.warn(
      `[affiliate] AMAZON_AFFILIATE_ID_${market.toUpperCase()} is empty — outgoing Amazon ${market} links will be untagged (no commission).`
    );
    _warnedNoTag.add(market);
  }
  const tagPart = resolvedTag
    ? `tag=${encodeURIComponent(resolvedTag)}&${program.siteStripe}`
    : '';
  const base = `https://${program.marketplace}`;
  if (asin) {
    return `${base}/dp/${asin}/${tagPart ? `?${tagPart}` : ''}`;
  }
  if (query) {
    const q = encodeURIComponent(query);
    return `${base}/s?k=${q}${tagPart ? `&${tagPart}` : ''}`;
  }
  return `${base}/${tagPart ? `?${tagPart}` : ''}`;
}

/**
 * Resolve a final affiliate URL given a product spec
 * `{ program, asin, fallbackUrl }`. The product spec's `program` is the
 * authoritative routing (e.g. "amazon-fr" vs "amazon-us" vs "awin-darty").
 * Awin programs require AWIN_PUBLISHER_ID + the program's advertiserId; if
 * either is missing, returns the unwrapped fallbackUrl.
 */
export function buildAffiliateUrl(productData, programs = affiliate.programs) {
  const { program, asin, fallbackUrl } = productData;
  const programConfig = programs[program];
  if (!programConfig) return fallbackUrl;

  if (program?.startsWith('amazon-')) {
    const market = programConfig.market;
    if (asin) return buildAmazonUrl({ asin, market, tag: programConfig.tag });
    if (fallbackUrl) return fallbackUrl;
    return buildAmazonUrl({ market, tag: programConfig.tag });
  }

  if (program?.startsWith('awin-')) {
    const publisherId = process.env.AWIN_PUBLISHER_ID;
    const advertiserId = programConfig.advertiserId;
    if (!publisherId || !advertiserId || !fallbackUrl) return fallbackUrl;
    return `${programConfig.baseUrl}?awinaffid=${publisherId}&awinmid=${advertiserId}&ued=${encodeURIComponent(fallbackUrl)}`;
  }

  return fallbackUrl;
}

/**
 * Substring match a keyword against the product map for a (niche, market)
 * pair. Returns null if no entry matches. Case-insensitive.
 */
export function findProduct(niche, market, keyword) {
  const map = affiliate.products?.[niche]?.[market];
  if (!map) return null;
  const lower = keyword.toLowerCase();
  for (const [key, spec] of Object.entries(map)) {
    if (lower.includes(key.toLowerCase())) return { ...spec, key };
  }
  return null;
}

export default affiliate;
