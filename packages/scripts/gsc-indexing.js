#!/usr/bin/env node
/**
 * Submit pending URLs from data/published-urls.json to the Google Search Console
 * Indexing API. Tracks daily quota in data/indexation-requests.json (cap 200/day).
 *
 * Auth: two supported paths, both landing on a service account that is an Owner
 * of each GSC property (one property per (niche, market) since each site is a
 * distinct domain).
 *   - CI: Workload Identity Federation. `google-github-actions/auth` writes
 *     Application Default Credentials and GoogleAuth picks them up with no key
 *     material anywhere. This is the path the workflow uses — the GCP org
 *     forbids service-account keys (constraints/iam.disableServiceAccountKeyCreation).
 *   - Local: set GSC_SERVICE_ACCOUNT_KEY to the JSON of a service account key,
 *     or run `gcloud auth application-default login` and leave it unset.
 *
 * Optional flags: --niche, --market (or --site <niche>-<market>) restrict
 * submissions to one bucket. Without flags every pending URL is submitted up
 * to the daily quota.
 */
import { parseArgs } from './lib/site-config.js';
import { isValidNiche, isValidMarket, parseSiteId } from '@comparateur/config/niches';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';
import { DATA_DIR, googleAuthCredentials } from './lib/env.js';
import { readPublished, writePublished } from './lib/queue.js';

const REQUESTS_PATH = resolve(DATA_DIR, 'indexation-requests.json');
const DAILY_QUOTA = 200;
const MAX_PER_RUN = 100;

function readRequests() {
  if (!existsSync(REQUESTS_PATH)) return {};
  return JSON.parse(readFileSync(REQUESTS_PATH, 'utf-8'));
}

function writeRequests(r) {
  writeFileSync(REQUESTS_PATH, JSON.stringify(r, null, 2) + '\n');
}

function resolveFilter(args) {
  if (args.site && args.site !== 'all') {
    const parsed = parseSiteId(args.site);
    if (parsed) return parsed;
    if (isValidNiche(args.site)) return { niche: args.site };
  }
  const filter = {};
  if (args.niche) {
    if (!isValidNiche(args.niche)) throw new Error(`Unknown niche: ${args.niche}`);
    filter.niche = args.niche;
  }
  if (args.market) {
    if (!isValidMarket(args.market)) throw new Error(`Unknown market: ${args.market}`);
    filter.market = args.market;
  }
  return filter;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filter = resolveFilter(args);

  const auth = new google.auth.GoogleAuth({
    ...googleAuthCredentials(),
    scopes: ['https://www.googleapis.com/auth/indexing'],
  });
  const indexing = google.indexing({ version: 'v3', auth });

  const urls = readPublished();
  const requests = readRequests();
  const today = new Date().toISOString().split('T')[0];
  const todayCount = requests[today]?.count || 0;
  const remaining = DAILY_QUOTA - todayCount;

  const pending = urls
    .filter(u => u.indexationStatus === 'pending')
    .filter(u => !filter.niche || u.niche === filter.niche)
    .filter(u => !filter.market || u.market === filter.market)
    .slice(0, Math.min(MAX_PER_RUN, remaining));

  if (pending.length === 0) {
    console.log('ℹ️  No URLs pending indexation (or daily quota exhausted).');
    return;
  }

  console.log(`📡 Submitting ${pending.length} URLs to GSC (${todayCount}/${DAILY_QUOTA} used today)`);

  let success = 0;
  for (const entry of pending) {
    try {
      await indexing.urlNotifications.publish({
        requestBody: { url: entry.url, type: 'URL_UPDATED' },
      });
      const idx = urls.findIndex(u => u.url === entry.url);
      if (idx !== -1) {
        urls[idx].indexationStatus = 'submitted';
        urls[idx].submittedAt = new Date().toISOString();
      }
      success++;
      console.log(`  ✅ ${entry.url}`);
      await new Promise(r => setTimeout(r, 1000)); // GSC rate limit
    } catch (err) {
      console.error(`  ❌ ${entry.url}: ${err.message}`);
    }
  }

  writePublished(urls);

  if (!requests[today]) requests[today] = { count: 0, urls: [] };
  requests[today].count += success;
  requests[today].urls.push(...pending.slice(0, success).map(p => p.url));
  writeRequests(requests);

  console.log(`\n✅ ${success}/${pending.length} URLs submitted`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
