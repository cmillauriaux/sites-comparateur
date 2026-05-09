#!/usr/bin/env node
/**
 * Weekly content refresh:
 *   1. If the (niche, market) queue has no pending entries → trigger
 *      DataForSEO refill for that pair.
 *   2. Otherwise pick the oldest published articles for that pair, re-scrape
 *      sources, and ask Claude to update only what diverged.
 *
 * Usage:
 *   node packages/scripts/content-updater.js --niche jardin-bricolage --market fr
 *   node packages/scripts/content-updater.js --site jardin-bricolage-us
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT, SITES_DIR, requireEnv } from './lib/env.js';
import { readQueue, readPublished, writePublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveTargets, siteId, isLaunched } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import { getSourcesFor } from '@comparateur/config/sources';

const MAX_REFRESH_PER_RUN = parseInt(process.env.MAX_REFRESH_PER_RUN || '3', 10);
const MIN_AGE_DAYS = parseInt(process.env.MIN_AGE_DAYS || '60', 10);

function ageInDays(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function refillQueueViaCli(niche, market) {
  console.log(`\n🔄 ${niche}/${market}: queue empty, refilling via dataforseo-keywords.js`);
  const r = spawnSync('node', ['packages/scripts/dataforseo-keywords.js', '--niche', niche, '--market', market], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });
  return r.status === 0;
}

function articlePathFor(siteConfig, urlEntry) {
  // Article URL has the form https://<domain>/<subdir>/<slug>/ where subdir is
  // a market-specific localization of "review" / "comparison" / "guide".
  // We don't need to validate the subdir — only the slug, which becomes the
  // basename of the .mdx file under sites/<niche>/<market>/src/content/articles.
  const m = urlEntry.url.match(/\/[^/]+\/([^/]+)\/?$/);
  if (!m) return null;
  return resolve(SITES_DIR, siteConfig.niche, siteConfig.market, 'src/content/articles', `${m[1]}.mdx`);
}

async function refreshOne(siteConfig, urlEntry) {
  const articlePath = articlePathFor(siteConfig, urlEntry);
  if (!articlePath || !existsSync(articlePath)) {
    // Fallback to legacy .md extension (pre-mdx articles)
    const mdPath = articlePath?.replace(/\.mdx$/, '.md');
    if (!mdPath || !existsSync(mdPath)) {
      console.warn(`  ⚠️  ${urlEntry.url}: source file not found, skipping`);
      return false;
    }
  }
  const finalPath = existsSync(articlePath) ? articlePath : articlePath.replace(/\.mdx$/, '.md');

  const sources = getSourcesFor(siteConfig.niche, siteConfig.market);
  console.log(`  🔍 Re-scraping for: ${urlEntry.keyword}`);
  const { sources: scraped, enough } = await scrapeSourcesForKeyword(sources, urlEntry.keyword, { minSuccess: 2 });
  if (!enough) {
    console.warn(`  ⚠️  not enough fresh sources, skipping`);
    return false;
  }

  const original = readFileSync(finalPath, 'utf-8');
  const sourcesBlock = scraped
    .map((s, i) => `### SOURCE ${i + 1} — ${s.name}\nURL: ${s.url}\n\n${s.content}`)
    .join('\n\n---\n\n');

  const isFr = siteConfig.market === 'fr';
  const prompt = isFr
    ? `Tu mets à jour un article existant pour ${siteConfig.name}.

ARTICLE EXISTANT (chemin: ${finalPath}) :
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
- Sinon, utilise Write pour réécrire le fichier complet à : ${finalPath}`
    : `You are updating an existing article for ${siteConfig.name}.

EXISTING ARTICLE (path: ${finalPath}):
\`\`\`md
${original}
\`\`\`

FRESH SOURCES (re-scraped today):
${sourcesBlock}

TASK:
- Compare the fresh sources to the current content.
- Update ONLY what changed: prices, rankings, new products, dates.
- Preserve the structure, intermediate scores (unless a source invalidates them), the slug and URL.
- Update the frontmatter "updatedAt" to ${new Date().toISOString()}.
- If no material change is detected, write EXACTLY "NO_UPDATE_NEEDED" with nothing else and DO NOT use Write.
- Otherwise, use Write to rewrite the full file at: ${finalPath}`;

  const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
  const r = spawnSync('claude', ['-p', '--dangerously-skip-permissions'], {
    input: prompt,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
    cwd: REPO_ROOT,
  });

  if (r.status !== 0) {
    console.error(`  ❌ claude exited ${r.status}`);
    return false;
  }

  const updated = readFileSync(finalPath, 'utf-8');
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
  for (const { niche, market } of targets) {
    const siteConfig = await loadSiteConfig(niche, market);
    if (!isLaunched(siteConfig)) {
      console.warn(`⏭  ${niche}/${market}: skipping — domain still placeholder (${siteConfig.domain})`);
      continue;
    }
    const queue = readQueue();
    const pending = (queue?.[niche]?.[market] || []).filter(k => k.status === 'pending');

    if (pending.length === 0) {
      const ok = refillQueueViaCli(niche, market);
      if (!ok) console.warn(`  ⚠️  refill failed for ${siteId(niche, market)}`);
      continue;
    }

    const candidates = readPublished()
      .filter(u => u.niche === niche && u.market === market && u.publishedAt && ageInDays(u.publishedAt) >= MIN_AGE_DAYS)
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
      .slice(0, MAX_REFRESH_PER_RUN);

    if (candidates.length === 0) {
      console.log(`ℹ️  ${siteId(niche, market)}: no articles older than ${MIN_AGE_DAYS}d to refresh`);
      continue;
    }

    console.log(`\n♻️  ${siteId(niche, market)}: refreshing ${candidates.length} articles`);
    for (const c of candidates) await refreshOne(siteConfig, c);
  }
}

const args = parseArgs(process.argv.slice(2));
run(resolveTargets(args)).catch(err => {
  console.error(err);
  process.exit(1);
});
