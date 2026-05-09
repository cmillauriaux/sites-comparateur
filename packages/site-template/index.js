import { fileURLToPath } from 'node:url';

/** Absolute filesystem path to the shared Astro src/ directory. Each
 *  per-(niche, market) site sets `srcDir` to this so they all consume the
 *  same components, layouts, pages, and content.config.ts. */
export const SITE_TEMPLATE_SRC = fileURLToPath(new URL('./src/', import.meta.url));
