#!/usr/bin/env node
/**
 * Refill keywords-queue.json[niche][market] from DataForSEO Labs API.
 *
 * Two-pass pipeline:
 *  1. /keyword_ideas/live    — broad semantic expansion of all seed keywords
 *                              in one batch call (much higher yield than
 *                              /keyword_suggestions which is substring-only).
 *  2. /bulk_keyword_difficulty/live — optional best-effort KD enrichment in
 *                              chunks of 1000. Long-tail often returns
 *                              KD=0 (= unknown, NOT easy); we treat 0 as
 *                              "no signal" and fall back to the default.
 *
 * Filtering:
 *  - minVolume        — drop everything below
 *  - topicTokens      — at least one must appear in the keyword (kills
 *                       semantic drift like "rideau thermique" from a
 *                       jardin seed)
 *  - normalized dedup — sort tokens to collapse "best robot mower" and
 *                       "robot mower best" into one entry
 *
 * Usage:
 *   node packages/scripts/dataforseo-keywords.js --niche jardin-bricolage --market fr
 *   node packages/scripts/dataforseo-keywords.js --site jardin-bricolage-us
 *   node packages/scripts/dataforseo-keywords.js                  # all enabled sites
 */
import { requireEnv } from './lib/env.js';
import { readQueue, writeQueue, getBucket, readPublished } from './lib/queue.js';
import { resolveTargets, loadSiteConfig, parseArgs, isLaunched } from './lib/site-config.js';
import { detectIntent } from './lib/intent.js';
import { buildGscFeedbackScorer } from './lib/gsc-feedback.js';
import { MARKET_DATAFORSEO } from '@comparateur/config/niches';

const BASE_URL = 'https://api.dataforseo.com/v3';
const KD_DEFAULT_WHEN_UNKNOWN = 30;     // realistic median for long-tail
const KD_BATCH_SIZE = 700;              // bulk_keyword_difficulty accepts up to 1000/call
const IDEAS_LIMIT = 700;                // per call; we want a wide net then filter

function authHeader() {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

async function callDataForSEO(endpoint, payload) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`DataForSEO ${endpoint} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const STOPWORDS_BY_LANG = {
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'à', 'a',
    'pour', 'avec', 'sur', 'par', 'en', 'au', 'aux', 'ce', 'cet', 'cette',
  ]),
  en: new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'with', 'on', 'in', 'at',
    'by', 'from', 'is', 'are', 'this', 'that', 'these', 'those',
  ]),
};

function normalize(keyword, lang = 'fr') {
  const stopwords = STOPWORDS_BY_LANG[lang] ?? STOPWORDS_BY_LANG.fr;
  return keyword
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !stopwords.has(t))
    .sort()
    .join(' ');
}

function passesTopicFilter(keyword, topicTokens) {
  if (!topicTokens?.length) return true;
  const kw = keyword.toLowerCase();
  return topicTokens.some(t => kw.includes(t.toLowerCase()));
}

function scoreKeyword({ volume, kd, cpc }) {
  const safeKd = (kd && kd > 0 ? kd : KD_DEFAULT_WHEN_UNKNOWN) + 1;
  const safeCpc = Math.max(cpc ?? 0, 0);
  return Math.round((volume / safeKd) * Math.log(safeCpc + 1.5));
}

async function fetchKeywordIdeas(siteConfig) {
  const { niche, market, keywords: kwConfig } = siteConfig;
  const dfsLoc = MARKET_DATAFORSEO[market];
  console.log(`\n📊 ${niche}/${market}: querying keyword_ideas with ${kwConfig.seedKeywords.length} seeds (location=${dfsLoc.location_name}, lang=${dfsLoc.language_name})`);

  const data = await callDataForSEO('/dataforseo_labs/google/keyword_ideas/live', [{
    keywords: kwConfig.seedKeywords,
    location_code: dfsLoc.location_code,
    language_code: dfsLoc.language_code,
    limit: IDEAS_LIMIT,
    filters: [
      ['keyword_info.search_volume', '>', kwConfig.minVolume],
    ],
    order_by: ['keyword_info.search_volume,desc'],
  }]);

  if (data.status_code !== 20000) {
    console.error(`  ❌ DataForSEO error: ${data.status_message}`);
    return [];
  }

  const result = data.tasks?.[0]?.result?.[0];
  if (!result) return [];
  console.log(`  📥 ${result.items_count} of ${result.total_count} ideas returned (cost $${data.cost})`);

  const candidates = [];
  const seenNormalized = new Set();

  for (const item of result.items || []) {
    const kw = item.keyword;
    if (!kw) continue;

    if (!passesTopicFilter(kw, kwConfig.topicTokens)) continue;

    const norm = normalize(kw, dfsLoc.language_code);
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);

    candidates.push({
      keyword: kw,
      normalized: norm,
      volume: item.keyword_info?.search_volume ?? 0,
      cpc: item.keyword_info?.cpc ?? 0,
      competition: item.keyword_info?.competition_level ?? null,
    });
  }

  console.log(`  🔎 ${candidates.length} after topic filter + dedup`);
  return candidates;
}

async function enrichWithKD(candidates, market) {
  if (candidates.length === 0) return candidates;
  const dfsLoc = MARKET_DATAFORSEO[market];
  console.log(`  📐 Enriching ${candidates.length} keywords with KD data…`);

  const byKeyword = new Map(candidates.map(c => [c.keyword, c]));
  const keywords = candidates.map(c => c.keyword);

  for (let i = 0; i < keywords.length; i += KD_BATCH_SIZE) {
    const batch = keywords.slice(i, i + KD_BATCH_SIZE);
    try {
      const data = await callDataForSEO('/dataforseo_labs/google/bulk_keyword_difficulty/live', [{
        keywords: batch,
        location_code: dfsLoc.location_code,
        language_code: dfsLoc.language_code,
      }]);
      if (data.status_code !== 20000) {
        console.warn(`  ⚠️  KD batch ${i}: ${data.status_message}`);
        continue;
      }
      const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
      for (const item of items) {
        const c = byKeyword.get(item.keyword);
        if (!c) continue;
        // 0 means "DataForSEO has no signal", not "easy". Keep null in that case.
        c.kd = item.keyword_difficulty > 0 ? item.keyword_difficulty : null;
      }
    } catch (err) {
      console.warn(`  ⚠️  KD batch ${i} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const withKd = candidates.filter(c => c.kd != null).length;
  console.log(`  📊 KD signal available for ${withKd}/${candidates.length} keywords`);
  return candidates;
}

