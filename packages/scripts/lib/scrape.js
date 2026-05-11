import * as cheerio from 'cheerio';
import { fetchWithBrowser, closeBrowser } from './browser.js';

// Realistic browser UA — many retailers WAF-block obvious bots, even when polite.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const TIMEOUT_MS = 15_000;
const MIN_CONTENT_CHARS = 300;

const SEARCH_URLS = {
  // FR
  // /recherche/?query= returns HTTP 500 (deprecated endpoint?). /utils/recherche/?keyword=
  // is what the site's own search form posts to and returns 200.
  'www.quechoisir.org':       q => `https://www.quechoisir.org/utils/recherche/?keyword=${encodeURIComponent(q)}`,
  'www.lesnumeriques.com':    q => `https://www.lesnumeriques.com/recherche?q=${encodeURIComponent(q)}`,
  'www.60millions-mag.com':   q => `https://www.60millions-mag.com/recherche?search_text=${encodeURIComponent(q)}`,
  'www.darty.com':            q => `https://www.darty.com/nav/recherche/search?text=${encodeURIComponent(q)}`,
  'www.fnac.com':             q => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(q)}`,
  'www.amazon.fr':            q => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}`,
  'www.leroymerlin.fr':       q => `https://www.leroymerlin.fr/recherche?q=${encodeURIComponent(q)}`,
  'www.castorama.fr':         q => `https://www.castorama.fr/search?term=${encodeURIComponent(q)}`,
  'www.mr-bricolage.fr':      q => `https://www.mr-bricolage.fr/search?q=${encodeURIComponent(q)}`,
  'maniaques.fr':             q => `https://maniaques.fr/?s=${encodeURIComponent(q)}`,
  'www.decathlon.fr':         q => `https://www.decathlon.fr/search?Ntt=${encodeURIComponent(q)}`,
  'www.fitnessboutique.fr':   q => `https://www.fitnessboutique.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
  'www.go-sport.com':         q => `https://www.go-sport.com/search?q=${encodeURIComponent(q)}`,
  'www.sport2000.fr':         q => `https://www.sport2000.fr/recherche?q=${encodeURIComponent(q)}`,
  'www.fitnessdigital.fr':    q => `https://www.fitnessdigital.fr/search?text=${encodeURIComponent(q)}`,
  'www.cdiscount.com':        q => `https://www.cdiscount.com/search/10/${encodeURIComponent(q).replace(/%20/g, '+')}.html`,

  // US
  'www.amazon.com':           q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  'www.homedepot.com':        q => `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
  'www.lowes.com':            q => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`,
  'www.nytimes.com':          q => `https://www.nytimes.com/search?query=${encodeURIComponent(q)}&dropmab=true&types=wirecutter`,
  'www.consumerreports.org':  q => `https://www.consumerreports.org/cro/search.htm?searchTerm=${encodeURIComponent(q)}`,
  'www.popularmechanics.com': q => `https://www.popularmechanics.com/search/?q=${encodeURIComponent(q)}`,
  'www.familyhandyman.com':   q => `https://www.familyhandyman.com/?s=${encodeURIComponent(q)}`,
  'www.thespruce.com':        q => `https://www.thespruce.com/search?q=${encodeURIComponent(q)}`,

  // GB
  'www.amazon.co.uk':         q => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`,
  'www.which.co.uk':          q => `https://www.which.co.uk/search?q=${encodeURIComponent(q)}`,
  'www.trustedreviews.com':   q => `https://www.trustedreviews.com/?s=${encodeURIComponent(q)}`,
  'www.expertreviews.co.uk':  q => `https://www.expertreviews.co.uk/search?keywords=${encodeURIComponent(q)}`,
  'www.techradar.com':        q => `https://www.techradar.com/search?searchTerm=${encodeURIComponent(q)}`,
  'www.diy.com':              q => `https://www.diy.com/search?term=${encodeURIComponent(q)}`,
  'www.screwfix.com':         q => `https://www.screwfix.com/search?search=${encodeURIComponent(q)}`,
  'www.wickes.co.uk':         q => `https://www.wickes.co.uk/search?text=${encodeURIComponent(q)}`,
};

export function buildSearchUrl(baseUrl, keyword) {
  const hostname = new URL(baseUrl).hostname;
  const fn = SEARCH_URLS[hostname];
  return fn ? fn(keyword) : `${baseUrl.replace(/\/$/, '')}/?s=${encodeURIComponent(keyword)}`;
}

