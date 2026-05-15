/**
 * One-shot, idempotent backfill for the SEO audit fixes.
 *
 * Three jobs, all scoped to every site under `sites/<niche>/<market>/`:
 *
 *   1. Strip the duplicate leading H1 from every article body. The
 *      ArticleLayout already renders `<h1>{data.title}</h1>` once per page,
 *      so the model-written `# ...` inside the body produces a second H1 —
 *      a hard SEO finding. `scrubLeadingH1` from article-postprocess is the
 *      same backstop the live pipeline now applies on each generation.
 *
 *   2. Rename articles whose slug contains non-ASCII characters. The new
 *      slug is computed via `asciiSlug()` (the same helper the generator
 *      uses going forward). Old URLs are recorded so we can ship a 301.
 *
 *   3. Emit a `_redirects` file under `sites/<niche>/<market>/public/` so
 *      Cloudflare Pages serves a 301 from each renamed accented URL to its
 *      new ASCII form. Existing redirect lines for the same source path
 *      are left untouched (the file may have been hand-extended).
 *
 * Side-effect state — `data/published-urls.json` and
 * `data/semrush-priorities.json` — is updated in place so the next pipeline
 * run sees the new URLs and doesn't try to "re-publish" the old slug.
 *
 * The script is safe to re-run: a clean state (no leading H1, all-ASCII
 * slugs, redirects already in place) results in zero writes.
 *
 *   node packages/scripts/backfill-seo-fixes.js              # all sites
 *   node packages/scripts/backfill-seo-fixes.js --dry-run    # report only
 */
