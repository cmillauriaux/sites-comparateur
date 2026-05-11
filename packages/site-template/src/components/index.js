// Barrel for MDX-style imports. The dynamic page route already injects these
// components via <Content components={...} /> so .mdx imports are technically
// redundant — but the Claude generator sometimes writes defensive imports at
// the top of articles, and we'd rather have them resolve than fail the build.
export { default as AffiliateButton }    from './AffiliateButton.astro';
export { default as AffiliateDisclosure } from './AffiliateDisclosure.astro';
export { default as ArticleCard }         from './ArticleCard.astro';
export { default as AuthorBio }           from './AuthorBio.astro';
export { default as ComparisonTable }     from './ComparisonTable.astro';
export { default as Footer }              from './Footer.astro';
export { default as Header }              from './Header.astro';
export { default as ProductCard }         from './ProductCard.astro';
export { default as ScoreBadge }          from './ScoreBadge.astro';
export { default as SourceList }          from './SourceList.astro';
