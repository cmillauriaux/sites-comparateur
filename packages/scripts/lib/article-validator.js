/**
 * Post-write validator for generated .mdx articles.
 *
 * Catches silent prompt drift: the model is told to insert ≥3 affiliate buttons
 * and never write raw prices in body text, but nothing previously enforced it.
 * Returns a list of human-readable error strings; empty list = valid.
 */

const MIN_AFFILIATE_BUTTONS = 3;

export function validateGeneratedArticle(content) {
  const errors = [];

  if (!content.startsWith('---')) {
    errors.push('missing YAML frontmatter');
  }

  const affiliateButtons = (content.match(/<AffiliateButton\b/g) || []).length;
  if (affiliateButtons < MIN_AFFILIATE_BUTTONS) {
    errors.push(`only ${affiliateButtons} <AffiliateButton>, need ${MIN_AFFILIATE_BUTTONS}+`);
  }

  // Strip frontmatter then strip every Astro/JSX-style component tag, then
  // search the remaining prose for currency-anchored numbers. Components are
  // stripped because legitimate price="..." attributes inside <ProductCard>
  // and <ComparisonTable> are injected by the pipeline (and contain € / $ /
  // £); only PROSE prices count as drift.
  const body = content
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/<[A-Z][\s\S]*?\/?>/g, '');
  const priceMatches = body.match(/(?:[€$£]\s*\d|\d[\d ,.]*\s*[€$£])/g);
  if (priceMatches && priceMatches.length > 0) {
    errors.push(`raw price in body: ${priceMatches.slice(0, 3).join(', ')}`);
  }

  return errors;
}
