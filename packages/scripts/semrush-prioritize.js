#!/usr/bin/env node
/**
 * Mine Semrush for Easy/Very-Easy keyword opportunities, cluster them into
 * article briefs, and write the registry of prioritized clusters to
 * data/semrush-priorities.json.
 *
 * One ENTRY in the registry = one article to write (primary + secondaries).
 *
 * Pipeline per (niche, market):
 *   1. Pull seedKeywords from the site.config.js
 *   2. For each seed → Semrush /phrase_fullsearch with server-side filter
 *      (Nq ≥ minVolume, Kd ≤ maxKD). Cached on disk, 14-day TTL.
 *   3. Aggregate, dedup, drop keywords that fail topicTokens whitelist
 *   4. Drop keywords already published (data/published-urls.json) or already
 *      in the priorities registry
 *   5. Cluster by token-Jaccard ≥ 0.6 (cluster.js)
 *   6. Score each cluster (same formula as dataforseo-keywords.js but on
 *      cluster totals so 5-keyword clusters don't get unfair boost)
 *   7. Classify intent on the primary keyword via detectIntent (reused so the
 *      url subdir picked at generation time stays consistent)
 *   8. Merge into the registry
 *
 * Usage:
 *   node packages/scripts/semrush-prioritize.js --niche jardin-bricolage --market fr
 *   node packages/scripts/semrush-prioritize.js --site jardin-bricolage-us
 *   node packages/scripts/semrush-prioritize.js                       # all enabled
 *   node packages/scripts/semrush-prioritize.js --max-units 50000     # API budget cap
 *   node packages/scripts/semrush-prioritize.js --no-cache            # bypass disk cache
 *   node packages/scripts/semrush-prioritize.js --top 20              # print top N
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import slugger from 'github-slugger';

import { DATA_DIR } from './lib/env.js';
import { readPublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, isLaunched } from './lib/site-config.js';
import { detectIntent } from './lib/intent.js';
import { fetchBroadMatch, normalizeRow } from './lib/semrush.js';
import { clusterKeywords, summarizeCluster } from './lib/cluster.js';
import { MARKET_SEMRUSH } from '@comparateur/config/niches';

const PRIORITIES_PATH = resolve(DATA_DIR, 'semrush-priorities.json');
const KD_CEILING = 29;            // "Easy" + "Very Easy" buckets in Semrush
const VOLUME_FLOOR = 200;         // ROI threshold for affiliate articles
const PER_SEED_LIMIT = 100;       // Semrush rows per seed call (cost = 100 × 20 = 2000 units)
const KD_DEFAULT_WHEN_UNKNOWN = 30;
const DEFAULT_MAX_UNITS = 100000;

const slug = new slugger();

function readPriorities() {
  if (!existsSync(PRIORITIES_PATH)) return {};
  return JSON.parse(readFileSync(PRIORITIES_PATH, 'utf-8'));
}

function writePriorities(data) {
  writeFileSync(PRIORITIES_PATH, JSON.stringify(data, null, 2) + '\n');
}

function getBucket(registry, niche, market) {
  if (!registry[niche]) registry[niche] = {};
  if (!registry[niche][market]) registry[niche][market] = [];
  return registry[niche][market];
}

function passesTopicFilter(keyword, topicTokens) {
  if (!topicTokens?.length) return true;
  const kw = keyword.toLowerCase();
  return topicTokens.some(t => kw.includes(t.toLowerCase()));
}

function scoreCluster({ totalVolume, avgKD, avgCPC }) {
  const safeKd = (avgKD && avgKD > 0 ? avgKD : KD_DEFAULT_WHEN_UNKNOWN) + 1;
  const safeCpc = Math.max(avgCPC ?? 0, 0);
  return Math.round((totalVolume / safeKd) * Math.log(safeCpc + 1.5));
}

/**
 * Build the registry-shaped opportunity. The id is stable across reruns
 * (slug of primary keyword + niche + market) so the same cluster, mined again
 * a week later, lands on the same row instead of duplicating.
 */
function toOpportunity(cluster, niche, market) {
  const summary = summarizeCluster(cluster);
  const score = scoreCluster(summary);
  const intent = detectIntent(summary.primaryKeyword, { cpc: summary.primaryCPC });
  const id = `${niche}-${market}-${slug.slug(summary.primaryKeyword)}`;
  return {
    id,
    niche,
    market,
    primaryKeyword: summary.primaryKeyword,
    secondaryKeywords: summary.secondaryKeywords,
    secondaryDetails: summary.secondaryDetails,
    primaryVolume: summary.primaryVolume,
    totalVolume: summary.totalVolume,
    avgKD: summary.avgKD,
    avgCPC: summary.avgCPC,
    primaryKD: summary.primaryKD,
    score,
    intent,
    semrushIntent: summary.semrushIntent,
    status: 'pending',          // pending | generated | rejected
    source: 'semrush',
    createdAt: new Date().toISOString(),
    generatedAt: null,
    publishedUrl: null,
  };
}

