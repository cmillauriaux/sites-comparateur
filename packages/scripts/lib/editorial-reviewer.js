/**
 * Systematic programmatic editorial review of generated .mdx articles.
 *
 * Catches quality regressions that slip past the structural validator
 * (article-validator.js). Runs inline in article-generator.js post-validation
 * and is also called standalone from review-articles.js for batch CI reviews.
 *
 * Checks:
 *  1. Prix tronqués — residual broken sentences after price scrubbing
 *  2. Search-URL sources — source entries pointing to search result pages
 *  3. Score math — avis finalScore ≈ weighted sum of subscores (±0.15)
 *  4. French gender — "un <feminine-noun>" in frontmatter fields
 *  5. Structural completeness — comparatif must have ComparisonTable;
 *     avis must have subscores + finalScore in frontmatter
 *  6. Thin content — body word count below the minimum per intent
 *
 * Return value: { status: 'ok'|'warn'|'ko', issues: Issue[] }
 *   Issue = { level: 'ko'|'warn', code: string, message: string }
 *
 * 'ko' = article should be rejected (caller deletes + marks slot failed).
 * 'warn' = ships with a console warning.
 * 'ok' = no issues.
 */

import { readFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';

// ─── Thresholds ─────────────────────────────────────────────────────────────

const MIN_WORD_COUNT = {
  comparatif: 900,
  avis:       800,
  guide:      600,
  informational: 400,
};

const SCORE_MATH_TOLERANCE = 0.20;

// Search-result URL patterns (not actual article pages).
const SEARCH_URL_PATTERNS = [
  /[?&]q=/i,
  /[?&]search=/i,
  /[?&]query=/i,
  /\/recherche\//i,
  /\/search\?/i,
  /\/results\?/i,
  /\/catalogsearch\//i,
  /google\.[a-z]+\/search/i,
  /bing\.com\/search/i,
  /amazon\.[a-z.]+\/s\?/i,
];

// Feminine nouns that are commonly mis-gendered as "un" in Semrush keywords.
const FRENCH_FEMININE_NOUNS = [
  'scie', 'tondeuse', 'tronçonneuse', 'perceuse', 'débroussailleuse',
  'souffleuse', 'ponceuse', 'fraiseuse', 'rabot', 'cisaille', 'cisailles',
  'soufflante', 'meuleuse', 'visseuse', 'agrafeuse', 'riveteuse',
];

// Patterns that indicate a truncated sentence left behind by the price scrubber.
// Matches: digit(s) followed immediately by a hyphen then end-of-word boundary
// (before space, comma, period, newline) — "350-" without a following number.
const TRUNCATED_PRICE_RE = /\d+[-–](?=\s*[,.\n\r]|\s+[a-zàâéèêëîïôùûü])/gi;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: null, body: content };
  try {
    return { fm: YAML.parse(m[1]) ?? {}, body: m[2] };
  } catch {
    return { fm: {}, body: m[2] };
  }
}

function stripComponents(body) {
  return body.replace(/<[A-Z][\s\S]*?\/?>/g, '');
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Individual checks ───────────────────────────────────────────────────────

function checkTruncatedPrices(body) {
  const prose = stripComponents(body);
  const matches = prose.match(TRUNCATED_PRICE_RE);
  if (!matches || matches.length === 0) return [];
  return [{
    level: 'ko',
    code: 'prix-tronques',
    message: `${matches.length} phrase(s) tronquée(s) après nettoyage des prix : "${matches.slice(0, 2).join('", "')}…"`,
  }];
}

function checkSearchUrlSources(fm) {
  if (!Array.isArray(fm?.sources)) return [];
  const searchUrls = fm.sources
    .map(s => s?.url ?? '')
    .filter(u => SEARCH_URL_PATTERNS.some(re => re.test(u)));
  if (searchUrls.length === 0) return [];
  return [{
    level: 'warn',
    code: 'search-url-sources',
    message: `${searchUrls.length} source(s) pointent vers des pages de résultats de recherche (non des articles) : ${searchUrls.slice(0, 2).join(', ')}`,
  }];
}

function checkScoreMath(fm) {
  const issues = [];
  const { subscores, weights, finalScore } = fm ?? {};
  if (!subscores || !weights || finalScore == null) return issues;

  const scoreKeys = Object.keys(subscores);
  if (scoreKeys.length === 0) return issues;

  const weightSum = scoreKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (Math.abs(weightSum - 1) > 0.05) {
    issues.push({
      level: 'ko',
      code: 'weights-dont-sum-to-1',
      message: `Les poids déclarés somment à ${weightSum.toFixed(2)} (attendu : 1.00)`,
    });
  }

  const computed = scoreKeys.reduce((s, k) => s + (subscores[k] ?? 0) * (weights[k] ?? 0), 0);
  const diff = Math.abs(computed - finalScore);
  if (diff > SCORE_MATH_TOLERANCE) {
    issues.push({
      level: 'ko',
      code: 'score-math-mismatch',
      message: `finalScore=${finalScore} mais la moyenne pondérée des subscores donne ${computed.toFixed(2)} (écart=${diff.toFixed(2)} > tolérance=${SCORE_MATH_TOLERANCE})`,
    });
  }
  return issues;
}

function checkFrenchGender(fm) {
  if (!fm) return [];
  const fields = [fm.title, fm.description, fm.keyword].filter(Boolean);
  const issues = [];
  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const lower = field.toLowerCase();
    for (const noun of FRENCH_FEMININE_NOUNS) {
      // Match "un <noun>" but not "une <noun>" or "l'un des <noun>"
      if (new RegExp(`\\bun ${noun}\\b`).test(lower)) {
        issues.push({
          level: 'warn',
          code: 'french-gender',
          message: `Accord de genre incorrect : "un ${noun}" devrait être "une ${noun}" dans : "${field.slice(0, 80)}"`,
        });
        break; // one issue per field is enough
      }
    }
  }
  return issues;
}

