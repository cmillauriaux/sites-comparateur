import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import siteConfig from 'virtual:site-config';
import { i18n } from '@comparateur/config';

// Mirror of article-generator.js#subdirByIntent so the RSS link slugs match
// the actual published URLs on every marketplace (FR uses comparatifs/avis,
// US/GB use comparisons/reviews).
const s = i18n(siteConfig.market);
const subdirByIntent: Record<string, string> = {
  comparatif:    s.slugComparisons,
  avis:          s.slugReviews,
  guide:         s.slugGuides,
  informational: s.slugGuides,
};

export async function GET(context: { site: URL }) {
  const all = await getCollection('articles', ({ data }) => !data.draft);
  const sorted = all.sort((a, b) => +b.data.publishedAt - +a.data.publishedAt).slice(0, 30);
  const language = (siteConfig.locale ?? 'fr-FR').toLowerCase();

  return rss({
    title: siteConfig.name,
    description: siteConfig.shortDescription,
    site: context.site!,
    items: sorted.map((a) => ({
      title: a.data.title,
      pubDate: a.data.publishedAt,
      description: a.data.description,
      link: `/${subdirByIntent[a.data.intent] ?? s.slugGuides}/${a.id}/`,
    })),
    customData: `<language>${language}</language>`,
  });
}