async function mineOne(siteConfig, { maxUnits, noCache }) {
  const { niche, market, keywords: kwConfig } = siteConfig;
  const semConf = MARKET_SEMRUSH[market];
  if (!semConf) throw new Error(`No Semrush database mapping for market ${market}`);

  const minVolume = Math.max(VOLUME_FLOOR, kwConfig.minVolume ?? VOLUME_FLOOR);
  console.log(`\n📊 ${niche}/${market}: mining Semrush (db=${semConf.database}, KD ≤ ${KD_CEILING}, vol ≥ ${minVolume})`);
  console.log(`   ${kwConfig.seedKeywords.length} seeds, max ${PER_SEED_LIMIT} rows/seed → up to ${kwConfig.seedKeywords.length * PER_SEED_LIMIT * 20} units`);

  const allRows = [];
  let totalCost = 0;
  let cachedHits = 0;

  for (const seed of kwConfig.seedKeywords) {
    if (totalCost >= maxUnits) {
      console.warn(`  ⚠️  Budget exhausted (${totalCost}/${maxUnits} units) — skipping remaining seeds`);
      break;
    }
    try {
      const { rows, cached, cost } = await fetchBroadMatch({
        phrase: seed,
        database: semConf.database,
        minVolume,
        maxKD: KD_CEILING,
        limit: PER_SEED_LIMIT,
        noCache,
      });
      totalCost += cost;
      if (cached) cachedHits++;
      allRows.push(...rows);
      const tag = cached ? 'cached' : `${cost} units`;
      console.log(`  • "${seed}" → ${rows.length} rows (${tag})`);
    } catch (err) {
      console.warn(`  ⚠️  "${seed}": ${err.message}`);
    }
    if (!noCache && cachedHits < kwConfig.seedKeywords.length) {
      // Throttle only when actually hitting the API; cached calls are local.
      await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log(`  📥 ${allRows.length} rows total (${cachedHits}/${kwConfig.seedKeywords.length} cached, $cost ≈ ${totalCost} units)`);

  // Normalize → typed keywords
  const normalized = allRows
    .map(normalizeRow)
    .filter(k => k.keyword && k.volume >= minVolume && k.kd <= KD_CEILING);

  // Topic filter (keep cluster tight to the niche's vocabulary)
  const onTopic = normalized.filter(k => passesTopicFilter(k.keyword, kwConfig.topicTokens));
  console.log(`  🎯 ${onTopic.length} rows pass topicTokens filter`);

  // Dedup (Semrush can return the same keyword from multiple seeds)
  const seen = new Set();
  const deduped = [];
  for (const k of onTopic) {
    const norm = k.keyword.toLowerCase().trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    deduped.push(k);
  }
  console.log(`  🧹 ${deduped.length} after dedup`);

  // Drop keywords already covered: published articles + existing priorities
  const published = readPublished()
    .filter(u => u.niche === niche && u.market === market)
    .map(u => (u.keyword || '').toLowerCase().trim())
    .filter(Boolean);
  const publishedSet = new Set(published);

  const registry = readPriorities();
  const existingBucket = getBucket(registry, niche, market);
  const existingKeywords = new Set();
  for (const opp of existingBucket) {
    existingKeywords.add(opp.primaryKeyword.toLowerCase().trim());
    for (const sk of opp.secondaryKeywords || []) existingKeywords.add(sk.toLowerCase().trim());
  }

  const fresh = deduped.filter(k => {
    const norm = k.keyword.toLowerCase().trim();
    return !publishedSet.has(norm) && !existingKeywords.has(norm);
  });
  console.log(`  ➖ ${deduped.length - fresh.length} dropped (already published / already prioritized)`);

  if (fresh.length === 0) {
    console.log(`  💤 Nothing new for ${niche}/${market}`);
    return { opportunities: [], cost: totalCost };
  }

  // Cluster + score
  const lang = semConf.language;
  const clusters = clusterKeywords(fresh, { lang, similarityThreshold: 0.4, minSharedTokens: 2, maxClusterSize: 7 });
  const opportunities = clusters
    .map(c => toOpportunity(c, niche, market))
    .sort((a, b) => b.score - a.score);

  console.log(`  📦 ${clusters.length} clusters built (${fresh.length - clusters.length} keywords merged as secondaries)`);
  return { opportunities, cost: totalCost };
}

async function run({ targets, maxUnits, noCache, topN }) {
  const registry = readPriorities();
  let totalCost = 0;
  const allFresh = [];

  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    const { opportunities, cost } = await mineOne(siteConfig, { maxUnits: maxUnits - totalCost, noCache });
    totalCost += cost;

    if (opportunities.length === 0) continue;

    const bucket = getBucket(registry, niche, market);
    bucket.push(...opportunities);
    bucket.sort((a, b) => b.score - a.score);
    allFresh.push(...opportunities);
    console.log(`  ✅ ${opportunities.length} new opportunities added to registry`);
  }

  writePriorities(registry);
  console.log(`\n💾 Wrote ${PRIORITIES_PATH}`);
  console.log(`💸 Total Semrush API cost this run: ${totalCost} units`);

  if (allFresh.length > 0) {
    const top = allFresh.sort((a, b) => b.score - a.score).slice(0, topN);
    console.log(`\n🏆 Top ${top.length} opportunities (across all targets):`);
    for (const o of top) {
      const secs = o.secondaryKeywords.length;
      console.log(
        `   [${o.score.toString().padStart(6)}] ${o.intent.padEnd(13)} vol=${String(o.totalVolume).padStart(6)} kd=${String(Math.round(o.avgKD)).padStart(2)} ${o.niche}/${o.market}  ${o.primaryKeyword}  (+${secs} secondaries)`,
      );
    }
    console.log(`\nNext step: pick an id from data/semrush-priorities.json and run:`);
    console.log(`   node packages/scripts/article-generator.js --cluster <id>`);
  }
}

const args = parseArgs(process.argv.slice(2));
const targets = resolveTargets(args);
const maxUnits = parseInt(args['max-units'] ?? DEFAULT_MAX_UNITS, 10);
const noCache = args['no-cache'] === true;
const topN = parseInt(args['top'] ?? 15, 10);

run({ targets, maxUnits, noCache, topN }).catch(err => {
  console.error(err);
  process.exit(1);
});
