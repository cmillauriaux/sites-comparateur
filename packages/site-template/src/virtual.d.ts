declare module 'virtual:site-config' {
  /** Per-site visual identity. Drives the inline <style> CSS variables
   *  injected by SiteLayout and the SVG archetype rendered by Logo.astro.
   *  Varying these across (niche, market) breaks the shared-template
   *  fingerprint — see CLAUDE.md "Anti-spam AI". */
  interface SiteTheme {
    palette: {
      primary: string;
      primaryDark: string;
      accent: string;
      accentLight: string;
      heroBg: string;
      text: string;
      textMuted: string;
      border: string;
    };
    typography: {
      headingFont: string;     // family name, slug-cased for bunny.net fonts
      bodyFont: string;
      headingWeight: number;
      bodyWeight: number;
    };
    density: {
      radius: string;          // CSS length (e.g. '0.5rem')
      spacingScale: number;    // unitless multiplier
      contentMaxWidth: string; // CSS length (e.g. '72ch')
    };
    logo: {
      archetype: 'leaf' | 'bolt' | 'bowl' | 'mountain';
      primaryFill: string;
      accentFill: string;
    };
  }

  /** The per-site config injected by astro.config.mjs (vite plugin
   *  `virtual-site-config`). Every site exports the same shape from its
   *  local site.config.js — kept loose here because it carries
   *  niche-specific keys like seedKeywords / topicTokens. */
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
    theme?: SiteTheme;
    affiliatePrograms?: string[];
    [key: string]: unknown;
  }
  const siteConfig: SiteConfig;
  export default siteConfig;
}
