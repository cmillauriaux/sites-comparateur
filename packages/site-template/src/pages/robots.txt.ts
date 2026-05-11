import type { APIRoute } from 'astro';

// AI / LLM crawlers we explicitly welcome. The `User-agent: *` block already
// allows everything, so these explicit entries are redundant *for behaviour*
// — but they serve as a clear documentation signal to crawler operators and
// to anyone auditing the site that AI indexing is intentional, not accidental.
const AI_CRAWLERS = [
  'GPTBot',              // OpenAI training
  'ChatGPT-User',        // OpenAI live retrieval (when a user asks ChatGPT to browse)
  'OAI-SearchBot',       // OpenAI search index
  'ClaudeBot',           // Anthropic training
  'Claude-User',         // Anthropic live retrieval
  'Claude-SearchBot',    // Anthropic search index
  'anthropic-ai',        // legacy Anthropic UA
  'PerplexityBot',       // Perplexity index
  'Perplexity-User',     // Perplexity live retrieval
  'Google-Extended',     // Google AI training (Gemini, AI Overviews)
  'Applebot-Extended',   // Apple Intelligence training
  'Bingbot',             // Bing + Copilot
  'DuckAssistBot',       // DuckDuckGo AI
  'meta-externalagent',  // Meta AI
  'CCBot',               // Common Crawl (feeds many LLMs)
  'Bytespider',          // ByteDance (TikTok / Doubao)
  'Diffbot',             // Diffbot Knowledge Graph
];

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = new URL('sitemap-index.xml', site).toString();
  const llmsUrl = new URL('llms.txt', site).toString();
  const aiBlocks = AI_CRAWLERS.map((ua) => `User-agent: ${ua}\nAllow: /`).join('\n\n');
  const body =
    `# AI / LLM crawlers are welcome — see ${llmsUrl} for a curated index.\n\n` +
    `User-agent: *\nAllow: /\n\n` +
    `${aiBlocks}\n\n` +
    `Sitemap: ${sitemapUrl}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
