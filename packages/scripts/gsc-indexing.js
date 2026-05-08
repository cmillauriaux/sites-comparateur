#!/usr/bin/env node
/**
 * Submit pending URLs from data/published-urls.json to the Google Search Console
 * Indexing API. Tracks daily quota in data/indexation-requests.json (cap 200/day).
 *
 * Prereq: GSC_SERVICE_ACCOUNT_KEY env var = JSON of a service account with
 * Indexing API access, added as Owner on each GSC property.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { google } from 'googleapis';
import { DATA_DIR, requireEnv } from './lib/env.js';
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

async function main() {
  const credentials = JSON.parse(requireEnv('GSC_SERVICE_ACCOUNT_KEY'));
  const auth = new google.auth.GoogleAuth({
    credentials,
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
