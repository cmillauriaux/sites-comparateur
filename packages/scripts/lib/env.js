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

/**
 * Credentials fragment to spread into a `google.auth.GoogleAuth` constructor.
 *
 * Returns `{ credentials }` when GSC_SERVICE_ACCOUNT_KEY holds a service
 * account key, and `{}` otherwise so GoogleAuth falls back to Application
 * Default Credentials. ADC is what CI uses: the GCP org enforces
 * `constraints/iam.disableServiceAccountKeyCreation`, so no key exists and
 * `google-github-actions/auth` federates a GitHub OIDC token instead.
 * Locally, `gcloud auth application-default login` covers the same path.
 */
export function googleAuthCredentials() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw || !raw.trim()) return {};
  try {
    return { credentials: JSON.parse(raw) };
  } catch (err) {
    console.error(`GSC_SERVICE_ACCOUNT_KEY is set but is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}