function checkStructuralCompleteness(fm, body, intent) {
  const issues = [];
  if (intent === 'comparatif') {
    if (!/<ComparisonTable\b/.test(body)) {
      issues.push({
        level: 'ko',
        code: 'missing-comparison-table',
        message: 'Comparatif sans <ComparisonTable> — composant obligatoire manquant',
      });
    }
    if (!Array.isArray(fm?.products) || fm.products.length === 0) {
      issues.push({
        level: 'ko',
        code: 'missing-products-frontmatter',
        message: 'Comparatif sans tableau `products:` dans le frontmatter',
      });
    }
  }
  if (intent === 'avis') {
    if (!fm?.subscores || Object.keys(fm.subscores).length === 0) {
      issues.push({
        level: 'ko',
        code: 'missing-subscores',
        message: 'Avis sans `subscores:` dans le frontmatter — scores intermédiaires obligatoires',
      });
    }
    if (fm?.finalScore == null) {
      issues.push({
        level: 'ko',
        code: 'missing-final-score',
        message: 'Avis sans `finalScore:` dans le frontmatter',
      });
    }
  }
  return issues;
}

function checkWordCount(body, intent) {
  const prose = stripComponents(body);
  const words = countWords(prose);
  const min = MIN_WORD_COUNT[intent] ?? MIN_WORD_COUNT.comparatif;
  if (words < min) {
    return [{
      level: 'warn',
      code: 'thin-content',
      message: `Corps trop court : ${words} mots (minimum attendu : ${min} pour intent=${intent})`,
    }];
  }
  return [];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Review a single article.
 *
 * @param {string} filePath  Absolute path to the .mdx file.
 * @returns {{ status: 'ok'|'warn'|'ko', issues: Array<{level, code, message}> }}
 */
export function reviewArticle(filePath) {
  if (!existsSync(filePath)) {
    return { status: 'ko', issues: [{ level: 'ko', code: 'file-missing', message: `Fichier introuvable : ${filePath}` }] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const { fm, body } = parseFrontmatter(content);
  const intent = fm?.intent ?? 'comparatif';

  const issues = [
    ...checkTruncatedPrices(body),
    ...checkSearchUrlSources(fm),
    ...checkScoreMath(fm),
    ...checkFrenchGender(fm),
    ...checkStructuralCompleteness(fm, body, intent),
    ...checkWordCount(body, intent),
  ];

  const status = issues.some(i => i.level === 'ko') ? 'ko'
    : issues.some(i => i.level === 'warn') ? 'warn'
    : 'ok';

  return { status, issues };
}

/**
 * Review all articles for a (niche, market) and return a flat report.
 *
 * @param {string[]} filePaths  Absolute paths to .mdx files to review.
 * @returns {Array<{filePath, slug, status, issues}>}
 */
export function reviewArticles(filePaths) {
  return filePaths.map(fp => {
    const slug = fp.replace(/.*\/([^/]+)\.mdx?$/, '$1');
    const { status, issues } = reviewArticle(fp);
    return { filePath: fp, slug, status, issues };
  });
}
