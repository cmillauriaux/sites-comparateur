import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) config({ path: envPath });

export const REPO_ROOT = repoRoot;
export const DATA_DIR = resolve(repoRoot, 'data');
export const SITES_DIR = resolve(repoRoot, 'sites');

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}
