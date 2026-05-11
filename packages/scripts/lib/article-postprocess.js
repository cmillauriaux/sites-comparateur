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
