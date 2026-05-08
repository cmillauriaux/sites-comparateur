import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import siteConfig from '../../site.config.js';

export async function GET(context: { site: URL }) {
  const all = await getCollection('articles', ({ data }) => !data.draft);
  const sorted = all.sort((a, b) => +b.data.publishedAt - +a.data.publishedAt).slice(0, 30);

  return rss({
    title: siteConfig.name,
    description: siteConfig.shortDescription,
    site: context.site!,
    items: sorted.map((a) => ({
      title: a.data.title,
      pubDate: a.data.publishedAt,
      description: a.data.description,
      link: `/${a.data.intent === 'comparatif' ? 'comparatifs' : a.data.intent === 'avis' ? 'avis' : 'guides'}/${a.id}/`,
    })),
    customData: '<language>fr-fr</language>',
  });
}
