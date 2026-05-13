/**
 * Bundle cross-link retro-injection.
 *
 * The bundle ships in order comparatif → pillar guide → avis. When the
 * comparatif and pillar guide are written, the avis URL doesn't exist yet
 * — so the model can't link to it. This module patches the older articles
 * AFTER the avis ships so the reader can navigate from any bundle slot to
 * the others via body links (not just the sidebar).
 *
 * Three patches per avis-ship:
 *   1. Comparatif: callout right under the ProductCard for the reviewed
 *      product. "Notre test détaillé : [...]" pointing at the avis URL.
 *   2. Pillar guide: transition callout near the end of the body
 *      (between "Profils d'usage" and "FAQ" or before "En résumé").
 *
 * All injections are idempotent — a marker `<!-- avis-link:<slug> -->` is
 * embedded in the callout so a second pass skips already-patched files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITES_DIR } from './env.js';

/**
 * Returns an HTML-comment marker tag unique to this avis URL. Searched as a
 * substring in the existing content to make the injection idempotent.
 */
function avisMarker(avisUrl) {
  // URL is already unique per (niche, market, slug) — use it as the key.
  // MDX-style JSX comment (`{/* ... */}`) rather than HTML `<!-- -->`; MDX
  // refuses HTML comments inside paragraphs/blockquotes and the build trips
  // on them with "Unexpected character `!` before name".
  return `{/* avis-link:${avisUrl} */}`;
}

/** Strip any blockquote block containing the marker for `avisUrl`. Used
 *  before re-injecting so wording changes propagate instead of being
 *  blocked by an idempotency check. */
function stripExistingCallout(content, avisUrl) {
  // Match: optional whitespace, the marker line (HTML or JSX form — both
  // exist in articles repaired across the format change), the blockquote
  // block that follows, and trailing blank lines. Removed in one shot so
  // re-injection has clean spacing.
  const escapedUrl = avisUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const oldHtml = new RegExp(`\\n*<!--\\s*avis-link:${escapedUrl}\\s*-->\\n(?:>.*\\n)*\\n*`, 'g');
  const oldJsx  = new RegExp(`\\n*\\{/\\*\\s*avis-link:${escapedUrl}\\s*\\*/\\}\\n(?:>.*\\n)*\\n*`, 'g');
  // Legacy form where the marker was inside the blockquote itself.
  const legacy  = new RegExp(`\\n*(?:>.*\\n)*>[^\\n]*${escapedUrl}[^\\n]*\\n(?:>.*\\n)*\\n*`, 'g');
  return content.replace(oldHtml, '\n\n').replace(oldJsx, '\n\n').replace(legacy, '\n\n');
}

/**
 * Inject a "Notre test détaillé" callout into the comparatif's body, right
 * after the <ProductCard ... /> whose `name="..."` matches `productName`.
 * Returns the new content. Strip-and-replace: an older callout (matched by
 * the avisUrl marker) is removed first so wording updates propagate.
 */
export function injectAvisCalloutInComparatif(content, { productName, avisUrl, market = 'fr' }) {
  if (!content || !productName || !avisUrl) return content;
  content = stripExistingCallout(content, avisUrl);
  const marker = avisMarker(avisUrl);

  // Escape regex specials in product name (e.g. "+" in "Black+Decker BDCDD12C").
  const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match a self-closing ProductCard whose name attr equals the product.
  const re = new RegExp(`(<ProductCard\\b[^>]*\\bname\\s*=\\s*"${escapedName}"[^>]*?/>)`);
  const m = content.match(re);
  if (!m) return content;

  const isFr = market === 'fr';
  const linkText = isFr
    ? `Lire notre test complet — ${productName}`
    : `Read our full review — ${productName}`;
  const calloutPrefix = isFr ? 'Notre test détaillé' : 'Our detailed review';
  // Marker sits on its own line ABOVE the blockquote — JSX comments render
  // to nothing, blockquote then opens cleanly.
  const callout = `\n\n${marker}\n> 📝 **${calloutPrefix}** : [${linkText}](${avisUrl})\n`;

  return content.replace(re, `$1${callout}`);
}

/**
 * Inject a transition callout into the pillar guide's body that points at
 * the newly-published avis. Placement (tried in order):
 *   1. Right before the "## FAQ" H2 (most natural — last editorial section
 *      before the FAQ block).
 *   2. Right before the "## En résumé" / "## Takeaway" H2.
 *   3. At the very end of the body (least preferred; only if neither H2
 *      exists).
 * Returns the new content. Idempotent.
 */
