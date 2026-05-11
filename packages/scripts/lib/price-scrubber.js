/**
 * Strip raw prices from the article BODY (prose only, never component
 * attributes) before validation runs.
 *
 * Why this exists: the prompt explicitly forbids absolute prices in body text
 * because they go stale fast (Amazon prices fluctuate hourly). The pipeline
 * injects live prices into <ProductCard> / <ComparisonTable> components, so
 * prose mentions are pure drift. Empirically, the model leaks "X €" once or
 * twice per article despite the instruction. Rejecting the article wastes the
 * Claude credits we just spent; this scrubber surgically removes the leak so
 * the article can ship.
 *
 * Targets:
 *   - "X €" / "$ X" / "X £" with optional thousands separators ("1 200 €")
 *   - Optional preceding price-clause prepositions ("à", "de", "environ",
 *     "coûte", "à partir de", "jusqu'à", "~", "≈") so we eat the WHOLE clause
 *     instead of leaving "à ." remnants behind.
 *
 * Strictly preserves:
 *   - YAML frontmatter (first --- block)
 *   - Anything inside Astro/JSX components <Component .../> (matches the
 *     same regex as the validator — same boundaries, no drift between them)
 */

// Match a price token. Two shapes:
//   "50 €", "1 200 €", "1.200 €", "1,200.50 €"
//   "$ 50", "£50"
const PRICE_TOKEN = String.raw`(?:[€$£]\s*\d[\d ,.]*|\d[\d ,.]*\s*[€$£])`;

// Optional preceding clause that should be eaten with the price.
// `de` is a very common French word, but inside this regex it's only consumed
// when followed by a price (the trailing PRICE_TOKEN gates the whole match),
// so "ergonomie de la machine" is safe.
const PRICE_PREFIX = String.raw`(?:à\s+|de\s+|environ\s+|autour\s+de\s+|à\s+partir\s+de\s+|jusqu'à\s+|approximativement\s+|coûte\s+|coûtent\s+|coute\s+|coutent\s+|coûter\s+|~\s*|≈\s*)`;

// Range form: "50 € à 100 €" / "50€ - 100€" / "50€ et 100€"
const PRICE_RANGE_TAIL = String.raw`(?:\s*(?:à|et|-)\s*${PRICE_TOKEN})?`;

const PRICE_CLAUSE_RE = new RegExp(
  String.raw`\s*${PRICE_PREFIX}?${PRICE_TOKEN}${PRICE_RANGE_TAIL}\.?`,
  'gi',
);

// Match Astro/JSX-style component tags. Same shape as article-validator.js so
// the two stay in lockstep on what counts as "prose".
const JSX_TAG_RE = /<[A-Z][\s\S]*?\/?>/g;

/**
 * @param {string} content Full .mdx content (frontmatter + body).
 * @returns {{ content: string, count: number }}
 */
export function scrubRawPrices(content) {
  const m = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!m) return { content, count: 0 };
  const [, frontmatter, body] = m;

  // Walk the body, alternating between text and JSX-tag segments. We only
  // scrub the text segments — component attributes legitimately carry prices
  // injected by the pipeline.
  const tagMatches = [...body.matchAll(JSX_TAG_RE)];
  const segments = [];
  let lastEnd = 0;
  for (const tagMatch of tagMatches) {
    if (tagMatch.index > lastEnd) {
      segments.push({ type: 'text', text: body.slice(lastEnd, tagMatch.index) });
    }
    segments.push({ type: 'tag', text: tagMatch[0] });
    lastEnd = tagMatch.index + tagMatch[0].length;
  }
  if (lastEnd < body.length) {
    segments.push({ type: 'text', text: body.slice(lastEnd) });
  }

  let count = 0;
  for (const seg of segments) {
    if (seg.type !== 'text') continue;
    const matches = seg.text.match(PRICE_CLAUSE_RE);
    if (!matches) continue;
    count += matches.length;
    seg.text = seg.text
      .replace(PRICE_CLAUSE_RE, '')
      // Tidy up the cosmetic damage from the strip.
      .replace(/[ \t]{2,}/g, ' ')           // collapse double spaces
      .replace(/\s+([,.;:!?])/g, '$1')      // orphan space before punctuation
      .replace(/\(\s*\)/g, '')              // empty parens "()"
      .replace(/\(\s*([,.;])/g, '($1')      // orphan punct inside parens
      .replace(/^\s+\./gm, '.');            // leading whitespace before period
  }

  return {
    content: frontmatter + segments.map(s => s.text).join(''),
    count,
  };
}
