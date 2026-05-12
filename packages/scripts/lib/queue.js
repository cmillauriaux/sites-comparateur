import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from './env.js';

const PUBLISHED_PATH = resolve(DATA_DIR, 'published-urls.json');

/**
 * Schema:
 *   published-urls.json = PublishedUrl[]   (entries carry { niche, market })
 *
 * The published list stays flat because it's append-only and queried by URL,
 * but every entry MUST set both `niche` and `market` so we can scope GSC
 * indexation requests, content refresh, and stats per market.
 */

export function readPublished() {
  if (!existsSync(PUBLISHED_PATH)) return [];
  return JSON.parse(readFileSync(PUBLISHED_PATH, 'utf-8'));
}

export function writePublished(urls) {
  writeFileSync(PUBLISHED_PATH, JSON.stringify(urls, null, 2) + '\n');
}

export function appendPublished(entry) {
  const urls = readPublished();
  urls.push(entry);
  writePublished(urls);
}

export const PATHS = { PUBLISHED_PATH };
