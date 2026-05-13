/**
 * Refresh the `bundleSiblings` frontmatter field on every already-shipped
 * slot of a bundle so the "Articles liés" block in the layout shows the
 * EDITORIAL title each article was actually published with (proper
 * accents, capitalisation, correct article — "une machine à café"), not
 * the lowercase Semrush keyword stored in opp.bundle.<slot>.keyword
 * ("machine a cafe a grain professionnelle").
 *
 * Slug is resolved from bundle.<slot>.url (last path segment) — the only
 * authoritative source. opp.bundle.<slot>.slug can drift when github-
 * slugger appended `-1` for a collision that never landed on disk.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { SITES_DIR } from './env.js';

function readArticleTitle(mdxPath) {
  if (!existsSync(mdxPath)) return null;
  try {
    const content = readFileSync(mdxPath, 'utf-8');
    const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const line = fm.match(/^title:\s*(.+)$/m)?.[1] ?? '';
    return line.trim().replace(/^["']|["']$/g, '') || null;
  } catch { return null; }
}

function prettifyKeyword(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const urlSlug = (url) => url?.match(/\/([^/]+)\/?$/)?.[1] ?? null;

/** Parse the YAML frontmatter as a real document, set/overwrite the
 *  `bundleSiblings` field, serialize back. Using js-yaml (via the `yaml`
 *  package) avoids the duplicated-key bug that a naive regex-based
 *  rewrite produced — the regex couldn't reliably anchor "from the
 *  field line to the start of the next field" across single-line vs
 *  multi-line values. YAML uses `lineWidth: 0` so long inline arrays
 *  aren't folded into a block scalar that would break compact display. */
function setFrontmatterField(content, field, value) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return content;
  const [, fmText, body] = fmMatch;

  let fm;
  // uniqueKeys: false tolerates pre-existing duplicate keys (e.g. left over
  // from an earlier buggy rewrite that appended instead of replacing).
  // js-yaml takes the last value when keys collide, so this is also the
  // path that COLLAPSES the duplicates on the next write.
  try { fm = YAML.parse(fmText, { uniqueKeys: false }) ?? {}; } catch { return content; }
  fm[field] = value;
  const newFmText = YAML.stringify(fm, { lineWidth: 0 }).trimEnd();
  return `---\n${newFmText}\n---\n${body}`;
}

/**
 * @param {{ niche: string, market: 'fr'|'us'|'gb' }} siteConfig
 * @param {object} opp   priorities entry with .bundle
 */
export function refreshBundleSiblings(siteConfig, opp) {
  if (!opp?.bundle) return { patched: [] };
  const { niche, market } = siteConfig;
  const articlesDir = resolve(SITES_DIR, niche, market, 'src/content/articles');

  const generated = [];
  for (const slot of ['comparatif', 'pillar', 'avis']) {
    const s = opp.bundle[slot];
    if (s?.status !== 'generated' || !s.url || !s.keyword) continue;
    const fileSlug = urlSlug(s.url) || s.slug;
    if (!fileSlug) continue;
    const mdxPath = `${articlesDir}/${fileSlug}.mdx`;
    const title = readArticleTitle(mdxPath) || prettifyKeyword(s.keyword);
    generated.push({ slot, title, url: s.url, slug: fileSlug, mdxPath });
  }
  if (generated.length === 0) return { patched: [] };

  const patched = [];
  for (const target of generated) {
    if (!existsSync(target.mdxPath)) continue;
    const siblings = generated
      .filter(g => g.slug !== target.slug)
      .map(({ slot, title, url }) => ({ slot, title, url }));
    try {
      const original = readFileSync(target.mdxPath, 'utf-8');
      const updated = setFrontmatterField(original, 'bundleSiblings', siblings);
      if (updated !== original) {
        writeFileSync(target.mdxPath, updated);
        patched.push(`${target.slot}/${target.slug}`);
      }
    } catch (err) {
      console.warn(`  ⚠️  refreshBundleSiblings(${target.slug}): ${err.message}`);
    }
  }
  return { patched };
}