function extractText(html, maxChars) {
  const $ = cheerio.load(html);
  // Only strip elements we're SURE are noise. Class-substring selectors
  // (`[class*="banner"]` etc.) match too greedily and kill product-banner,
  // results-banner, etc. Stick to safe tag-level removals.
  $('script, style, noscript, iframe').remove();
  const candidates = ['main', 'article', '[role="main"]', '#main', '#content', '.content', '.search-results', '.search', '.results', 'body'];
  let text = '';
  for (const sel of candidates) {
    const t = $(sel).first().text();
    if (t && t.trim().length > text.length) text = t;
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

const STOP_PATH_RE = /\/(recherche|search|tag|tags|categorie|categories|category)(\/|$)/i;
const REVIEW_PATH_RE = /\/(test|tests|avis|review|reviews|comparatif|comparatifs|comparison|comparisons|guide|guide-d-achat|buying-guide)(\/|-|_|$)/i;

function tokenizeKeyword(s) {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3),
  );
}

/**
 * From a SERP page on an editorial source, locate up to 3 same-domain links
 * whose anchor text best matches the keyword. Returned candidates are deep
 * URLs (≥ 8 chars in pathname) and exclude index/category pages.
 *
 * Scoring: Jaccard(keyword tokens, anchor tokens) + 0.3 boost when the URL
 * path contains review-typed segments (test/avis/comparatif/...). The boost
 * is large enough that an anchor with two of the keyword's tokens AND a
 * review-typed path beats a five-token-overlap anchor on a category page.
 */
function extractArticleLinks(html, baseUrl, keyword) {
  let $;
  try { $ = cheerio.load(html); } catch { return []; }
  const baseHost = new URL(baseUrl).hostname;
  const kwTokens = tokenizeKeyword(keyword);
  if (kwTokens.size === 0) return [];

  const seen = new Set();
  const candidates = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs;
    try { abs = new URL(href, baseUrl).toString().split('#')[0]; } catch { return; }
    if (seen.has(abs)) return;
    seen.add(abs);

    let u;
    try { u = new URL(abs); } catch { return; }
    if (u.hostname !== baseHost) return;
    if (STOP_PATH_RE.test(u.pathname)) return;
    if (u.pathname.length < 8) return;

    const anchor = $(el).text().replace(/\s+/g, ' ').trim();
    if (!anchor || anchor.length < 8) return;

    const aTokens = tokenizeKeyword(anchor);
    let inter = 0;
    for (const t of kwTokens) if (aTokens.has(t)) inter++;
    const similarity = inter / kwTokens.size;
    if (similarity < 0.5) return;

    const pathBoost = REVIEW_PATH_RE.test(u.pathname) ? 0.3 : 0;
    candidates.push({ url: abs, anchor, score: similarity + pathBoost });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}

async function tryFetch(searchUrl) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (res.status >= 500 && res.status !== 503) return { ok: false, reason: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html, status: res.status };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, reason: err.message };
  }
}

