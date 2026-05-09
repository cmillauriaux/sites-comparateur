import * as cheerio from 'cheerio';
import { fetchWithBrowser, closeBrowser } from './browser.js';

// Realistic browser UA — many retailers WAF-block obvious bots, even when polite.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const TIMEOUT_MS = 15_000;
const MIN_CONTENT_CHARS = 300;

const SEARCH_URLS = {
  // FR
  'www.quechoisir.org':       q => `https://www.quechoisir.org/recherche/?query=${encodeURIComponent(q)}`,
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

  return {
    name: source.name,
    domain,
    url: searchUrl,
    content: text,
    trust: source.trust,
    httpStatus: response.status,
    fetchedVia: route,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapeSourcesForKeyword(sources, keyword, { maxConcurrent = 3, minSuccess = 2, verbose = true } = {}) {
  const scrapeable = sources.filter(s => s.scrape);
  const results = [];
  // Lower concurrency than fetch-only — Chromium pages are heavier; 3 in flight is plenty.
  for (let i = 0; i < scrapeable.length; i += maxConcurrent) {
    const batch = scrapeable.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(s => scrapeSource(s, keyword, { verbose })));
    results.push(...batchResults);
  }
  const successful = results.filter(r => r && !r.error);
  // Browser is launched lazily; close it once we're done with this keyword.
  await closeBrowser();
  return {
    sources: successful,
    failed: results.filter(r => !r || r.error),
    enough: successful.length >= minSuccess,
    requestedCount: scrapeable.length,
  };
}
