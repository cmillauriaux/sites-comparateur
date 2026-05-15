/**
 * ASCII-folding slug helper.
 *
 * github-slugger v2 preserves Unicode characters (incl. accented Latin), which
 * yields URLs like `/comparatifs/tondeuse-à-gazon/`. Once shared on social or
 * pasted into browser bars these get percent-encoded (`tondeuse-%C3%A0-gazon`),
 * which breaks copy-paste, complicates GSC reporting, and is generally a worse
 * SEO signal than a plain-ASCII slug. We pre-fold to ASCII before calling the
 * slugger so the output is always URL-safe.
 *
 * The behaviour is deliberately strict: combining diacritics are stripped, the
 * common Latin ligatures (œ/æ + capitals) are expanded, and everything else
 * falls back to github-slugger's defaults (lowercase, kebab-case, dedupe).
 *
 * Used everywhere a slug or article id is derived from free-text:
 *   - article-generator.js     (article slug from primary keyword)
 *   - bundle.js                (slot slugs + URL computation)
 *   - semrush-prioritize.js    (cluster id)
 *   - product-images.js        (image filename per product)
 *   - repair-products.js       (post-hoc product slug)
 */
import Slugger from 'github-slugger';

/** Fold a string to ASCII: strip combining diacritics + expand common
 *  Latin ligatures. Leaves all other characters untouched (github-slugger
 *  will drop anything non-alphanumeric anyway). */
export function deburr(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/ß/g, 'ss');
}

/** One-shot ASCII slug. Resets the internal slugger state on each call so
 *  duplicates across distinct calls don't get spurious `-1` suffixes — use
 *  `createAsciiSlugger()` instead when you need dedupe across a batch. */
export function asciiSlug(text) {
  const s = new Slugger();
  return s.slug(deburr(text));
}

/** Stateful slugger with ASCII folding. Mirrors the github-slugger API
 *  (`slug(text)` + `reset()`) but pre-deburrs every input. Use this when you
 *  want the dedupe behaviour (e.g. a list of products in the same article). */
export function createAsciiSlugger() {
  const s = new Slugger();
  return {
    slug: (text) => s.slug(deburr(text)),
    reset: () => s.reset(),
  };
}
