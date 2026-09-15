#!/usr/bin/env node
/**
 * IndexNow submission script — reusable across all Astro sites.
 *
 * Usage (from the repo root):
 *   pnpm indexnow            # new/changed URLs from dist/sitemap-0.xml
 *   pnpm indexnow:all        # every sitemap URL
 *   pnpm indexnow:dry        # dry run
 *   pnpm indexnow --urls /en/foo/,/en/bar/   # explicit paths or absolute URLs
 *
 * Required env vars (or pass via CLI):
 *   INDEXNOW_DOMAIN   e.g. jemefaispayer.fr
 *   INDEXNOW_KEY      e.g. ae5f3596bfa4f8bc32f5535e8182cb5f
 *
 * Flags:
 *   --dry-run         Print URLs that would be submitted, don't call API
 *   --all             Ignore state cache, resubmit all URLs
 *   --domain <d>      Override INDEXNOW_DOMAIN
 *   --key <k>         Override INDEXNOW_KEY
 *   --sitemap <path>  Path to sitemap XML (default: ./dist/sitemap-0.xml)
 *   --urls <a,b,c>    Submit only these URLs (paths or absolute), ignore sitemap/state
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 10000; // IndexNow max per request

// --- Arg parsing (no dependencies) ---
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const DRY_RUN = flag('dry-run');
const SUBMIT_ALL = flag('all');

const domain = arg('domain') || process.env.INDEXNOW_DOMAIN;
const key = arg('key') || process.env.INDEXNOW_KEY;
const sitemapArg = arg('sitemap');
const urlsArg = arg('urls');

if (!domain || !key) {
  console.error('Error: INDEXNOW_DOMAIN and INDEXNOW_KEY are required.');
  console.error('Set them as env vars or pass --domain / --key flags.');
  process.exit(1);
}

// --- Resolve paths relative to CWD (the site dir) ---
const CWD = process.cwd();
const sitemapPath = sitemapArg ? resolve(sitemapArg) : join(CWD, 'dist', 'sitemap-0.xml');
const stateFile = join(CWD, '.indexnow-state.json');

// --- Parse sitemap ---
function parseSitemap(xmlPath) {
  if (!existsSync(xmlPath)) {
    console.error(`Sitemap not found: ${xmlPath}`);
    console.error('Run `npm run build` first.');
    process.exit(1);
  }
  const xml = readFileSync(xmlPath, 'utf8');
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  const lastmodRegex = /<lastmod>(.*?)<\/lastmod>/g;
  let locMatch, lastmodMatch;
  const locs = [];
  const lastmods = [];
  while ((locMatch = locRegex.exec(xml)) !== null) locs.push(locMatch[1].trim());
  while ((lastmodMatch = lastmodRegex.exec(xml)) !== null) lastmods.push(lastmodMatch[1].trim());
  for (let i = 0; i < locs.length; i++) {
    urls.push({ url: locs[i], lastmod: lastmods[i] || '' });
  }
  return urls;
}

// --- State management (tracks last submitted lastmod per URL) ---
function loadState() {
  if (!existsSync(stateFile)) return {};
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// --- Submit batch to IndexNow ---
async function submitBatch(urlList) {
  const body = {
    host: domain,
    key,
    keyLocation: `https://${domain}/${key}.txt`,
    urlList,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  return { status: res.status, ok: res.ok };
}

// --- Main ---
async function main() {
  console.log(`\nIndexNow submission for ${domain}`);
  console.log(`Key: ${key}`);
  console.log(`Sitemap: ${sitemapPath}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no API calls)\n');

  const explicit = urlsArg
    ? urlsArg.split(',').map((u) => u.trim()).filter(Boolean)
        .map((u) => (u.startsWith('http') ? u : `https://${domain}${u.startsWith('/') ? '' : '/'}${u}`))
        .map((url) => ({ url, lastmod: new Date().toISOString().slice(0, 10) }))
    : null;
  const entries = explicit ?? parseSitemap(sitemapPath);
  console.log(explicit ? `Explicit list: ${entries.length} URL(s).` : `Found ${entries.length} URLs in sitemap.`);

  const state = loadState();
  const toSubmit = SUBMIT_ALL || explicit
    ? entries
    : entries.filter((e) => state[e.url] !== e.lastmod);

  if (toSubmit.length === 0) {
    console.log('Nothing to submit — all URLs already indexed (use --all to force).');
    return;
  }

  console.log(`Submitting ${toSubmit.length} URL(s)${SUBMIT_ALL ? ' (forced --all)' : ' (new/changed)'}...\n`);

  // Split into batches
  for (let i = 0; i < toSubmit.length; i += BATCH_SIZE) {
    const batch = toSubmit.slice(i, i + BATCH_SIZE);
    const urlList = batch.map((e) => e.url);

    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${urlList.length} URL(s)`);
    urlList.forEach((u) => console.log(`  ${u}`));

    if (!DRY_RUN) {
      const { status, ok } = await submitBatch(urlList);
      if (ok || status === 200 || status === 202) {
        console.log(`  → ${status === 202 ? '202 Accepted' : status} ✓`);
        // Update state for successfully submitted URLs
        for (const e of batch) state[e.url] = e.lastmod;
      } else {
        console.error(`  → HTTP ${status} — submission failed for this batch`);
      }
    } else {
      console.log('  → [dry-run, skipped]');
    }
    console.log('');
  }

  if (!DRY_RUN) {
    saveState(state);
    console.log(`State saved to ${stateFile}`);
  }

  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
