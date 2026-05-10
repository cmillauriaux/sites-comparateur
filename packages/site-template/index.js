import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Absolute filesystem path to the shared Astro src/ directory. Each
 *  per-(niche, market) site sets `srcDir` to this so they all consume the
 *  same components, layouts, pages, and content.config.ts. */
export const SITE_TEMPLATE_SRC = fileURLToPath(new URL('./src/', import.meta.url));

const TODO_DOMAIN_RE = /^TODO[_A-Z]*_DOMAIN$/i;

/**
 * Discover sibling `(niche, market)` site.config.js files for hreflang.
 *
 * Hreflang is emitted on the home page only (inner article URLs don't have
 * cross-market equivalents until a translation map exists). The returned
 * list excludes sites whose domain is still a `TODO_*_DOMAIN` placeholder
 * — pointing Google at a placeholder would poison the localisation graph.
 *
 * Includes the current site so a homepage can emit its own self-reference,
 * which Google requires for hreflang to be honoured.
 */
export async function loadHreflangSiblings(niche) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const nicheDir = resolve(here, '..', '..', 'sites', niche);
  if (!existsSync(nicheDir)) return [];
  const dirEntries = readdirSync(nicheDir, { withFileTypes: true })
    .filter(d => d.isDirectory());
  const siblings = [];
  for (const d of dirEntries) {
    const cfgPath = resolve(nicheDir, d.name, 'site.config.js');
    if (!existsSync(cfgPath)) continue;
    try {
      const mod = await import(pathToFileURL(cfgPath).href);
      const cfg = mod.default;
      if (!cfg?.domain || TODO_DOMAIN_RE.test(cfg.domain)) continue;
      siblings.push({
        market: cfg.market || d.name,
        locale: cfg.locale,
        domain: cfg.domain,
      });
    } catch { /* unreadable / malformed config — skip */ }
  }
  return siblings;
}
