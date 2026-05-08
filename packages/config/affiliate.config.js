/**
 * Affiliate program registry + per-keyword product mapping.
 *
 * Add new products under `products` as you discover ASINs / Awin merchant IDs.
 * `findAffiliateLinks(keyword)` in article-generator does substring matching
 * against the keys here.
 */

const affiliate = {
  programs: {
    amazon: {
      trackingId: process.env.AMAZON_AFFILIATE_ID,
      baseUrl: 'https://www.amazon.fr/dp/',
      tagParam: 'tag',
      commission: '3-5%',
      cookieDays: 1,
    },
    'awin-leroy-merlin': {
      advertiserId: process.env.AWIN_LEROY_MERLIN_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-4%',
      cookieDays: 30,
    },
    'awin-mr-bricolage': {
      advertiserId: process.env.AWIN_MR_BRICOLAGE_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-4%',
      cookieDays: 30,
    },
    'awin-castorama': {
      advertiserId: process.env.AWIN_CASTORAMA_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-4%',
      cookieDays: 30,
    },
    'awin-boulanger': {
      advertiserId: process.env.AWIN_BOULANGER_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-3%',
      cookieDays: 30,
    },
    'awin-decathlon': {
      advertiserId: process.env.AWIN_DECATHLON_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '5%',
      cookieDays: 30,
    },
    'awin-darty': {
      advertiserId: process.env.AWIN_DARTY_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-4%',
      cookieDays: 30,
    },
    'awin-fnac': {
      advertiserId: process.env.AWIN_FNAC_ID,
      baseUrl: 'https://www.awin1.com/cread.php',
      commission: '2-3%',
      cookieDays: 30,
    },
  },

  // keyword fragment → product. Searched via case-insensitive substring match.
  products: {
    // Jardin & Bricolage
    'robot tondeuse husqvarna':       { asin: null, program: 'amazon', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=robot+tondeuse+husqvarna' },
    'nettoyeur haute pression karcher': { asin: null, program: 'amazon', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=nettoyeur+karcher' },
    'perceuse visseuse bosch':         { asin: null, program: 'amazon', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=perceuse+bosch' },
    'debroussailleuse stihl':          { asin: null, program: 'amazon', fallbackUrl: 'https://www.leroymerlin.fr/recherche?q=debroussailleuse+stihl' },

    // Sport & Fitness
    'velo elliptique domyos':          { asin: null, program: 'awin-decathlon', fallbackUrl: 'https://www.decathlon.fr/sport/cardio-fitness/velo-elliptique/' },
    'tapis course nordictrack':        { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=tapis+course+nordictrack' },
    'trottinette electrique xiaomi':   { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=trottinette+xiaomi' },

    // Cuisine
    'air fryer ninja':                 { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=air+fryer+ninja' },
    'robot cuisine thermomix':         { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=robot+cuisine' },
    'cafetiere delonghi':              { asin: null, program: 'awin-darty', fallbackUrl: 'https://www.darty.com/nav/recherche/search?text=cafetiere+delonghi' },

    // Maison & Électroménager
    'aspirateur dyson':                { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=aspirateur+dyson' },
    'aspirateur robot irobot':         { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=irobot+roomba' },
    'purificateur air philips':        { asin: null, program: 'amazon', fallbackUrl: 'https://www.amazon.fr/s?k=purificateur+air+philips' },
  },
};

export function buildAffiliateUrl(productData, programs = affiliate.programs) {
  const { program, asin, fallbackUrl } = productData;
  const programConfig = programs[program];
  if (!programConfig) return fallbackUrl;

  if (program === 'amazon' && asin) {
    const tag = process.env.AMAZON_AFFILIATE_ID;
    return `${programConfig.baseUrl}${asin}?tag=${tag}`;
  }

  if (program.startsWith('awin-')) {
    const publisherId = process.env.AWIN_PUBLISHER_ID;
    const advertiserId = programConfig.advertiserId;
    if (!publisherId || !advertiserId || !fallbackUrl) return fallbackUrl;
    return `${programConfig.baseUrl}?awinaffid=${publisherId}&awinmid=${advertiserId}&ued=${encodeURIComponent(fallbackUrl)}`;
  }

  return fallbackUrl;
}

export default affiliate;
