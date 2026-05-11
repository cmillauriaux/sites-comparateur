import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import siteConfig from 'virtual:site-config';
import { i18n } from '@comparateur/config';

// /llms.txt — emerging standard (proposed by Jeremy Howard / answer.ai) for a
// curated markdown index of the site that LLM-based tools can consume to
// understand the site's structure and surface the most useful URLs without
// crawling everything. Format spec: https://llmstxt.org/
//
// Structure: H1 (site name) → blockquote summary → H2 sections per intent,
// each with a bulleted list of `[title](url): description` entries.

const s = i18n(siteConfig.market);
const subdirByIntent: Record<string, string> = {
  comparatif:    s.slugComparisons,
  avis:          s.slugReviews,
  guide:         s.slugGuides,
  informational: s.slugGuides,
};

type IntentKey = 'comparatif' | 'avis' | 'guide' | 'informational';

const sectionTitle: Record<IntentKey, string> = {
  comparatif:    s.navComparisons,
  avis:          s.navReviews,
  guide:         s.navGuides,
  informational: s.navGuides,
};

export const GET: APIRoute = async ({ site }) => {
  const base = site!.toString().replace(/\/$/, '');
  const all = await getCollection('articles', ({ data }) => !data.draft);
  const sorted = all.sort((a, b) => +b.data.publishedAt - +a.data.publishedAt);

  const byIntent: Record<string, typeof sorted> = {};
  for (const a of sorted) {
    const k = a.data.intent;
    (byIntent[k] ||= []).push(a);
  }

  const lines: string[] = [];
  lines.push(`# ${siteConfig.name}`);
  lines.push('');
  lines.push(`> ${siteConfig.longDescription ?? siteConfig.shortDescription ?? ''}`);
  lines.push('');

  // Stable order: comparatifs → avis → guides → informational
  const order: IntentKey[] = ['comparatif', 'avis', 'guide', 'informational'];
  const seen = new Set<string>();
  for (const intent of order) {
    const items = byIntent[intent];
    if (!items?.length) continue;
    const title = sectionTitle[intent];
    if (seen.has(title)) continue;
    seen.add(title);
    lines.push(`## ${title}`);
    lines.push('');
    for (const a of items) {
      const subdir = subdirByIntent[a.data.intent] ?? s.slugGuides;
      const url = `${base}/${subdir}/${a.id}/`;
      const desc = (a.data.description ?? '').replace(/\s+/g, ' ').trim();
      lines.push(`- [${a.data.title}](${url})${desc ? `: ${desc}` : ''}`);
    }
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
