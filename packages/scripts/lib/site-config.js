import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITES_DIR } from './env.js';
import { NICHES, isValidNiche } from '@comparateur/config/niches';

export async function loadSiteConfig(niche) {
  if (!isValidNiche(niche)) {
    throw new Error(`Unknown niche: ${niche}. Valid: ${NICHES.join(', ')}`);
  }
  const path = resolve(SITES_DIR, niche, 'site.config.js');
  const mod = await import(pathToFileURL(path).href);
  return mod.default;
}

export async function loadAllSiteConfigs() {
  return Promise.all(NICHES.map(loadSiteConfig));
}

export function resolveSiteArg(arg) {
  if (!arg || arg === 'all') return NICHES;
  if (!isValidNiche(arg)) {
    throw new Error(`Unknown niche: ${arg}. Valid: ${NICHES.join(', ')}`);
  }
  return [arg];
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}
