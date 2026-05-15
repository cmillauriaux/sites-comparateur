#!/usr/bin/env node
/**
 * Standalone editorial review runner — called from GitHub Actions as a named
 * step so review results are visible in the CI log with proper annotations.
 *
 * Also usable locally for batch audits:
 *   node packages/scripts/review-articles.js --niche jardin-bricolage --market fr --all
 *   node packages/scripts/review-articles.js --niche jardin-bricolage --market fr --new
 *   node packages/scripts/review-articles.js --niche jardin-bricolage --market fr --slug husqvarna-automower-310-mark-ii-avis
 *
 * Flags:
 *   --niche <niche>    Target niche (required)
 *   --market <market>  Target market (required)
 *   --all              Review all articles in the site's content dir
 *   --new              Review only articles new/modified in the working tree
 *                      (git status --porcelain — works in CI clean checkouts)
 *   --slug <slug>      Review a single article by slug
 *   --fix              Delete KO articles and revert their state in
 *                      semrush-priorities.json + published-urls.json
 *   --fail-on-warn     Exit 1 on WARN too (not just KO)
 *
 * GitHub Actions annotations are always emitted when running inside CI
 * (GITHUB_ACTIONS=true). Locally they're suppressed by default.
 *
 * Exit codes:
 *   0  all articles OK (or WARN, unless --fail-on-warn)
 *   1  at least one KO (or WARN with --fail-on-warn)
 *   2  bad usage / missing args
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

import { REPO_ROOT, SITES_DIR, DATA_DIR } from './lib/env.js';
import { reviewArticles } from './lib/editorial-reviewer.js';

const isCI = process.env.GITHUB_ACTIONS === 'true';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { niche: null, market: null, mode: null, slug: null, fix: false, failOnWarn: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--niche':       args.niche = argv[++i]; break;
      case '--market':      args.market = argv[++i]; break;
      case '--all':         args.mode = 'all'; break;
      case '--new':         args.mode = 'new'; break;
      case '--slug':        args.mode = 'slug'; args.slug = argv[++i]; break;
      case '--fix':         args.fix = true; break;
      case '--fail-on-warn': args.failOnWarn = true; break;
    }
  }
  return args;
}

// ─── File discovery ───────────────────────────────────────────────────────────

function allArticlePaths(niche, market) {
  const dir = resolve(SITES_DIR, niche, market, 'src/content/articles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    .map(f => join(dir, f));
}

function newArticlePaths(niche, market) {
  // Use `git status --porcelain=v1 -z` to find untracked/modified .mdx files.
  // In a fresh CI checkout this returns only the files generated in this run.
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: REPO_ROOT, encoding: 'utf-8',
  });
  if (result.status !== 0) return allArticlePaths(niche, market);

  const prefix = `sites/${niche}/${market}/src/content/articles/`;
  const paths = result.stdout
    .split('\0')
    .filter(Boolean)
    .map(r => r.length > 3 ? r.slice(3) : '')
    .filter(p => p.startsWith(prefix) && (p.endsWith('.mdx') || p.endsWith('.md')))
    .map(p => resolve(REPO_ROOT, p));

  return paths;
}

function slugPath(niche, market, slug) {
  const dir = resolve(SITES_DIR, niche, market, 'src/content/articles');
  for (const ext of ['.mdx', '.md']) {
    const p = join(dir, slug + ext);
    if (existsSync(p)) return [p];
  }
  return [];
}

// ─── State rollback (used by --fix) ──────────────────────────────────────────

const PRIORITIES_PATH = resolve(DATA_DIR, 'semrush-priorities.json');
const PUBLISHED_PATH = resolve(DATA_DIR, 'published-urls.json');

function revokeArticle(filePath, niche, market) {
  const slug = filePath.replace(/.*\/([^/]+)\.mdx?$/, '$1');

  // Delete the file
  try { unlinkSync(filePath); } catch { /* already gone */ }

  // Remove from published-urls.json
  if (existsSync(PUBLISHED_PATH)) {
    try {
      const all = JSON.parse(readFileSync(PUBLISHED_PATH, 'utf-8'));
      const kept = all.filter(e => !(e.niche === niche && e.market === market && e.url?.includes(slug)));
      if (kept.length !== all.length) {
        writeFileSync(PUBLISHED_PATH, JSON.stringify(kept, null, 2) + '\n');
      }
    } catch { /* non-fatal */ }
  }

  // Reset bundle slot in semrush-priorities.json
  if (existsSync(PRIORITIES_PATH)) {
    try {
      const reg = JSON.parse(readFileSync(PRIORITIES_PATH, 'utf-8'));
      let changed = false;
      for (const opp of reg?.[niche]?.[market] ?? []) {
        if (!opp.bundle) continue;
        for (const slotKey of ['comparatif', 'pillar', 'avis']) {
          const slot = opp.bundle[slotKey];
          if (slot?.slug === slug && slot?.status === 'shipped') {
            slot.status = 'failed';
            slot.lastError = 'editorial-review-ko';
            changed = true;
          }
        }
      }
      if (changed) writeFileSync(PRIORITIES_PATH, JSON.stringify(reg, null, 2) + '\n');
    } catch { /* non-fatal */ }
  }
}

// ─── CI annotations ───────────────────────────────────────────────────────────

function annotate(level, filePath, message) {
  if (!isCI) return;
  const shortPath = filePath.replace(REPO_ROOT + '/', '');
  // GitHub Actions workflow command format
  console.log(`::${level} file=${shortPath}::${message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.niche || !args.market) {
    console.error('Usage: review-articles.js --niche <niche> --market <market> [--all|--new|--slug <slug>] [--fix] [--fail-on-warn]');
    process.exit(2);
  }
  if (!args.mode) {
    console.error('Specify one of: --all, --new, --slug <slug>');
    process.exit(2);
  }

  const { niche, market } = args;

  let paths;
  if (args.mode === 'all')       paths = allArticlePaths(niche, market);
  else if (args.mode === 'new')  paths = newArticlePaths(niche, market);
  else                           paths = slugPath(niche, market, args.slug);

  if (paths.length === 0) {
    console.log(`ℹ️  Aucun article à relire pour ${niche}/${market} (mode=${args.mode}).`);
    process.exit(0);
  }

  console.log(`\n📋 Relecture éditoriale — ${niche}/${market} — ${paths.length} article(s)\n`);

  const results = reviewArticles(paths);

  let hasKo = false;
  let hasWarn = false;

  for (const { filePath, slug, status, issues } of results) {
    const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️ ' : '❌';
    console.log(`  ${icon} [${status.toUpperCase()}] ${slug}`);

    for (const issue of issues) {
      const prefix = issue.level === 'ko' ? '     ❌' : '     ⚠️ ';
      console.log(`${prefix} [${issue.code}] ${issue.message}`);
      annotate(issue.level === 'ko' ? 'error' : 'warning', filePath, `[${issue.code}] ${issue.message}`);
    }

    if (status === 'ko') {
      hasKo = true;
      if (args.fix) {
        revokeArticle(filePath, niche, market);
        console.log(`     🗑️  Article supprimé et état révoqué.`);
      }
    }
    if (status === 'warn') hasWarn = true;
  }

  // Summary
  const ko = results.filter(r => r.status === 'ko').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n📊 Résultat : ${ok} OK · ${warn} WARN · ${ko} KO (sur ${results.length})`);

  if (hasKo || (args.failOnWarn && hasWarn)) {
    if (hasKo && !args.fix) {
      console.log('\n💡 Re-run with --fix to delete KO articles and revert their state.');
    }
    process.exit(1);
  }
}

main();