async function tryBrowser(searchUrl) {
  try {
    const { html, status } = await fetchWithBrowser(searchUrl);
    return { ok: true, html, status };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function scrapeSource(source, keyword, { maxChars = 4000, verbose = false } = {}) {
  const searchUrl = buildSearchUrl(source.url, keyword);
  const domain = new URL(source.url).hostname;

  // Routing: known WAF-protected sources go straight to browser to avoid
  // the wasted fetch round-trip. Others try fetch first (fast), fall back
  // to browser if the response is too short or extraction yields nothing.
  const wantBrowser = source.useBrowser === true;

  let response = wantBrowser ? null : await tryFetch(searchUrl);
  let route = 'fetch';

  // Fall back to browser if fetch was rejected or returned a stub page (<2KB).
  if (!response || !response.ok || response.html.length < 2000) {
    if (verbose && response && !response.ok) console.warn(`    ⚠️  ${source.name}: fetch failed (${response.reason}), trying browser…`);
    response = await tryBrowser(searchUrl);
    route = 'browser';
  }

  if (!response.ok) {
    if (verbose) console.warn(`    ⚠️  ${source.name}: ${response.reason}`);
    return { error: response.reason, domain, url: searchUrl };
  }

  // Even via browser, a 5xx is the WAF serving an error page (e.g. Que Choisir
  // returns "Une erreur est survenue" with substantial HTML — looks valid by
  // length but has zero factual content).
  if (response.status && response.status >= 500 && response.status !== 503) {
    if (verbose) console.warn(`    ⚠️  ${source.name}: HTTP ${response.status} via ${route} (treating as blocked)`);
    return { error: `HTTP ${response.status}`, domain, url: searchUrl };
  }

  // Browser fallback: also retry browser if extracted text was too short
  // even though HTML was substantial (e.g. JS-rendered listings on Cdiscount).
  let text = extractText(response.html, maxChars);
  if (route === 'fetch' && text.length < MIN_CONTENT_CHARS) {
    if (verbose) console.warn(`    ⚠️  ${source.name}: thin extraction via fetch (${text.length} chars), retrying with browser…`);
    const browserResp = await tryBrowser(searchUrl);
    if (browserResp.ok) {
      response = browserResp;
      route = 'browser';
      text = extractText(browserResp.html, maxChars);
    }
  }

  if (!text || text.length < MIN_CONTENT_CHARS) {
    if (verbose) console.warn(`    ⚠️  ${source.name}: text too short (${text.length} chars) via ${route}`);
    return null;
  }

  // 2-hop: editorial sources (`type: 'reviews'`) get their SERP parsed for
  // article links, and the best matching link is fetched as the actual
  // grounding content. This pulls real review prose into the prompt instead
  // of search-page snippets — a structural fix to the editorial credibility
  // gap (the model can no longer fabricate "Que Choisir says X" from a
  // listing page that only mentions X by title).
  //
  // Retailers stay at SERP level (their search pages already carry pricing,
  // stock, ratings — that's what we want from them). Editorial 2-hop is
  // best-effort: if no qualifying link is found or the fetch fails, the
  // SERP text is kept rather than aborting the source.
  let finalUrl = searchUrl;
  let finalText = text;
  let hop = 1;
  if (source.type === 'reviews') {
    const links = extractArticleLinks(response.html, searchUrl, keyword);
    for (const link of links) {
      const deepResp = source.useBrowser ? await tryBrowser(link.url) : await tryFetch(link.url);
      if (!deepResp.ok) continue;
      if (deepResp.status && deepResp.status >= 500 && deepResp.status !== 503) continue;
      const deepText = extractText(deepResp.html, maxChars);
      if (!deepText || deepText.length < MIN_CONTENT_CHARS) continue;
      // Accept the deep content only when it's substantively richer than
      // the SERP — an article body should comfortably beat the SERP listing
      // text. 1.2× guards against picking a same-domain link that resolves
      // to another listing of similar size.
      if (deepText.length < text.length * 1.2) continue;
      finalUrl = link.url;
      finalText = deepText;
      hop = 2;
      if (verbose) console.log(`    🔗 ${source.name}: 2-hop → ${link.anchor.slice(0, 60)} (${deepText.length} chars)`);
      break;
    }
  }

  return {
    name: source.name,
    domain,
    url: finalUrl,
    content: finalText,
    trust: source.trust,
    httpStatus: response.status,
    fetchedVia: route,
    fetchHops: hop,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapeSourcesForKeyword(sources, keyword, { maxConcurrent = 3, minSuccess = 2, minEditorial = 1, verbose = true } = {}) {
  const scrapeable = sources.filter(s => s.scrape);
  const results = [];
  // Lower concurrency than fetch-only — Chromium pages are heavier; 3 in flight is plenty.
  for (let i = 0; i < scrapeable.length; i += maxConcurrent) {
    const batch = scrapeable.slice(i, i + maxConcurrent);
    // The source's `type` is preserved on the result so callers can apply
    // editorial-only thresholds without having to re-zip with the input.
    const batchResults = await Promise.all(batch.map(async (s) => {
      const r = await scrapeSource(s, keyword, { verbose });
      if (r && !r.error) r.type = s.type;
      return r;
    }));
    results.push(...batchResults);
  }
  const successful = results.filter(r => r && !r.error);
  const editorialCount = successful.filter(r => r.type === 'reviews').length;
  // Browser is launched lazily; close it once we're done with this keyword.
  await closeBrowser();
  return {
    sources: successful,
    failed: results.filter(r => !r || r.error),
    // `enough` now requires BOTH a numeric floor AND at least one editorial
    // (reviews-type) source. A keyword backed only by retailer SERPs +
    // Amazon listings cannot pass anti-plagiarism by aggregating product
    // titles — the LLM has no real review prose to synthesise from.
    enough: successful.length >= minSuccess && editorialCount >= minEditorial,
    editorialCount,
    requestedCount: scrapeable.length,
  };
}
