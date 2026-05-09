import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITES_DIR } from './env.js';
import {
  NICHES, MARKETS, ENABLED_SITES,
  isValidNiche, isValidMarket, isEnabled, siteId, parseSiteId,
} from '@comparateur/config/niches';

/**
 * Load the per-(niche, market) site.config.js.
 *
 * Path is sites/<niche>/<market>/site.config.js. The site config carries the
 * domain, locale, language, theme, seedKeywords, and affiliatePrograms list
 * for that specific marketplace.
 */
export async function loadSiteConfig(niche, market) {
  if (!isValidNiche(niche)) {
    throw new Error(`Unknown niche: ${niche}. Valid: ${NICHES.join(', ')}`);
  }
  if (!isValidMarket(market)) {
    throw new Error(`Unknown market: ${market}. Valid: ${MARKETS.join(', ')}`);
  }
  const path = resolve(SITES_DIR, niche, market, 'site.config.js');
  const mod = await import(pathToFileURL(path).href);
  return { ...mod.default, niche, market };
}

/** Returns false when the site's domain is still a TODO_*_DOMAIN placeholder.
 *  Pipelines should skip such sites — running them poisons published-urls.json
 *  with broken canonicals and submits TODO URLs to GSC. */
export function isLaunched(siteConfig) {
  return Boolean(siteConfig?.domain) && !/^TODO[_A-Z]*_DOMAIN$/i.test(siteConfig.domain);
}

/** Load every config in ENABLED_SITES. */
export async function loadAllSiteConfigs() {
  return Promise.all(ENABLED_SITES.map(({ niche, market }) => loadSiteConfig(niche, market)));
}

/**
 * Resolve the script's --niche / --market / --site arguments into a list of
 * {niche, market} pairs to operate on.
 *
 * Supported forms:
 *   --niche jardin-bricolage --market fr     → 1 pair
 *   --niche jardin-bricolage                 → all enabled markets for that niche
 *   --site jardin-bricolage-us               → 1 pair (siteId form)
 *   --site all  / no flags                   → every enabled (niche, market) pair
 */
export function resolveTargets(args) {
  if (args.site && args.site !== 'all') {
    if (args.site.includes('-')) {
      const parsed = parseSiteId(args.site);
      if (parsed) return [parsed];
    }
    // Legacy: bare niche name. Expand to all enabled markets for it.
    if (isValidNiche(args.site)) {
      return ENABLED_SITES.filter(s => s.niche === args.site);
    }
    throw new Error(`Unknown --site value: ${args.site}`);
  }

  if (args.niche) {
    if (!isValidNiche(args.niche)) {
      throw new Error(`Unknown --niche: ${args.niche}. Valid: ${NICHES.join(', ')}`);
    }
    if (args.market) {
      if (!isValidMarket(args.market)) {
        throw new Error(`Unknown --market: ${args.market}. Valid: ${MARKETS.join(', ')}`);
      }
      if (!isEnabled(args.niche, args.market)) {
        throw new Error(`(${args.niche}, ${args.market}) is not enabled. Add it to ENABLED_SITES first.`);
      }
      return [{ niche: args.niche, market: args.market }];
    }
    return ENABLED_SITES.filter(s => s.niche === args.niche);
  }

  // No filter → every enabled site.
  return [...ENABLED_SITES];
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

export { siteId };
