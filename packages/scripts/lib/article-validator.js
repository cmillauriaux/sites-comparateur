/**
 * Post-write validator for generated .mdx articles.
 *
 * Catches silent prompt drift: the model is told to insert ≥3 affiliate buttons
 * and never write raw prices in body text, but nothing previously enforced it.
 * Also catches silent product-image failures from the Amazon scrape: a comparatif
 * shipped with `image=""` on half the cards is a credibility cliff.
 * Returns a list of human-readable error strings; empty list = valid.
 */

const MIN_AFFILIATE_BUTTONS = 3;
const MIN_IMAGE_COVERAGE = 0.8;     // ≥80% of products must carry a resolved image
const MIN_PRODUCTS_FOR_GATE = 2;    // single-card pages skip the coverage check

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

  const coverage = computeImageCoverage(content);
  if (coverage.total >= MIN_PRODUCTS_FOR_GATE && coverage.ratio < MIN_IMAGE_COVERAGE) {
    const pct = Math.round(coverage.ratio * 100);
    errors.push(`image coverage ${pct}% (${coverage.withImage}/${coverage.total}), need ${Math.round(MIN_IMAGE_COVERAGE * 100)}%+`);
  }

  return errors;
}

/**
 * Count product references and how many carry a resolved image. Covers two
 * shapes:
 *   - <ProductCard ... image="/images/..." ... />      (or image="" / missing / "auto:...")
 *   - <ComparisonTable products={[ {name:"X", image:"/images/...", ...}, ... ]} />
 *
 * "Resolved" means the value is non-empty AND does not start with "auto:"
 * (the placeholder sentinel left when injectImagePaths couldn't find a
 * matching Amazon product).
 */
function computeImageCoverage(content) {
  let total = 0;
  let withImage = 0;

  // ProductCard: each self-closing tag counts as one product.
  for (const m of content.matchAll(/<ProductCard\b([\s\S]*?)\/>/g)) {
    total++;
    const body = m[1];
    const imgMatch = body.match(/\bimage\s*=\s*(["'])([^"']*)\1/);
    if (imgMatch && imgMatch[2] && !imgMatch[2].startsWith('auto:')) withImage++;
  }

  // ComparisonTable: parse the products={[...]} array; each `name: "..."`
  // entry is a product. Match a sibling `image: "..."` until the next entry.
  for (const tbl of content.matchAll(/<ComparisonTable\b[\s\S]*?products\s*=\s*\{\[([\s\S]*?)\]\}/g)) {
    const arr = tbl[1];
    const nameMatches = [...arr.matchAll(/\bname\s*:\s*(["'])([^"']+)\1/g)];
    for (let i = 0; i < nameMatches.length; i++) {
      total++;
      const start = nameMatches[i].index + nameMatches[i][0].length;
      const end = i + 1 < nameMatches.length ? nameMatches[i + 1].index : arr.length;
      const slice = arr.slice(start, end);
      const imgMatch = slice.match(/\bimage\s*:\s*(["'])([^"']*)\1/);
      if (imgMatch && imgMatch[2] && !imgMatch[2].startsWith('auto:')) withImage++;
    }
  }

  const ratio = total === 0 ? 1 : withImage / total;
  return { total, withImage, ratio };
}
