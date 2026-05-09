import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import pagefind from 'astro-pagefind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // TODO: replace once the .com domain is confirmed (must match site.config.js domain).
  site: 'https://TODO_US_DOMAIN',
  trailingSlash: 'always',
  build: { concurrency: 6 },

  prefetch: { defaultStrategy: 'viewport' },

  // Load .env from monorepo root so AMAZON_AFFILIATE_ID_* etc. are available
  // to component code (`import.meta.env.AMAZON_AFFILIATE_ID_FR`).
  vite: {
    plugins: [tailwindcss()],
    envDir: '../../../',
  },

  // Single-locale per build; multi-market = separate Astro builds per (niche, market).
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },

  image: {
    responsiveStyles: true,
    layout: 'constrained',
    service: {
      config: {
        jpeg: { mozjpeg: true },
        webp: { effort: 6, alphaQuality: 80 },
        avif: { effort: 4 },
      },
    },
    remotePatterns: [
      { protocol: 'https', hostname: '*.unsplash.com' },
      { protocol: 'https', hostname: '*.pexels.com' },
    ],
  },

  integrations: [
    sitemap(),
    mdx(),
    pagefind(),
    icon({
      include: { lucide: ['arrow-right', 'check', 'star', 'shopping-cart', 'external-link', 'menu', 'x', 'search', 'rss'] },
    }),
  ],
});