import { readFileSync, writeFileSync, readdirSync, renameSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { REPO_ROOT, SITES_DIR, DATA_DIR } from './lib/env.js';
import { asciiSlug } from './lib/slugify.js';
import { scrubLeadingH1 } from './lib/article-postprocess.js';
import { i18n } from '@comparateur/config';

/** Map an article intent to the i18n URL segment for the given market. */
function segmentFor(intent, market) {
  const t = i18n(market);
  return intent === 'comparatif' ? t.slugComparisons
    : intent === 'avis' ? t.slugReviews
    : t.slugGuides;
}

/** Read the `intent` field from an .mdx frontmatter (cheap regex — avoids
 *  pulling YAML for this single-key lookup). */
function readIntent(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return 'guide';
  const im = m[1].match(/^intent:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  return im?.[1]?.trim() ?? 'guide';
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

/** Walk every `sites/<niche>/<market>/src/content/articles` dir. */
function* eachArticlesDir() {
  for (const niche of safeReaddir(SITES_DIR)) {
    const nichePath = join(SITES_DIR, niche);
    if (!statSync(nichePath).isDirectory()) continue;
    for (const market of safeReaddir(nichePath)) {
      const articlesDir = join(nichePath, market, 'src/content/articles');
      if (!existsSync(articlesDir)) continue;
      yield { niche, market, articlesDir };
    }
  }
}

function safeReaddir(p) {
  try { return readdirSync(p); } catch { return []; }
}

function isAscii(s) {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s);
}

/** Per-site map { oldSlug → newSlug } produced when we rename a file. The
 *  values are slug-only (no path segment); the redirect emitter joins them
 *  with the intent segment derived from frontmatter. */
// key = `${niche}/${market}`, value = Map(oldSlug, { newSlug, intent })
const renames = new Map();

function recordRename(niche, market, oldSlug, newSlug, intent) {
  const key = `${niche}/${market}`;
  if (!renames.has(key)) renames.set(key, new Map());
  renames.get(key).set(oldSlug, { newSlug, intent });
}

let stats = { h1Stripped: 0, renamed: 0, articlesScanned: 0 };

for (const { niche, market, articlesDir } of eachArticlesDir()) {
  const files = readdirSync(articlesDir).filter(f => f.endsWith('.mdx'));
  for (const file of files) {
    stats.articlesScanned++;
    const oldSlug = file.replace(/\.mdx$/, '');
    let currentPath = join(articlesDir, file);

    // 1) Maybe rename to an ASCII slug.
    let newSlug = oldSlug;
    if (!isAscii(oldSlug)) {
      newSlug = asciiSlug(oldSlug);
      const newPath = join(articlesDir, `${newSlug}.mdx`);
      if (existsSync(newPath) && newPath !== currentPath) {
        // Collision: don't overwrite an existing ASCII article. Skip the
        // rename and log so the operator can resolve manually.
        console.warn(`[skip rename] ${niche}/${market}: ${file} → ${newSlug}.mdx already exists`);
        newSlug = oldSlug;
      } else {
        // Read the intent BEFORE renaming so the dry-run path (no rename
        // performed) and the real path both read from the same on-disk file.
        const intent = readIntent(readFileSync(currentPath, 'utf-8'));
        if (!DRY_RUN) {
          renameSync(currentPath, newPath);
          currentPath = newPath;
        }
        recordRename(niche, market, oldSlug, newSlug, intent);
        stats.renamed++;
        console.log(`  ↻ renamed ${niche}/${market}/${file} → ${newSlug}.mdx`);
      }
    }

    // 2) Maybe scrub the leading H1 from the body.
    const content = readFileSync(currentPath, 'utf-8');
    const { content: scrubbed, count } = scrubLeadingH1(content);
    if (count > 0) {
      if (!DRY_RUN) writeFileSync(currentPath, scrubbed);
      stats.h1Stripped++;
      console.log(`  ✂  stripped leading H1 in ${niche}/${market}/${currentPath.split('/').pop()}`);
    }
  }
}

// 3) Patch data/published-urls.json + data/semrush-priorities.json for the
//    renamed articles, then emit/extend `_redirects` per site.
if (renames.size > 0) {
  patchPublishedUrls();
  patchSemrushPriorities();
  emitRedirects();
}

console.log('');
console.log(`done — ${stats.articlesScanned} articles scanned · ${stats.h1Stripped} H1 stripped · ${stats.renamed} renamed${DRY_RUN ? ' (dry-run, no writes)' : ''}`);

// ─────────────────────────────────────────────────────────────────────────

function patchPublishedUrls() {
  const path = join(DATA_DIR, 'published-urls.json');
  if (!existsSync(path)) return;
  const entries = JSON.parse(readFileSync(path, 'utf-8'));
  let updates = 0;
  for (const entry of entries) {
    if (!entry.url) continue;
    const map = renames.get(`${entry.niche}/${entry.market}`);
    if (!map) continue;
    const newUrl = rewriteUrl(entry.url, map);
    if (newUrl !== entry.url) {
      entry.url = newUrl;
      updates++;
    }
  }
  if (updates > 0) {
    console.log(`  📋 published-urls.json: rewrote ${updates} URL${updates > 1 ? 's' : ''}`);
    if (!DRY_RUN) writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
  }
}

function patchSemrushPriorities() {
  const path = join(DATA_DIR, 'semrush-priorities.json');
  if (!existsSync(path)) return;
  const registry = JSON.parse(readFileSync(path, 'utf-8'));
  let updates = 0;
  for (const [niche, byMarket] of Object.entries(registry)) {
    for (const [market, opps] of Object.entries(byMarket)) {
      const map = renames.get(`${niche}/${market}`);
      if (!map) continue;
      for (const opp of opps) {
        for (const slot of Object.values(opp.bundle || {})) {
          if (slot?.url) {
            const newUrl = rewriteUrl(slot.url, map);
            if (newUrl !== slot.url) {
              slot.url = newUrl;
              updates++;
            }
          }
          // Slug field — strip "-N" dedupe suffix before matching, then
          // re-attach so a "tondeuse-à-gazon-1" slug becomes
          // "tondeuse-a-gazon-1".
          if (slot?.slug && !isAscii(slot.slug)) {
            const m = slot.slug.match(/^(.*?)(-\d+)?$/);
            const base = m?.[1] ?? slot.slug;
            const suffix = m?.[2] ?? '';
            const entry = map.get(base);
            const rewritten = entry ? entry.newSlug : asciiSlug(base);
            const newSlug = `${rewritten}${suffix}`;
            if (newSlug !== slot.slug) {
              slot.slug = newSlug;
              updates++;
            }
          }
        }
      }
    }
  }
  if (updates > 0) {
    console.log(`  📋 semrush-priorities.json: rewrote ${updates} field${updates > 1 ? 's' : ''}`);
    if (!DRY_RUN) writeFileSync(path, JSON.stringify(registry, null, 2) + '\n');
  }
}

/** Rewrite a URL whose last non-empty path segment matches a key in `map`.
 *  Only the slug segment is rewritten; the intent prefix (comparatifs/avis/
 *  guides/…) and trailing slash are preserved. */
function rewriteUrl(url, map) {
  try {
    const u = new URL(url);
    // WHATWG URL percent-encodes accented chars in `pathname`, so compare
    // against the decoded form when looking up the rename map.
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length === 0) return url;
    const lastIdx = parts.length - 1;
    const entry = map.get(parts[lastIdx]);
    if (!entry) return url;
    parts[lastIdx] = entry.newSlug;
    // Rebuild the URL with the (now ASCII) parts. Don't reassign pathname —
    // that would re-percent-encode anything already in the parts. Instead
    // serialise origin + new path directly.
    return `${u.origin}/${parts.join('/')}/${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/** Append 301 lines to each site's `public/_redirects`. Idempotent: lines
 *  whose source already exists in the file are skipped. */
function emitRedirects() {
  for (const [siteKey, map] of renames) {
    const [niche, market] = siteKey.split('/');
    const publicDir = resolve(SITES_DIR, niche, market, 'public');
    if (!DRY_RUN) mkdirSync(publicDir, { recursive: true });
    const redirectsPath = join(publicDir, '_redirects');

    const existing = existsSync(redirectsPath) ? readFileSync(redirectsPath, 'utf-8') : '';
    const existingSources = new Set(
      existing.split('\n')
        .map(l => l.trim().split(/\s+/)[0])
        .filter(Boolean)
    );

    const newLines = [];
    for (const [oldSlug, { newSlug, intent }] of map) {
      const segment = segmentFor(intent, market);
      const oldPath = `/${segment}/${oldSlug}/`;
      const newPath = `/${segment}/${newSlug}/`;
      if (existingSources.has(oldPath)) continue;
      newLines.push(`${oldPath}  ${newPath}  301`);
    }

    if (newLines.length === 0) continue;
    const header = existing.length === 0
      ? '# Cloudflare Pages redirect rules — generated by backfill-seo-fixes.js\n# Format: <from>  <to>  <status>\n\n'
      : (existing.endsWith('\n') ? '' : '\n');
    const out = existing + header + newLines.join('\n') + '\n';
    console.log(`  📝 ${publicDir.replace(REPO_ROOT + '/', '')}/_redirects: +${newLines.length} rule${newLines.length > 1 ? 's' : ''}`);
    if (!DRY_RUN) writeFileSync(redirectsPath, out);
  }
}
