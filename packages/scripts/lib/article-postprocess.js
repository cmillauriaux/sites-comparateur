/**
 * Defensive post-write cleanup for generated articles.
 *
 * The prompts tell Claude not to do these things, but the model occasionally
 * does anyway. Scrubbing here keeps the build green and avoids 404 links on
 * the live site without forcing a full regeneration cycle.
 *
 *   scrubInlineSourceList: layout already renders <SourceList /> at the bottom
 *     of every article; an inline copy would render twice.
 *
 *   stripBrokenInternalLinks: any markdown link [text](URL) targeting this
 *     site's domain (absolute or path-relative) must resolve to a URL that
 *     already exists in data/published-urls.json. Anything else is a model
 *     fabrication and gets stripped (link removed, anchor text preserved).
 */

/**
 * Strip the article's leading H1 (`# ...`) from the markdown body.
 *
 * The ArticleLayout already renders `<h1>{data.title}</h1>` once per page,
 * so any H1 the model wrote in the body produces a duplicate H1 — a
 * frequent SEO audit finding. We keep the prompt instructing the model
 * structurally ("start with a title…") but always strip the first H1 here
 * as a hard backstop. Subsequent H1s (rare, usually a model mistake) are
 * left alone — those signal a deeper structural issue worth surfacing.
 *
 * Operates on the body only (frontmatter is preserved verbatim). Blank
 * lines immediately following the stripped H1 are collapsed so the body
 * starts cleanly on the first paragraph.
 */
export function scrubLeadingH1(content) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  const head = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? fmMatch[2] : content;

  // Match the first markdown H1 that appears before any other ATX heading.
  // Leading blank lines are allowed; anything else (text, components) before
  // the H1 means the body doesn't start with an H1 and we leave it alone.
  const re = /^(\s*)#[ \t]+[^\n]+\n+/;
  if (!re.test(body)) return { content, count: 0 };

  const stripped = body.replace(re, (_, leading) => leading);
  return { content: head + stripped, count: 1 };
}

/** Remove every standalone or paired <SourceList /> tag from the body.
 *  Preserves frontmatter (YAML block) untouched.
 *  Returns { content, count } so the caller can log how many were stripped. */
export function scrubInlineSourceList(content) {
  // Match self-closing <SourceList ... /> and paired <SourceList ...>...</SourceList>.
  // Allow whitespace + attributes (legit cases shouldn't add attrs, but defensive).
  const selfClose = /<SourceList\b[^>]*\/>\s*/g;
  const paired    = /<SourceList\b[^>]*>[\s\S]*?<\/SourceList>\s*/g;

  let count = 0;
  let out = content.replace(selfClose, () => { count++; return ''; });
  out = out.replace(paired, () => { count++; return ''; });
  return { content: out, count };
}

/**
 * Strip every `import X from "...";?` line from the .mdx body.
 *
 * The site-template ships components to MDX articles via the dynamic page
 * route's `<Content components={...} />` prop — articles must NOT declare
 * their own imports. When Claude writes one anyway (recurring lapse on
 * guide articles), Astro tries to resolve it as a relative path from the
 * article location, which fails because the components live in a
 * different workspace package (`@comparateur/site-template`). The build
 * 500s before ever rendering. Strip preemptively.
 *
 * Frontmatter (the YAML block bounded by `---`) is left untouched.
 * Lines must start with `import` (ESM style) — `require(...)` calls,
 * inline `import()` expressions, and prose mentioning the word are kept.
 */
export function scrubMdxImports(content) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  const head = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? fmMatch[2] : content;

  let count = 0;
  // Match a real ESM import line — `import X from "...";?` or
  // `import { X, Y } from "...";?` or `import * as X from "...";?`.
  // Anchored at the line start; the `from "<path>"` is mandatory so
  // English prose starting with the word "import" is left alone.
  const re = /^[ \t]*import\b[^\n]*?\s+from\s+(?:"[^"]+"|'[^']+')\s*;?[ \t]*\r?\n/gm;
  const cleaned = body.replace(re, () => { count++; return ''; });
  return { content: head + cleaned, count };
}

/**
 * Validate every internal markdown link in the body and strip any that
 * points to a URL not in `existingUrls`. The bracketed text is preserved
 * so the prose still reads naturally.
 *
 * Two link shapes are considered "internal":
 *  - absolute: https://<siteDomain>/path/   (the site's published URL)
 *  - relative: /path/                         (will resolve against siteOrigin)
 *
 * External links (other domains) are left alone — out of scope for this
 * check. Frontmatter is also skipped (its `sources:` block contains URLs
 * but they're meant to be external).
 *
 * @param {string} content
 * @param {object} opts
 * @param {Set<string>} opts.existingUrls       Set of full URLs (with trailing slash)
 *                                              that have been published for this site.
 * @param {string} opts.siteOrigin              "https://jardinguide.fr" (no trailing /)
 * @returns {{ content: string, count: number, removed: Array<{anchor: string, url: string}> }}
 */
export function stripBrokenInternalLinks(content, { existingUrls, siteOrigin }) {
  // Split frontmatter (---\n...\n---\n) so we only operate on the body.
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  const head = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? fmMatch[2] : content;

  const originHost = new URL(siteOrigin).host;
  const removed = [];
  // Markdown link: [anchor](url). The "anchor" supports nested brackets via [^\]]*.
  // The url is up to the first whitespace or closing paren.
  const newBody = body.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (full, anchor, url) => {
    const normalised = normaliseInternalUrl(url, originHost, siteOrigin);
    if (!normalised) return full;                         // external link — leave it
    if (existingUrls.has(normalised)) return full;        // exists — keep
    removed.push({ anchor, url });
    return anchor;                                        // strip the link, keep the text
  });
  return { content: head + newBody, count: removed.length, removed };
}

/** Turn an internal link into a canonical full URL with trailing slash.
 *  Returns null when the URL is external (different host) or not an http(s) URL. */
function normaliseInternalUrl(rawUrl, originHost, siteOrigin) {
  // Path-relative: starts with "/" but not "//" (which is protocol-relative).
  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    const full = `${siteOrigin.replace(/\/$/, '')}${ensureTrailingSlash(rawUrl)}`;
    return full;
  }
  // Anchor or fragment-only or query — not an internal page link, skip.
  if (rawUrl.startsWith('#') || rawUrl.startsWith('?')) return null;
  // Absolute URL: must match the site's origin host.
  try {
    const u = new URL(rawUrl);
    if (u.host !== originHost) return null;
    return `${u.origin}${ensureTrailingSlash(u.pathname)}`;
  } catch {
    return null;   // mailto:, tel:, malformed — out of scope
  }
}

function ensureTrailingSlash(path) {
  const noFragment = path.split('#')[0].split('?')[0];
  return noFragment.endsWith('/') ? noFragment : `${noFragment}/`;
}
