#!/usr/bin/env node
/**
 * Pull last-28-days Search Analytics from Google Search Console for every
 * launched (niche, market). Two outputs:
 *
 *   1. data/gsc-metrics.json — per-URL aggregates:
 *      { [url]: { clicks, impressions, ctr, position, fetchedAt } }
 *
 *   2. published-urls.json entries gain a `gsc:` field cloned from above so
 *      downstream scoring (e.g. semrush-prioritize.js if/when wired to use
 *      lib/gsc-feedback.js) doesn't need a join.
 *
 * Score feedback application is the consumer's responsibility: this script
 * is read-only on the published list and only persists fresh metrics. That
 * keeps the GSC quota consumption disjoint from the article-generation
 * pipeline and makes the metrics inspectable as their own artefact.
 *
 * Auth: same service account as gsc-indexing.js, but a different scope
 * (`webmasters.readonly`). The account must be added as a verified user
 * (Owner OR Restricted user) on every GSC property — one property per
 * (niche, market) since each is a distinct domain.
 *
 * Usage:
 *   node packages/scripts/gsc-analytics.js
 *   node packages/scripts/gsc-analytics.js --niche jardin-bricolage --market fr
 *   node packages/scripts/gsc-analytics.js --site jardin-bricolage-us
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';
import { DATA_DIR, googleAuthCredentials } from './lib/env.js';
import { readPublished, writePublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, isLaunched, siteId } from './lib/site-config.js';

const METRICS_PATH = resolve(DATA_DIR, 'gsc-metrics.json');
const WINDOW_DAYS = 28;
const ROW_LIMIT = 1000;

function loadMetrics() {
  if (!existsSync(METRICS_PATH)) return {};
  try { return JSON.parse(readFileSync(METRICS_PATH, 'utf-8')); }
  catch { return {}; }
}

function saveMetrics(m) {
  writeFileSync(METRICS_PATH, JSON.stringify(m, null, 2) + '\n');
}

function ymd(d) {
  return d.toISOString().split('T')[0];
}

async function fetchSiteMetrics(searchconsole, siteUrl, startDate, endDate) {
  // dimensions: page → one row per indexed URL with summed clicks/impressions
  // and weighted-average position. Dropping `query` keeps the row count
  // manageable; per-keyword breakdowns can come later if needed.
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: ROW_LIMIT,
    },
  });
  return res.data.rows ?? [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);

  const auth = new google.auth.GoogleAuth({
    ...googleAuthCredentials(),
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const endDate = ymd(new Date());
  const startDate = ymd(new Date(Date.now() - WINDOW_DAYS * 86400000));

  const metrics = loadMetrics();
  const published = readPublished();
  let totalRows = 0;

  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${siteId(niche, market)}: skipping — domain still placeholder`);
      continue;
    }

    // GSC properties are typically registered as `https://<domain>/`. URL-
    // prefix properties require this exact form (with trailing slash).
    const siteUrl = `https://${siteConfig.domain}/`;
    console.log(`\n📈 ${siteId(niche, market)}: querying ${siteUrl} (${startDate} → ${endDate})`);

    let rows;
    try {
      rows = await fetchSiteMetrics(searchconsole, siteUrl, startDate, endDate);
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
      continue;
    }

    console.log(`  📥 ${rows.length} URLs returned`);
    totalRows += rows.length;

    const fetchedAt = new Date().toISOString();
    for (const row of rows) {
      const [url] = row.keys || [];
      if (!url) continue;
      metrics[url] = {
        clicks:       row.clicks ?? 0,
        impressions:  row.impressions ?? 0,
        ctr:          row.ctr ?? 0,
        position:     row.position ?? 0,
        windowDays:   WINDOW_DAYS,
        fetchedAt,
      };
    }
  }

  saveMetrics(metrics);

  // Enrich published-urls.json with the latest metrics so consumers don't
  // have to load the metrics file separately. Append-only on the gsc field;
  // entries without GSC data keep their existing shape unchanged.
  let enriched = 0;
  for (const entry of published) {
    if (!entry.url) continue;
    const m = metrics[entry.url];
    if (!m) continue;
    entry.gsc = {
      clicks: m.clicks,
      impressions: m.impressions,
      ctr: m.ctr,
      position: m.position,
      fetchedAt: m.fetchedAt,
    };
    enriched++;
  }
  if (enriched > 0) writePublished(published);
  console.log(`\n✅ ${totalRows} rows persisted; ${enriched} published-urls.json entries enriched.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
