/**
 * Token-overlap clustering for keyword clusters.
 *
 * Goal: turn a flat list of keywords into a list of "article opportunities"
 * where each opportunity = primary keyword + its semantic siblings. One well-
 * grounded article that targets primary + 4-7 secondaries captures 3-5× the
 * total addressable volume of a single-keyword article.
 *
 * Algorithm: greedy single-pass clustering by Jaccard similarity over content
 * tokens (stopwords stripped). Sort keywords by volume descending; for each
 * keyword try to join an existing cluster (similarity ≥ threshold against the
 * cluster's primary), else start a new cluster with the keyword as primary.
 *
 * This is intentionally simple. SERP-overlap clustering is more accurate but
 * needs a SERP-fetch per keyword (expensive). Token Jaccard catches 80% of
 * the obvious clusters ("robot tondeuse comparatif" + "meilleur robot tondeuse"
 * + "robot tondeuse pas cher" all share {robot, tondeuse}).
 */

const STOPWORDS_BY_LANG = {
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'ou', 'à', 'a',
    'pour', 'avec', 'sur', 'par', 'en', 'au', 'aux', 'ce', 'cet', 'cette',
    'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'que', 'qui', 'quoi', 'est',
  ]),
  en: new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'with', 'on', 'in', 'at',
    'by', 'from', 'is', 'are', 'this', 'that', 'these', 'those', 'be', 'as',
    'it', 'its', 'i', 'you', 'we', 'my', 'your', 'our',
  ]),
};

export function tokenize(keyword, lang = 'fr') {
  const stopwords = STOPWORDS_BY_LANG[lang] ?? STOPWORDS_BY_LANG.fr;
  return new Set(
    keyword
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t && t.length > 1 && !stopwords.has(t)),
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function sharedTokens(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter;
}

/**
 * Cluster a list of typed keywords (from semrush.js#normalizeRow).
 *
 * @param {Array<{keyword: string, volume: number, kd: number, cpc: number, competition: number, semrushIntent: string|null, trends: number[]}>} keywords
 * Merge rule: a keyword joins a cluster iff it shares ≥ 2 content tokens with
 * the cluster's primary AND the Jaccard similarity is ≥ similarityThreshold.
 * Both conditions matter: the shared-tokens floor avoids over-merging cases
 * where two long keywords coincidentally share one head term ("meilleur" or
 * "best") without being topically related; the Jaccard floor avoids merging
 * very long keywords that share 2 tokens but otherwise diverge.
 *
 * @param {object} opts
 * @param {string} [opts.lang]                  'fr' | 'en' (default 'fr')
 * @param {number} [opts.similarityThreshold]   Jaccard floor to merge (default 0.4)
 * @param {number} [opts.minSharedTokens]       Min content tokens shared (default 2)
 * @param {number} [opts.maxClusterSize]        Max secondaries per cluster (default 7)
 * @returns {Array<{primary: object, secondaries: object[], tokens: Set<string>}>}
 */
export function clusterKeywords(keywords, { lang = 'fr', similarityThreshold = 0.4, minSharedTokens = 2, maxClusterSize = 7 } = {}) {
  // Sort by volume desc so the highest-volume keyword always seeds its cluster
  // and becomes its primary. Ties broken by lower KD (easier wins are better
  // primaries even at equal volume).
  const sorted = [...keywords].sort((a, b) => b.volume - a.volume || a.kd - b.kd);

  const clusters = [];
  for (const kw of sorted) {
    const tokens = tokenize(kw.keyword, lang);
    if (tokens.size === 0) continue;

    let best = null;
    let bestSim = 0;
    for (const cluster of clusters) {
      if (cluster.secondaries.length >= maxClusterSize) continue;
      const shared = sharedTokens(tokens, cluster.tokens);
      // For 1-token keywords (or 1-token clusters), require an exact token
      // hit; the minSharedTokens floor would otherwise reject them all.
      const minShared = Math.min(minSharedTokens, tokens.size, cluster.tokens.size);
      if (shared < minShared) continue;
      const sim = jaccard(tokens, cluster.tokens);
      if (sim >= similarityThreshold && sim > bestSim) {
        best = cluster;
        bestSim = sim;
      }
    }

    if (best) {
      best.secondaries.push({ ...kw, similarity: Number(bestSim.toFixed(2)) });
      // Don't update best.tokens — keep it anchored on the primary so a chain
      // of weak similarities can't drift the cluster's centroid topic.
    } else {
      clusters.push({
        primary: kw,
        secondaries: [],
        tokens,
      });
    }
  }

  return clusters;
}

/**
 * Aggregate cluster-level metrics. Used both for sorting clusters by
 * priority and for the JSON registry written to data/semrush-priorities.json.
 */
export function summarizeCluster(cluster) {
  const { primary, secondaries } = cluster;
  const all = [primary, ...secondaries];
  const totalVolume = all.reduce((s, k) => s + k.volume, 0);
  const avgKD = all.reduce((s, k) => s + (k.kd || 0), 0) / all.length;
  const avgCPC = all.reduce((s, k) => s + (k.cpc || 0), 0) / all.length;
  return {
    primaryKeyword: primary.keyword,
    primaryVolume: primary.volume,
    primaryKD: primary.kd,
    primaryCPC: primary.cpc,
    secondaryKeywords: secondaries.map(s => s.keyword),
    secondaryDetails: secondaries.map(s => ({
      keyword: s.keyword, volume: s.volume, kd: s.kd, similarity: s.similarity,
    })),
    totalVolume,
    avgKD: Number(avgKD.toFixed(1)),
    avgCPC: Number(avgCPC.toFixed(2)),
    semrushIntent: primary.semrushIntent,
  };
}
