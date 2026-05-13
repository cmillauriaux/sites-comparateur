/**
 * Title-match gates shared between the Amazon path (product-images.js) and
 * the Google Shopping fallback (google-shopping.js).
 *
 * The gates are intentionally identical across both backends: a listing that
 * the Amazon matcher rejects (screen protectors, scooters, spare-part lids)
 * must also be rejected when it shows up in Google Shopping results — same
 * "buy this thing" intent on the user end, same defences.
 *
 * Exported:
 *   - evaluateMatch(query, title) → { score, accessory, reason? }
 *       Raw title-match with brand-required + model-id-required + non-brand
 *       + accessory penalties applied. No price knowledge. A `reason` field
 *       indicates a HARD gate failure (score forced to 0).
 *   - PRICE_FLOOR, PRICE_LOW_PENALTY — apply at the call site:
 *       adjusted = score - (priceValue < PRICE_FLOOR[market] ? PRICE_LOW_PENALTY : 0)
 *   - MIN_TITLE_MATCH — acceptance threshold on `adjusted`.
 *
 * Why the gates exist: see the per-block comments below. The acceptance
 * decision in callers MUST use `adjusted < MIN_TITLE_MATCH`, not the raw
 * `score`, otherwise the price-floor penalty is a no-op.
 */

// Minimum match score on `adjusted` to accept a result.
export const MIN_TITLE_MATCH = 0.5;

// Per-market price floor below which a high-title-match listing is treated
// as "almost certainly an accessory". Same magnitude across markets — fine
// for our currency conversions.
export const PRICE_FLOOR = { fr: 40, us: 40, gb: 35 };
export const PRICE_LOW_PENALTY = 0.4;

// STRONG accessory signals — words near the title start that identify the
// listing as an accessory rather than the headline product. Penalty is
// large enough to push a perfect-match score below the acceptance threshold.
//
// `kit` / `set` / `pack` are intentionally EXCLUDED — legitimate bundled
// products are routinely titled "DeWalt 20V MAX Cordless Drill Kit" etc.
const STRONG_ACCESSORY_TOKENS = new Set([
  'compatible', 'compatibles',
  'rechange', 'rechanges', 'remplacement', 'remplacements', 'replacement', 'replacements',
  'lot', 'lots', 'sachet', 'sachets',
  'chiffon', 'chiffons', 'lingette', 'lingettes',
  // Cuisine spare-part nouns. CAUTION: only words that are NEVER a feature of
  // a headline product. "mousseur" / "tamping" / "carafe" / "reservoir" are
  // legitimate features of coffee machines ("avec mousseur automatique") so
  // they MUST stay out of this set. Inclusion here drops machines whose titles
  // describe their built-in mousseur.
  'couvercle', 'couvercles', 'lid', 'lids',
  'detartrant', 'détartrant', 'descaling', 'descaler',
]);
const STRONG_ACCESSORY_PENALTY = 0.6;
const PREFIX_CHARS_FOR_STRONG = 80;

// A title that LITERALLY STARTS with "pour " / "for " is almost always an
// accessory-for pattern ("Pour Machine à café Epos"). Tested separately from
// STRONG_ACCESSORY_TOKENS because we want first-word anchoring, not "appears
// somewhere in the first 80 chars" — "pour" / "for" inside a feature
// description ("idéal pour le café espresso") is fine.
const TITLE_STARTS_WITH_ACCESSORY_PREFIX = /^(pour|for)\s/i;

// WEAK signals — accessory-typical nouns. Mild penalty — legitimate products
// often list "filtres inclus" / "accessoires fournis" as features.
const WEAK_ACCESSORY_TOKENS = new Set([
  'filtre', 'filtres', 'cartouche', 'cartouches',
  'brosse', 'brosses', 'recharge', 'recharges',
  'housse', 'housses',
  'tube', 'tuyau', 'buse', 'embout', 'embouts',
  'joint', 'joints', 'patin', 'patins',
  'lingette', 'lingettes', 'tampon', 'tampons', 'chiffon', 'chiffons',
  'sac', 'sacs',
  'lame', 'lames',
  'fixation', 'support',
  'coque', 'coques', 'protection',
]);
const WEAK_ACCESSORY_PENALTY = 0.15;

