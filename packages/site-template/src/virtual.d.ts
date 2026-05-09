declare module 'virtual:site-config' {
  /** The per-site config injected by astro.config.mjs (vite plugin
   *  `virtual-site-config`). Every site exports the same shape from its
   *  local site.config.js — kept loose here because it carries
   *  niche-specific keys like seedKeywords / topicTokens / theme. */
  interface SiteConfig {
    name: string;
    domain: string;
    niche: string;
    market: 'fr' | 'us' | 'gb';
    locale?: string;
    language?: string;
    currency?: string;
    location?: string;
    editorialReference?: string;
    shortDescription: string;
    longDescription?: string;
    heroTitle?: [string, string];
    heroBlurb?: string;
    keywords?: Record<string, unknown>;
    theme?: Record<string, string>;
    affiliatePrograms?: string[];
    [key: string]: unknown;
  }
  const siteConfig: SiteConfig;
  export default siteConfig;
}