export function injectAvisCalloutInGuide(content, { productName, avisUrl, market = 'fr' }) {
  if (!content || !productName || !avisUrl) return content;
  content = stripExistingCallout(content, avisUrl);
  const marker = avisMarker(avisUrl);

  const isFr = market === 'fr';
  const linkLabel = isFr
    ? `Lire notre avis complet sur le ${productName}`
    : `Read our full review of the ${productName}`;
  const prefix = isFr ? '💡 **Notre test du modèle phare**' : '💡 **Our review of the standout pick**';
  const tail = isFr
    ? ' — utile pour comparer les notes par critère avant achat.'
    : ' — handy to compare per-criterion scores before buying.';
  const callout = `\n\n${marker}\n> ${prefix} : [${linkLabel}](${avisUrl})${tail}\n\n`;

  // Try to insert before "## FAQ" first.
  const beforeFaq = /\n(##\s+(?:FAQ|Foire aux questions|Questions))\b/i;
  if (beforeFaq.test(content)) {
    return content.replace(beforeFaq, `${callout}\n$1`);
  }
  // Fallback: before "## En résumé" / "## Takeaway".
  const beforeOutro = /\n(##\s+(?:En résumé|Résumé|Takeaway|Bottom line))\b/i;
  if (beforeOutro.test(content)) {
    return content.replace(beforeOutro, `${callout}\n$1`);
  }
  // Last-resort: append at end of body.
  return content.replace(/\s*$/, `\n${callout}`);
}

/**
 * Apply both retro-link injections (comparatif + guide) for one shipped
 * avis. The bundle holds the comparatif's slug and the avis's product name.
 *
 *  @param {object} siteConfig
 *  @param {object} bundle  the opp.bundle object (comparatif + pillar + avis)
 */
export function applyAvisRetroLinks(siteConfig, bundle) {
  if (!bundle) return { patched: [] };
  const { niche, market } = siteConfig;
  const articlesDir = resolve(SITES_DIR, niche, market, 'src/content/articles');

  const productName = bundle.comparatif?.topProductName;
  const avisUrl = bundle.avis?.url;
  if (!productName || !avisUrl) return { patched: [] };

  const patched = [];

  // Slug from URL last path segment — the authoritative source. The
  // bundle.<slot>.slug field was set at the time slugFromKeyword() ran and
  // can drift (e.g. when github-slugger appends `-1` for a duplicate that
  // never made it to disk). The URL last segment is what Astro actually
  // built and what GSC was told about, so resolve files from there.
  const urlSlug = (url) => {
    if (!url) return null;
    const m = url.match(/\/([^/]+)\/?$/);
    return m?.[1] ?? null;
  };

  // 1. Comparatif file.
  const compSlug = urlSlug(bundle.comparatif?.url) || bundle.comparatif?.slug;
  if (compSlug) {
    const compPath = `${articlesDir}/${compSlug}.mdx`;
    if (existsSync(compPath)) {
      try {
        const original = readFileSync(compPath, 'utf-8');
        const updated = injectAvisCalloutInComparatif(original, { productName, avisUrl, market });
        if (updated !== original) {
          writeFileSync(compPath, updated);
          patched.push(`comparatif/${compSlug}`);
        }
      } catch (err) {
        console.warn(`  ⚠️  injectAvisCalloutInComparatif(${compSlug}): ${err.message}`);
      }
    }
  }

  // 2. Pillar guide file.
  const pillarSlug = urlSlug(bundle.pillar?.url) || bundle.pillar?.slug;
  if (pillarSlug && bundle.pillar?.status === 'generated') {
    const pillarPath = `${articlesDir}/${pillarSlug}.mdx`;
    if (existsSync(pillarPath)) {
      try {
        const original = readFileSync(pillarPath, 'utf-8');
        const updated = injectAvisCalloutInGuide(original, { productName, avisUrl, market });
        if (updated !== original) {
          writeFileSync(pillarPath, updated);
          patched.push(`pillar/${pillarSlug}`);
        }
      } catch (err) {
        console.warn(`  ⚠️  injectAvisCalloutInGuide(${pillarSlug}): ${err.message}`);
      }
    }
  }

  return { patched };
}