function applyKDFilter(candidates, maxKD) {
  return candidates.filter(c => {
    // Keep if no KD signal (otherwise we'd kill all long-tail).
    if (c.kd == null) return true;
    return c.kd <= maxKD;
  });
}

function toQueueEntry(c, niche, market, gscScorer) {
  const baseScore = scoreKeyword(c);
  // GSC feedback multiplier rerouts effort away from clusters Google has
  // already shown disinterest in. 1.0 by default (no signal / cold start).
  const gscMultiplier = gscScorer ? gscScorer(c.keyword) : 1.0;
  return {
    keyword: c.keyword,
    volume: c.volume,
    kd: c.kd,                       // null when DataForSEO has no signal
    cpc: c.cpc,
    score: Math.round(baseScore * gscMultiplier),
    rawScore: baseScore,            // pre-feedback for audit
    gscMultiplier,
    intent: detectIntent(c.keyword, { cpc: c.cpc }),
    status: 'pending',
    niche,
    market,
    createdAt: new Date().toISOString(),
    publishedUrl: null,
    publishedAt: null,
    errorCount: 0,
  };
}

async function refillQueue(targets) {
  const queue = readQueue();
  const published = readPublished();

  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    let candidates = await fetchKeywordIdeas(siteConfig);
    candidates = await enrichWithKD(candidates, market);
    candidates = applyKDFilter(candidates, siteConfig.keywords.maxKD);

    // GSC feedback: build a (keyword → multiplier) scorer from published
    // URLs in this (niche, market). Returns the neutral 1.0 closure when
    // the bucket has fewer than 3 mature URLs (cold start).
    const { scorer: gscScorer, sampleSize: gscSampleSize } = buildGscFeedbackScorer(published, niche, market);
    if (gscSampleSize > 0) {
      console.log(`  🎯 GSC feedback: ${gscSampleSize} published URLs in scope for cluster scoring`);
    }

    const fresh = candidates.map(c => toQueueEntry(c, niche, market, gscScorer));
    fresh.sort((a, b) => b.score - a.score);

    const bucket = getBucket(queue, niche, market);
    const lang = MARKET_DATAFORSEO[market].language_code;
    const existingNorms = new Set(bucket.map(k => normalize(k.keyword, lang)));
    const toAdd = fresh.filter(k => !existingNorms.has(normalize(k.keyword, lang)));

    bucket.push(...toAdd);
    console.log(`  ➕ ${toAdd.length} new keywords queued for ${niche}/${market} (total: ${bucket.length})`);

    if (toAdd.length > 0) {
      console.log(`     sample top 5:`);
      for (const k of toAdd.slice(0, 5)) {
        console.log(`       vol=${String(k.volume).padStart(6)} kd=${k.kd ?? '?'} cpc=${k.cpc.toFixed(2).padStart(5)} score=${String(k.score).padStart(5)} | ${k.keyword}`);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  writeQueue(queue);
  console.log('\n✅ Queue updated: data/keywords-queue.json');
}

const args = parseArgs(process.argv.slice(2));
const targets = resolveTargets(args);
refillQueue(targets).catch(err => {
  console.error(err);
  process.exit(1);
});
