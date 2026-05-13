/**
 * Post-process step: insert 1-2 Pexels/Pixabay photos at H2 boundaries in
 * long articles to break visual monotony. Hero image is the only photo
 * pre-existing; everything else is text + product cards. For 1500+ word
 * pieces that reads as a wall.
 *
 * Insertion strategy:
 *   - Skip if body word count < 1400 (short articles don't need it).
 *   - Skip if fewer than 5 H2 sections (not enough breathing room).
 *   - 1400-2199 words → 1 image at ~midpoint H2.
 *   - 2200+ words → 2 images at ~1/3 and ~2/3 H2 positions.
 *   - Image is placed JUST BEFORE the chosen H2 so it acts as a section break.
 *
 * Query derivation per image: take the H2 heading text, feed it through the
 * same brand-stripping + FR→EN categorical cascade as the hero, fall back to
 * the article keyword. We REUSE hero-image.js's buildQueries so the same
 * vocabulary handling applies (Pexels coverage is the same constraint).
 *
 * Photo deduplication: each image carries a Pexels/Pixabay `id`. The hero's
 * id is read from its sidecar; inline picks track their own ids in a Set so
 * a 2-image article doesn't ship the same photo twice. Across articles we
 * don't deduplicate — the cost of an occasional photo reuse across
 * unrelated keywords is not worth the bookkeeping.
 */
import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SITES_DIR } from './env.js';
import { searchPexels, searchPixabay, stripBrandsAndNormalize, categoricalEnQuery } from './hero-image.js';
import { IMAGE_QUERIES } from '@comparateur/config/images';

const MIN_WORDS_FOR_1 = 1400;
const MIN_WORDS_FOR_2 = 2200;
const MIN_H2_COUNT    = 5;

function countBodyWords(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  const stripped = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[A-Z][\s\S]*?\/>/g, ' ')
    .replace(/<[A-Z][\s\S]*?>[\s\S]*?<\/[A-Z][\w]*>/g, ' ');
  return stripped.split(/\s+/).filter(Boolean).length;
}

function findH2Positions(content) {
  const fmEnd = (content.match(/^---\n[\s\S]*?\n---\n/)?.[0].length) ?? 0;
  const positions = [];
  const re = /^## (.+)$/gm;
  re.lastIndex = fmEnd;
  let m;
  while ((m = re.exec(content)) !== null) {
    positions.push({ index: m.index, text: m[1].trim() });
  }
  return positions;
}

// Boilerplate H2 sections that should not anchor inline images — they're
// short, structural, and an image between them lands awkwardly at the very
// end of the article.
const SKIP_H2_PATTERNS = [
  /^(notre )?verdict\b/i,
  /^conclusion\b/i,
  /^(notre )?méthode\b/i, /^méthodologie\b/i,
  /^sources?\b/i,
  /^foire aux questions\b/i, /^faq\b/i, /^questions?\b/i,
  /^en résumé\b/i, /^résumé\b/i,
  /^à retenir\b/i,
];

function pickSpaced(positions, count) {
  const editorial = positions.filter(p => !SKIP_H2_PATTERNS.some(re => re.test(p.text)));
  const pool = editorial.length >= count + 1 ? editorial : positions;
  if (pool.length === 0) return [];

  const candidates = pool.slice(1);
  if (candidates.length === 0) return [];

  if (count === 1) {
    return [candidates[Math.floor(candidates.length / 2)]];
  }
  const a = candidates[Math.floor(candidates.length * 1 / 3)];
  const b = candidates[Math.floor(candidates.length * 2 / 3)];
  return a && b && a.index !== b.index ? [a, b] : [a].filter(Boolean);
}

async function downloadImage(url, outputPath) {
  if (existsSync(outputPath)) return true;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(outputPath));
  return true;
}

