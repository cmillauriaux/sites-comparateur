#!/usr/bin/env node
/**
 * Weekly content refresh:
 *   1. If queue empty for a niche → trigger DataForSEO refill.
 *   2. Otherwise pick the oldest published articles, re-scrape sources,
 *      and ask Claude to update only what diverged.
 *
 * Usage:
 *   node packages/scripts/content-updater.js --site jardin-bricolage
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { REPO_ROOT, SITES_DIR, requireEnv } from './lib/env.js';
import { readQueue, readPublished, writePublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveSiteArg } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import sourcesConfig from '@comparateur/config/sources';

const MAX_REFRESH_PER_RUN = parseInt(process.env.MAX_REFRESH_PER_RUN || '3', 10);
const MIN_AGE_DAYS = parseInt(process.env.MIN_AGE_DAYS || '60', 10);

function ageInDays(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function refillQueueViaCli(niche) {
  console.log(`\n🔄 ${niche}: queue empty, refilling via dataforseo-keywords.js`);
  const r = spawnSync('node', ['packages/scripts/dataforseo-keywords.js', '--site', niche], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });
  return r.status === 0;
}

function articlePathFor(siteConfig, urlEntry) {
  // URL: https://<domain>/{avis|comparatifs|guides}/<slug>/
  const m = urlEntry.url.match(/\/(avis|comparatifs|guides)\/([^/]+)\/?$/);
  if (!m) return null;
  return resolve(SITES_DIR, siteConfig.niche, 'src/content/articles', `${m[2]}.md`);
}

async function refreshOne(siteConfig, urlEntry) {
  const articlePath = articlePathFor(siteConfig, urlEntry);
  if (!articlePath || !existsSync(articlePath)) {
    console.warn(`  ⚠️  ${urlEntry.url}: source file not found, skipping`);
    return false;
  }

  const sources = sourcesConfig[siteConfig.niche] || [];
  console.log(`  🔍 Re-scraping for: ${urlEntry.keyword}`);
  const { sources: scraped, enough } = await scrapeSourcesForKeyword(sources, urlEntry.keyword, { minSuccess: 2 });
  if (!enough) {
    console.warn(`  ⚠️  not enough fresh sources, skipping`);
    return false;
  }

  const original = readFileSync(articlePath, 'utf-8');
  const sourcesBlock = scraped
    .map((s, i) => `### SOURCE ${i + 1} — ${s.name}\nURL: ${s.url}\n\n${s.content}`)
    .join('\n\n---\n\n');

  const prompt = `Tu mets à jour un article existant pour ${siteConfig.name}.

ARTICLE EXISTANT (chemin: ${articlePath}) :
\`\`\`md
${original}
\`\`\`

SOURCES FRAÎCHES (re-scrapées aujourd'hui) :
${sourcesBlock}

TÂCHE :
- Compare les sources fraîches au contenu actuel.
- Mets à jour UNIQUEMENT les éléments qui ont changé : prix, classements, nouveaux produits, dates.
- Conserve la structure, les notes intermédiaires (sauf si une source les invalide), le slug et l'URL.
- Mets à jour le frontmatter "updatedAt" à ${new Date().toISOString()}.
- Si aucun changement matériel n'est détecté, écris EXACTEMENT "NO_UPDATE_NEEDED" sans rien d'autre et n'utilise PAS Write.
- Sinon, utilise Write pour réécrire le fichier complet à : ${articlePath}`;

  const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
  const r = spawnSync('claude', ['-p', '--dangerously-skip-permissions', prompt], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
    cwd: REPO_ROOT,
  });

  if (r.status !== 0) {
    console.error(`  ❌ claude exited ${r.status}`);
    return false;
  }

  const updated = readFileSync(articlePath, 'utf-8');
  if (updated === original) {
    console.log(`  ⏭  no update applied (NO_UPDATE_NEEDED)`);
    return false;
  }

  // Resubmit to GSC indexing
  const urls = readPublished();
  const idx = urls.findIndex(u => u.url === urlEntry.url);
  if (idx !== -1) {
    urls[idx].indexationStatus = 'pending';
    urls[idx].refreshedAt = new Date().toISOString();
    writePublished(urls);
  }
  console.log(`  ✅ refreshed ${urlEntry.url}`);
  return true;
}

async function run(targets) {
  for (const niche of targets) {
    const queue = readQueue();
    const pending = (queue[niche] || []).filter(k => k.status === 'pending');

    if (pending.length === 0) {
      const ok = refillQueueViaCli(niche);
      if (!ok) console.warn(`  ⚠️  refill failed for ${niche}`);
      continue;
    }

    const siteConfig = await loadSiteConfig(niche);
    const candidates = readPublished()
      .filter(u => u.site === niche && u.publishedAt && ageInDays(u.publishedAt) >= MIN_AGE_DAYS)
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
      .slice(0, MAX_REFRESH_PER_RUN);

    if (candidates.length === 0) {
      console.log(`ℹ️  ${niche}: no articles older than ${MIN_AGE_DAYS}d to refresh`);
      continue;
    }

    console.log(`\n♻️  ${niche}: refreshing ${candidates.length} articles`);
    for (const c of candidates) await refreshOne(siteConfig, c);
  }
}

const args = parseArgs(process.argv.slice(2));
run(resolveSiteArg(args.site)).catch(err => {
  console.error(err);
  process.exit(1);
});