// Tokenize for fuzzy product matching:
//  - lowercase + accent strip (NFD)
//  - collapse "<short letters> <digit>" → "<lettersdigit>" so "SC 3", "i 7",
//    "M 18" become single tokens that can match "SC3", "i7", "M18".
//  - alphanum split, drop tokens shorter than 2 chars
export const tokenize = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z]{1,4})\s+(\d+)/g, '$1$2')
    .split(/[^a-z0-9]+/)
    .filter(t => t && t.length >= 2);

// Strip all non-alphanumerics + accents and lowercase. Used by the brand-
// required gate so "De'Longhi" / "De Longhi" / "DeLonghi" all collapse to
// "delonghi" and match equivalently.
const stripToAlnum = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Score a candidate `title` against a `query`, applying:
 *   - Gate 0: brand-required (first word of query ≥ 3 chars must be in title)
 *   - Gate 1: model-id (letters+digits tokens like "sc3", "rjs18" must all
 *             appear in title as substring of any title token)
 *   - Gate 2: at least one non-brand query token must match the title
 *   - Penalty: strong accessory token at title start (-0.6)
 *   - Penalty: weak accessory token anywhere (-0.15)
 *
 * Returns `{ score, accessory, reason? }`. A `reason` indicates a hard-gate
 * failure (score = 0). Callers should still adjust by price-floor before
 * comparing to `MIN_TITLE_MATCH`.
 */
export function evaluateMatch(query, title) {
  const qTokens = tokenize(query);
  const tTokensArr = tokenize(title);
  const tTokens = new Set(tTokensArr);
  if (qTokens.length === 0) return { score: 0, accessory: false };

  // Gate 0 — brand-required.
  const firstWord = query.trim().split(/\s+/)[0];
  const brandKey = stripToAlnum(firstWord);
  if (brandKey.length >= 3) {
    const titleKey = stripToAlnum(title);
    if (!titleKey.includes(brandKey)) {
      return { score: 0, accessory: false, reason: 'brand-missing' };
    }
  }

  // Gate 1 — model identifier match.
  const qAlphanumMix = qTokens.filter(t => /[a-z]/.test(t) && /\d/.test(t));
  if (qAlphanumMix.length > 0) {
    const allFound = qAlphanumMix.every(qt =>
      tTokensArr.some(tt => tt.includes(qt))
    );
    if (!allFound) {
      return { score: 0, accessory: false, reason: 'model-id-mismatch' };
    }
  }

  // Gate 2 — at least one non-brand query token must match the title.
  if (qTokens.length >= 2) {
    const nonBrandQ = qTokens.filter(t => !brandKey.includes(t) && !t.includes(brandKey));
    if (nonBrandQ.length > 0) {
      const anyNonBrandMatch = nonBrandQ.some(qt => tTokensArr.some(tt => tt.includes(qt)));
      if (!anyNonBrandMatch) {
        return { score: 0, accessory: false, reason: 'brand-only' };
      }
    }
  }

  // Substring match for fuzzy alignment ("easy" matches "easyfix").
  const matched = qTokens.filter(qt => tTokensArr.some(tt => tt.includes(qt))).length;
  let score = matched / qTokens.length;

  // Accessory penalty: strong (prefix) + weak (anywhere) + first-word match.
  const titleLow = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const prefixTokens = new Set(tokenize(titleLow.slice(0, PREFIX_CHARS_FOR_STRONG)));
  const strong = [...prefixTokens].some(t => STRONG_ACCESSORY_TOKENS.has(t))
              || TITLE_STARTS_WITH_ACCESSORY_PREFIX.test(title);

  let penalty = 0;
  if (strong) {
    penalty = STRONG_ACCESSORY_PENALTY;
  } else if ([...tTokens].some(t => WEAK_ACCESSORY_TOKENS.has(t))) {
    penalty = WEAK_ACCESSORY_PENALTY;
  }
  score -= penalty;

  return { score, accessory: penalty > 0 };
}