function readFrontmatterValues(content, keys) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = m[1];
  const out = {};
  for (const k of keys) {
    const line = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
    if (line) out[k] = line[1].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function readHeroPhotoId({ niche, market, articleSlug }) {
  const sidecar = resolve(SITES_DIR, niche, market, 'public/images/heroes', `${articleSlug}.json`);
  if (!existsSync(sidecar)) return null;
  try {
    const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
    return meta.photoId ?? null;
  } catch { return null; }
}

/**
 * @param {object} opts
 * @param {string} opts.niche
 * @param {'fr'|'us'|'gb'} opts.market
 * @param {string} opts.articleSlug
 * @param {string} opts.content
 * @param {string} opts.keyword
 * @param {boolean} [opts.verbose]
 * @returns {{ content: string, count: number }}
 */
export async function injectInlineImages({ niche, market, articleSlug, content, keyword, verbose = true }) {
  const words = countBodyWords(content);
  if (words < MIN_WORDS_FOR_1) return { content, count: 0 };

  const allH2 = findH2Positions(content);
  if (allH2.length < MIN_H2_COUNT) return { content, count: 0 };

  const target = words >= MIN_WORDS_FOR_2 ? 2 : 1;
  const picks = pickSpaced(allH2, target);
  if (picks.length === 0) return { content, count: 0 };

  const excludeIds = new Set();
  const heroId = readHeroPhotoId({ niche, market, articleSlug });
  if (heroId != null) excludeIds.add(heroId);

  const dir = resolve(SITES_DIR, niche, market, 'public/images/inline', articleSlug);
  mkdirSync(dir, { recursive: true });

  // Query strategy for inline images is stricter than the hero. We ONLY use
  // queries that resolved through the FR→EN categorical dictionary OR fall
  // back to the niche-level pool. We never use the raw normalized keyword
  // because for avis articles the keyword becomes "e6 avis" after brand
  // stripping — which returns random Pexels results.
  //
  // Scan TARGETS are limited to high-signal text: keyword + frontmatter
  // title/description + H2 titles. We deliberately EXCLUDE the body — an
  // incidental "tuyau" (milk wand mention in a coffee article) used to
  // override the article's actual topic via the FR→EN dictionary.
  const fm = readFrontmatterValues(content, ['title', 'description']);
  const scanTargets = [
    stripBrandsAndNormalize(keyword),
    stripBrandsAndNormalize(fm.title ?? ''),
    stripBrandsAndNormalize(fm.description ?? ''),
    ...allH2.map(h => stripBrandsAndNormalize(h.text)),
  ];
  const queries = [];
  for (const t of scanTargets) {
    const q = categoricalEnQuery(t);
    if (q && !queries.includes(q)) queries.push(q);
    if (queries.length >= 2) break;
  }
  for (const f of (IMAGE_QUERIES[niche]?.hero ?? [])) {
    if (!queries.includes(f)) queries.push(f);
  }

  const insertions = [];
  for (let i = 0; i < picks.length; i++) {
    const h2 = picks[i];

    let match = null;
    let matchedQuery = null;
    for (const q of queries) {
      match = await searchPexels(q, { excludeIds });
      if (!match) match = await searchPixabay(q, { excludeIds });
      if (match?.url) { matchedQuery = q; break; }
    }
    if (!match?.url) {
      if (verbose) console.warn(`    ⚠️  no inline image for H2 "${h2.text.slice(0, 40)}" — skipping`);
      continue;
    }

    const localPath = join(dir, `${i + 1}.jpg`);
    const publicPath = `/images/inline/${articleSlug}/${i + 1}.jpg`;
    try {
      await downloadImage(match.url, localPath);
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  inline download failed for "${matchedQuery}": ${err.message}`);
      continue;
    }
    if (match.id != null) excludeIds.add(match.id);

    const alt = (match.alt || h2.text || keyword).replace(/"/g, '');
    const markdown = `![${alt}](${publicPath})\n\n`;
    insertions.push({ index: h2.index, markdown });
    if (verbose) console.log(`    🖼  inline #${i + 1}: ${publicPath} (query="${matchedQuery}", source=${match.source})`);
  }

  if (insertions.length === 0) return { content, count: 0 };

  insertions.sort((a, b) => b.index - a.index);
  let out = content;
  for (const { index, markdown } of insertions) {
    out = out.slice(0, index) + markdown + out.slice(index);
  }
  return { content: out, count: insertions.length };
}
