import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from './env.js';

const QUEUE_PATH = resolve(DATA_DIR, 'keywords-queue.json');
const PUBLISHED_PATH = resolve(DATA_DIR, 'published-urls.json');

export function readQueue() {
  if (!existsSync(QUEUE_PATH)) return {};
  return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
}

export function writeQueue(queue) {
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n');
}

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

export const PATHS = { QUEUE_PATH, PUBLISHED_PATH };
