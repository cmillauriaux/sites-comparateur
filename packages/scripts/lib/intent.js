const COMPARATIF_PATTERNS = ['meilleur', 'comparatif', 'top ', 'classement', 'versus', ' vs ', 'comparaison'];
const TEST_PATTERNS = ['avis', 'test ', 'review', 'opinion'];
const GUIDE_PATTERNS = ['comment', 'guide', 'choisir', 'quelle ', 'quel ', 'pourquoi'];

// CPC threshold above which a head term is treated as commercial intent.
// Calibrated for the FR market — average CPCs are ~30% lower than EN, so
// 0.20 € is the equivalent of ~0.30 USD on US data. Below this, the term is
// usually informational (definitions, how-to) rather than purchase-ready.
const COMMERCIAL_CPC_FLOOR = 0.20;

/**
 * Classify a keyword's intent. Returns one of:
 *   - 'avis'       (single-product review — "test X", "avis X")
 *   - 'comparatif' (multi-product — "meilleur X", "top X", or head term with commercial CPC)
 *   - 'guide'      (informational with buying angle — "comment choisir X")
 *   - 'informational' (pure top-of-funnel — "qu'est-ce que X")
 *
 * The CPC signal upgrades head terms ("tondeuse", "perceuse") from informational
 * to comparatif because that's where the affiliate money is, AND because it
 * matches what Les Numériques actually does: their /guide-d-achat/tondeuse-X.html
 * pages rank on the head term and present multiple products.
 */
export function detectIntent(keyword, { cpc } = {}) {
  const kw = keyword.toLowerCase();
  if (TEST_PATTERNS.some(p => kw.includes(p))) return 'avis';
  if (COMPARATIF_PATTERNS.some(p => kw.includes(p))) return 'comparatif';
  if (GUIDE_PATTERNS.some(p => kw.includes(p))) return 'guide';
  // Head term with commercial CPC → buyer intent → comparatif
  if (cpc != null && cpc >= COMMERCIAL_CPC_FLOOR) return 'comparatif';
  return 'informational';
}

const TOPIC_STRIP_TOKENS = [
  'meilleur', 'meilleure', 'meilleurs', 'meilleures',
  'top', 'classement', 'comparatif', 'comparaison', 'versus', 'vs',
  'best', 'top',
  'avis', 'test', 'review', 'reviews',
  'comment', 'guide', 'choisir', 'quelle', 'quel', 'pourquoi',
  'how', 'which', 'what', 'why', 'buying',
  'pas', 'cher', 'cheap',
  'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'a', 'an', 'the',
  'en', 'for', 'pour',
];

/**
 * Extract the product topic from a keyword. Used by the cluster→pillar hook
 * to build a "comment choisir un <topic>" keyword.
 *
 *   "meilleur robot tondeuse 2026"      → "robot tondeuse"
 *   "comparatif nettoyeur haute pression" → "nettoyeur haute pression"
 *   "best lawn mower"                   → "lawn mower"
 */
export function extractTopicFromKeyword(keyword) {
  const tokens = keyword
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Drop pure-numeric tokens up to 4 digits: 1-3 = quantifiers ("top 5",
    // "top 10"), 4 = years ("2026"). Multi-digit spec values ("5000 mAh")
    // rarely appear in cluster primary keywords, where the topic is a noun.
    .filter(t => !/^\d{1,4}$/.test(t))
    .filter(t => !TOPIC_STRIP_TOKENS.includes(t));
  return tokens.join(' ').trim();
}
