/**
 * Compute a per-keyword "GSC performance multiplier" that
 * `dataforseo-keywords.js` applies to a candidate's raw score.
 *
 * The signal: when a published URL on a topically-similar keyword performs
 * poorly in Google Search Console after ≥30 days, future candidates sharing
 * its tokens get penalised — the system stops compounding effort on a topic
 * Google has already shown disinterest in. Conversely, a cluster that
 * already ranks earns a small boost on adjacent candidates.
 *
 * Rules (all heuristic — calibrate as data accumulates):
 *
 *   age <  AGE_THRESHOLD_DAYS         → 1.0  (no signal yet)
 *   position ≤ 10 AND clicks ≥ 10     → 1.5  (boost the cluster)
 *   position ≤ 30                     → 1.0  (neutral)
 *   age ≥ 30d AND position 30..100    → 0.5  (malus)
 *   age ≥ 30d AND (position > 100 OR no impressions) → 0.3  (heavy malus)
 *
 * The candidate's final multiplier is the Jaccard-weighted mean of the
 * multipliers of all published URLs in the same (niche, market). If no
 * published URL passes the AGE_THRESHOLD_DAYS gate, the multiplier is 1.0
 * (cold start: no feedback to apply).
 */

const AGE_THRESHOLD_DAYS = 30;
const MIN_PUBLISHED_FOR_FEEDBACK = 3;
const NEUTRAL_MULTIPLIER = 1.0;

function ageInDays(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function urlPerformanceMultiplier(entry) {
  if (ageInDays(entry.publishedAt) < AGE_THRESHOLD_DAYS) return NEUTRAL_MULTIPLIER;
  const g = entry.gsc;
  if (!g) return 0.7;                                 // mature URL never seen by GSC = soft penalty
  if (g.position > 0 && g.position <= 10 && g.clicks >= 10) return 1.5;
  if (g.position > 0 && g.position <= 30) return NEUTRAL_MULTIPLIER;
  if (g.position > 100 || g.impressions === 0) return 0.3;
  return 0.5;
}

function tokenize(s) {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3),
  );
}

function jaccard(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Build a "scorer" closure for a (niche, market) by pre-computing the
 * tokens + multiplier of every published URL in that bucket. Returns a
 * function that, given a candidate keyword string, returns its multiplier.
 *
 * Pre-computing once per refill avoids quadratic work when the queue is
 * large (700 candidates × N published).
 */
export function buildGscFeedbackScorer(publishedEntries, niche, market) {
  const local = publishedEntries.filter(p => p.niche === niche && p.market === market && p.keyword);
  if (local.length < MIN_PUBLISHED_FOR_FEEDBACK) {
    return { scorer: () => NEUTRAL_MULTIPLIER, sampleSize: local.length };
  }
  const enriched = local.map(p => ({
    tokens: tokenize(p.keyword),
    multiplier: urlPerformanceMultiplier(p),
  }));
  return {
    scorer: (candidateKeyword) => {
      const cTokens = tokenize(candidateKeyword);
      let weightedSum = 0;
      let totalWeight = 0;
      for (const e of enriched) {
        const sim = jaccard(cTokens, e.tokens);
        if (sim < 0.2) continue;            // not in the same cluster — ignore
        weightedSum += sim * e.multiplier;
        totalWeight += sim;
      }
      if (totalWeight === 0) return NEUTRAL_MULTIPLIER;
      return weightedSum / totalWeight;
    },
    sampleSize: local.length,
  };
}
